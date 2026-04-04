import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { phoneNumber, code } = body;

  if (!phoneNumber || !code) {
    return NextResponse.json(
      { error: "Phone number and code are required." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: verification } = await admin
    .from("sms_verification_codes")
    .select("id, code, expires_at")
    .eq("user_id", user.id)
    .eq("phone_number", phoneNumber)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!verification) {
    return NextResponse.json(
      { error: "No verification code found. Please request a new one." },
      { status: 400 }
    );
  }

  if (new Date(verification.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "Verification code expired. Please request a new one." },
      { status: 400 }
    );
  }

  if (verification.code !== code) {
    return NextResponse.json(
      { error: "Invalid verification code." },
      { status: 400 }
    );
  }

  const { error: updateError } = await admin
    .from("users")
    .update({ phone_number: phoneNumber })
    .eq("id", user.id);

  if (updateError) {
    if (updateError.code === "23505") {
      return NextResponse.json(
        {
          error:
            "This phone number was just registered to another account.",
        },
        { status: 409 }
      );
    }
    logger.error("sms_verification_save_failed", {
      userId: user.id,
      error: updateError.message,
    });
    return NextResponse.json(
      { error: "Failed to save phone number." },
      { status: 500 }
    );
  }

  await admin
    .from("sms_verification_codes")
    .delete()
    .eq("user_id", user.id);

  trackServerEvent(user.id, AnalyticsEvents.SMS_PHONE_VERIFIED, {
    phoneNumber,
  });

  logger.info("sms_phone_verified", { userId: user.id, phoneNumber });

  return NextResponse.json({ data: { verified: true, phoneNumber } });
}
