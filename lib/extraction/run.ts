import { createAdminClient } from "@/lib/supabase/admin";
import { getExtractionProvider } from "./provider";
import { logger } from "@/lib/utils/logger";
import type { ExtractionResult } from "./types";

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
      throw new Error(
        "Failed to generate signed URL: " +
          (signedUrlError?.message ?? "unknown error")
      );
    }

    // 2. Fetch file bytes
    const fileResponse = await fetch(signedUrlData.signedUrl);
    if (!fileResponse.ok) {
      throw new Error(`Failed to fetch file: HTTP ${fileResponse.status}`);
    }
    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());

    // 3. Call extraction provider
    const provider = getExtractionProvider();
    const result = await provider.extractInvoiceData(fileBuffer, fileType);

    // 4. Store extracted_data
    const { data: extractedRow, error: insertError } = await admin
      .from("extracted_data")
      .insert({
        invoice_id: invoiceId,
        vendor_name: result.data.vendorName,
        vendor_address: result.data.vendorAddress,
        invoice_number: result.data.invoiceNumber,
        invoice_date: result.data.invoiceDate,
        due_date: result.data.dueDate,
        subtotal: result.data.subtotal,
        tax_amount: result.data.taxAmount,
        total_amount: result.data.totalAmount,
        currency: result.data.currency,
        payment_terms: result.data.paymentTerms,
        raw_ai_response: result.rawResponse,
        confidence_score: result.data.confidenceScore,
        model_version: result.modelVersion,
        extraction_duration_ms: result.durationMs,
      })
      .select("id")
      .single();

    if (insertError || !extractedRow) {
      throw new Error(
        "Failed to store extraction results: " +
          (insertError?.message ?? "unknown error")
      );
    }

    // 5. Store line items
    if (result.data.lineItems.length > 0) {
      const lineItemRows = result.data.lineItems.map((item) => ({
        extracted_data_id: extractedRow.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        amount: item.amount,
        gl_account_id: null,
        sort_order: item.sortOrder,
      }));

      const { error: lineItemError } = await admin
        .from("extracted_line_items")
        .insert(lineItemRows);

      if (lineItemError) {
        throw new Error(
          "Failed to store line items: " + lineItemError.message
        );
      }
    }

    // 6. Update invoice status to pending_review
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

    // 7. Log success
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
