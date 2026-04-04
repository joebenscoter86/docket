import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";

export async function DELETE() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("users")
    .update({ phone_number: null })
    .eq("id", user.id);

  if (error) {
    logger.error("sms_phone_remove_failed", {
      userId: user.id,
      error: error.message,
    });
    return NextResponse.json(
      { error: "Failed to remove phone number." },
      { status: 500 }
    );
  }

  trackServerEvent(user.id, AnalyticsEvents.SMS_PHONE_REMOVED, {});

  logger.info("sms_phone_removed", { userId: user.id });

  return NextResponse.json({ data: { removed: true } });
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: userData } = await admin
    .from("users")
    .select("phone_number")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    data: {
      phoneNumber: userData?.phone_number ?? null,
      docketNumber: process.env.TWILIO_PHONE_NUMBER ?? null,
    },
  });
}
