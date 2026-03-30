import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/supabase/helpers";
import { getAccountOptions, QBOApiError } from "@/lib/quickbooks/api";
import { logger } from "@/lib/utils/logger";
import { authError, apiSuccess, internalError } from "@/lib/utils/errors";

/**
 * GET /api/quickbooks/accounts
 *
 * Returns active QBO expense accounts formatted for dropdown UI.
 * Uses FullyQualifiedName for sub-accounts to show hierarchy.
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
    const orgId = await getActiveOrgId(supabase, user.id);
    if (!orgId) {
      return authError("No organization found.");
    }

    // Fetch accounts from QBO
    const adminSupabase = createAdminClient();
    const accounts = await getAccountOptions(adminSupabase, orgId);

    logger.info("qbo.accounts_fetched", {
      userId: user.id,
      orgId,
      count: String(accounts.length),
      durationMs: Date.now() - startTime,
    });

    return apiSuccess(accounts);
  } catch (error) {
    if (error instanceof QBOApiError) {
      logger.error("qbo.accounts_api_error", {
        error: error.message,
        code: error.errorCode,
        statusCode: String(error.statusCode),
        durationMs: Date.now() - startTime,
      });

      if (error.statusCode === 401) {
        return authError("QuickBooks connection expired. Please reconnect in Settings.");
      }
    }

    logger.error("qbo.accounts_fetch_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });

    // If no connection, return empty array (UI handles empty state)
    if (error instanceof Error && error.message.includes("No QuickBooks connection")) {
      return apiSuccess([]);
    }

    return internalError("Failed to fetch accounts from QuickBooks.");
  }
}
