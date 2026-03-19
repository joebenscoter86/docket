import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isConnected } from "@/lib/quickbooks/auth";
import { createBill, createPurchase, attachPdfToEntity, QBOApiError } from "@/lib/quickbooks/api";
import { logger } from "@/lib/utils/logger";
import {
  authError,
  notFound,
  validationError,
  unprocessableEntity,
  apiSuccess,
  internalError,
} from "@/lib/utils/errors";
import type { QBOBillPayload, QBOBillLine, QBOPurchasePayload, QBOPurchaseLine } from "@/lib/quickbooks/types";
import type { OutputType, ProviderEntityType } from "@/lib/types/invoice";
import { OUTPUT_TYPE_TO_PAYMENT_TYPE, OUTPUT_TYPE_LABELS, SYNC_SUCCESS_MESSAGES } from "@/lib/types/invoice";

const MAX_SYNC_RETRIES = 3;

/**
 * POST /api/invoices/[id]/sync/retry
 *
 * Retries a failed sync for an approved invoice.
 * Reads output_type from the invoice record (same branching as sync route).
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
    if (invoice.status !== "approved") {
      if (invoice.status === "synced") {
        return validationError("Invoice has already been synced to QuickBooks.");
      }
      return validationError(
        `Invoice must be approved before syncing. Current status: ${invoice.status}`
      );
    }

    // Read output_type from invoice record (defaults to 'bill')
    const outputType = (invoice.output_type ?? "bill") as OutputType;
    const isBill = outputType === "bill";
    const transactionType = outputType;
    const providerEntityType: ProviderEntityType = isBill ? "Bill" : "Purchase";

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
        outputType,
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

    // 6b. Validate payment_account_id for non-bill types
    if (!isBill && !invoice.payment_account_id) {
      return validationError(
        `Select a payment account for ${OUTPUT_TYPE_LABELS[outputType]} before syncing.`
      );
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

    // 9. Create transaction in QBO (Bill or Purchase)
    let entityId: string;
    let requestPayload: unknown;
    let responsePayload: unknown;

    try {
      if (isBill) {
        // ─── Bill flow ───
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
          ...(extractedData.invoice_date ? { TxnDate: extractedData.invoice_date } : {}),
          ...(extractedData.due_date ? { DueDate: extractedData.due_date } : {}),
          ...(extractedData.invoice_number ? { DocNumber: extractedData.invoice_number } : {}),
        };

        requestPayload = billPayload;
        const billResponse = await createBill(adminSupabase, orgId, billPayload);
        entityId = billResponse.Bill.Id;
        responsePayload = billResponse;
      } else {
        // ─── Purchase flow (Check/Cash/CreditCard) ───
        const purchaseLines: QBOPurchaseLine[] = lineItems.map(
          (li: { amount: number; gl_account_id: string; description: string | null }) => ({
            Amount: Number(li.amount),
            DetailType: "AccountBasedExpenseLineDetail" as const,
            AccountBasedExpenseLineDetail: {
              AccountRef: { value: li.gl_account_id },
              ...(li.description ? { Description: li.description } : {}),
            },
          })
        );

        const paymentType = OUTPUT_TYPE_TO_PAYMENT_TYPE[outputType as Exclude<OutputType, "bill">];

        const purchasePayload: QBOPurchasePayload = {
          PaymentType: paymentType as "Check" | "Cash" | "CreditCard",
          AccountRef: { value: invoice.payment_account_id! },
          EntityRef: { value: extractedData.vendor_ref, type: "Vendor" },
          Line: purchaseLines,
          ...(extractedData.invoice_date ? { TxnDate: extractedData.invoice_date } : {}),
          ...(extractedData.invoice_number ? { DocNumber: extractedData.invoice_number } : {}),
        };

        requestPayload = purchasePayload;
        const purchaseResponse = await createPurchase(adminSupabase, orgId, purchasePayload);
        entityId = purchaseResponse.Purchase.Id;
        responsePayload = purchaseResponse;
      }

      // Log success in sync_log (new row — append-only)
      await adminSupabase.from("sync_log").insert({
        invoice_id: invoiceId,
        provider: "quickbooks",
        provider_bill_id: entityId,
        request_payload: requestPayload as Record<string, unknown>,
        provider_response: responsePayload as Record<string, unknown>,
        status: "success",
        transaction_type: transactionType,
        provider_entity_type: providerEntityType,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorDetail = error instanceof QBOApiError
        ? { code: error.errorCode, element: error.element, detail: error.detail, faultType: error.faultType }
        : {};

      await adminSupabase.from("sync_log").insert({
        invoice_id: invoiceId,
        provider: "quickbooks",
        request_payload: requestPayload as Record<string, unknown>,
        provider_response: errorDetail as Record<string, unknown>,
        status: "failed",
        transaction_type: transactionType,
        provider_entity_type: providerEntityType,
      });

      await adminSupabase
        .from("invoices")
        .update({
          error_message: `Sync failed: ${errorMessage}`,
          retry_count: (invoice.retry_count ?? 0) + 1,
        })
        .eq("id", invoiceId);

      logger.error("sync_retry_creation_failed", {
        invoiceId,
        orgId,
        userId: user.id,
        outputType,
        transactionType,
        error: errorMessage,
        ...errorDetail,
        durationMs: Date.now() - startTime,
      });

      if (error instanceof QBOApiError) {
        if (error.detail?.includes("Duplicate")) {
          return validationError(
            `A ${OUTPUT_TYPE_LABELS[outputType].toLowerCase()} with this invoice number already exists in QuickBooks. ${error.detail}`
          );
        }
        return validationError(`QuickBooks error: ${error.detail}`);
      }
      return internalError(`Failed to create ${OUTPUT_TYPE_LABELS[outputType].toLowerCase()} in QuickBooks.`);
    }

    // 10. Attach PDF (partial success if this fails)
    let attachmentStatus = "attached";
    try {
      const { data: fileData, error: downloadError } = await adminSupabase.storage
        .from("invoices")
        .download(invoice.file_path);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download file: ${downloadError?.message}`);
      }

      const fileBuffer = Buffer.from(await fileData.arrayBuffer());
      await attachPdfToEntity(adminSupabase, orgId, entityId, providerEntityType, fileBuffer, invoice.file_name);
    } catch (error) {
      attachmentStatus = "failed";
      logger.warn("sync_retry_attachment_failed", {
        invoiceId,
        orgId,
        entityId,
        entityType: providerEntityType,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // 11. Update invoice status to synced
    await adminSupabase
      .from("invoices")
      .update({ status: "synced", error_message: null })
      .eq("id", invoiceId);

    logger.info("sync_retry_complete", {
      invoiceId,
      orgId,
      userId: user.id,
      entityId,
      outputType,
      transactionType,
      providerEntityType,
      attachmentStatus,
      durationMs: Date.now() - startTime,
    });

    return apiSuccess({
      billId: entityId,
      attachmentStatus,
      message: SYNC_SUCCESS_MESSAGES[outputType],
      ...(attachmentStatus === "failed"
        ? {
            warning:
              `${OUTPUT_TYPE_LABELS[outputType]} created but PDF attachment failed. You can attach it manually in QuickBooks.`,
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
