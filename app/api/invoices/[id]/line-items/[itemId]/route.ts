import { createClient } from "@/lib/supabase/server";
import {
  updateLineItemField,
  deleteLineItem,
  recordCorrection,
  LINE_ITEM_EDITABLE_FIELDS,
} from "@/lib/extraction/data";
import { upsertGlMapping } from "@/lib/extraction/gl-mappings";
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
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id: invoiceId, itemId } = await params;
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

  // 2. Parse body
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
  if (!LINE_ITEM_EDITABLE_FIELDS.has(field)) {
    return validationError(`Field '${field}' is not editable`);
  }

  // 3. Verify ownership via invoice (RLS)
  const { data: invoice, error: invError } = await client
    .from("invoices")
    .select("id, org_id")
    .eq("id", invoiceId)
    .single();

  if (invError || !invoice) {
    return notFound("Invoice not found");
  }

  // 4. Fetch current line item value for correction tracking
  const { data: currentItem } = await client
    .from("extracted_line_items")
    .select("id, description, quantity, unit_price, amount, extracted_data_id, tracking")
    .eq("id", itemId)
    .single();

  const preUpdateValue = currentItem?.[field as keyof typeof currentItem] ?? null;

  logger.info("update_line_item_start", {
    action: "update_line_item",
    invoiceId,
    itemId,
    orgId: invoice.org_id,
    userId: user.id,
    field,
  });

  // 5. Update
  const castValue = field === "tracking"
    ? (value as Record<string, unknown>[] | null)
    : (value as string | number | null);
  const updated = await updateLineItemField(itemId, field, castValue);
  if (!updated) {
    logger.error("update_line_item_failed", {
      action: "update_line_item",
      invoiceId,
      itemId,
      orgId: invoice.org_id,
      userId: user.id,
      field,
      durationMs: Date.now() - start,
      status: "error",
    });
    return internalError("Failed to update line item field");
  }

  // 6. Record correction if changed
  const stringify = (v: unknown) =>
    v === null || v === undefined ? null : String(v);
  if (stringify(castValue) !== stringify(preUpdateValue)) {
    await recordCorrection(
      invoiceId,
      invoice.org_id,
      `line_item.${itemId}.${field}`,
      stringify(preUpdateValue),
      stringify(castValue)
    );
  }

  // 7. Record GL mapping when user confirms a GL account
  if (field === "gl_account_id" && castValue !== null && currentItem?.extracted_data_id) {
    const { data: extractedData } = await client
      .from("extracted_data")
      .select("vendor_name")
      .eq("id", currentItem.extracted_data_id)
      .single();

    const vendorName = extractedData?.vendor_name;
    const description = currentItem.description;

    if (vendorName && description) {
      // Fire-and-forget: don't block the response
      upsertGlMapping(invoice.org_id, vendorName, description, String(castValue)).catch(() => {
        // Already logged inside upsertGlMapping
      });
    }
  }

  logger.info("update_line_item_success", {
    action: "update_line_item",
    invoiceId,
    itemId,
    orgId: invoice.org_id,
    userId: user.id,
    field,
    durationMs: Date.now() - start,
    status: "success",
  });

  return apiSuccess(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id: invoiceId, itemId } = await params;
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

  // 2. Verify ownership via invoice (RLS)
  const { data: invoice, error: invError } = await client
    .from("invoices")
    .select("id, org_id")
    .eq("id", invoiceId)
    .single();

  if (invError || !invoice) {
    return notFound("Invoice not found");
  }

  logger.info("delete_line_item_start", {
    action: "delete_line_item",
    invoiceId,
    itemId,
    orgId: invoice.org_id,
    userId: user.id,
  });

  // 3. Delete
  const deleted = await deleteLineItem(itemId);
  if (!deleted) {
    logger.error("delete_line_item_failed", {
      action: "delete_line_item",
      invoiceId,
      itemId,
      orgId: invoice.org_id,
      userId: user.id,
      durationMs: Date.now() - start,
      status: "error",
    });
    return internalError("Failed to delete line item");
  }

  logger.info("delete_line_item_success", {
    action: "delete_line_item",
    invoiceId,
    itemId,
    orgId: invoice.org_id,
    userId: user.id,
    durationMs: Date.now() - start,
    status: "success",
  });

  return apiSuccess({ deleted: true });
}
