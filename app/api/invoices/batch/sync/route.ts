import { waitUntil } from "@vercel/functions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOrgConnected, getOrgProvider } from "@/lib/accounting";
import { checkInvoiceAccess } from "@/lib/billing/access";
import { processBatchSync } from "@/lib/quickbooks/batch-sync";
import type { BatchSyncInvoice } from "@/lib/quickbooks/batch-sync";
import { logger } from "@/lib/utils/logger";
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";
import {
  authError,
  validationError,
  forbiddenError,
  internalError,
  subscriptionRequired,
  apiSuccess,
} from "@/lib/utils/errors";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/invoices/batch/sync
 *
 * Fires off batch sync to the connected accounting provider for all approved invoices in a batch.
 * Returns immediately after pre-flight validation; sync runs in the background
 * via waitUntil().
 *
 * Pre-flight skips invoices that:
 *   - Are not in 'approved' status
 *   - Missing vendor_ref in extracted_data
 *   - Have no line items
 *   - Have line items without gl_account_id
 *   - Are non-bill type but missing payment_account_id
 */
export async function POST(request: Request) {
  const start = Date.now();

  // 1. Authenticate
  const supabase = createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return authError();
  }

  // 2. Resolve org
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return authError("No organization found.");
  }

  const orgId = membership.org_id;

  logger.info("batch_sync.start", { userId: user.id, orgId });

  // 3. Subscription check
  const access = await checkInvoiceAccess(user.id);
  if (!access.allowed) {
    logger.warn("batch_sync.access_denied", {
      userId: user.id,
      orgId,
      reason: access.reason,
    });
    return subscriptionRequired("Subscription required to sync invoices.", {
      subscriptionStatus: access.subscriptionStatus,
      trialExpired: access.trialExpired,
    });
  }

  // 4. Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError("Invalid JSON body.");
  }

  const { batch_id: batchId } = (body as Record<string, unknown>) ?? {};

  if (!batchId || typeof batchId !== "string") {
    return validationError("batch_id is required.");
  }

  if (!UUID_REGEX.test(batchId)) {
    return validationError("batch_id must be a valid UUID.");
  }

  const admin = createAdminClient();

  // 5. Check accounting connection
  const connected = await isOrgConnected(admin, orgId);
  if (!connected) {
    return validationError(
      "Connect an accounting provider in Settings before syncing invoices."
    );
  }

  const providerType = await getOrgProvider(admin, orgId);

  // 6. Fetch all invoices for this batch
  const { data: allInvoices, error: fetchErr } = await admin
    .from("invoices")
    .select("id, org_id, status, output_type, payment_account_id, file_path, file_name, retry_count")
    .in("batch_id", [batchId]);

  if (fetchErr) {
    logger.error("batch_sync.fetch_failed", {
      userId: user.id,
      orgId,
      batchId,
      error: fetchErr.message,
    });
    return internalError("Failed to fetch batch invoices.");
  }

  const invoices = allInvoices ?? [];

  // 7. Ownership check — ALL invoices must belong to this org
  const unauthorized = invoices.filter((inv) => inv.org_id !== orgId);
  if (unauthorized.length > 0) {
    logger.warn("batch_sync.ownership_violation", {
      userId: user.id,
      orgId,
      batchId,
      unauthorizedIds: unauthorized.map((i) => i.id),
    });
    return forbiddenError(
      "One or more invoices in this batch do not belong to your organization."
    );
  }

  // 8. Filter to approved only
  const approvedInvoices = invoices.filter((inv) => inv.status === "approved");

  if (approvedInvoices.length === 0) {
    logger.info("batch_sync.no_approved_invoices", {
      userId: user.id,
      orgId,
      batchId,
      totalInvoices: invoices.length,
      durationMs: Date.now() - start,
    });
    return apiSuccess({
      syncing: 0,
      skipped: 0,
      skippedInvoices: [],
      invoiceIds: [],
    });
  }

  const approvedIds = approvedInvoices.map((inv) => inv.id);

  // 9. Pre-flight validation: load extracted_data and line_items for all approved invoices

  // Get extracted_data rows (keyed by invoice_id)
  const { data: extractedRows, error: edErr } = await admin
    .from("extracted_data")
    .select("id, invoice_id, vendor_ref")
    .in("invoice_id", approvedIds);

  if (edErr) {
    logger.error("batch_sync.extracted_data_fetch_failed", {
      userId: user.id,
      orgId,
      batchId,
      error: edErr.message,
    });
    return internalError("Failed to fetch extracted data.");
  }

  const extractedByInvoiceId = new Map(
    (extractedRows ?? []).map((row) => [row.invoice_id, row])
  );

  // Get line items via extracted_data_id (NOT invoice_id — the table has no invoice_id column)
  const edIds = (extractedRows ?? []).map((ed) => ed.id);
  const { data: lineItemRows, error: liErr } =
    edIds.length > 0
      ? await admin
          .from("extracted_line_items")
          .select("extracted_data_id, gl_account_id")
          .in("extracted_data_id", edIds)
      : { data: [], error: null };

  if (liErr) {
    logger.error("batch_sync.line_items_fetch_failed", {
      userId: user.id,
      orgId,
      batchId,
      error: liErr.message,
    });
    return internalError("Failed to fetch line items.");
  }

  // Group line items by extracted_data_id
  const lineItemsByEdId = new Map<string, Array<{ gl_account_id: string | null }>>();
  for (const li of lineItemRows ?? []) {
    const existing = lineItemsByEdId.get(li.extracted_data_id) ?? [];
    existing.push(li);
    lineItemsByEdId.set(li.extracted_data_id, existing);
  }

  // 10. Validate each approved invoice
  const toSync: BatchSyncInvoice[] = [];
  const skippedInvoices: Array<{
    id: string;
    fileName: string;
    reason: string;
  }> = [];

  for (const inv of approvedInvoices) {
    const ed = extractedByInvoiceId.get(inv.id);

    if (!ed) {
      skippedInvoices.push({
        id: inv.id,
        fileName: inv.file_name,
        reason: "No extracted data found.",
      });
      continue;
    }

    if (!ed.vendor_ref) {
      skippedInvoices.push({
        id: inv.id,
        fileName: inv.file_name,
        reason: "No vendor mapped. Please select a vendor.",
      });
      continue;
    }

    const lineItems = lineItemsByEdId.get(ed.id) ?? [];

    if (lineItems.length === 0) {
      skippedInvoices.push({
        id: inv.id,
        fileName: inv.file_name,
        reason: "No line items found. At least one line item is required.",
      });
      continue;
    }

    const unmappedCount = lineItems.filter((li) => !li.gl_account_id).length;
    if (unmappedCount > 0) {
      skippedInvoices.push({
        id: inv.id,
        fileName: inv.file_name,
        reason: `${unmappedCount} line item(s) missing GL account mapping.`,
      });
      continue;
    }

    const outputType = inv.output_type ?? "bill";
    if (outputType !== "bill" && !inv.payment_account_id) {
      skippedInvoices.push({
        id: inv.id,
        fileName: inv.file_name,
        reason: "Payment account required for non-bill transaction types.",
      });
      continue;
    }

    toSync.push({
      id: inv.id,
      org_id: inv.org_id,
      output_type: inv.output_type,
      payment_account_id: inv.payment_account_id,
      file_path: inv.file_path,
      file_name: inv.file_name,
      retry_count: inv.retry_count ?? 0,
    });
  }

  logger.info("batch_sync.preflight_complete", {
    userId: user.id,
    orgId,
    batchId,
    toSync: toSync.length,
    skipped: skippedInvoices.length,
    durationMs: Date.now() - start,
  });

  trackServerEvent(user.id, AnalyticsEvents.BATCH_SYNCED, {
    batchId,
    count: toSync.length,
  });

  // 11. Fire background sync for valid invoices
  if (toSync.length > 0) {
    waitUntil(processBatchSync(admin, orgId, batchId, toSync, providerType!));
  }

  return apiSuccess({
    syncing: toSync.length,
    skipped: skippedInvoices.length,
    skippedInvoices,
    invoiceIds: toSync.map((inv) => inv.id),
  });
}
