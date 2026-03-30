import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/supabase/helpers";
import { getOrgProvider, getAccountingProvider } from "@/lib/accounting";
import { checkInvoiceAccess } from "@/lib/billing/access";
import { logger } from "@/lib/utils/logger";
import {
  authError,
  validationError,
  internalError,
  forbiddenError,
  subscriptionRequired,
  apiSuccess,
} from "@/lib/utils/errors";
import { checkContentDuplicates } from "@/lib/invoices/duplicate-check";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/invoices/batch/prepare-preview
 *
 * Read-only preview of what "Prepare & Approve" will do for a batch.
 * Returns a breakdown of vendor auto-matches, AI GL suggestions to accept,
 * invoices needing manual review, and skip reasons.
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
  const orgId = await getActiveOrgId(supabase, user.id);
  if (!orgId) {
    return authError("No organization found.");
  }

  // 3. Subscription check
  const access = await checkInvoiceAccess(user.id);
  if (!access.allowed) {
    return subscriptionRequired("Subscription required.", {
      subscriptionStatus: access.subscriptionStatus,
      trialExhausted: access.trialExhausted,
    });
  }

  // 4. Parse body
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

  // 5. Fetch all invoices for this batch
  const admin = createAdminClient();

  const { data: allInvoices, error: fetchErr } = await admin
    .from("invoices")
    .select("id, org_id, status, file_name")
    .in("batch_id", [batchId]);

  if (fetchErr) {
    logger.error("prepare_preview.fetch_failed", {
      userId: user.id,
      orgId,
      batchId,
      error: fetchErr.message,
    });
    return internalError("Failed to fetch batch invoices.");
  }

  const invoices = allInvoices ?? [];

  // 6. Ownership check
  const unauthorized = invoices.filter((inv) => inv.org_id !== orgId);
  if (unauthorized.length > 0) {
    return forbiddenError(
      "One or more invoices in this batch do not belong to your organization."
    );
  }

  // 7. Filter to pending_review
  const candidates = invoices.filter((inv) => inv.status === "pending_review");

  if (candidates.length === 0) {
    return apiSuccess({
      fullyReady: 0,
      vendorAutoMatchable: 0,
      glSuggestionsToAccept: 0,
      glInvoiceCount: 0,
      needsManualReview: [],
      willApprove: 0,
      willSkip: 0,
    });
  }

  // 8. Fetch extracted_data for candidates (include id for line item FK join)
  const candidateIds = candidates.map((inv) => inv.id);

  const { data: extractedRows, error: edErr } = await admin
    .from("extracted_data")
    .select("id, invoice_id, vendor_name, vendor_ref, total_amount, invoice_number, invoice_date")
    .in("invoice_id", candidateIds);

  if (edErr) {
    logger.error("prepare_preview.extracted_data_failed", {
      userId: user.id,
      orgId,
      batchId,
      error: edErr.message,
    });
    return internalError("Failed to fetch extracted data.");
  }

  const edRows = extractedRows ?? [];
  const extractedByInvoiceId = new Map(
    edRows.map((row) => [row.invoice_id, row])
  );

  // Build maps between extracted_data.id and invoice_id
  const edIdToInvoiceId = new Map(
    edRows.map((r) => [r.id, r.invoice_id])
  );

  // 9. Fetch line items via extracted_data.id FK
  const edIds = edRows.map((r) => r.id);

  const { data: lineItems, error: lineItemErr } = edIds.length > 0
    ? await admin
        .from("extracted_line_items")
        .select("id, extracted_data_id, gl_account_id, suggested_gl_account_id, gl_suggestion_source")
        .in("extracted_data_id", edIds)
    : { data: [] as never[], error: null };

  if (lineItemErr) {
    logger.error("prepare_preview.line_items_failed", {
      userId: user.id,
      orgId,
      batchId,
      error: lineItemErr.message,
    });
    return internalError("Failed to fetch line items.");
  }

  // Group line items by invoice_id
  const lineItemsByInvoiceId = new Map<string, typeof lineItems>();
  for (const li of lineItems ?? []) {
    const invoiceId = edIdToInvoiceId.get(li.extracted_data_id);
    if (!invoiceId) continue;
    const existing = lineItemsByInvoiceId.get(invoiceId) ?? [];
    existing.push(li);
    lineItemsByInvoiceId.set(invoiceId, existing);
  }

  // 10. Fetch accounting vendors (if connected)
  const providerType = await getOrgProvider(admin, orgId);
  const vendorMap = new Map<string, string>(); // normalizedName -> vendorId

  if (providerType) {
    try {
      const provider = getAccountingProvider(providerType);
      const vendors = await provider.fetchVendors(admin, orgId);
      for (const v of vendors) {
        vendorMap.set(v.label.toLowerCase().trim(), v.value);
      }
    } catch (err) {
      logger.warn("prepare_preview.vendor_fetch_failed", {
        userId: user.id,
        orgId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue without vendor matching
    }
  }

  // 11. Analyze each candidate
  let fullyReady = 0;
  let vendorAutoMatchable = 0;
  let glSuggestionsToAccept = 0;
  let glInvoiceCount = 0;
  let willApprove = 0;
  let willSkip = 0;
  const needsManualReview: Array<{
    id: string;
    fileName: string;
    reasons: string[];
  }> = [];
  const unmatchedVendors: Array<{
    invoiceId: string;
    fileName: string;
    vendorName: string;
  }> = [];

  for (const inv of candidates) {
    const ed = extractedByInvoiceId.get(inv.id);

    // Missing extracted data or required fields -> skip
    if (!ed) {
      willSkip++;
      needsManualReview.push({
        id: inv.id,
        fileName: inv.file_name,
        reasons: ["No extracted data found"],
      });
      continue;
    }

    const missingFields: string[] = [];
    if (!ed.vendor_name) missingFields.push("vendor_name");
    if (ed.total_amount === null || ed.total_amount === undefined) {
      missingFields.push("total_amount");
    }

    if (missingFields.length > 0) {
      willSkip++;
      needsManualReview.push({
        id: inv.id,
        fileName: inv.file_name,
        reasons: [`Missing required fields: ${missingFields.join(", ")}`],
      });
      continue;
    }

    // This invoice will be approved (has vendor_name + total_amount)
    willApprove++;

    // Check vendor readiness
    const hasVendorRef = !!ed.vendor_ref;
    let willAutoMatchVendor = false;

    if (!hasVendorRef && ed.vendor_name && providerType) {
      const normalizedName = ed.vendor_name.toLowerCase().trim();
      if (vendorMap.has(normalizedName)) {
        willAutoMatchVendor = true;
        vendorAutoMatchable++;
      }
    }

    // Check GL readiness
    const items = lineItemsByInvoiceId.get(inv.id) ?? [];
    let pendingGlCount = 0;
    for (const li of items) {
      if (
        !li.gl_account_id &&
        li.suggested_gl_account_id &&
        li.gl_suggestion_source === "ai"
      ) {
        pendingGlCount++;
      }
    }

    if (pendingGlCount > 0) {
      glSuggestionsToAccept += pendingGlCount;
      glInvoiceCount++;
    }

    // Check if this invoice has remaining issues that can't be auto-fixed
    const manualReasons: string[] = [];

    // Check for content-based duplicates
    if (ed.vendor_name) {
      try {
        const duplicates = await checkContentDuplicates({
          admin,
          invoiceId: inv.id,
          orgId,
          vendorName: ed.vendor_name,
          invoiceNumber: ed.invoice_number ?? null,
          totalAmount: ed.total_amount != null ? Number(ed.total_amount) : null,
          invoiceDate: ed.invoice_date ?? null,
        });
        if (duplicates.length > 0) {
          const dup = duplicates[0];
          const statusLabel = dup.status === "synced" ? "already synced" : dup.status;
          manualReasons.push(`Possible duplicate of ${dup.vendorName}${dup.invoiceNumber ? ` - ${dup.invoiceNumber}` : ""} (${statusLabel})`);
        }
      } catch (err) {
        logger.warn("prepare_preview.duplicate_check_failed", {
          invoiceId: inv.id, orgId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!hasVendorRef && !willAutoMatchVendor && providerType) {
      manualReasons.push("No vendor match found");
      if (ed.vendor_name) {
        unmatchedVendors.push({
          invoiceId: inv.id,
          fileName: inv.file_name,
          vendorName: ed.vendor_name,
        });
      }
    }

    const unmappedWithoutSuggestion = items.filter(
      (li) => !li.gl_account_id && !li.suggested_gl_account_id
    );
    if (unmappedWithoutSuggestion.length > 0) {
      manualReasons.push(
        `${unmappedWithoutSuggestion.length} line item${unmappedWithoutSuggestion.length !== 1 ? "s" : ""} need a GL account (no AI suggestion)`
      );
    }

    if (manualReasons.length > 0) {
      needsManualReview.push({
        id: inv.id,
        fileName: inv.file_name,
        reasons: manualReasons,
      });
    } else {
      fullyReady++;
    }
  }

  logger.info("prepare_preview.complete", {
    userId: user.id,
    orgId,
    batchId,
    fullyReady,
    vendorAutoMatchable,
    glSuggestionsToAccept,
    willApprove,
    willSkip,
    durationMs: Date.now() - start,
  });

  return apiSuccess({
    fullyReady,
    vendorAutoMatchable,
    glSuggestionsToAccept,
    glInvoiceCount,
    needsManualReview,
    unmatchedVendors,
    willApprove,
    willSkip,
  });
}
