import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAccountingProvider,
  getOrgProvider,
  AccountingApiError,
} from "@/lib/accounting";
import { logger } from "@/lib/utils/logger";
import { authError, apiSuccess, internalError } from "@/lib/utils/errors";

/**
 * GET /api/accounting/accounts
 *
 * Returns active expense accounts formatted for dropdown UI.
 * Provider-agnostic — works with any connected accounting system.
 * Returns an empty array if no accounting connection exists.
 */
export async function GET() {
  const startTime = Date.now();

  try {
    // Verify authentication
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

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

    const orgId = membership.org_id;
    const adminSupabase = createAdminClient();

    // Check for a connected accounting provider
    const providerType = await getOrgProvider(adminSupabase, orgId);
    if (!providerType) {
      return apiSuccess([]);
    }

    const provider = getAccountingProvider(providerType);
    const accounts = await provider.fetchAccounts(adminSupabase, orgId);

    logger.info("accounting.accounts_fetched", {
      userId: user.id,
      orgId,
      provider: providerType,
      count: String(accounts.length),
      durationMs: Date.now() - startTime,
    });

    return apiSuccess(accounts);
  } catch (error) {
    if (error instanceof AccountingApiError) {
      logger.error("accounting.accounts_api_error", {
        error: error.message,
        code: error.errorCode,
        statusCode: String(error.statusCode),
        durationMs: Date.now() - startTime,
      });

      if (error.statusCode === 401) {
        return authError(
          "Accounting connection expired. Please reconnect in Settings."
        );
      }
    }

    logger.error("accounting.accounts_fetch_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });

    // Legacy: existing QBO helpers throw this message — return empty array
    if (
      error instanceof Error &&
      error.message.includes("No QuickBooks connection")
    ) {
      return apiSuccess([]);
    }

    return internalError("Failed to fetch accounts.");
  }
}
