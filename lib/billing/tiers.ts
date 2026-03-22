/**
 * Three-tier pricing configuration.
 *
 * All tier logic flows through this file. No ad-hoc tier string
 * checks elsewhere in the codebase.
 */

export type SubscriptionTier = "starter" | "pro" | "growth";
export type BillingInterval = "monthly" | "annual";

export interface TierFeatures {
  batch_upload: boolean;
  bill_to_check: boolean;
  email_forwarding: boolean;
  vendor_matching: boolean;
  multi_entity: boolean;
  api_access: boolean;
  ai_gl_inference: boolean;
  both_platforms: boolean;
  one_click_nav: boolean;
}

export interface TierConfig {
  name: string;
  tier: SubscriptionTier;
  monthlyPrice: number;
  annualPrice: number;
  invoiceCap: number;
  features: TierFeatures;
  recommended: boolean;
}

const TIER_CONFIGS: Record<SubscriptionTier, TierConfig> = {
  starter: {
    name: "Starter",
    tier: "starter",
    monthlyPrice: 29,
    annualPrice: 276,
    invoiceCap: 75,
    recommended: false,
    features: {
      batch_upload: false,
      bill_to_check: false,
      email_forwarding: false,
      vendor_matching: false,
      multi_entity: false,
      api_access: false,
      ai_gl_inference: true,
      both_platforms: true,
      one_click_nav: true,
    },
  },
  pro: {
    name: "Pro",
    tier: "pro",
    monthlyPrice: 59,
    annualPrice: 564,
    invoiceCap: 200,
    recommended: true,
    features: {
      batch_upload: true,
      bill_to_check: true,
      email_forwarding: false,
      vendor_matching: false,
      multi_entity: false,
      api_access: false,
      ai_gl_inference: true,
      both_platforms: true,
      one_click_nav: true,
    },
  },
  growth: {
    name: "Growth",
    tier: "growth",
    monthlyPrice: 99,
    annualPrice: 948,
    invoiceCap: 500,
    recommended: false,
    features: {
      batch_upload: true,
      bill_to_check: true,
      email_forwarding: true,
      vendor_matching: true,
      multi_entity: true,
      api_access: true,
      ai_gl_inference: true,
      both_platforms: true,
      one_click_nav: true,
    },
  },
};

/** Design partners get Pro-level cap (150/mo) */
const DESIGN_PARTNER_CAP = 150;

/** Trial users get 10 invoices lifetime */
export const TRIAL_INVOICE_LIMIT = 10;

/**
 * Get the full config for a tier.
 */
export function getTierConfig(tier: SubscriptionTier): TierConfig {
  return TIER_CONFIGS[tier];
}

/**
 * Get all tier configs (for pricing page display).
 */
export function getAllTiers(): TierConfig[] {
  return [TIER_CONFIGS.starter, TIER_CONFIGS.pro, TIER_CONFIGS.growth];
}

/**
 * Get feature flags for a tier. Trial users get Pro-level features.
 */
export function getTierFeatures(
  tier: SubscriptionTier | null,
  isTrial: boolean = false
): TierFeatures {
  if (isTrial || !tier) {
    return TIER_CONFIGS.pro.features;
  }
  return TIER_CONFIGS[tier].features;
}

/**
 * Get the monthly invoice cap for a user.
 * - Design partners: 150/mo
 * - Trial users: 10 lifetime (handled separately via isTrialExhausted)
 * - Paid: per-tier cap (75/200/500)
 */
export function getInvoiceCap(
  tier: SubscriptionTier | null,
  isDesignPartner: boolean
): number {
  if (isDesignPartner) return DESIGN_PARTNER_CAP;
  if (!tier) return 0;
  return TIER_CONFIGS[tier].invoiceCap;
}

/**
 * Get the next tier up from the current tier (for upgrade prompts).
 */
export function getNextTier(
  tier: SubscriptionTier
): TierConfig | null {
  if (tier === "starter") return TIER_CONFIGS.pro;
  if (tier === "pro") return TIER_CONFIGS.growth;
  return null;
}

// -- Price ID validation --

interface PriceIdMapping {
  tier: SubscriptionTier;
  interval: BillingInterval;
}

/**
 * Build a map from env var price IDs to tier+interval.
 * Validated at call time, not module load (env vars may not be set during build).
 */
function getPriceIdMap(): Map<string, PriceIdMapping> {
  const map = new Map<string, PriceIdMapping>();

  const entries: { envVar: string; tier: SubscriptionTier; interval: BillingInterval }[] = [
    { envVar: "STRIPE_STARTER_MONTHLY_PRICE_ID", tier: "starter", interval: "monthly" },
    { envVar: "STRIPE_STARTER_ANNUAL_PRICE_ID", tier: "starter", interval: "annual" },
    { envVar: "STRIPE_PRO_MONTHLY_PRICE_ID", tier: "pro", interval: "monthly" },
    { envVar: "STRIPE_PRO_ANNUAL_PRICE_ID", tier: "pro", interval: "annual" },
    { envVar: "STRIPE_GROWTH_MONTHLY_PRICE_ID", tier: "growth", interval: "monthly" },
    { envVar: "STRIPE_GROWTH_ANNUAL_PRICE_ID", tier: "growth", interval: "annual" },
  ];

  for (const { envVar, tier, interval } of entries) {
    const priceId = process.env[envVar];
    if (priceId) {
      map.set(priceId, { tier, interval });
    }
  }

  return map;
}

/**
 * Validate a Stripe price ID and return the tier + interval it maps to.
 * Returns null if the price ID is not one of our known prices.
 */
export function validatePriceId(
  priceId: string
): PriceIdMapping | null {
  return getPriceIdMap().get(priceId) ?? null;
}

/**
 * Check if a user's trial is exhausted (10 invoices lifetime).
 */
export function isTrialExhausted(trialInvoicesUsed: number): boolean {
  return trialInvoicesUsed >= TRIAL_INVOICE_LIMIT;
}
