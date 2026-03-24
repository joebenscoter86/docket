import { createAdminClient } from "@/lib/supabase/admin";

export const HOURLY_LIMIT = 50;
export const DAILY_LIMIT = 100;

type RateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: "hourly" | "daily" };

/**
 * Check if an org is within email ingestion rate limits.
 * Uses windowed counts on email_ingestion_log.processed_at.
 */
export async function checkEmailRateLimit(orgId: string): Promise<RateLimitResult> {
  const admin = createAdminClient();
  const now = new Date();

  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const { count: hourlyCount, error: hourlyError } = await admin
    .from("email_ingestion_log")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("processed_at", oneHourAgo.toISOString());

  if (!hourlyError && (hourlyCount ?? 0) >= HOURLY_LIMIT) {
    return { allowed: false, reason: "hourly" };
  }

  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const { count: dailyCount, error: dailyError } = await admin
    .from("email_ingestion_log")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("processed_at", oneDayAgo.toISOString());

  if (!dailyError && (dailyCount ?? 0) >= DAILY_LIMIT) {
    return { allowed: false, reason: "daily" };
  }

  return { allowed: true };
}
