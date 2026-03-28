import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";
import { authError, validationError, apiSuccess, internalError, conflict } from "@/lib/utils/errors";

const NON_DELETABLE_STATUSES = ["extracting", "uploading"];

/**
 * POST /api/invoices/[id]/delete
 *
 * Soft-deletes an invoice by setting status to "archived".
 * Rejects if invoice is mid-extraction or mid-upload.
 * Warns if invoice has been synced to an accounting provider.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const { id: invoiceId } = await params;

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return authError();
    }

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
    const adminSupabase = createAdminClient();

    // Verify invoice exists and belongs to org
    const { data: invoice } = await adminSupabase
      .from("invoices")
      .select("id, status, file_path")
      .eq("id", invoiceId)
      .eq("org_id", orgId)
      .single();

    if (!invoice) {
      return validationError("Invoice not found.");
    }

    // Block deletion during active processing
    if (NON_DELETABLE_STATUSES.includes(invoice.status)) {
      return conflict(
        `Cannot delete invoice while it is ${invoice.status}. Please wait for processing to complete.`
      );
    }

    // Check if synced -- include warning in response
    let syncWarning: string | null = null;
    if (invoice.status === "synced") {
      const { data: syncLog } = await adminSupabase
        .from("sync_log")
        .select("provider, provider_bill_id")
        .eq("invoice_id", invoiceId)
        .eq("status", "success")
        .limit(1)
        .single();

      if (syncLog) {
        syncWarning = `This invoice was synced to ${syncLog.provider}. The bill (ID: ${syncLog.provider_bill_id}) still exists in your accounting system and must be deleted there separately.`;
      }
    }

    // Soft delete: set status to archived
    const { error: updateError } = await adminSupabase
      .from("invoices")
      .update({ status: "archived" })
      .eq("id", invoiceId);

    if (updateError) {
      logger.error("invoice.delete_failed", {
        invoiceId,
        orgId,
        userId: user.id,
        error: updateError.message,
      });
      return internalError("Failed to delete invoice.");
    }

    logger.info("invoice.archived", {
      action: "delete_invoice",
      invoiceId,
      orgId,
      userId: user.id,
      previousStatus: invoice.status,
      durationMs: Date.now() - startTime,
      status: "success",
    });

    return apiSuccess({
      deleted: true,
      warning: syncWarning,
    });
  } catch (error) {
    logger.error("invoice.delete_unexpected_error", {
      invoiceId,
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return internalError("An unexpected error occurred.");
  }
}
