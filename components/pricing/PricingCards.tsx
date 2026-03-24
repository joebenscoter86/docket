"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  TierConfig,
  SubscriptionTier,
  BillingInterval,
  TierPriceIds,
} from "@/lib/billing/tiers";

interface PricingCardsProps {
  tiers: TierConfig[];
  priceIds: Record<SubscriptionTier, TierPriceIds>;
  currentTier: SubscriptionTier | null;
  subscriptionStatus: string | null;
  isDesignPartner: boolean;
  isAuthenticated: boolean;
  hasStripeCustomer: boolean;
}

const CHECK_ICON = (
  <svg
    className="h-5 w-5 text-accent shrink-0"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4.5 12.75l6 6 9-13.5"
    />
  </svg>
);

// All features included on every tier
const ALL_FEATURES = [
  "Full header + line-item extraction",
  "Side-by-side review UI",
  "Confidence scoring",
  "AI GL account inference",
  "Vendor auto-matching",
  "QuickBooks + Xero integration",
  "Batch upload (up to 25 files)",
  "Bill, check, cash, or credit card sync",
  "PDF attachment to synced items",
  "Email forwarding ingestion",
  "Email support",
];

export default function PricingCards({
  tiers,
  priceIds,
  currentTier,
  subscriptionStatus,
  isDesignPartner,
  isAuthenticated,
  hasStripeCustomer,
}: PricingCardsProps) {
  const router = useRouter();
  const [interval, setInterval] = useState<BillingInterval>("annual");
  const [loadingTier, setLoadingTier] = useState<SubscriptionTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isActiveSubscriber = subscriptionStatus === "active";

  function getDisplayPrice(tier: TierConfig): string {
    if (interval === "annual") {
      return `$${Math.round(tier.annualPrice / 12)}`;
    }
    return `$${tier.monthlyPrice}`;
  }

  function getAnnualTotal(tier: TierConfig): string {
    return `$${tier.annualPrice}/yr`;
  }

  function getSavingsPercent(tier: TierConfig): number {
    const monthlyTotal = tier.monthlyPrice * 12;
    return Math.round(((monthlyTotal - tier.annualPrice) / monthlyTotal) * 100);
  }

  function getCtaLabel(tier: TierConfig): string {
    if (isDesignPartner) return "Design Partner";
    if (isActiveSubscriber && currentTier === tier.tier) return "Current Plan";
    if (isActiveSubscriber) {
      const tierOrder: SubscriptionTier[] = ["starter", "pro", "growth"];
      const currentIndex = tierOrder.indexOf(currentTier!);
      const targetIndex = tierOrder.indexOf(tier.tier);
      return targetIndex > currentIndex ? "Upgrade" : "Downgrade";
    }
    return `Start with ${tier.name}`;
  }

  function isCtaDisabled(tier: TierConfig): boolean {
    if (isDesignPartner) return true;
    if (isActiveSubscriber && currentTier === tier.tier) return true;
    if (loadingTier !== null) return true;
    return false;
  }

  async function handleCtaClick(tier: TierConfig) {
    setError(null);

    // Unauth users: redirect to signup with return URL
    if (!isAuthenticated) {
      router.push(`/signup?returnTo=/pricing`);
      return;
    }

    // Active subscribers: redirect to Stripe portal for plan changes
    if (isActiveSubscriber && hasStripeCustomer) {
      setLoadingTier(tier.tier);
      try {
        const res = await fetch("/api/stripe/portal", { method: "POST" });
        const body = await res.json();
        if (!res.ok) {
          setError(body.error || "Failed to open billing portal.");
          return;
        }
        window.location.href = body.data.portalUrl;
      } catch {
        setError("Failed to open billing portal. Please try again.");
      } finally {
        setLoadingTier(null);
      }
      return;
    }

    // Trial/cancelled/new users: create checkout session
    const priceId =
      interval === "annual"
        ? priceIds[tier.tier].annual
        : priceIds[tier.tier].monthly;

    if (!priceId) {
      setError("Pricing not configured. Please contact support.");
      return;
    }

    setLoadingTier(tier.tier);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Failed to start checkout.");
        return;
      }

      window.location.href = body.data.sessionUrl;
    } catch {
      setError("Failed to start checkout. Please try again.");
    } finally {
      setLoadingTier(null);
    }
  }

  function getFeaturesForTier() {
    return ALL_FEATURES;
  }

  return (
    <div>
      {/* Interval toggle */}
      <div className="flex justify-center mb-10">
        <div className="inline-flex items-center rounded-brand-md bg-white border border-border p-1 shadow-soft">
          <button
            onClick={() => setInterval("monthly")}
            className={`px-5 py-2 rounded-brand-sm text-sm font-medium transition-colors ${
              interval === "monthly"
                ? "bg-text text-white"
                : "text-muted hover:text-text"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval("annual")}
            className={`px-5 py-2 rounded-brand-sm text-sm font-medium transition-colors flex items-center gap-2 ${
              interval === "annual"
                ? "bg-text text-white"
                : "text-muted hover:text-text"
            }`}
          >
            Annual
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                interval === "annual"
                  ? "bg-accent text-white"
                  : "bg-accent/10 text-accent"
              }`}
            >
              Save 20%
            </span>
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="max-w-md mx-auto mb-6 px-4 py-3 rounded-brand-md bg-red-50 border border-red-200 text-sm text-red-700 text-center">
          {error}
        </div>
      )}

      {/* Tier cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
        {tiers.map((tier) => {
          const isRecommended = tier.recommended;
          const isCurrent = isActiveSubscriber && currentTier === tier.tier;
          const features = getFeaturesForTier();

          return (
            <div
              key={tier.tier}
              className={`relative flex flex-col rounded-brand-lg bg-white border-2 shadow-soft transition-shadow hover:shadow-float ${
                isRecommended
                  ? "border-primary ring-1 ring-primary/20"
                  : isCurrent
                    ? "border-accent"
                    : "border-border"
              }`}
            >
              {/* Recommended badge */}
              {isRecommended && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center px-4 py-1 rounded-full bg-primary text-white text-xs font-bold shadow-sm">
                    Recommended
                  </span>
                </div>
              )}

              {/* Current plan badge */}
              {isCurrent && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center px-4 py-1 rounded-full bg-accent text-white text-xs font-bold shadow-sm">
                    Current Plan
                  </span>
                </div>
              )}

              <div className="px-6 pt-8 pb-6">
                {/* Tier name */}
                <h3 className="font-headings font-bold text-xl text-text">
                  {tier.name}
                </h3>

                {/* Price */}
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-headings font-bold text-5xl text-text">
                    {getDisplayPrice(tier)}
                  </span>
                  <span className="font-body text-muted text-sm">/mo</span>
                </div>

                {/* Annual billing note */}
                {interval === "annual" && (
                  <p className="mt-1 text-sm text-muted">
                    {getAnnualTotal(tier)} billed annually (save{" "}
                    {getSavingsPercent(tier)}%)
                  </p>
                )}

                {/* Invoice cap */}
                <p className="mt-3 font-body text-sm text-text font-medium">
                  {tier.invoiceCap} invoices/month
                </p>

                {/* CTA */}
                <button
                  onClick={() => handleCtaClick(tier)}
                  disabled={isCtaDisabled(tier)}
                  className={`mt-6 w-full rounded-brand-md px-5 py-3 text-sm font-bold transition-colors ${
                    isRecommended && !isCurrent && !isDesignPartner
                      ? "bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
                      : isCurrent || isDesignPartner
                        ? "bg-gray-100 text-muted cursor-not-allowed"
                        : "bg-text text-white hover:bg-text/90 disabled:opacity-50"
                  } disabled:cursor-not-allowed`}
                >
                  {loadingTier === tier.tier
                    ? "Loading..."
                    : getCtaLabel(tier)}
                </button>
              </div>

              {/* Divider */}
              <div className="border-t border-border mx-6" />

              {/* Features */}
              <div className="px-6 py-6 flex-1">
                <p className="text-xs font-bold text-muted uppercase tracking-wider mb-4">
                  Everything included
                </p>
                <ul className="space-y-3">
                  {features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5"
                    >
                      {CHECK_ICON}
                      <span className="font-body text-sm text-text">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
