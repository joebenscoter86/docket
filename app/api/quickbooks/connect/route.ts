import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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
export async function GET() {
  const startTime = Date.now();

  try {
    // Verify the user is authenticated
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return authError("You must be logged in to connect QuickBooks.");
    }

    // Generate CSRF state and store in cookie
    const state = generateState();

    const cookieStore = cookies();
    cookieStore.set("qbo_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes — plenty for OAuth flow
      path: "/",
    });

    // Build authorization URL and redirect
    const authUrl = getAuthorizationUrl(state);

    logger.info("qbo.oauth_initiated", {
      userId: user.id,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.redirect(authUrl);
  } catch (error) {
    logger.error("qbo.oauth_initiate_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return internalError("Failed to initiate QuickBooks connection.");
  }
}
