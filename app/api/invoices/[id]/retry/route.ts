import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runExtraction } from "@/lib/extraction/run";
import {
  authError,
  notFound,
  conflict,
  unprocessableEntity,
  internalError,
  apiSuccess,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

const MAX_RETRIES = 3;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: invoiceId } = await params;
  const start = Date.now();

  // 1. Auth check
  const client = createClient();
  const {
    data: { user },
    error: authErr,
  } = await client.auth.getUser();
  if (authErr || !user) {
    logger.warn("retry_route_unauthorized", { invoiceId, status: "error" });
    return authError();
  }

  logger.info("retry_route_start", {
    action: "retry",
    invoiceId,
    userId: user.id,
  });

  // 2. Ownership check via RLS
  const { data: invoice, error: invoiceErr } = await client
    .from("invoices")
    .select("id, org_id, status, file_path, file_type, retry_count")
    .eq("id", invoiceId)
    .single();

  if (invoiceErr || !invoice) {
    logger.warn("retry_route_not_found", {
      invoiceId,
      userId: user.id,
      status: "error",
    });
    return notFound("Invoice not found");
  }

  // 3. Status guard — only error invoices can be retried
  if (invoice.status !== "error") {
    logger.warn("retry_route_wrong_status", {
      invoiceId,
      userId: user.id,
      orgId: invoice.org_id,
      currentStatus: invoice.status,
      status: "error",
    });
    return conflict("Invoice is not in an error state");
  }

  // 4. Max retry guard
  if (invoice.retry_count >= MAX_RETRIES) {
    logger.warn("retry_route_max_retries", {
      invoiceId,
      userId: user.id,
      orgId: invoice.org_id,
      retryCount: invoice.retry_count,
      status: "error",
    });
    return unprocessableEntity(
      "Extraction failed after 3 attempts. You can enter this invoice manually."
    );
  }

  // 5. Set status to extracting
  const admin = createAdminClient();
  await admin
    .from("invoices")
    .update({ status: "extracting", error_message: null })
    .eq("id", invoiceId);

  // 6. Run extraction
  try {
    const result = await runExtraction({
      invoiceId,
      orgId: invoice.org_id,
      userId: user.id,
      filePath: invoice.file_path,
      fileType: invoice.file_type,
    });

    logger.info("retry_route_success", {
      action: "retry",
      invoiceId,
      orgId: invoice.org_id,
      userId: user.id,
      durationMs: Date.now() - start,
      status: "success",
    });

    return apiSuccess(result.data);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Extraction failed";
    logger.error("retry_route_failed", {
      action: "retry",
      invoiceId,
      orgId: invoice.org_id,
      userId: user.id,
      durationMs: Date.now() - start,
      error: errorMessage,
      status: "error",
    });
    return internalError(errorMessage);
  }
}
