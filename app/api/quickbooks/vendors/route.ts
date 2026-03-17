import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVendorOptions, QBOApiError } from "@/lib/quickbooks/api";
import { logger } from "@/lib/utils/logger";
import { authError, apiSuccess, internalError } from "@/lib/utils/errors";

/**
 * GET /api/quickbooks/vendors
 *
 * Returns active QBO vendors formatted for dropdown UI.
 * Requires authenticated user with a QBO connection.
 */
export async function GET() {
  const startTime = Date.now();

  try {
    // Verify authentication
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return authError();
    }

    // Get user's org
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership) {
      return authError("No organization found.");
    }

    // Fetch vendors from QBO
    const adminSupabase = createAdminClient();
    const vendors = await getVendorOptions(adminSupabase, membership.org_id);

    logger.info("qbo.vendors_fetched", {
      userId: user.id,
      orgId: membership.org_id,
      count: String(vendors.length),
      durationMs: Date.now() - startTime,
    });

    return apiSuccess(vendors);
  } catch (error) {
    if (error instanceof QBOApiError) {
      logger.error("qbo.vendors_api_error", {
        error: error.message,
        code: error.errorCode,
        statusCode: String(error.statusCode),
        durationMs: Date.now() - startTime,
      });

      if (error.statusCode === 401) {
        return authError("QuickBooks connection expired. Please reconnect in Settings.");
      }
    }

    logger.error("qbo.vendors_fetch_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });

    // If no connection, return empty array (UI handles empty state)
    if (error instanceof Error && error.message.includes("No QuickBooks connection")) {
      return apiSuccess([]);
    }

    return internalError("Failed to fetch vendors from QuickBooks.");
  }
}
