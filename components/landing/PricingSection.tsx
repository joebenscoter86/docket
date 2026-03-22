"use client";

import { useState } from "react";
import Link from "next/link";
import type { TierConfig, BillingInterval } from "@/lib/billing/tiers";

interface PricingSectionProps {
  tiers: TierConfig[];
}

const TIER_HIGHLIGHTS: Record<string, string[]> = {
  starter: [
    "75 invoices/month",
    "AI extraction + review UI",
    "QuickBooks + Xero sync",
    "AI GL account inference",
  ],
  pro: [
    "200 invoices/month",
    "Batch upload (up to 25 files)",
    "Bill-to-check toggle",
    "Priority email support",
  ],
  growth: [
    "500 invoices/month",
    "Everything in Pro, plus",
    "Multi-entity support",
    "Priority support + onboarding",
  ],
};

export default function PricingSection({ tiers }: PricingSectionProps) {
  const [interval, setInterval] = useState<BillingInterval>("annual");

  function getDisplayPrice(tier: TierConfig): number {
    if (interval === "annual") {
      return Math.round(tier.annualPrice / 12);
    }
    return tier.monthlyPrice;
  }

  function getSavingsPercent(tier: TierConfig): number {
    const monthlyTotal = tier.monthlyPrice * 12;
    return Math.round(
      ((monthlyTotal - tier.annualPrice) / monthlyTotal) * 100
    );
  }

  return (
    <section className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-8">
        {/* Heading */}
        <div className="text-center">
          <h2 className="font-headings text-4xl font-extrabold tracking-tight text-[#0F172A] sm:text-5xl">
            Simple, transparent pricing
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-[#475569]">
            Start free with 10 invoices. Pick a plan when you&apos;re ready.
          </p>
        </div>

        {/* Interval toggle */}
        <div className="mt-10 flex justify-center">
          <div className="inline-flex items-center rounded-full bg-[#F1F5F9] p-1">
            <button
              onClick={() => setInterval("monthly")}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${
                interval === "monthly"
                  ? "bg-white text-[#0F172A] shadow-sm"
                  : "text-[#64748B] hover:text-[#0F172A]"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval("annual")}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${
                interval === "annual"
                  ? "bg-white text-[#0F172A] shadow-sm"
                  : "text-[#64748B] hover:text-[#0F172A]"
              }`}
            >
              Annual
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#10B981]/10 text-[#10B981]">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Cards */}
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3 lg:gap-8">
          {tiers.map((tier) => {
            const isRecommended = tier.recommended;
            const highlights = TIER_HIGHLIGHTS[tier.tier] ?? [];

            return (
              <div
                key={tier.tier}
                className={`relative flex flex-col rounded-2xl border-2 bg-white p-6 transition-shadow hover:shadow-float ${
                  isRecommended
                    ? "border-[#3B82F6] shadow-soft"
                    : "border-[#E2E8F0]"
                }`}
              >
                {/* Recommended badge */}
                {isRecommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center px-3 py-0.5 rounded-full bg-[#3B82F6] text-white text-xs font-bold">
                      Recommended
                    </span>
                  </div>
                )}

                {/* Tier name */}
                <h3 className="font-headings font-bold text-lg text-[#0F172A]">
                  {tier.name}
                </h3>

                {/* Price */}
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="font-headings font-bold text-4xl text-[#0F172A]">
                    ${getDisplayPrice(tier)}
                  </span>
                  <span className="text-sm text-[#64748B]">/mo</span>
                </div>

                {interval === "annual" && (
                  <p className="mt-1 text-xs text-[#64748B]">
                    ${tier.annualPrice}/yr (save {getSavingsPercent(tier)}%)
                  </p>
                )}

                {/* Highlights */}
                <ul className="mt-5 space-y-2.5 flex-1">
                  {highlights.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <svg
                        className="h-4 w-4 mt-0.5 text-[#10B981] shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 12.75l6 6 9-13.5"
                        />
                      </svg>
                      <span className="text-sm text-[#475569]">{item}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link
                  href="/signup"
                  className={`mt-6 block w-full rounded-brand-md px-4 py-2.5 text-center text-sm font-bold transition-colors ${
                    isRecommended
                      ? "bg-[#3B82F6] text-white hover:bg-[#2563EB]"
                      : "bg-[#0F172A] text-white hover:bg-[#0F172A]/90"
                  }`}
                >
                  Start Free Trial
                </Link>
              </div>
            );
          })}
        </div>

        {/* View full pricing link */}
        <div className="mt-8 text-center">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1 text-sm font-medium text-[#3B82F6] hover:text-[#2563EB] transition-colors"
          >
            View full pricing details
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
              />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}
