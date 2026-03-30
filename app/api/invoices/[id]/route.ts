import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/supabase/helpers";
import { logger } from "@/lib/utils/logger";
import { authError, validationError, apiSuccess, internalError } from "@/lib/utils/errors";

const VALID_OUTPUT_TYPES = ["bill", "check", "cash", "credit_card"] as const;
const MUTABLE_STATUSES = ["pending_review", "approved"];

/**
 * PATCH /api/invoices/[id]
 *
 * Updates invoice-level fields: output_type, payment_account_id, payment_account_name.
 * When output_type changes, clears payment_account_id/name to prevent stale account mismatch.
 * Invoice must be in pending_review or approved status (reject if synced/extracting/uploading).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const { id: invoiceId } = await params;

  try {
    // 1. Verify authentication
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return authError();
    }

    // 2. Get user's org
    const orgId = await getActiveOrgId(supabase, user.id);

    if (!orgId) {
      return authError("No organization found.");
    }
    const adminSupabase = createAdminClient();

    // 3. Parse request body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return validationError("Invalid JSON body.");
    }

    // 4. Verify the invoice exists and belongs to this org
    const { data: invoice } = await adminSupabase
      .from("invoices")
      .select("id, status, output_type")
      .eq("id", invoiceId)
      .eq("org_id", orgId)
      .single();

    if (!invoice) {
      return validationError("Invoice not found.");
    }

    // 5. Reject updates on non-mutable statuses
    if (!MUTABLE_STATUSES.includes(invoice.status)) {
      return validationError(
        `Cannot update invoice in ${invoice.status} status. Only pending_review and approved invoices can be modified.`
      );
    }

    // 6. Build update payload
    const update: Record<string, unknown> = {};

    if ("output_type" in body) {
      const outputType = body.output_type as string;
      if (!VALID_OUTPUT_TYPES.includes(outputType as typeof VALID_OUTPUT_TYPES[number])) {
        return validationError(
          `Invalid output_type. Must be one of: ${VALID_OUTPUT_TYPES.join(", ")}`
        );
      }
      update.output_type = outputType;

      // Clear payment account when output_type changes to prevent stale mismatch
      if (outputType !== invoice.output_type) {
        update.payment_account_id = null;
        update.payment_account_name = null;
      }
    }

    if ("payment_account_id" in body) {
      update.payment_account_id = body.payment_account_id ?? null;
    }

    if ("payment_account_name" in body) {
      update.payment_account_name = body.payment_account_name ?? null;
    }

    if ("xero_bill_status" in body) {
      const status = body.xero_bill_status as string | null;
      if (status !== null && status !== "DRAFT" && status !== "AUTHORISED") {
        return validationError("Invalid xero_bill_status. Must be DRAFT, AUTHORISED, or null.");
      }
      update.xero_bill_status = status;
    }

    if ("tax_treatment" in body) {
      const treatment = body.tax_treatment as string | null;
      if (treatment !== null && !["exclusive", "inclusive", "no_tax"].includes(treatment)) {
        return validationError("Invalid tax_treatment. Must be exclusive, inclusive, no_tax, or null.");
      }
      update.tax_treatment = treatment;
    }

    if (Object.keys(update).length === 0) {
      return validationError("No valid fields to update.");
    }

    // 7. Apply update
    const { error: updateError } = await adminSupabase
      .from("invoices")
      .update(update)
      .eq("id", invoiceId);

    if (updateError) {
      logger.error("invoice.patch_failed", {
        invoiceId,
        orgId,
        userId: user.id,
        error: updateError.message,
      });
      return internalError("Failed to update invoice.");
    }

    logger.info("invoice.patched", {
      action: "patch_invoice",
      invoiceId,
      orgId,
      userId: user.id,
      fields: Object.keys(update).join(","),
      durationMs: Date.now() - startTime,
      status: "success",
    });

    return apiSuccess({ updated: update });
  } catch (error) {
    logger.error("invoice.patch_unexpected_error", {
      invoiceId,
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return internalError("An unexpected error occurred.");
  }
}
