import { createAdminClient } from "@/lib/supabase/admin";
import { getExtractionProvider } from "./provider";
import { mapToExtractedDataRow, mapToLineItemRows } from "./mapper";
import { logger } from "@/lib/utils/logger";
import { getAccountingProvider, getOrgProvider } from "@/lib/accounting";
import { lookupGlMappings } from "./gl-mappings";
import { normalizeForMatching } from "@/lib/utils/normalize";
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";
import { checkContentDuplicates } from "@/lib/invoices/duplicate-check";
import {
  sendExtractionCompleteEmail,
  checkAndSendBatchCompleteEmail,
} from "@/lib/email/triggers";
import type { ExtractionResult, ExtractionContext } from "./types";
import { isRetryableError, toUserFriendlyError } from "./errors";
import { inferTaxExpenseAccount } from "@/lib/accounting/tax-account-inference";
import type { AccountOption } from "@/lib/accounting/types";

// Minimum resolution for image extraction accuracy.
// Images below this threshold on their shortest side get upscaled.
// Determined empirically: receipt text is misread at 595px but accurate at 1500px+.
const MIN_IMAGE_DIMENSION = 1500;

/**
 * Upscale an image buffer if either dimension is below the minimum threshold.
 * PDFs are vector-based and don't need this. Returns the original buffer if
 * no upscaling is needed.
 */
async function ensureMinimumResolution(
  fileBuffer: Buffer,
  mimeType: string
): Promise<Buffer> {
  // Only process raster images, not PDFs
  if (!mimeType.startsWith("image/")) {
    return fileBuffer;
  }

  try {
    const sharp = (await import("sharp")).default;
    const metadata = await sharp(fileBuffer).metadata();

    if (!metadata.width || !metadata.height) {
      return fileBuffer;
    }

    const shortSide = Math.min(metadata.width, metadata.height);
    if (shortSide >= MIN_IMAGE_DIMENSION) {
      return fileBuffer;
    }

    const scale = Math.ceil(MIN_IMAGE_DIMENSION / shortSide);
    const newWidth = metadata.width * scale;
    const newHeight = metadata.height * scale;

    logger.info("image_upscaled_for_extraction", {
      action: "run_extraction",
      originalWidth: metadata.width,
      originalHeight: metadata.height,
      newWidth,
      newHeight,
      scale,
    });

    return await sharp(fileBuffer)
      .resize(newWidth, newHeight, { kernel: "lanczos3" })
      .png()
      .toBuffer();
  } catch (err) {
    // Non-fatal: if sharp fails, proceed with original image
    logger.warn("image_upscale_failed", {
      action: "run_extraction",
      error: err instanceof Error ? err.message : String(err),
    });
    return fileBuffer;
  }
}

