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
 * GET /api/accounting/tax-codes
 *
 * Returns available tax codes formatted for dropdown UI.
 * Provider-agnostic -- works with any connected accounting system.
 * Returns 422 if no accounting connection exists.
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
    const taxCodes = await provider.fetchTaxCodes(adminSupabase, orgId);

    logger.info("accounting.tax_codes_fetched", {
      userId: user.id,
      orgId,
      provider: providerType,
      count: String(taxCodes.length),
      durationMs: Date.now() - startTime,
    });

    return apiSuccess(taxCodes);
  } catch (error) {
    if (error instanceof AccountingApiError) {
      logger.error("accounting.tax_codes_api_error", {
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

    logger.error("accounting.tax_codes_fetch_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });

    return internalError("Failed to fetch tax codes.");
  }
}
