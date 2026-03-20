import { getValidAccessToken } from "@/lib/quickbooks/auth";
import {
  createBill,
  createPurchase,
  attachPdfToEntity,
  QBOApiError,
} from "@/lib/quickbooks/api";
import { logger } from "@/lib/utils/logger";
import type {
  QBOBillPayload,
  QBOBillLine,
  QBOPurchasePayload,
  QBOPurchaseLine,
} from "@/lib/quickbooks/types";
import type { OutputType, ProviderEntityType } from "@/lib/types/invoice";
import { OUTPUT_TYPE_TO_PAYMENT_TYPE } from "@/lib/types/invoice";

// ─── Types ───

export type SupabaseAdminClient = ReturnType<
  typeof import("@/lib/supabase/admin").createAdminClient
>;

export interface BatchSyncInvoice {
  id: string;
  org_id: string;
  output_type: string | null;
  payment_account_id: string | null;
  file_path: string;
  file_name: string;
  retry_count: number;
}

export interface BatchSyncResult {
  synced: number;
  failed: number;
  skippedIdempotent: number;
  totalMs: number;
}

// ─── Rate-limit backoff ───

const RATE_LIMIT_BACKOFFS_MS = [5000, 10000, 20000, 40000, 60000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Core function ───

/**
 * Processes a list of approved invoices for QBO sync sequentially.
 * Called via waitUntil() from the batch sync route — runs in the background.
 *
 * Per-invoice failures are logged and skipped; the batch continues.
 * QBO 429 rate-limit responses trigger exponential backoff + retry.
 */
export async function processBatchSync(
  adminSupabase: SupabaseAdminClient,
  orgId: string,
  batchId: string,
  invoices: BatchSyncInvoice[]
): Promise<BatchSyncResult> {
  const startTime = Date.now();
  let synced = 0;
  let failed = 0;
  let skippedIdempotent = 0;

  logger.info("batch_sync.start", {
    orgId,
    batchId,
    invoiceCount: invoices.length,
  });

  let i = 0;
  let rateLimitRetryCount = 0;

  while (i < invoices.length) {
    const invoice = invoices[i];
    const invoiceId = invoice.id;
    const outputType = (invoice.output_type ?? "bill") as OutputType;
    const isBill = outputType === "bill";
    const transactionType = outputType;
    const providerEntityType: ProviderEntityType = isBill ? "Bill" : "Purchase";

    try {
      // 1. Idempotency guard
      const { data: existingSync } = await adminSupabase
        .from("sync_log")
        .select("provider_bill_id")
        .eq("invoice_id", invoiceId)
        .eq("provider", "quickbooks")
        .eq("status", "success")
        .eq("transaction_type", transactionType)
        .limit(1)
        .single();

      if (existingSync?.provider_bill_id) {
        logger.info("batch_sync.idempotent_skip", {
          invoiceId,
          orgId,
          batchId,
          entityId: existingSync.provider_bill_id,
          outputType,
        });
        skippedIdempotent++;
        i++;
        continue;
      }

      // 2. Token check (auto-refreshes if expiring within 5 min)
      await getValidAccessToken(adminSupabase, orgId);

      // 3. Load extracted data + line items
      const { data: extractedData } = await adminSupabase
        .from("extracted_data")
        .select("*")
        .eq("invoice_id", invoiceId)
        .single();

      if (!extractedData) {
        throw new Error("No extracted data found for this invoice.");
      }

      const { data: lineItems } = await adminSupabase
        .from("extracted_line_items")
        .select("*")
        .eq("extracted_data_id", extractedData.id)
        .order("sort_order", { ascending: true });

      // 4. Create bill or purchase in QBO
      let entityId: string;
      let requestPayload: unknown;
      let responsePayload: unknown;

      if (isBill) {
        const billLines: QBOBillLine[] = (lineItems ?? []).map(
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

        requestPayload = billPayload;
        const billResponse = await createBill(
          adminSupabase,
          orgId,
          billPayload
        );
        entityId = billResponse.Bill.Id;
        responsePayload = billResponse;
      } else {
        const purchaseLines: QBOPurchaseLine[] = (lineItems ?? []).map(
          (li: { amount: number; gl_account_id: string; description: string | null }) => ({
            Amount: Number(li.amount),
            DetailType: "AccountBasedExpenseLineDetail" as const,
            Description: li.description ?? undefined,
            AccountBasedExpenseLineDetail: {
              AccountRef: { value: li.gl_account_id },
            },
          })
        );

        const paymentType =
          OUTPUT_TYPE_TO_PAYMENT_TYPE[
            outputType as Exclude<OutputType, "bill">
          ];

        const purchasePayload: QBOPurchasePayload = {
          PaymentType: paymentType as "Check" | "Cash" | "CreditCard",
          AccountRef: { value: invoice.payment_account_id! },
          EntityRef: { value: extractedData.vendor_ref, type: "Vendor" },
          Line: purchaseLines,
          ...(extractedData.invoice_date
            ? { TxnDate: extractedData.invoice_date }
            : {}),
          ...(extractedData.invoice_number
            ? { DocNumber: extractedData.invoice_number }
            : {}),
        };

        requestPayload = purchasePayload;
        const purchaseResponse = await createPurchase(
          adminSupabase,
          orgId,
          purchasePayload
        );
        entityId = purchaseResponse.Purchase.Id;
        responsePayload = purchaseResponse;
      }

      // 5. Log success in sync_log
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

      // 6. Attach PDF (best-effort)
      try {
        const { data: fileData, error: downloadError } = await adminSupabase
          .storage.from("invoices")
          .download(invoice.file_path);

        if (downloadError || !fileData) {
          throw new Error(
            `Failed to download file: ${downloadError?.message}`
          );
        }

        const fileBuffer = Buffer.from(await fileData.arrayBuffer());
        await attachPdfToEntity(
          adminSupabase,
          orgId,
          entityId,
          providerEntityType,
          fileBuffer,
          invoice.file_name
        );
      } catch (attachError) {
        logger.warn("batch_sync.attachment_failed", {
          invoiceId,
          orgId,
          batchId,
          entityId,
          entityType: providerEntityType,
          error:
            attachError instanceof Error
              ? attachError.message
              : "Unknown error",
        });
        // Non-fatal — continue to status update
      }

      // 7. Update invoice status to synced
      await adminSupabase
        .from("invoices")
        .update({ status: "synced", error_message: null })
        .eq("id", invoiceId);

      logger.info("batch_sync.invoice_synced", {
        invoiceId,
        orgId,
        batchId,
        entityId,
        outputType,
        transactionType,
        providerEntityType,
      });

      synced++;
      rateLimitRetryCount = 0; // reset backoff counter on success
      i++;
    } catch (error) {
      // QBO rate limit — backoff and retry the same invoice
      if (
        error instanceof QBOApiError &&
        error.statusCode === 429
      ) {
        const backoffIndex = Math.min(
          rateLimitRetryCount,
          RATE_LIMIT_BACKOFFS_MS.length - 1
        );
        const backoffMs = RATE_LIMIT_BACKOFFS_MS[backoffIndex];
        rateLimitRetryCount++;

        logger.warn("batch_sync.rate_limited", {
          invoiceId,
          orgId,
          batchId,
          backoffMs,
          retryAttempt: rateLimitRetryCount,
        });

        await sleep(backoffMs);
        // Do NOT increment i — retry the same invoice
        continue;
      }

      // Any other error — log, mark invoice as error, continue to next
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

      logger.error("batch_sync.invoice_failed", {
        invoiceId,
        orgId,
        batchId,
        outputType,
        error: errorMessage,
        ...errorDetail,
      });

      // Log failure in sync_log
      await adminSupabase.from("sync_log").insert({
        invoice_id: invoiceId,
        provider: "quickbooks",
        provider_response: errorDetail as Record<string, unknown>,
        status: "failed",
        transaction_type: (invoice.output_type ?? "bill") as OutputType,
        provider_entity_type: (
          (invoice.output_type ?? "bill") === "bill" ? "Bill" : "Purchase"
        ) as ProviderEntityType,
      });

      // Update invoice status to error
      await adminSupabase
        .from("invoices")
        .update({
          status: "error",
          error_message: `Sync failed: ${errorMessage}`,
          retry_count: (invoice.retry_count ?? 0) + 1,
        })
        .eq("id", invoiceId);

      failed++;
      rateLimitRetryCount = 0;
      i++;
    }
  }

  const totalMs = Date.now() - startTime;

  logger.info("batch_sync.complete", {
    orgId,
    batchId,
    synced,
    failed,
    skippedIdempotent,
    totalMs,
  });

  return { synced, failed, skippedIdempotent, totalMs };
}
