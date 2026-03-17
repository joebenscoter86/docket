import { createClient } from "@/lib/supabase/server";
import { updateExtractedField, recordCorrection, EDITABLE_FIELDS } from "@/lib/extraction/data";
import {
  authError,
  notFound,
  validationError,
  internalError,
  apiSuccess,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: invoiceId } = await params;
  const start = Date.now();

  // 1. Auth
  const client = createClient();
  const {
    data: { user },
    error: authErr,
  } = await client.auth.getUser();
  if (authErr || !user) {
    return authError();
  }

  logger.info("update_field_start", { invoiceId, userId: user.id });

  // 2. Parse + validate body
  let body: { field?: string; value?: unknown };
  try {
    body = await request.json();
  } catch {
    return validationError("Invalid JSON body");
  }

  const { field, value } = body;
  if (!field || typeof field !== "string") {
    return validationError("Missing or invalid 'field' parameter");
  }
  if (!EDITABLE_FIELDS.has(field)) {
    return validationError(`Field '${field}' is not editable`);
  }

  // 3. Fetch extracted_data (RLS enforces ownership)
  const { data: extractedData, error: edError } = await client
    .from("extracted_data")
    .select(
      "id, invoice_id, vendor_name, vendor_address, invoice_number, invoice_date, due_date, payment_terms, currency, subtotal, tax_amount, total_amount, vendor_ref"
    )
    .eq("invoice_id", invoiceId)
    .single();

  if (edError || !extractedData) {
    logger.warn("update_field_not_found", {
      invoiceId,
      userId: user.id,
      status: "error",
    });
    return notFound("Extracted data not found for this invoice");
  }

  const preUpdateValue = extractedData[field as keyof typeof extractedData];

  // 4. Update the field
  const castValue = value as string | number | null;
  const updated = await updateExtractedField(extractedData.id, field, castValue);
  if (!updated) {
    logger.error("update_field_failed", {
      invoiceId,
      userId: user.id,
      field,
      durationMs: Date.now() - start,
      status: "error",
    });
    return internalError("Failed to update field");
  }

  // 5. Record correction if value changed
  const stringifyValue = (v: unknown) =>
    v === null || v === undefined ? null : String(v);
  if (stringifyValue(castValue) !== stringifyValue(preUpdateValue)) {
    // Fetch org_id from invoice
    const { data: invoice } = await client
      .from("invoices")
      .select("org_id")
      .eq("id", invoiceId)
      .single();

    if (invoice?.org_id) {
      await recordCorrection(
        invoiceId,
        invoice.org_id,
        field,
        stringifyValue(preUpdateValue),
        stringifyValue(castValue)
      );
    }
  }

  logger.info("update_field_success", {
    invoiceId,
    userId: user.id,
    field,
    durationMs: Date.now() - start,
    status: "success",
  });

  return apiSuccess({ field, value: castValue, saved: true });
}
