import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isConnected } from "@/lib/quickbooks/auth";
import { createBill, attachPdfToEntity, QBOApiError } from "@/lib/quickbooks/api";
import { logger } from "@/lib/utils/logger";
import {
  authError,
  notFound,
  validationError,
  unprocessableEntity,
  apiSuccess,
  internalError,
} from "@/lib/utils/errors";
import type { QBOBillPayload, QBOBillLine } from "@/lib/quickbooks/types";

const MAX_SYNC_RETRIES = 3;

/**
 * POST /api/invoices/[id]/sync/retry
 *
 * Retries a failed sync for an approved invoice.
 * Reuses the same approved invoice data — does not re-extract or re-review.
 * Each retry is a new row in sync_log (append-only).
 * Max 3 retry attempts.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: invoiceId } = await params;
  const startTime = Date.now();

  try {
    // 1. Verify authentication
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return authError();
    }

    // 2. Get user's org
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

    // 3. Verify the invoice exists and belongs to this org
    const { data: invoice } = await adminSupabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("org_id", orgId)
      .single();

    if (!invoice) {
      return notFound("Invoice not found.");
    }

    // 4. Only approved invoices can be sync-retried
    // (Failed syncs keep status as "approved" so user can retry)
    if (invoice.status !== "approved") {
      if (invoice.status === "synced") {
        return validationError("Invoice has already been synced to QuickBooks.");
      }
      return validationError(
        `Invoice must be approved before syncing. Current status: ${invoice.status}`
      );
    }

    // 5. Count previous sync attempts from sync_log (append-only)
    const { count: syncAttemptCount } = await adminSupabase
      .from("sync_log")
      .select("id", { count: "exact", head: true })
      .eq("invoice_id", invoiceId)
      .eq("provider", "quickbooks");

    if ((syncAttemptCount ?? 0) >= MAX_SYNC_RETRIES) {
      logger.warn("sync_retry_max_attempts", {
        invoiceId,
        orgId,
        userId: user.id,
        syncAttempts: syncAttemptCount,
        status: "error",
      });
      return unprocessableEntity(
        `Sync failed after ${MAX_SYNC_RETRIES} attempts. Please check your QuickBooks connection and try again later.`
      );
    }

    // 6. Verify QBO connection exists
    const connected = await isConnected(adminSupabase, orgId);
    if (!connected) {
      return validationError("Connect QuickBooks in Settings before syncing.");
    }

    // 7. Load extracted data + line items
    const { data: extractedData } = await adminSupabase
      .from("extracted_data")
      .select("*")
      .eq("invoice_id", invoiceId)
      .single();

    if (!extractedData) {
      return validationError("No extracted data found for this invoice.");
    }

    const { data: lineItems } = await adminSupabase
      .from("extracted_line_items")
      .select("*")
      .eq("extracted_data_id", extractedData.id)
      .order("sort_order", { ascending: true });

    // 8. Validate required sync fields
    if (!extractedData.vendor_name || !extractedData.vendor_ref) {
      return validationError("Vendor name and QuickBooks vendor must be set before syncing.");
    }

    if (!lineItems || lineItems.length === 0) {
      return validationError("At least one line item is required before syncing.");
    }

    const unmappedLines = lineItems.filter(
      (li: { gl_account_id: string | null }) => !li.gl_account_id
    );
    if (unmappedLines.length > 0) {
      return validationError(
        `${unmappedLines.length} line item(s) need a GL account mapped before syncing.`
      );
    }

    // 9. Build QBO bill payload
    const billLines: QBOBillLine[] = lineItems.map(
      (li: { amount: number; gl_account_id: string; description: string | null }) => ({
        DetailType: "AccountBasedExpenseLineDetail" as const,
        Amount: Number(li.amount),
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: li.gl_account_id },
        },
        ...(li.description ? { Description: li.description } : {}),
      })
    );

    const billPayload: QBOBillPayload = {
      VendorRef: { value: extractedData.vendor_ref },
      Line: billLines,
      ...(extractedData.invoice_date
        ? { TxnDate: extractedData.invoice_date }
        : {}),
      ...(extractedData.due_date
        ? { DueDate: extractedData.due_date }
        : {}),
      ...(extractedData.invoice_number
        ? { DocNumber: extractedData.invoice_number }
        : {}),
    };

    // 10. Create bill in QBO
    let billId: string;
    try {
      const billResponse = await createBill(adminSupabase, orgId, billPayload);
      billId = billResponse.Bill.Id;

      // Log success in sync_log (new row — append-only)
      await adminSupabase.from("sync_log").insert({
        invoice_id: invoiceId,
        provider: "quickbooks",
        provider_bill_id: billId,
        request_payload: billPayload as unknown as Record<string, unknown>,
        provider_response: billResponse as unknown as Record<string, unknown>,
        status: "success",
      });
    } catch (error) {
      // Log failure in sync_log (new row — append-only)
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorDetail =
        error instanceof QBOApiError
          ? {
              code: error.errorCode,
              element: error.element,
              detail: error.detail,
              faultType: error.faultType,
            }
          : {};

      await adminSupabase.from("sync_log").insert({
        invoice_id: invoiceId,
        provider: "quickbooks",
        request_payload: billPayload as unknown as Record<string, unknown>,
        provider_response: errorDetail as Record<string, unknown>,
        status: "failed",
      });

      // Update retry count on invoice
      await adminSupabase
        .from("invoices")
        .update({
          error_message: `Sync failed: ${errorMessage}`,
          retry_count: (invoice.retry_count ?? 0) + 1,
        })
        .eq("id", invoiceId);

      logger.error("sync_retry_bill_creation_failed", {
        invoiceId,
        orgId,
        userId: user.id,
        error: errorMessage,
        ...errorDetail,
        durationMs: Date.now() - startTime,
      });

      if (error instanceof QBOApiError) {
        // Surface duplicate DocNumber errors clearly
        if (error.detail?.includes("Duplicate")) {
          return validationError(
            `A bill with this invoice number already exists in QuickBooks. ${error.detail}`
          );
        }
        return validationError(`QuickBooks error: ${error.detail}`);
      }
      return internalError("Failed to create bill in QuickBooks.");
    }

    // 11. Attach PDF (partial success if this fails)
    let attachmentStatus = "attached";
    try {
      const { data: fileData, error: downloadError } = await adminSupabase.storage
        .from("invoices")
        .download(invoice.file_path);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download file: ${downloadError?.message}`);
      }

      const fileBuffer = Buffer.from(await fileData.arrayBuffer());
      await attachPdfToEntity(adminSupabase, orgId, billId, "Bill", fileBuffer, invoice.file_name);
    } catch (error) {
      attachmentStatus = "failed";
      logger.warn("sync_retry_attachment_failed", {
        invoiceId,
        orgId,
        billId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // 12. Update invoice status to synced
    await adminSupabase
      .from("invoices")
      .update({ status: "synced", error_message: null })
      .eq("id", invoiceId);

    logger.info("sync_retry_complete", {
      invoiceId,
      orgId,
      userId: user.id,
      billId,
      attachmentStatus,
      durationMs: Date.now() - startTime,
    });

    return apiSuccess({
      billId,
      attachmentStatus,
      ...(attachmentStatus === "failed"
        ? {
            warning:
              "Bill created but PDF attachment failed. You can attach it manually in QuickBooks.",
          }
        : {}),
    });
  } catch (error) {
    logger.error("sync_retry_unexpected_error", {
      invoiceId,
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return internalError("An unexpected error occurred during sync retry.");
  }
}
