"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import type { SubscriptionTier } from "@/lib/billing/tiers";

interface BillingCardProps {
  user: {
    id: string;
    email: string;
    stripe_customer_id: string | null;
    subscription_status: string | null;
    subscription_tier: SubscriptionTier | null;
    is_design_partner: boolean;
  };
  usage: {
    used: number;
    limit: number | null;
    percentUsed: number | null;
    periodEnd: string;
    isTrial: boolean;
    trialInvoicesUsed: number;
    trialLimit: number;
  };
}

const TIER_LABELS: Record<SubscriptionTier, { name: string; price: string }> = {
  starter: { name: "Starter", price: "$19/mo" },
  pro: { name: "Pro", price: "$39/mo" },
  growth: { name: "Growth", price: "$99/mo" },
};

export function BillingCard({ user, usage }: BillingCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePortal() {
    setLoading(true);
    setError(null);
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
      setLoading(false);
    }
  }

  // State A: Design Partner
  if (user.is_design_partner) {
    return (
      <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-6">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="font-headings font-bold text-xl text-text">
            Pro Plan
          </h3>
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#FEF3C7] text-[#92400E] text-xs font-medium">
            Design Partner
          </span>
        </div>
        <p className="font-body text-sm text-muted">
          Thank you for being a Dockett design partner. You have free access to
          all features, with up to 150 invoices per month.
        </p>
        <div className="mt-3">
          <div className="flex items-center justify-between text-sm text-muted mb-1.5">
            <span>{usage.used} / {usage.limit} invoices this month</span>
            <span>{Math.min(Math.round(usage.percentUsed ?? 0), 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                (usage.percentUsed ?? 0) >= 100
                  ? "bg-red-500"
                  : (usage.percentUsed ?? 0) >= 80
                    ? "bg-amber-500"
                    : "bg-green-500"
              }`}
              style={{ width: `${Math.min(usage.percentUsed ?? 0, 100)}%` }}
            />
          </div>
          {(usage.percentUsed ?? 0) >= 80 && (usage.percentUsed ?? 0) < 100 && (
            <p className="mt-1.5 text-xs text-amber-600 font-medium">Approaching limit</p>
          )}
          {(usage.percentUsed ?? 0) >= 100 && (
            <p className="mt-1.5 text-xs text-red-600 font-medium">Limit reached</p>
          )}
        </div>
      </div>
    );
  }

  // State B: Active Subscription
  if (user.subscription_status === "active" && user.subscription_tier) {
    const tierLabel = TIER_LABELS[user.subscription_tier];
    return (
      <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-6">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="font-headings font-bold text-xl text-text">
            {tierLabel.name} Plan
          </h3>
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#D1FAE5] text-[#065F46] text-xs font-medium">
            Active
          </span>
        </div>
        <p className="font-body text-sm text-muted mb-1">
          {tierLabel.price} -- {usage.limit} invoices/month
        </p>
        {usage.limit !== null && (
          <div className="mt-3 mb-4">
            <div className="flex items-center justify-between text-sm text-muted mb-1.5">
              <span>{usage.used} / {usage.limit} invoices this period</span>
              <span>{Math.min(Math.round(usage.percentUsed ?? 0), 100)}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  (usage.percentUsed ?? 0) >= 100
                    ? "bg-red-500"
                    : (usage.percentUsed ?? 0) >= 80
                      ? "bg-amber-500"
                      : "bg-green-500"
                }`}
                style={{ width: `${Math.min(usage.percentUsed ?? 0, 100)}%` }}
              />
            </div>
          </div>
        )}
        {error && (
          <p className="text-sm text-error mb-3">{error}</p>
        )}
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={handlePortal}
            disabled={loading}
          >
            {loading ? "Loading..." : "Manage Subscription"}
          </Button>
        </div>
      </div>
    );
  }

  // State C: Free Trial
  if (usage.isTrial) {
    const trialPercent = (usage.trialInvoicesUsed / usage.trialLimit) * 100;
    return (
      <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-6">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="font-headings font-bold text-xl text-text">
            Free Trial
          </h3>
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#DBEAFE] text-[#1E40AF] text-xs font-medium">
            Full Access
          </span>
        </div>
        <p className="font-body text-sm text-muted mb-1">
          You have full access for your first {usage.trialLimit} invoices.
        </p>
        <div className="mt-3 mb-4">
          <div className="flex items-center justify-between text-sm text-muted mb-1.5">
            <span>{usage.trialInvoicesUsed} / {usage.trialLimit} trial invoices used</span>
            <span>{Math.round(trialPercent)}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                trialPercent >= 100
                  ? "bg-red-500"
                  : trialPercent >= 80
                    ? "bg-amber-500"
                    : "bg-blue-500"
              }`}
              style={{ width: `${Math.min(trialPercent, 100)}%` }}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={() => window.location.href = "/pricing"}
          >
            View Plans
          </Button>
        </div>
      </div>
    );
  }

  // State D: Cancelled
  if (user.subscription_status === "cancelled") {
    return (
      <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-6">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="font-headings font-bold text-xl text-text">
            No Active Plan
          </h3>
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#FEE2E2] text-[#991B1B] text-xs font-medium">
            Cancelled
          </span>
        </div>
        <p className="font-body text-sm text-muted mb-5">
          Your subscription has been cancelled. Choose a plan to continue using Dockett.
        </p>
        {error && (
          <p className="text-sm text-error mb-3">{error}</p>
        )}
        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={() => window.location.href = "/pricing"}
          >
            View Plans
          </Button>
        </div>
      </div>
    );
  }

  // State E: No subscription, trial exhausted (or past_due)
  return (
    <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-6">
      <div className="mb-4">
        <h3 className="font-headings font-bold text-xl text-text mb-1">
          Choose a Plan
        </h3>
        <p className="font-body text-sm text-muted mt-1">
          {usage.trialInvoicesUsed >= usage.trialLimit
            ? `You've used all ${usage.trialLimit} trial invoices. Subscribe to continue.`
            : "Subscribe to start processing invoices."}
        </p>
      </div>

      {user.subscription_status === "past_due" && (
        <div className="bg-[#FEF3C7] border border-[#F59E0B] rounded-brand-md px-4 py-3 mb-4">
          <p className="text-sm text-[#92400E] font-medium">
            Your payment failed. Please update your payment method.
          </p>
          <button
            onClick={handlePortal}
            disabled={loading}
            className="text-sm text-[#92400E] underline mt-1 hover:no-underline"
          >
            Update Payment
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-error mb-3">{error}</p>
      )}

      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={() => window.location.href = "/pricing"}
        >
          View Plans
        </Button>
      </div>
    </div>
  );
}
