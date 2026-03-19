import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";
import {
  authError,
  notFound,
  apiSuccess,
} from "@/lib/utils/errors";

/**
 * GET /api/invoices/[id]/sync/log
 *
 * Returns sync_log entries for an invoice, ordered newest-first.
 * Used by the review page to display sync status and history.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: invoiceId } = await params;

  try {
    // 1. Verify authentication
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return authError();
    }

    // 2. Verify ownership via RLS — if user can see the invoice, they can see its sync logs
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, org_id")
      .eq("id", invoiceId)
      .single();

    if (!invoice) {
      return notFound("Invoice not found.");
    }

    // 3. Fetch sync logs using admin client (sync_log may not have RLS via org_id directly)
    const adminSupabase = createAdminClient();
    const { data: logs, error: logError } = await adminSupabase
      .from("sync_log")
      .select("id, provider, provider_bill_id, status, synced_at, provider_response, transaction_type, provider_entity_type")
      .eq("invoice_id", invoiceId)
      .order("synced_at", { ascending: false });

    if (logError) {
      logger.error("sync_log_fetch_failed", {
        invoiceId,
        userId: user.id,
        error: logError.message,
        status: "error",
      });
      return apiSuccess({ logs: [] });
    }

    return apiSuccess({ logs: logs ?? [] });
  } catch (error) {
    logger.error("sync_log_unexpected_error", {
      invoiceId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return apiSuccess({ logs: [] });
  }
}
