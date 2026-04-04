import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const phoneNumber = body.phoneNumber?.trim();

  if (!phoneNumber || !/^\+1\d{10}$/.test(phoneNumber)) {
    return NextResponse.json(
      { error: "Invalid phone number. Use US format: +1XXXXXXXXXX" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("users")
    .select("id")
    .eq("phone_number", phoneNumber)
    .single();

  if (existing && existing.id !== user.id) {
    return NextResponse.json(
      { error: "This phone number is already registered to another account." },
      { status: 409 }
    );
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const { count } = await admin
    .from("sms_verification_codes")
    .select("*", { count: "exact", head: true })
    .eq("phone_number", phoneNumber)
    .gte("created_at", oneHourAgo.toISOString());

  if ((count ?? 0) >= 3) {
    return NextResponse.json(
      { error: "Too many verification attempts. Try again later." },
      { status: 429 }
    );
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await admin.from("sms_verification_codes").insert({
    user_id: user.id,
    phone_number: phoneNumber,
    code,
    expires_at: expiresAt.toISOString(),
  });

  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );

    await client.messages.create({
      to: phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER!,
      body: `Your Dockett verification code is: ${code}. Expires in 5 minutes.`,
    });

    logger.info("sms_verification_sent", { userId: user.id, phoneNumber });

    return NextResponse.json({ data: { sent: true } });
  } catch (err) {
    logger.error("sms_verification_send_failed", {
      userId: user.id,
      phoneNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to send verification code. Please try again." },
      { status: 500 }
    );
  }
}
