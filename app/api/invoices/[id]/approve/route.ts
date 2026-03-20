import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  authError,
  notFound,
  validationError,
  conflict,
  internalError,
  apiSuccess,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";

export async function POST(
  _request: Request,
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

  logger.info("invoice.approve.start", { invoiceId, userId: user.id });

  // 2. Fetch invoice (RLS verifies ownership)
  const { data: invoice, error: invoiceErr } = await client
    .from("invoices")
    .select("id, org_id, status")
    .eq("id", invoiceId)
    .single();

  if (invoiceErr || !invoice) {
    logger.warn("invoice.approve.not_found", {
      invoiceId,
      userId: user.id,
      status: "error",
    });
    return notFound("Invoice not found");
  }

  // 3. Status guard
  if (invoice.status === "approved" || invoice.status === "synced") {
    return conflict(`Invoice is already ${invoice.status}`);
  }
  if (invoice.status !== "pending_review") {
    return validationError(
      `Invoice cannot be approved from status '${invoice.status}'`
    );
  }

  // 4. Fetch extracted data and validate required fields
  const { data: extractedData, error: edErr } = await client
    .from("extracted_data")
    .select("id, vendor_name, total_amount")
    .eq("invoice_id", invoiceId)
    .single();

  if (edErr || !extractedData) {
    logger.warn("invoice.approve.no_extracted_data", {
      invoiceId,
      userId: user.id,
      status: "error",
    });
    return notFound("No extracted data found for this invoice");
  }

  // 5. Validate required fields
  const missingFields: string[] = [];
  if (!extractedData.vendor_name) missingFields.push("vendor_name");
  if (extractedData.total_amount === null || extractedData.total_amount === undefined) {
    missingFields.push("total_amount");
  }
  if (missingFields.length > 0) {
    return validationError(
      `Missing required fields: ${missingFields.join(", ")}`,
      { missingFields }
    );
  }

  // 6. Update invoice status to approved
  const admin = createAdminClient();
  const { error: updateErr } = await admin
    .from("invoices")
    .update({ status: "approved" })
    .eq("id", invoiceId);

  if (updateErr) {
    logger.error("invoice.approve.update_failed", {
      invoiceId,
      orgId: invoice.org_id,
      userId: user.id,
      durationMs: Date.now() - start,
      status: "error",
      error: updateErr.message,
    });
    return internalError("Failed to update invoice status");
  }

  // Bust the server component cache so the invoice list shows updated status
  revalidatePath("/invoices");

  logger.info("invoice.approve.success", {
    invoiceId,
    orgId: invoice.org_id,
    userId: user.id,
    durationMs: Date.now() - start,
    status: "success",
  });

  trackServerEvent(user.id, AnalyticsEvents.INVOICE_APPROVED, { invoiceId });

  return apiSuccess({ status: "approved" });
}
