import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateState, getAuthorizationUrl } from "@/lib/quickbooks/auth";
import { logger } from "@/lib/utils/logger";
import { authError, internalError } from "@/lib/utils/errors";

/**
 * GET /api/quickbooks/connect
 *
 * Initiates the QBO OAuth2 flow. Generates a CSRF state parameter,
 * stores it in an httpOnly cookie, and redirects to Intuit's authorization page.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify the user is authenticated
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return authError("You must be logged in to connect QuickBooks.");
    }

    // Generate CSRF state and store in cookie on the redirect response
    const state = generateState();
    const authUrl = getAuthorizationUrl(state);

    // NextResponse.redirect requires absolute URL
    const response = NextResponse.redirect(new URL(authUrl));

    response.cookies.set("qbo_oauth_state", state, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      maxAge: 600, // 10 minutes — plenty for OAuth flow
      path: "/",
    });

    // Store returnTo for post-OAuth redirect (validated against allowlist)
    const returnTo = request.nextUrl.searchParams.get("returnTo");
    const ALLOWED_RETURN_PATHS = ["/settings", "/onboarding/connect"];
    if (returnTo && ALLOWED_RETURN_PATHS.includes(returnTo)) {
      response.cookies.set("qbo_oauth_return_to", returnTo, {
        httpOnly: true,
        secure: request.nextUrl.protocol === "https:",
        sameSite: "lax",
        maxAge: 600,
        path: "/",
      });
    }

    logger.info("qbo.oauth_initiated", {
      userId: user.id,
      durationMs: Date.now() - startTime,
    });

    return response;
  } catch (error) {
    logger.error("qbo.oauth_initiate_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return internalError("Failed to initiate QuickBooks connection.");
  }
}
