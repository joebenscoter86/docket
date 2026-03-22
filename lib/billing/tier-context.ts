import { createAdminClient } from "@/lib/supabase/admin";
import { getTierFeatures, TRIAL_INVOICE_LIMIT } from "@/lib/billing/tiers";
import type { SubscriptionTier, TierFeatures } from "@/lib/billing/tiers";

export interface UserTierInfo {
  features: TierFeatures;
  tier: SubscriptionTier | null;
  isTrial: boolean;
  isDesignPartner: boolean;
}

/**
 * Fetch the user's subscription tier and compute their feature flags.
 * Used by server components to pass tier context to client components.
 *
 * Design partners and trial users get Pro-level features.
 */
export async function getUserTierFeatures(userId: string): Promise<UserTierInfo> {
  const admin = createAdminClient();

  const { data: user, error } = await admin
    .from("users")
    .select("subscription_status, subscription_tier, is_design_partner, trial_invoices_used")
    .eq("id", userId)
    .single();

  if (error || !user) {
    // Fail-open: return Starter features (most restrictive) if lookup fails
    return {
      features: getTierFeatures("starter"),
      tier: null,
      isTrial: false,
      isDesignPartner: false,
    };
  }

  const isDesignPartner = user.is_design_partner ?? false;
  const trialUsed = user.trial_invoices_used ?? 0;
  const isTrial =
    !isDesignPartner &&
    user.subscription_status !== "active" &&
    trialUsed < TRIAL_INVOICE_LIMIT;

  // Design partners get Pro features
  if (isDesignPartner) {
    return {
      features: getTierFeatures(null, true), // Pro features
      tier: null,
      isTrial: false,
      isDesignPartner: true,
    };
  }

  const tier = (user.subscription_tier as SubscriptionTier) ?? null;
  const features = getTierFeatures(tier, isTrial);

  return { features, tier, isTrial, isDesignPartner };
}
