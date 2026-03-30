import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/supabase/helpers";
import { getOrgProvider, getAccountingProvider } from "@/lib/accounting";
import { checkInvoiceAccess } from "@/lib/billing/access";
import { logger } from "@/lib/utils/logger";
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";
import {
  authError,
  validationError,
  internalError,
  forbiddenError,
  subscriptionRequired,
  apiSuccess,
} from "@/lib/utils/errors";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/invoices/batch/prepare-and-approve
 *
 * Auto-matches vendors, accepts AI GL suggestions, and approves invoices in a batch.
 * For each pending_review invoice:
 *   1. Validates vendor_name + total_amount (skips if missing)
 *   2. Auto-matches vendor_ref if vendor_name matches an accounting vendor
 *   3. Accepts AI GL suggestions (copies suggested_gl_account_id to gl_account_id)
 *   4. Sets status to "approved"
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

  logger.info("prepare_and_approve.start", { userId: user.id, orgId });

  // 3. Subscription check
  const access = await checkInvoiceAccess(user.id);
  if (!access.allowed) {
    logger.warn("prepare_and_approve.access_denied", {
      userId: user.id,
      orgId,
      reason: access.reason,
    });
    return subscriptionRequired(
      "Subscription required to approve invoices.",
      {
        subscriptionStatus: access.subscriptionStatus,
        trialExhausted: access.trialExhausted,
      }
    );
  }

  // 4. Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError("Invalid JSON body.");
  }

  const { batch_id: batchId, create_vendor_for_invoice_ids: createVendorForInvoiceIds } =
    (body as Record<string, unknown>) ?? {};

  if (!batchId || typeof batchId !== "string") {
    return validationError("batch_id is required.");
  }
  if (!UUID_REGEX.test(batchId)) {
    return validationError("batch_id must be a valid UUID.");
  }

  // Validate create_vendor_for_invoice_ids if provided
  const vendorCreateSet = new Set<string>();
  if (Array.isArray(createVendorForInvoiceIds)) {
    for (const id of createVendorForInvoiceIds) {
      if (typeof id === "string" && UUID_REGEX.test(id)) {
        vendorCreateSet.add(id);
      }
    }
  }

  // 5. Fetch all invoices for this batch
  const admin = createAdminClient();

  const { data: allInvoices, error: fetchErr } = await admin
    .from("invoices")
    .select("id, org_id, status, file_name")
    .in("batch_id", [batchId]);

  if (fetchErr) {
    logger.error("prepare_and_approve.fetch_failed", {
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
    logger.warn("prepare_and_approve.ownership_violation", {
      userId: user.id,
      orgId,
      batchId,
      unauthorizedIds: unauthorized.map((i) => i.id),
    });
    return forbiddenError(
      "One or more invoices in this batch do not belong to your organization."
    );
  }

  // 7. Filter to pending_review
  const candidates = invoices.filter((inv) => inv.status === "pending_review");

  if (candidates.length === 0) {
    return apiSuccess({
      approved: 0,
      skipped: 0,
      vendorsMatched: 0,
      glSuggestionsAccepted: 0,
      skippedInvoices: [],
    });
  }

  // 8. Fetch extracted_data for candidates
  const candidateIds = candidates.map((inv) => inv.id);

  const { data: extractedRows, error: edErr } = await admin
    .from("extracted_data")
    .select("id, invoice_id, vendor_name, vendor_ref, total_amount")
    .in("invoice_id", candidateIds);

  if (edErr) {
    logger.error("prepare_and_approve.extracted_data_failed", {
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
    logger.error("prepare_and_approve.line_items_failed", {
      userId: user.id,
      orgId,
      batchId,
      error: lineItemErr.message,
    });
    return internalError("Failed to fetch line items.");
  }

  // Group line items by invoice_id
  const lineItemsByInvoiceId = new Map<string, Array<{ id: string; extracted_data_id: string; gl_account_id: string | null; suggested_gl_account_id: string | null; gl_suggestion_source: string | null }>>();
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
      logger.warn("prepare_and_approve.vendor_fetch_failed", {
        userId: user.id,
        orgId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 11. Get the accounting provider for vendor creation
  let provider: ReturnType<typeof getAccountingProvider> | null = null;
  if (providerType) {
    provider = getAccountingProvider(providerType);
  }

  // 12. Process each candidate: auto-match/create vendors, accept GL suggestions, approve
  const toApprove: string[] = [];
  const skippedInvoices: Array<{
    id: string;
    fileName: string;
    reason: string;
  }> = [];
  let vendorsMatched = 0;
  let vendorsCreated = 0;
  let glSuggestionsAccepted = 0;

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

    // Auto-match vendor if possible (don't overwrite existing vendor_ref)
    let vendorResolved = !!ed.vendor_ref;
    if (!vendorResolved && ed.vendor_name && providerType) {
      const normalizedName = ed.vendor_name.toLowerCase().trim();
      const matchedVendorId = vendorMap.get(normalizedName);
      if (matchedVendorId) {
        // Existing vendor match
        const { error: vendorErr } = await admin
          .from("extracted_data")
          .update({ vendor_ref: matchedVendorId })
          .eq("id", ed.id);

        if (!vendorErr) {
          vendorsMatched++;
          vendorResolved = true;
        } else {
          logger.warn("prepare_and_approve.vendor_match_write_failed", {
            invoiceId: inv.id,
            error: vendorErr.message,
          });
        }
      } else if (vendorCreateSet.has(inv.id) && provider) {
        // User opted to create this vendor in accounting system
        try {
          const created = await provider.createVendor(admin, orgId, ed.vendor_name);
          const { error: vendorErr } = await admin
            .from("extracted_data")
            .update({ vendor_ref: created.value })
            .eq("id", ed.id);

          if (!vendorErr) {
            vendorsCreated++;
            vendorResolved = true;
            // Add to vendorMap so subsequent invoices with the same name match
            vendorMap.set(normalizedName, created.value);
          } else {
            logger.warn("prepare_and_approve.vendor_create_ref_write_failed", {
              invoiceId: inv.id,
              error: vendorErr.message,
            });
          }
        } catch (err) {
          logger.warn("prepare_and_approve.vendor_create_failed", {
            invoiceId: inv.id,
            vendorName: ed.vendor_name,
            error: err instanceof Error ? err.message : String(err),
          });
          // Invoice stays in pending_review
          skippedInvoices.push({
            id: inv.id,
            fileName: inv.file_name,
            reason: `Failed to create vendor "${ed.vendor_name}"`,
          });
          continue;
        }
      } else if (!vendorResolved && providerType) {
        // No match and user didn't opt to create -- leave in pending_review
        skippedInvoices.push({
          id: inv.id,
          fileName: inv.file_name,
          reason: `No vendor match for "${ed.vendor_name}" -- needs manual review`,
        });
        continue;
      }
    }

    // Accept AI GL suggestions (don't overwrite existing gl_account_id)
    const items = lineItemsByInvoiceId.get(inv.id) ?? [];
    for (const li of items) {
      if (
        !li.gl_account_id &&
        li.suggested_gl_account_id &&
        li.gl_suggestion_source === "ai"
      ) {
        const { error: glErr } = await admin
          .from("extracted_line_items")
          .update({ gl_account_id: li.suggested_gl_account_id })
          .eq("id", li.id);

        if (!glErr) {
          glSuggestionsAccepted++;
        } else {
          logger.warn("prepare_and_approve.gl_accept_failed", {
            lineItemId: li.id,
            invoiceId: inv.id,
            error: glErr.message,
          });
        }
      }
    }

    toApprove.push(inv.id);
  }

  // 12. Bulk approve passing invoices
  if (toApprove.length > 0) {
    const { error: updateErr } = await admin
      .from("invoices")
      .update({ status: "approved" })
      .in("id", toApprove);

    if (updateErr) {
      logger.error("prepare_and_approve.update_failed", {
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

  logger.info("prepare_and_approve.complete", {
    userId: user.id,
    orgId,
    batchId,
    approved: toApprove.length,
    skipped: skippedInvoices.length,
    vendorsMatched,
    vendorsCreated,
    glSuggestionsAccepted,
    durationMs: Date.now() - start,
  });

  trackServerEvent(user.id, AnalyticsEvents.BATCH_APPROVED, {
    batchId,
    count: toApprove.length,
    vendorsMatched,
    vendorsCreated,
    glSuggestionsAccepted,
  });

  return apiSuccess({
    approved: toApprove.length,
    skipped: skippedInvoices.length,
    vendorsMatched,
    vendorsCreated,
    glSuggestionsAccepted,
    skippedInvoices,
  });
}
