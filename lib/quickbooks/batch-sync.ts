import {
  getAccountingProvider,
  AccountingApiError,
} from "@/lib/accounting";
import type {
  AccountingProviderType,
  CreateBillInput,
  CreatePurchaseInput,
  SyncLineItem,
  TransactionResult,
} from "@/lib/accounting";
import { logger } from "@/lib/utils/logger";
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
  xero_bill_status: string | null;
  tax_treatment: string | null;
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
 * Processes a list of approved invoices for accounting provider sync sequentially.
 * Called via waitUntil() from the batch sync route — runs in the background.
 *
 * Per-invoice failures are logged and skipped; the batch continues.
 * 429 rate-limit responses trigger exponential backoff + retry.
 */
export async function processBatchSync(
  adminSupabase: SupabaseAdminClient,
  orgId: string,
  batchId: string,
  invoices: BatchSyncInvoice[],
  providerType: AccountingProviderType
): Promise<BatchSyncResult> {
  const provider = getAccountingProvider(providerType);
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

    try {
      // 1. Idempotency guard
      const { data: existingSync } = await adminSupabase
        .from("sync_log")
        .select("provider_bill_id")
        .eq("invoice_id", invoiceId)
        .eq("provider", providerType)
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

      // 2. Load extracted data + line items
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

      // 4. Create bill or purchase via provider abstraction
      const taxTreatment = (invoice.tax_treatment === "exclusive" || invoice.tax_treatment === "inclusive" || invoice.tax_treatment === "no_tax")
        ? invoice.tax_treatment
        : undefined;

      const syncLineItems: SyncLineItem[] = (lineItems ?? []).map(
        (li: { amount: number; gl_account_id: string; description: string | null; tax_code_id: string | null }) => ({
          amount: Number(li.amount),
          glAccountId: li.gl_account_id,
          description: li.description,
          ...(li.tax_code_id ? { taxCodeId: li.tax_code_id } : {}),
        })
      );

      const batchTaxAmount = Number(extractedData.tax_amount) || 0;
      if (!taxTreatment && batchTaxAmount > 0 && syncLineItems.length > 0) {
        syncLineItems.push({
          amount: batchTaxAmount,
          glAccountId: syncLineItems[0].glAccountId,
          description: "Sales Tax",
        });
      }

      let result: TransactionResult;
      let requestInput: unknown;

      if (isBill) {
        const xeroStatus = (invoice.xero_bill_status === "DRAFT" || invoice.xero_bill_status === "AUTHORISED")
          ? invoice.xero_bill_status
          : undefined;
        const input: CreateBillInput = {
          vendorRef: extractedData.vendor_ref,
          lineItems: syncLineItems,
          invoiceDate: extractedData.invoice_date,
          dueDate: extractedData.due_date,
          invoiceNumber: extractedData.invoice_number,
          xeroStatus,
          taxTreatment,
        };
        requestInput = input;
        result = await provider.createBill(adminSupabase, orgId, input);
      } else {
        const input: CreatePurchaseInput = {
          vendorRef: extractedData.vendor_ref,
          paymentAccountRef: invoice.payment_account_id!,
          paymentType: OUTPUT_TYPE_TO_PAYMENT_TYPE[
            outputType as Exclude<OutputType, "bill">
          ] as "Check" | "Cash" | "CreditCard",
          lineItems: syncLineItems,
          invoiceDate: extractedData.invoice_date,
          invoiceNumber: extractedData.invoice_number,
          taxTreatment,
        };
        requestInput = input;
        result = await provider.createPurchase(adminSupabase, orgId, input);
      }

      // 5. Log success in sync_log
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
        await provider.attachDocument(
          adminSupabase,
          orgId,
          result.entityId,
          result.entityType,
          fileBuffer,
          invoice.file_name
        );
      } catch (attachError) {
        logger.warn("batch_sync.attachment_failed", {
          invoiceId,
          orgId,
          batchId,
          entityId: result.entityId,
          entityType: result.entityType,
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
        entityId: result.entityId,
        entityType: result.entityType,
        outputType,
        transactionType,
      });

      synced++;
      rateLimitRetryCount = 0; // reset backoff counter on success
      i++;
    } catch (error) {
      // Rate limit — backoff and retry the same invoice
      if (
        error instanceof AccountingApiError &&
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
        error instanceof AccountingApiError
          ? {
              code: error.errorCode,
              element: error.element,
              detail: error.detail,
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
        provider: providerType,
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
