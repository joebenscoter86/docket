import { createAdminClient } from "@/lib/supabase/admin";
import { getExtractionProvider } from "./provider";
import { mapToExtractedDataRow, mapToLineItemRows } from "./mapper";
import { logger } from "@/lib/utils/logger";
import { queryAccounts } from "@/lib/quickbooks/api";
import { lookupGlMappings } from "./gl-mappings";
import { normalizeForMatching } from "@/lib/utils/normalize";
import type { ExtractionResult, ExtractionContext } from "./types";

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
    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());

    // 3. Fetch QBO accounts for GL suggestions (non-fatal)
    // queryAccounts() internally handles connection lookup and token decryption.
    // If no QBO connection exists, it throws — the catch block handles it gracefully.
    let accountContext: ExtractionContext | undefined;
    let validAccountIds: Set<string> | undefined;
    try {
      const accounts = await queryAccounts(admin, orgId);
      if (accounts.length > 0) {
        const mappedAccounts = accounts.map((a) => ({
          id: a.Id,
          name: a.SubAccount ? a.FullyQualifiedName : a.Name,
        }));
        accountContext = { accounts: mappedAccounts };
        validAccountIds = new Set(mappedAccounts.map((a) => a.id));
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

    // 4. Call extraction provider
    const provider = getExtractionProvider();
    const result = await provider.extractInvoiceData(fileBuffer, fileType, accountContext);

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

    // 8. Update invoice status to pending_review
    const { error: statusError } = await admin
      .from("invoices")
      .update({ status: "pending_review", error_message: null })
      .eq("id", invoiceId);

    if (statusError) {
      logger.warn("extraction_status_update_failed", {
        invoiceId,
        orgId,
        userId,
        error: statusError.message,
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

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown extraction error";

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
        error_message: errorMessage,
        retry_count: (currentInvoice?.retry_count ?? 0) + 1,
      })
      .eq("id", invoiceId);

    logger.error("extraction_failed", {
      invoiceId,
      orgId,
      userId,
      error: errorMessage,
      status: "error",
    });

    throw error;
  }
}
