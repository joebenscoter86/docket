import { createAdminClient } from "@/lib/supabase/admin";

export const SMS_HOURLY_LIMIT = 10;

type RateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: "hourly" };

export async function checkSmsRateLimit(fromNumber: string): Promise<RateLimitResult> {
  const admin = createAdminClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const { count, error } = await admin
    .from("sms_ingestion_log")
    .select("*", { count: "exact", head: true })
    .eq("from_number", fromNumber)
    .gte("created_at", oneHourAgo.toISOString());

  if (!error && (count ?? 0) >= SMS_HOURLY_LIMIT) {
    return { allowed: false, reason: "hourly" };
  }

  return { allowed: true };
}
