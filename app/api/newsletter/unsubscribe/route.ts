import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";
import { generateUnsubscribeToken } from "@/lib/email/unsubscribe";

/**
 * GET /api/newsletter/unsubscribe?email=...&token=...
 * One-click unsubscribe. Token is HMAC-signed email to prevent unauthorized unsubscribes.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const token = searchParams.get("token");

  if (!email || !token) {
    return new NextResponse(unsubscribePage("Invalid unsubscribe link."), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  // Verify HMAC token
  const expectedToken = generateUnsubscribeToken(email);
  if (token !== expectedToken) {
    return new NextResponse(unsubscribePage("Invalid unsubscribe link."), {
      status: 400,
      headers: { "Content-Type": "text/html" },
    });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("newsletter_subscribers")
    .update({
      subscribed: false,
      unsubscribed_at: new Date().toISOString(),
    })
    .eq("email", email.toLowerCase());

  if (error) {
    logger.error("newsletter_unsubscribe_failed", {
      email,
      error: error.message,
    });
    return new NextResponse(
      unsubscribePage("Something went wrong. Please try again."),
      { status: 500, headers: { "Content-Type": "text/html" } }
    );
  }

  logger.info("newsletter_unsubscribed", { email });

  return new NextResponse(
    unsubscribePage("You have been unsubscribed. You will no longer receive marketing emails from Docket."),
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}

function unsubscribePage(message: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>Docket - Unsubscribe</title></head>
<body style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 80px auto; text-align: center; padding: 0 20px;">
  <h1 style="font-size: 20px; color: #1e293b;">Docket</h1>
  <p style="color: #374151; font-size: 15px; line-height: 1.6;">${message}</p>
</body>
</html>`;
}
