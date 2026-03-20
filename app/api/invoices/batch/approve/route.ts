import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkInvoiceAccess } from "@/lib/billing/access";
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

  logger.info("batch_approve.start", { userId: user.id, orgId });

  // 3. Subscription check
  const access = await checkInvoiceAccess(user.id);
  if (!access.allowed) {
    logger.warn("batch_approve.access_denied", {
      userId: user.id,
      orgId,
      reason: access.reason,
    });
    return subscriptionRequired(
      "Subscription required to approve invoices.",
      {
        subscriptionStatus: access.subscriptionStatus,
        trialExpired: access.trialExpired,
      }
    );
  }

  // 4. Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError("Invalid JSON body.");
  }

  const { batch_id: batchId } =
    (body as Record<string, unknown>) ?? {};

  if (!batchId || typeof batchId !== "string") {
    return validationError("batch_id is required.");
  }

  if (!UUID_REGEX.test(batchId)) {
    return validationError("batch_id must be a valid UUID.");
  }

  // 5. Fetch all invoices for this batch (admin to bypass RLS)
  const admin = createAdminClient();

  const { data: allInvoices, error: fetchErr } = await admin
    .from("invoices")
    .select("id, org_id, status, file_name")
    .in("batch_id", [batchId]);

  if (fetchErr) {
    logger.error("batch_approve.fetch_failed", {
      userId: user.id,
      orgId,
      batchId,
      error: fetchErr.message,
    });
    return internalError("Failed to fetch batch invoices.");
  }

  const invoices = allInvoices ?? [];

  // 6. Ownership check — ALL invoices must belong to this org
  const unauthorized = invoices.filter((inv) => inv.org_id !== orgId);
  if (unauthorized.length > 0) {
    logger.warn("batch_approve.ownership_violation", {
      userId: user.id,
      orgId,
      batchId,
      unauthorizedIds: unauthorized.map((i) => i.id),
    });
    return forbiddenError(
      "One or more invoices in this batch do not belong to your organization."
    );
  }

  // 7. Filter to pending_review only (approved/synced silently skipped)
  const candidates = invoices.filter((inv) => inv.status === "pending_review");

  if (candidates.length === 0) {
    logger.info("batch_approve.no_candidates", {
      userId: user.id,
      orgId,
      batchId,
      totalInvoices: invoices.length,
      durationMs: Date.now() - start,
    });
    return apiSuccess({ approved: 0, skipped: 0, skippedInvoices: [] });
  }

  // 8. Fetch extracted_data for candidates
  const candidateIds = candidates.map((inv) => inv.id);

  const { data: extractedRows, error: edErr } = await admin
    .from("extracted_data")
    .select("invoice_id, vendor_name, total_amount")
    .in("invoice_id", candidateIds);

  if (edErr) {
    logger.error("batch_approve.extracted_data_fetch_failed", {
      userId: user.id,
      orgId,
      batchId,
      error: edErr.message,
    });
    return internalError("Failed to fetch extracted data.");
  }

  // Build a lookup map for quick access
  const extractedByInvoiceId = new Map(
    (extractedRows ?? []).map((row) => [row.invoice_id, row])
  );

  // 9. Validate each candidate
  const toApprove: string[] = [];
  const skippedInvoices: Array<{
    id: string;
    fileName: string;
    reason: string;
  }> = [];

  for (const inv of candidates) {
    const ed = extractedByInvoiceId.get(inv.id);

    if (!ed) {
      skippedInvoices.push({
        id: inv.id,
        fileName: inv.file_name,
        reason: "No extracted data found.",
      });
      continue;
    }

    const missingFields: string[] = [];
    if (!ed.vendor_name) missingFields.push("vendor_name");
    if (ed.total_amount === null || ed.total_amount === undefined) {
      missingFields.push("total_amount");
    }

    if (missingFields.length > 0) {
      skippedInvoices.push({
        id: inv.id,
        fileName: inv.file_name,
        reason: `Missing required fields: ${missingFields.join(", ")}`,
      });
      continue;
    }

    toApprove.push(inv.id);
  }

  // 10. Bulk approve passing invoices
  if (toApprove.length > 0) {
    const { error: updateErr } = await admin
      .from("invoices")
      .update({ status: "approved" })
      .in("id", toApprove);

    if (updateErr) {
      logger.error("batch_approve.update_failed", {
        userId: user.id,
        orgId,
        batchId,
        toApprove,
        error: updateErr.message,
        durationMs: Date.now() - start,
      });
      return internalError("Failed to update invoice statuses.");
    }

    revalidatePath("/invoices");
  }

  logger.info("batch_approve.complete", {
    userId: user.id,
    orgId,
    batchId,
    approved: toApprove.length,
    skipped: skippedInvoices.length,
    durationMs: Date.now() - start,
  });

  trackServerEvent(user.id, AnalyticsEvents.BATCH_APPROVED, {
    batchId,
    count: toApprove.length,
  });

  return apiSuccess({
    approved: toApprove.length,
    skipped: skippedInvoices.length,
    skippedInvoices,
  });
}
