import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgWithRole } from "@/lib/supabase/helpers";
import { exchangeCodeForTokens, getXeroTenantId, storeConnection } from "@/lib/xero/auth";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/auth/callback/xero
 *
 * OAuth2 callback handler. Xero redirects here after the user authorizes.
 * Validates CSRF state, exchanges code + PKCE verifier for tokens,
 * fetches tenant ID, encrypts and stores the connection.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const searchParams = request.nextUrl.searchParams;

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const baseUrl = request.nextUrl.origin;

  // Parse the PKCE cookie
  const pkceCookie = request.cookies.get("xero_oauth_pkce")?.value;
  let savedState: string | undefined;
  let codeVerifier: string | undefined;
  let returnTo = "/settings";

  if (pkceCookie) {
    try {
      const parsed = JSON.parse(pkceCookie);
      savedState = parsed.state;
      codeVerifier = parsed.codeVerifier;
      if (parsed.returnTo) {
        const ALLOWED_RETURN_PATHS = ["/settings", "/onboarding/connect"];
        if (ALLOWED_RETURN_PATHS.includes(parsed.returnTo)) {
          returnTo = parsed.returnTo;
        }
      }
    } catch {
      // Cookie parse failed — treat as missing
    }
  }

  const errorRedirect = (message: string) => {
    const response = NextResponse.redirect(
      `${baseUrl}${returnTo}?xero_error=${encodeURIComponent(message)}`
    );
    response.cookies.delete("xero_oauth_pkce");
    return response;
  };

  if (error) {
    logger.warn("xero.oauth_denied", { error });
    return errorRedirect("Xero connection was not authorized.");
  }

  if (!code || !state) {
    logger.error("xero.oauth_callback_missing_params", {
      hasCode: String(!!code),
      hasState: String(!!state),
    });
    return errorRedirect("Connection failed. Missing required parameters.");
  }

  if (!savedState || savedState !== state) {
    logger.error("xero.oauth_csrf_mismatch", {
      hasSavedState: String(!!savedState),
      stateMatch: String(savedState === state),
    });
    return errorRedirect("Connection failed. Please try again.");
  }

  if (!codeVerifier) {
    logger.error("xero.oauth_missing_verifier");
    return errorRedirect("Connection failed. Please try again.");
  }

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${baseUrl}/login?redirect=${returnTo}`);
    }

    const orgWithRole = await getActiveOrgWithRole(supabase, user.id);

    if (!orgWithRole) {
      logger.error("xero.oauth_no_org", { userId: user.id });
      return errorRedirect("No organization found. Please contact support.");
    }

    if (orgWithRole.role !== "owner") {
      logger.warn("xero.oauth_not_owner", { userId: user.id, orgId: orgWithRole.orgId, role: orgWithRole.role });
      return errorRedirect("Only the organization owner can connect Xero.");
    }

    const orgId = orgWithRole.orgId;

    const tokens = await exchangeCodeForTokens(code, codeVerifier);
    const { tenantId, tenantName } = await getXeroTenantId(tokens.accessToken);

    const adminSupabase = createAdminClient();
    await storeConnection(adminSupabase, orgId, tokens, tenantId, tenantName);

    logger.info("xero.oauth_complete", {
      userId: user.id,
      orgId,
      tenantId,
      durationMs: Date.now() - startTime,
    });

    const response = NextResponse.redirect(
      `${baseUrl}${returnTo}?xero_success=${encodeURIComponent("Xero connected successfully!")}`
    );
    response.cookies.delete("xero_oauth_pkce");
    return response;
  } catch (err) {
    logger.error("xero.oauth_callback_failed", {
      error: err instanceof Error ? err.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return errorRedirect("Failed to connect Xero. Please try again.");
  }
}
