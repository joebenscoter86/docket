import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runExtraction } from "@/lib/extraction/run";
import { authError, notFound, conflict, internalError, apiSuccess } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

const BLOCKED_STATUSES = ["extracting", "approved", "synced"] as const;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: invoiceId } = await params;
  const start = Date.now();

  // 1. Auth check
  const client = createClient();
  const { data: { user }, error: authErr } = await client.auth.getUser();
  if (authErr || !user) {
    logger.warn("extract_route_unauthorized", { invoiceId, status: "error" });
    return authError();
  }

  logger.info("extract_route_start", { action: "extract", invoiceId, userId: user.id });

  // 2. Ownership check via server client (RLS enforces ownership)
  const { data: invoice, error: invoiceErr } = await client
    .from("invoices")
    .select("id, org_id, status, file_path, file_type")
    .eq("id", invoiceId)
    .single();

  if (invoiceErr || !invoice) {
    logger.warn("extract_route_not_found", { invoiceId, userId: user.id, status: "error" });
    return notFound("Invoice not found");
  }

  // 3. Status guard
  if ((BLOCKED_STATUSES as readonly string[]).includes(invoice.status)) {
    const messages: Record<string, string> = {
      extracting: "Extraction already in progress",
      approved: "Invoice is already approved",
      synced: "Invoice has already been synced",
    };
    logger.warn("extract_route_conflict", {
      invoiceId,
      userId: user.id,
      orgId: invoice.org_id,
      currentStatus: invoice.status,
      status: "error",
    });
    return conflict(messages[invoice.status] ?? "Cannot extract invoice in current state");
  }

  // 4. Set status to extracting via admin client (bypasses RLS for status updates)
  const admin = createAdminClient();
  await admin
    .from("invoices")
    .update({ status: "extracting", error_message: null })
    .eq("id", invoiceId);

  // 5. Run extraction
  try {
    const result = await runExtraction({
      invoiceId,
      orgId: invoice.org_id,
      userId: user.id,
      filePath: invoice.file_path,
      fileType: invoice.file_type,
    });

    logger.info("extract_route_success", {
      action: "extract",
      invoiceId,
      orgId: invoice.org_id,
      userId: user.id,
      durationMs: Date.now() - start,
      status: "success",
    });

    return apiSuccess(result.data);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Extraction failed";
    logger.error("extract_route_failed", {
      action: "extract",
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
