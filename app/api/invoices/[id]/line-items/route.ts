import { createClient } from "@/lib/supabase/server";
import { createLineItem } from "@/lib/extraction/data";
import {
  authError,
  notFound,
  validationError,
  internalError,
  apiSuccess,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

export async function POST(
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

  // 2. Parse body
  let body: { extracted_data_id?: string };
  try {
    body = await request.json();
  } catch {
    return validationError("Invalid JSON body");
  }

  const { extracted_data_id } = body;
  if (!extracted_data_id || typeof extracted_data_id !== "string") {
    return validationError("Missing or invalid 'extracted_data_id'");
  }

  // 3. Verify ownership via invoice (RLS enforces org access)
  const { data: invoice, error: invError } = await client
    .from("invoices")
    .select("id, org_id")
    .eq("id", invoiceId)
    .single();

  if (invError || !invoice) {
    logger.warn("create_line_item_invoice_not_found", {
      invoiceId,
      userId: user.id,
      status: "error",
    });
    return notFound("Invoice not found");
  }

  // 4. Verify extracted_data_id belongs to this invoice
  const { data: extractedData, error: edError } = await client
    .from("extracted_data")
    .select("id")
    .eq("id", extracted_data_id)
    .eq("invoice_id", invoiceId)
    .single();

  if (edError || !extractedData) {
    return validationError("extracted_data_id does not belong to this invoice");
  }

  logger.info("create_line_item_start", {
    action: "create_line_item",
    invoiceId,
    orgId: invoice.org_id,
    userId: user.id,
  });

  // 5. Create line item
  const lineItem = await createLineItem(extracted_data_id);
  if (!lineItem) {
    logger.error("create_line_item_failed", {
      action: "create_line_item",
      invoiceId,
      orgId: invoice.org_id,
      userId: user.id,
      durationMs: Date.now() - start,
      status: "error",
    });
    return internalError("Failed to create line item");
  }

  logger.info("create_line_item_success", {
    action: "create_line_item",
    invoiceId,
    itemId: lineItem.id,
    orgId: invoice.org_id,
    userId: user.id,
    durationMs: Date.now() - start,
    status: "success",
  });

  return apiSuccess(lineItem);
}
