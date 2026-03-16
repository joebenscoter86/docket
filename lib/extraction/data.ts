import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/utils/logger";

/** Fields the review UI is allowed to update */
export const EDITABLE_FIELDS = new Set([
  "vendor_name",
  "vendor_address",
  "invoice_number",
  "invoice_date",
  "due_date",
  "subtotal",
  "tax_amount",
  "total_amount",
  "currency",
  "payment_terms",
]);

/**
 * Fetch extracted data + line items for an invoice.
 * Uses the RLS-aware server client — caller must be authenticated.
 * Returns null if no extraction exists.
 */
export async function getExtractedData(invoiceId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("extracted_data")
    .select(
      `
      *,
      extracted_line_items (
        id, description, quantity, unit_price, amount, gl_account_id, sort_order
      )
    `
    )
    .eq("invoice_id", invoiceId)
    .single();

  if (error || !data) {
    if (error?.code === "PGRST116") {
      return null;
    }
    logger.warn("get_extracted_data_failed", {
      invoiceId,
      error: error?.message ?? "unknown",
      status: "error",
    });
    return null;
  }

  return data;
}

/**
 * Update a single field on extracted_data. Used by the review UI
 * when the user corrects a field.
 *
 * Only allows updates to user-editable fields (not raw_ai_response, id, etc.).
 * Uses the RLS-aware server client — caller must be authenticated.
 */
export async function updateExtractedField(
  extractedDataId: string,
  field: string,
  value: string | number | null
) {
  if (!EDITABLE_FIELDS.has(field)) {
    throw new Error(`Field '${field}' is not editable`);
  }

  const supabase = createClient();

  const { data, error } = await supabase
    .from("extracted_data")
    .update({ [field]: value })
    .eq("id", extractedDataId)
    .select()
    .single();

  if (error || !data) {
    logger.error("update_extracted_field_failed", {
      extractedDataId,
      field,
      error: error?.message ?? "unknown",
      status: "error",
    });
    return null;
  }

  return data;
}

/**
 * Record a user correction for learning/audit purposes.
 * Non-critical: logs errors but does not throw.
 */
export async function recordCorrection(
  invoiceId: string,
  orgId: string,
  fieldName: string,
  originalValue: string | null,
  correctedValue: string | null
) {
  const supabase = createClient();

  const { error } = await supabase.from("corrections").insert({
    invoice_id: invoiceId,
    org_id: orgId,
    field_name: fieldName,
    original_value: originalValue,
    corrected_value: correctedValue,
  });

  if (error) {
    logger.error("record_correction_failed", {
      invoiceId,
      orgId,
      field: fieldName,
      error: error.message,
      status: "error",
    });
  }
}
