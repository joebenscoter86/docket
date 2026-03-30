import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/supabase/helpers";
import {
  getAccountingProvider,
  getOrgProvider,
  AccountingApiError,
} from "@/lib/accounting";
import { logger } from "@/lib/utils/logger";
import { authError, apiSuccess, internalError, unprocessableEntity } from "@/lib/utils/errors";

/**
 * GET /api/accounting/tracking-categories
 *
 * Returns tracking categories (dimensions) from the connected accounting provider.
 * Xero: up to 2 categories. QBO: empty array (not yet supported).
 * Returns empty array if no connection exists.
 */
export async function GET() {
  const startTime = Date.now();

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return authError();
    }

    const orgId = await getActiveOrgId(supabase, user.id);
    if (!orgId) {
      return authError("No organization found.");
    }
    const adminSupabase = createAdminClient();

    const providerType = await getOrgProvider(adminSupabase, orgId);
    if (!providerType) {
      return unprocessableEntity(
        "No accounting connection found. Connect a provider in Settings."
      );
    }

    const provider = getAccountingProvider(providerType);
    const categories = await provider.fetchTrackingCategories(adminSupabase, orgId);

    logger.info("accounting.tracking_categories_fetched", {
      userId: user.id,
      orgId,
      provider: providerType,
      count: String(categories.length),
      durationMs: Date.now() - startTime,
    });

    return apiSuccess(categories);
  } catch (error) {
    if (error instanceof AccountingApiError) {
      logger.error("accounting.tracking_categories_api_error", {
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

    logger.error("accounting.tracking_categories_fetch_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });

    return internalError("Failed to fetch tracking categories.");
  }
}
