import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPaymentAccounts, QBOApiError } from "@/lib/quickbooks/api";
import { isConnected } from "@/lib/quickbooks/auth";
import { logger } from "@/lib/utils/logger";
import { authError, validationError, apiSuccess, internalError } from "@/lib/utils/errors";

const VALID_ACCOUNT_TYPES = ["Bank", "CreditCard"] as const;
type AccountType = (typeof VALID_ACCOUNT_TYPES)[number];

/**
 * GET /api/quickbooks/payment-accounts?type=Bank|CreditCard
 *
 * Returns active QBO payment accounts (bank or credit card) for the
 * payment account selector when output_type is non-Bill.
 * Requires authenticated user with an active QBO connection.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. Validate type parameter
    const accountType = request.nextUrl.searchParams.get("type") as AccountType | null;

    if (!accountType || !VALID_ACCOUNT_TYPES.includes(accountType)) {
      return validationError(
        'Query parameter "type" is required and must be "Bank" or "CreditCard".'
      );
    }

    // 2. Verify authentication
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return authError();
    }

    // 3. Get user's org
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

    // 4. Verify QBO connection
    const connected = await isConnected(adminSupabase, orgId);
    if (!connected) {
      return validationError("Connect QuickBooks in Settings first.");
    }

    logger.info("qbo.fetch_payment_accounts_start", {
      action: "fetch_payment_accounts",
      accountType,
      userId: user.id,
      orgId,
    });

    // 5. Fetch accounts from QBO
    const accounts = await fetchPaymentAccounts(adminSupabase, orgId, accountType);

    logger.info("qbo.fetch_payment_accounts_complete", {
      action: "fetch_payment_accounts",
      accountType,
      userId: user.id,
      orgId,
      count: String(accounts.length),
      durationMs: Date.now() - startTime,
      status: "success",
    });

    return apiSuccess({ accounts });
  } catch (error) {
    if (error instanceof QBOApiError) {
      logger.error("qbo.payment_accounts_api_error", {
        error: error.message,
        code: error.errorCode,
        statusCode: String(error.statusCode),
        durationMs: Date.now() - startTime,
      });

      if (error.statusCode === 401) {
        return authError("QuickBooks connection expired. Please reconnect in Settings.");
      }
    }

    logger.error("qbo.payment_accounts_fetch_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });

    return internalError("Failed to fetch payment accounts from QuickBooks.");
  }
}
