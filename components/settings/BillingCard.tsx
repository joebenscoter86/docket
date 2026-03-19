"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

interface BillingCardProps {
  user: {
    id: string;
    email: string;
    stripe_customer_id: string | null;
    subscription_status: string | null;
    is_design_partner: boolean;
  };
  usage: {
    used: number;
    limit: number | null;
    percentUsed: number | null;
    periodEnd: string; // ISO string
  };
}

export function BillingCard({ user, usage }: BillingCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Failed to start checkout.");
        return;
      }

      window.location.href = body.data.sessionUrl;
    } catch {
      setError("Failed to start checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  }

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
            Growth Plan
          </h3>
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#FEF3C7] text-[#92400E] text-xs font-medium">
            Design Partner
          </span>
        </div>
        <p className="font-body text-sm text-muted">
          You have free access to all MVP features as a design partner. Capped
          at 100 invoices/month.
        </p>
        {/* Usage display with progress bar */}
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

  // State C: Active Subscription
  if (user.subscription_status === "active") {
    return (
      <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-6">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="font-headings font-bold text-xl text-text">
            Growth Plan
          </h3>
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#D1FAE5] text-[#065F46] text-xs font-medium">
            Active
          </span>
        </div>
        <p className="font-body text-sm text-muted mb-1">
          Your subscription is active. Manage your payment method, view
          invoices, or cancel anytime.
        </p>
        <p className="font-body text-sm text-muted mb-5">
          {usage.used} invoices this billing period
        </p>
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

  // State D: Cancelled
  if (user.subscription_status === "cancelled") {
    return (
      <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-6">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="font-headings font-bold text-xl text-text">
            Growth Plan
          </h3>
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#FEE2E2] text-[#991B1B] text-xs font-medium">
            Cancelled
          </span>
        </div>
        <p className="font-body text-sm text-muted mb-1">
          Your subscription has been cancelled. Subscribe again to continue
          using Docket.
        </p>
        <p className="font-body text-sm text-muted mb-5">
          {usage.used} invoices this month
        </p>
        {error && (
          <p className="text-sm text-error mb-3">{error}</p>
        )}
        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={handleCheckout}
            disabled={loading}
          >
            {loading ? "Loading..." : "Subscribe — $99/mo"}
          </Button>
        </div>
      </div>
    );
  }

  // State B: No Subscription (default — includes past_due, inactive, null)
  return (
    <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-6">
      <div className="mb-4">
        <h3 className="font-headings font-bold text-xl text-text mb-1">
          Growth Plan — $99/mo
        </h3>
        <ul className="font-body text-sm text-muted space-y-1.5 mt-3">
          <li className="flex items-center gap-2">
            <span className="text-accent">&#10003;</span> Unlimited invoices
          </li>
          <li className="flex items-center gap-2">
            <span className="text-accent">&#10003;</span> AI-powered extraction
          </li>
          <li className="flex items-center gap-2">
            <span className="text-accent">&#10003;</span> QuickBooks Online sync
          </li>
        </ul>
        <p className="font-body text-sm text-muted mt-2">
          {usage.used} invoices this month
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
          onClick={handleCheckout}
          disabled={loading}
        >
          {loading ? "Loading..." : "Subscribe"}
        </Button>
      </div>
    </div>
  );
}
