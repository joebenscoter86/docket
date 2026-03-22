import { createAdminClient } from "@/lib/supabase/admin";
import { TRIAL_INVOICE_LIMIT } from "@/lib/billing/tiers";

export type AccessStatus =
  | { allowed: true; reason: "design_partner" | "active_subscription" | "trial" }
  | {
      allowed: false;
      reason: "no_subscription";
      subscriptionStatus: string;
      trialExhausted: boolean;
    };

/**
 * Check whether a user can process invoices (upload, extract, sync).
 *
 * Access is granted if ANY of:
 * 1. User is a design partner
 * 2. subscription_status is 'active'
 * 3. User is on usage-based trial with < 10 invoices used
 *
 * Uses the admin client to bypass RLS -- this is a billing check,
 * not a data access check.
 */
export async function checkInvoiceAccess(userId: string): Promise<AccessStatus> {
  const admin = createAdminClient();

  const { data: user, error } = await admin
    .from("users")
    .select("is_design_partner, subscription_status, trial_invoices_used")
    .eq("id", userId)
    .single();

  if (error || !user) {
    throw new Error("Failed to look up user for access check");
  }

  // 1. Design partners bypass everything
  if (user.is_design_partner) {
    return { allowed: true, reason: "design_partner" };
  }

  // 2. Active subscription
  if (user.subscription_status === "active") {
    return { allowed: true, reason: "active_subscription" };
  }

  // 3. Usage-based trial (10 invoices lifetime, no time limit)
  const trialUsed = user.trial_invoices_used ?? 0;
  if (trialUsed < TRIAL_INVOICE_LIMIT) {
    return { allowed: true, reason: "trial" };
  }

  // Denied
  return {
    allowed: false,
    reason: "no_subscription",
    subscriptionStatus: user.subscription_status ?? "inactive",
    trialExhausted: trialUsed >= TRIAL_INVOICE_LIMIT,
  };
}
