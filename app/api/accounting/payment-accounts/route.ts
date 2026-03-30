import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/supabase/helpers";
import {
  getAccountingProvider,
  getOrgProvider,
  AccountingApiError,
} from "@/lib/accounting";
import { logger } from "@/lib/utils/logger";
import {
  authError,
  validationError,
  apiSuccess,
  internalError,
} from "@/lib/utils/errors";

const VALID_ACCOUNT_TYPES = ["Bank", "CreditCard"] as const;
type AccountType = (typeof VALID_ACCOUNT_TYPES)[number];

/**
 * GET /api/accounting/payment-accounts?type=Bank|CreditCard
 *
 * Returns active payment accounts (bank or credit card) for the payment
 * account selector when output_type is non-Bill.
 * Provider-agnostic — works with any connected accounting system.
 * Requires authenticated user with an active accounting connection.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Validate type parameter
    const accountType = request.nextUrl.searchParams.get(
      "type"
    ) as AccountType | null;

    if (!accountType || !VALID_ACCOUNT_TYPES.includes(accountType)) {
      return validationError(
        'Query parameter "type" is required and must be "Bank" or "CreditCard".'
      );
    }

    // 2. Verify authentication
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return authError();
    }

    // 3. Get user's org
    const orgId = await getActiveOrgId(supabase, user.id);
    if (!orgId) {
      return authError("No organization found.");
    }
    const adminSupabase = createAdminClient();

    // 4. Require an active accounting connection
    // getOrgProvider returning non-null already confirms connection exists
    const providerType = await getOrgProvider(adminSupabase, orgId);
    if (!providerType) {
      return validationError(
        "Connect an accounting provider in Settings first."
      );
    }

    logger.info("accounting.fetch_payment_accounts_start", {
      action: "fetch_payment_accounts",
      accountType,
      userId: user.id,
      orgId,
      provider: providerType,
    });

    // 5. Fetch payment accounts from the provider
    const provider = getAccountingProvider(providerType);
    const accounts = await provider.fetchPaymentAccounts(
      adminSupabase,
      orgId,
      accountType
    );

    logger.info("accounting.fetch_payment_accounts_complete", {
      action: "fetch_payment_accounts",
      accountType,
      userId: user.id,
      orgId,
      provider: providerType,
      count: String(accounts.length),
      durationMs: Date.now() - startTime,
      status: "success",
    });

    return apiSuccess({ accounts });
  } catch (error) {
    if (error instanceof AccountingApiError) {
      logger.error("accounting.payment_accounts_api_error", {
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

    logger.error("accounting.payment_accounts_fetch_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });

    return internalError("Failed to fetch payment accounts.");
  }
}
