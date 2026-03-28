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
  "vendor_ref",
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
        id, description, quantity, unit_price, amount, gl_account_id, suggested_gl_account_id, gl_suggestion_source, is_user_confirmed, sort_order
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

/** Allowed fields for line item updates */
export const LINE_ITEM_EDITABLE_FIELDS = new Set([
  "description",
  "quantity",
  "unit_price",
  "amount",
  "gl_account_id",
  "tracking",
]);

export async function createLineItem(extractedDataId: string) {
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("extracted_line_items")
    .select("sort_order")
    .eq("extracted_data_id", extractedDataId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextSortOrder =
    existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

  const { data, error } = await supabase
    .from("extracted_line_items")
    .insert({
      extracted_data_id: extractedDataId,
      description: null,
      quantity: null,
      unit_price: null,
      amount: null,
      gl_account_id: null,
      suggested_gl_account_id: null,
      gl_suggestion_source: null,
      is_user_confirmed: false,
      sort_order: nextSortOrder,
    })
    .select("id, description, quantity, unit_price, amount, gl_account_id, suggested_gl_account_id, gl_suggestion_source, is_user_confirmed, sort_order")
    .single();

  if (error || !data) {
    logger.error("create_line_item_failed", {
      extractedDataId,
      error: error?.message ?? "unknown",
      status: "error",
    });
    return null;
  }

  return data;
}

export async function updateLineItemField(
  itemId: string,
  field: string,
  value: string | number | null | Record<string, unknown>[] | null
) {
  if (!LINE_ITEM_EDITABLE_FIELDS.has(field)) {
    throw new Error(`Field '${field}' is not editable on line items`);
  }

  const supabase = createClient();

  let updatePayload: Record<string, unknown>;
  if (field === "gl_account_id") {
    updatePayload =
      value !== null
        ? { gl_account_id: value, is_user_confirmed: true }
        : { gl_account_id: null, is_user_confirmed: false };
  } else {
    updatePayload = { [field]: value };
  }

  const { data, error } = await supabase
    .from("extracted_line_items")
    .update(updatePayload)
    .eq("id", itemId)
    .select("id, description, quantity, unit_price, amount, gl_account_id, suggested_gl_account_id, gl_suggestion_source, is_user_confirmed, sort_order")
    .single();

  if (error || !data) {
    logger.error("update_line_item_field_failed", {
      itemId,
      field,
      error: error?.message ?? "unknown",
      status: "error",
    });
    return null;
  }

  return data;
}

export async function deleteLineItem(itemId: string) {
  const supabase = createClient();

  const { error } = await supabase
    .from("extracted_line_items")
    .delete()
    .eq("id", itemId);

  if (error) {
    logger.error("delete_line_item_failed", {
      itemId,
      error: error.message,
      status: "error",
    });
    return false;
  }

  return true;
}
