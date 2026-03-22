import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";

/**
 * POST /api/newsletter/subscribe
 * Public endpoint - no auth required. Subscribes an email to the newsletter.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = body.email?.trim()?.toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Upsert: re-subscribe if previously unsubscribed
    const { error } = await admin.from("newsletter_subscribers").upsert(
      {
        email,
        subscribed: true,
        source: "landing_page",
        subscribed_at: new Date().toISOString(),
        unsubscribed_at: null,
      },
      { onConflict: "email" }
    );

    if (error) {
      logger.error("newsletter_subscribe_failed", {
        email,
        error: error.message,
      });
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 }
      );
    }

    logger.info("newsletter_subscribed", { email, source: "landing_page" });

    return NextResponse.json({ data: { subscribed: true } });
  } catch (err) {
    logger.error("newsletter_subscribe_error", {
      error: String(err),
    });
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