export async function runExtraction(params: {
  invoiceId: string;
  orgId: string;
  userId: string;
  filePath: string;
  fileType: string;
}): Promise<ExtractionResult> {
  const { invoiceId, orgId, userId, filePath, fileType } = params;
  const admin = createAdminClient();

  try {
    // 0. Double-extraction guard: skip if already extracting, otherwise set status
    const { data: currentInvoice, error: statusQueryError } = await admin
      .from("invoices")
      .select("status")
      .eq("id", invoiceId)
      .single();

    if (statusQueryError || !currentInvoice) {
      throw new Error("Failed to query invoice status");
    }

    if (currentInvoice.status === "extracting") {
      logger.warn("extraction_already_in_progress", {
        action: "run_extraction",
        invoiceId,
        orgId,
        userId,
      });
      return {
        data: {
          vendorName: null,
          vendorAddress: null,
          invoiceNumber: null,
          invoiceDate: null,
          dueDate: null,
          subtotal: null,
          taxAmount: null,
          totalAmount: null,
          currency: "USD",
          paymentTerms: null,
          confidenceScore: "low",
          lineItems: [],
        },
        rawResponse: {},
        modelVersion: "skipped",
        durationMs: 0,
      };
    }

    // Set status to extracting
    await admin
      .from("invoices")
      .update({ status: "extracting", error_message: null })
      .eq("id", invoiceId);

    // 1. Generate fresh signed URL
    const { data: signedUrlData, error: signedUrlError } = await admin.storage
      .from("invoices")
      .createSignedUrl(filePath, 3600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error("Failed to retrieve uploaded file");
    }

    // 2. Fetch file bytes
    const fileResponse = await fetch(signedUrlData.signedUrl);
    if (!fileResponse.ok) {
      throw new Error("Failed to retrieve uploaded file");
    }
    const rawFileBuffer = Buffer.from(await fileResponse.arrayBuffer());

    // 2.5. Upscale small images for extraction accuracy
    // Receipt images at low resolution (<1500px) cause digit misreads.
    // PDFs are unaffected (vector-based rendering).
    const fileBuffer = await ensureMinimumResolution(rawFileBuffer, fileType);

    // 3. Fetch QBO accounts for GL suggestions (non-fatal)
    // queryAccounts() internally handles connection lookup and token decryption.
    // If no QBO connection exists, it throws — the catch block handles it gracefully.
    let accountContext: ExtractionContext | undefined;
    let validAccountIds: Set<string> | undefined;
    let allAccountOptions: AccountOption[] = [];
    try {
      const providerType = await getOrgProvider(admin, orgId);
      let accounts: Array<{ id: string; name: string }> = [];
      if (providerType) {
        const provider = getAccountingProvider(providerType);
        const accountOptions = await provider.fetchAccounts(admin, orgId);
        allAccountOptions = accountOptions;
        // AI inference is scoped to Expense accounts only.
        // Full account list is available in the dropdown for manual override.
        const expenseAccounts = accountOptions.filter((a) => a.classification === "Expense");
        accounts = expenseAccounts.map((a) => ({ id: a.value, name: a.label }));
      }
      if (accounts.length > 0) {
        accountContext = { accounts };
        validAccountIds = new Set(accounts.map((a) => a.id));
      }
    } catch (err) {
      // Non-fatal: no QBO connection, expired token, API error — all handled here.
      // Extraction proceeds without GL suggestions.
      logger.warn("gl_suggestion_accounts_fetch_failed", {
        action: "run_extraction",
        invoiceId,
        orgId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 4. Call extraction provider with retry for transient errors
    const provider = getExtractionProvider();
    const RETRY_DELAYS = [1000, 2000, 4000]; // exponential backoff: 1s, 2s, 4s
    let lastError: Error | null = null;
    let result: ExtractionResult | null = null;

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        result = await provider.extractInvoiceData(fileBuffer, fileType, accountContext);
        lastError = null;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (!isRetryableError(lastError) || attempt === RETRY_DELAYS.length) {
          break;
        }

        const delay = RETRY_DELAYS[attempt];
        logger.warn("extraction_retrying", {
          action: "run_extraction",
          invoiceId,
          orgId,
          attempt: attempt + 1,
          maxRetries: RETRY_DELAYS.length,
          delayMs: delay,
          error: lastError.message.substring(0, 200),
        });

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    if (lastError || !result) {
      throw lastError ?? new Error("Extraction failed after retries");
    }

    // 4.5. Validate AI-suggested GL account IDs against real account list
    if (validAccountIds && result.data.lineItems.length > 0) {
      for (const item of result.data.lineItems) {
        if (
          item.suggestedGlAccountId &&
          !validAccountIds.has(item.suggestedGlAccountId)
        ) {
          logger.warn("gl_suggestion_invalid_id_discarded", {
            action: "run_extraction",
            invoiceId,
            orgId,
            suggestedId: item.suggestedGlAccountId,
          });
          item.suggestedGlAccountId = null;
        }
      }
    }

    // 4.6. Override AI suggestions with history-based mappings
    if (result.data.vendorName && result.data.lineItems.length > 0) {
      try {
        const mappings = await lookupGlMappings(orgId, result.data.vendorName);
        if (mappings.size > 0) {
          for (const item of result.data.lineItems) {
            if (!item.description) continue;
            const normalizedDesc = normalizeForMatching(item.description);
            const historicalAccountId = mappings.get(normalizedDesc);
            if (historicalAccountId && validAccountIds?.has(historicalAccountId)) {
              item.suggestedGlAccountId = historicalAccountId;
              item.glAccountId = historicalAccountId;
              item.glSuggestionSource = "history";
            }
            // If historical account is stale (not in validAccountIds), keep AI suggestion
          }
        }
      } catch (err) {
        logger.warn("gl_history_lookup_failed", {
          action: "run_extraction",
          invoiceId,
          orgId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 5. Clean up stale extraction data from prior attempts
    const { data: existingData } = await admin
      .from("extracted_data")
      .select("id")
      .eq("invoice_id", invoiceId);

    if (existingData && existingData.length > 0) {
      const existingIds = existingData.map((row: { id: string }) => row.id);

      // Delete line items first (FK dependency)
      await admin
        .from("extracted_line_items")
        .delete()
        .in("extracted_data_id", existingIds);

      // Delete extracted_data
      await admin
        .from("extracted_data")
        .delete()
        .eq("invoice_id", invoiceId);

      logger.info("extraction_stale_data_cleaned", {
        invoiceId,
        orgId,
        userId,
        deletedIds: existingIds,
      });
    }

    // 6. Store extracted_data
    const extractedDataRow = mapToExtractedDataRow(result, invoiceId);
    const { data: extractedRow, error: insertError } = await admin
      .from("extracted_data")
      .insert(extractedDataRow)
      .select("id")
      .single();

    if (insertError || !extractedRow) {
      throw new Error(
        "Failed to store extraction results: " +
          (insertError?.message ?? "unknown error")
      );
    }

    // 7. Store line items
    if (result.data.lineItems.length > 0) {
      const lineItemRows = mapToLineItemRows(
        result.data.lineItems,
        extractedRow.id
      );

      const { error: lineItemError } = await admin
        .from("extracted_line_items")
        .insert(lineItemRows);

      if (lineItemError) {
        throw new Error(
          "Failed to store line items: " + lineItemError.message
        );
      }
    }

    // 7.5. Add "Sales Tax" line item when tax_amount > 0
    // This makes tax visible and editable in the review UI with an auto-inferred GL account.
    const taxAmount = result.data.taxAmount;
    if (taxAmount != null && taxAmount > 0) {
      const taxGlAccountId = inferTaxExpenseAccount(allAccountOptions);
      const nextSortOrder = result.data.lineItems.length;
      const { error: taxLineError } = await admin
        .from("extracted_line_items")
        .insert({
          extracted_data_id: extractedRow.id,
          description: "Sales Tax",
          quantity: 1,
          unit_price: taxAmount,
          amount: taxAmount,
          gl_account_id: taxGlAccountId,
          suggested_gl_account_id: taxGlAccountId,
          gl_suggestion_source: taxGlAccountId ? "auto" : null,
          is_user_confirmed: false,
          sort_order: nextSortOrder,
        });

      if (taxLineError) {
        logger.warn("extraction_tax_line_insert_failed", {
          action: "run_extraction",
          invoiceId,
          orgId,
          error: taxLineError.message,
        });
      }
    }

    // 8. Update invoice status to pending_review
    // Tax treatment is NOT set from AI extraction -- user must explicitly enable it via toggle.
    const { error: statusError } = await admin
      .from("invoices")
      .update({
        status: "pending_review",
        error_message: null,
      })
      .eq("id", invoiceId);

    if (statusError) {
      logger.warn("extraction_status_update_failed", {
        invoiceId,
        orgId,
        userId,
        error: statusError.message,
      });
    }

    // 8.5. Check for content-based duplicates (non-fatal)
    try {
      if (result.data.vendorName) {
        const duplicates = await checkContentDuplicates({
          admin,
          invoiceId,
          orgId,
          vendorName: result.data.vendorName,
          invoiceNumber: result.data.invoiceNumber,
          totalAmount: result.data.totalAmount ? Number(result.data.totalAmount) : null,
          invoiceDate: result.data.invoiceDate,
        });

        if (duplicates.length > 0) {
          await admin
            .from("extracted_data")
            .update({ duplicate_matches: duplicates })
            .eq("invoice_id", invoiceId);

          logger.info("duplicate_content_matches_found", {
            invoiceId,
            orgId,
            matchCount: duplicates.length,
            matchTypes: duplicates.map((d) => d.matchType),
          });
        }
      }
    } catch (err) {
      logger.warn("duplicate_check_failed", {
        invoiceId,
        orgId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 9. Log success
    logger.info("extraction_complete", {
      invoiceId,
      orgId,
      userId,
      durationMs: result.durationMs,
      modelVersion: result.modelVersion,
      confidenceScore: result.data.confidenceScore,
      lineItemCount: result.data.lineItems.length,
      status: "success",
    });

    trackServerEvent(userId, AnalyticsEvents.INVOICE_EXTRACTED, {
      invoiceId,
      confidenceScore: result.data.confidenceScore,
      durationMs: result.durationMs,
    });

    // 10. Email notification (fire-and-forget)
    // Fetch invoice file_name and batch_id for email context
    const { data: invoiceMeta } = await admin
      .from("invoices")
      .select("file_name, batch_id")
      .eq("id", invoiceId)
      .single();

    if (invoiceMeta?.batch_id) {
      // Batch upload: check if entire batch is done, send single summary
      checkAndSendBatchCompleteEmail(userId, invoiceMeta.batch_id);
    } else {
      // Single upload: send per-invoice email
      sendExtractionCompleteEmail(
        userId,
        invoiceId,
        invoiceMeta?.file_name ?? "invoice",
        result.data.vendorName,
        result.data.totalAmount?.toString() ?? null
      );
    }

    return result;
  } catch (error) {
    const rawMessage =
      error instanceof Error ? error.message : "Unknown extraction error";
    const friendlyMessage = toUserFriendlyError(rawMessage);

    // Read current retry_count, then update with increment
    const { data: currentInvoice } = await admin
      .from("invoices")
      .select("retry_count")
      .eq("id", invoiceId)
      .single();

    await admin
      .from("invoices")
      .update({
        status: "error",
        error_message: friendlyMessage,
        retry_count: (currentInvoice?.retry_count ?? 0) + 1,
      })
      .eq("id", invoiceId);

    logger.error("extraction_failed", {
      invoiceId,
      orgId,
      userId,
      error: rawMessage,
      friendlyError: friendlyMessage,
      status: "error",
    });

    throw error;
  }
}
