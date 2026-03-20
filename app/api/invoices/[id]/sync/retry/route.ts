import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAccountingProvider,
  getOrgProvider,
  AccountingApiError,
} from "@/lib/accounting";
import type { CreateBillInput, CreatePurchaseInput, SyncLineItem, TransactionResult } from "@/lib/accounting";
import { logger } from "@/lib/utils/logger";
import {
  authError,
  notFound,
  validationError,
  unprocessableEntity,
  apiSuccess,
  internalError,
} from "@/lib/utils/errors";
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
        return validationError("Invoice has already been synced.");
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

    // 6. Verify accounting connection and get provider
    const providerType = await getOrgProvider(adminSupabase, orgId);
    if (!providerType) {
      return validationError("Connect an accounting provider in Settings before syncing.");
    }
    const provider = getAccountingProvider(providerType);

    // 5. Count previous sync attempts from sync_log (append-only)
    const { count: syncAttemptCount } = await adminSupabase
      .from("sync_log")
      .select("id", { count: "exact", head: true })
      .eq("invoice_id", invoiceId)
      .eq("provider", providerType);

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
        `Sync failed after ${MAX_SYNC_RETRIES} attempts. Please check your accounting connection and try again later.`
      );
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
      return validationError("Vendor name and vendor must be set before syncing.");
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

    // 9. Create transaction via provider abstraction
    const syncLineItems: SyncLineItem[] = lineItems.map(
      (li: { amount: number; gl_account_id: string; description: string | null }) => ({
        amount: Number(li.amount),
        glAccountId: li.gl_account_id,
        description: li.description,
      })
    );

    let result: TransactionResult;
    let requestInput: unknown;

    try {
      if (isBill) {
        const input: CreateBillInput = {
          vendorRef: extractedData.vendor_ref,
          lineItems: syncLineItems,
          invoiceDate: extractedData.invoice_date,
          dueDate: extractedData.due_date,
          invoiceNumber: extractedData.invoice_number,
        };
        requestInput = input;
        result = await provider.createBill(adminSupabase, orgId, input);
      } else {
        const input: CreatePurchaseInput = {
          vendorRef: extractedData.vendor_ref,
          paymentAccountRef: invoice.payment_account_id!,
          paymentType: OUTPUT_TYPE_TO_PAYMENT_TYPE[outputType as Exclude<OutputType, "bill">] as "Check" | "Cash" | "CreditCard",
          lineItems: syncLineItems,
          invoiceDate: extractedData.invoice_date,
          invoiceNumber: extractedData.invoice_number,
        };
        requestInput = input;
        result = await provider.createPurchase(adminSupabase, orgId, input);
      }

      // Log success in sync_log (new row — append-only)
      await adminSupabase.from("sync_log").insert({
        invoice_id: invoiceId,
        provider: providerType,
        provider_bill_id: result.entityId,
        request_payload: requestInput as Record<string, unknown>,
        provider_response: result.providerResponse,
        status: "success",
        transaction_type: transactionType,
        provider_entity_type: result.entityType,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorDetail = error instanceof AccountingApiError
        ? { code: error.errorCode, element: error.element, detail: error.detail }
        : {};

      await adminSupabase.from("sync_log").insert({
        invoice_id: invoiceId,
        provider: providerType,
        request_payload: requestInput as Record<string, unknown>,
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

      logger.error("accounting.sync_retry_creation_failed", {
        invoiceId,
        orgId,
        userId: user.id,
        outputType,
        transactionType,
        error: errorMessage,
        ...errorDetail,
        durationMs: Date.now() - startTime,
      });

      if (error instanceof AccountingApiError) {
        if (error.detail?.includes("Duplicate")) {
          return validationError(
            `A ${OUTPUT_TYPE_LABELS[outputType].toLowerCase()} with this invoice number already exists. ${error.detail}`
          );
        }
        return validationError(`Accounting error: ${error.detail}`);
      }
      return internalError(`Failed to create ${OUTPUT_TYPE_LABELS[outputType].toLowerCase()}.`);
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
      await provider.attachDocument(
        adminSupabase, orgId, result.entityId, result.entityType, fileBuffer, invoice.file_name
      );
    } catch (error) {
      attachmentStatus = "failed";
      logger.warn("accounting.sync_retry_attachment_failed", {
        invoiceId,
        orgId,
        entityId: result.entityId,
        entityType: result.entityType,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // 11. Update invoice status to synced
    await adminSupabase
      .from("invoices")
      .update({ status: "synced", error_message: null })
      .eq("id", invoiceId);

    logger.info("accounting.sync_retry_complete", {
      invoiceId,
      orgId,
      userId: user.id,
      entityId: result.entityId,
      outputType,
      transactionType,
      providerEntityType: result.entityType,
      attachmentStatus,
      durationMs: Date.now() - startTime,
    });

    return apiSuccess({
      billId: result.entityId,
      attachmentStatus,
      message: SYNC_SUCCESS_MESSAGES[outputType],
      ...(attachmentStatus === "failed"
        ? {
            warning:
              `${OUTPUT_TYPE_LABELS[outputType]} created but PDF attachment failed. You can attach it manually.`,
          }
        : {}),
    });
  } catch (error) {
    logger.error("accounting.sync_retry_unexpected_error", {
      invoiceId,
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return internalError("An unexpected error occurred during sync retry.");
  }
}
