import { createAdminClient } from "@/lib/supabase/admin";

export type AccessStatus =
  | { allowed: true; reason: "design_partner" | "active_subscription" | "trial" }
  | {
      allowed: false;
      reason: "no_subscription";
      subscriptionStatus: string;
      trialExpired: boolean;
    };

/**
 * Check whether a user can process invoices (upload, extract, sync).
 *
 * Access is granted if ANY of:
 * 1. User is a design partner
 * 2. subscription_status is 'active'
 * 3. trial_ends_at is in the future
 *
 * Uses the admin client to bypass RLS — this is a billing check,
 * not a data access check.
 */
export async function checkInvoiceAccess(userId: string): Promise<AccessStatus> {
  const admin = createAdminClient();

  const { data: user, error } = await admin
    .from("users")
    .select("is_design_partner, subscription_status, trial_ends_at")
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

  // 3. Active trial
  if (user.trial_ends_at && new Date(user.trial_ends_at) > new Date()) {
    return { allowed: true, reason: "trial" };
  }

  // Denied — determine if trial existed and expired
  const trialExpired = user.trial_ends_at !== null;

  return {
    allowed: false,
    reason: "no_subscription",
    subscriptionStatus: user.subscription_status ?? "inactive",
    trialExpired,
  };
}
