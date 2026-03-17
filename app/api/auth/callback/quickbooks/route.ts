import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCodeForTokens, storeConnection } from "@/lib/quickbooks/auth";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/auth/callback/quickbooks
 *
 * OAuth2 callback handler. Intuit redirects here after the user authorizes.
 * Validates the CSRF state, exchanges the code for tokens, encrypts and stores them.
 * Redirects to /settings with a success or error message.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const searchParams = request.nextUrl.searchParams;

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const realmId = searchParams.get("realmId");
  const error = searchParams.get("error");

  const baseUrl = request.nextUrl.origin;

  // Handle user denying authorization
  if (error) {
    logger.warn("qbo.oauth_denied", { error });
    return NextResponse.redirect(
      `${baseUrl}/settings?qbo_error=${encodeURIComponent("QuickBooks connection was not authorized.")}`
    );
  }

  // Validate required params
  if (!code || !state || !realmId) {
    logger.error("qbo.oauth_callback_missing_params", {
      hasCode: String(!!code),
      hasState: String(!!state),
      hasRealmId: String(!!realmId),
    });
    return NextResponse.redirect(
      `${baseUrl}/settings?qbo_error=${encodeURIComponent("Connection failed. Missing required parameters.")}`
    );
  }

  // CSRF validation: read state from cookie via request
  const savedState = request.cookies.get("qbo_oauth_state")?.value;

  if (!savedState || savedState !== state) {
    logger.error("qbo.oauth_csrf_mismatch", {
      hasSavedState: String(!!savedState),
      stateMatch: String(savedState === state),
    });
    const response = NextResponse.redirect(
      `${baseUrl}/settings?qbo_error=${encodeURIComponent("Connection failed. Please try again.")}`
    );
    response.cookies.delete("qbo_oauth_state");
    return response;
  }

  try {
    // Verify user is authenticated
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(
        `${baseUrl}/login?redirect=/settings`
      );
    }

    // Get the user's org
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership) {
      logger.error("qbo.oauth_no_org", { userId: user.id });
      return NextResponse.redirect(
        `${baseUrl}/settings?qbo_error=${encodeURIComponent("No organization found. Please contact support.")}`
      );
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);
    tokens.companyId = realmId;

    // Store encrypted tokens
    const adminSupabase = createAdminClient();
    await storeConnection(adminSupabase, membership.org_id, tokens);

    logger.info("qbo.oauth_complete", {
      userId: user.id,
      orgId: membership.org_id,
      companyId: realmId,
      durationMs: Date.now() - startTime,
    });

    // Redirect to settings with success, and clear the state cookie
    const response = NextResponse.redirect(
      `${baseUrl}/settings?qbo_success=${encodeURIComponent("QuickBooks connected successfully!")}`
    );
    response.cookies.delete("qbo_oauth_state");
    return response;
  } catch (err) {
    logger.error("qbo.oauth_callback_failed", {
      error: err instanceof Error ? err.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return NextResponse.redirect(
      `${baseUrl}/settings?qbo_error=${encodeURIComponent("Failed to connect QuickBooks. Please try again.")}`
    );
  }
}
