import { createAdminClient } from "@/lib/supabase/admin";

const DESIGN_PARTNER_LIMIT = 100;

export interface UsageInfo {
  used: number;
  limit: number | null;
  percentUsed: number | null;
  periodStart: Date;
  periodEnd: Date;
  isDesignPartner: boolean;
}

type UsageLimitResult =
  | { allowed: true; usage: UsageInfo }
  | { allowed: false; usage: UsageInfo; reason: "monthly_limit_reached" };

/**
 * Get the current billing period boundaries.
 *
 * - Design partners: calendar month
 * - Active subscribers with cached Stripe dates: Stripe billing cycle
 * - Everyone else: calendar month
 */
function getBillingPeriod(user: {
  is_design_partner: boolean;
  subscription_status: string;
  billing_period_start: string | null;
  billing_period_end: string | null;
}): { periodStart: Date; periodEnd: Date } {
  // Active subscribers with cached Stripe billing period
  if (
    user.subscription_status === "active" &&
    user.billing_period_start &&
    user.billing_period_end
  ) {
    return {
      periodStart: new Date(user.billing_period_start),
      periodEnd: new Date(user.billing_period_end),
    };
  }

  // Calendar month for everyone else
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return { periodStart, periodEnd };
}

/**
 * Count invoices processed this billing period for an org.
 * Excludes 'uploading' (incomplete) and 'error' (failed) statuses.
 */
async function countInvoicesInPeriod(orgId: string, periodStart: Date): Promise<number> {
  const admin = createAdminClient();

  const { count, error } = await admin
    .from("invoices")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("uploaded_at", periodStart.toISOString())
    .not("status", "in", '("uploading","error")');

  if (error) {
    // Fail-open: if count fails, don't block uploads
    return 0;
  }

  return count ?? 0;
}

/**
 * Get usage info for the current billing period.
 */
export async function getUsageThisPeriod(orgId: string, userId: string): Promise<UsageInfo> {
  const admin = createAdminClient();

  const { data: user, error } = await admin
    .from("users")
    .select("is_design_partner, subscription_status, billing_period_start, billing_period_end")
    .eq("id", userId)
    .single();

  if (error || !user) {
    throw new Error("Failed to look up user for usage check");
  }

  const { periodStart, periodEnd } = getBillingPeriod(user);
  const used = await countInvoicesInPeriod(orgId, periodStart);

  const isDesignPartner = user.is_design_partner ?? false;
  const limit = isDesignPartner ? DESIGN_PARTNER_LIMIT : null;
  const percentUsed = limit !== null ? (used / limit) * 100 : null;

  return {
    used,
    limit,
    percentUsed,
    periodStart,
    periodEnd,
    isDesignPartner,
  };
}

/**
 * Check if an org can upload more invoices this period.
 * Only design partners have a hard limit (100/mo).
 * All other plans are unlimited for now.
 */
export async function checkUsageLimit(orgId: string, userId: string): Promise<UsageLimitResult> {
  const usage = await getUsageThisPeriod(orgId, userId);

  if (usage.limit !== null && usage.used >= usage.limit) {
    return { allowed: false, usage, reason: "monthly_limit_reached" };
  }

  return { allowed: true, usage };
}
