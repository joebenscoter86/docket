import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrgWithRole } from "@/lib/supabase/helpers";
import { generateState, generatePKCE, getAuthorizationUrl } from "@/lib/xero/auth";
import { logger } from "@/lib/utils/logger";
import { authError, forbiddenError, internalError } from "@/lib/utils/errors";

/**
 * GET /api/xero/connect
 *
 * Initiates the Xero OAuth2+PKCE flow. Generates state + PKCE pair,
 * stores them in an httpOnly cookie, and redirects to Xero's authorization page.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return authError("You must be logged in to connect Xero.");
    }

    // Verify owner role
    const orgWithRole = await getActiveOrgWithRole(supabase, user.id);
    if (!orgWithRole) {
      return forbiddenError("No organization found.");
    }
    if (orgWithRole.role !== "owner") {
      return forbiddenError("Only the organization owner can connect Xero.");
    }

    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = generateState();
    const authUrl = getAuthorizationUrl(state, codeChallenge);

    const response = NextResponse.redirect(new URL(authUrl));

    const returnTo = request.nextUrl.searchParams.get("returnTo");
    const ALLOWED_RETURN_PATHS = ["/settings", "/onboarding/connect"];
    const cookiePayload = JSON.stringify({
      state,
      codeVerifier,
      ...(returnTo && ALLOWED_RETURN_PATHS.includes(returnTo) && { returnTo }),
    });

    response.cookies.set("xero_oauth_pkce", cookiePayload, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    logger.info("xero.oauth_initiated", {
      userId: user.id,
      durationMs: Date.now() - startTime,
    });

    return response;
  } catch (error) {
    logger.error("xero.oauth_initiate_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return internalError("Failed to initiate Xero connection.");
  }
}
