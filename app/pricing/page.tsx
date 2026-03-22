import { createClient } from "@/lib/supabase/server";
import {
  getAllTiers,
  getTierPriceIds,
  type SubscriptionTier,
} from "@/lib/billing/tiers";
import PricingCards from "@/components/pricing/PricingCards";
import LandingNav from "@/components/landing/LandingNav";
import Footer from "@/components/layout/Footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing -- Docket",
  description:
    "Simple, transparent pricing. Extract invoices with AI and sync to QuickBooks or Xero.",
};

export default async function PricingPage() {
  // Check auth state (optional -- page works for unauth too)
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let currentTier: SubscriptionTier | null = null;
  let subscriptionStatus: string | null = null;
  let isDesignPartner = false;
  let stripeCustomerId: string | null = null;

  if (user) {
    const { data: userData } = await supabase
      .from("users")
      .select(
        "subscription_status, subscription_tier, is_design_partner, stripe_customer_id"
      )
      .eq("id", user.id)
      .single();

    if (userData) {
      currentTier = userData.subscription_tier as SubscriptionTier | null;
      subscriptionStatus = userData.subscription_status;
      isDesignPartner = userData.is_design_partner ?? false;
      stripeCustomerId = userData.stripe_customer_id;
    }
  }

  const tiers = getAllTiers();
  const priceIds = getTierPriceIds();

  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
      {/* Nav -- reuse landing nav for unauth, simple back-link for auth */}
      {!user ? (
        <div className="mx-auto w-full max-w-[1400px] px-4 pt-4 sm:px-8 sm:pt-6">
          <div className="rounded-[40px] bg-white shadow-2xl ring-1 ring-black/5">
            <LandingNav />
          </div>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[1200px] px-4 pt-6 sm:px-8">
          <a
            href="/invoices"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text transition-colors"
          >
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
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
            Back to Docket
          </a>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-8 sm:py-16">
        <div className="text-center mb-12">
          <h1 className="font-headings font-bold text-4xl sm:text-5xl text-text mb-4">
            Simple, transparent pricing
          </h1>
          <p className="font-body text-lg text-muted max-w-2xl mx-auto mb-6">
            Extract invoices with AI and sync to QuickBooks or Xero in seconds.
          </p>
          <div className="inline-flex items-center gap-2.5 rounded-full bg-accent/10 border border-accent/20 px-6 py-2.5">
            <svg className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <span className="font-body text-sm font-bold text-accent">
              10 free invoices -- no credit card required
            </span>
          </div>
        </div>

        <PricingCards
          tiers={tiers}
          priceIds={priceIds}
          currentTier={currentTier}
          subscriptionStatus={subscriptionStatus}
          isDesignPartner={isDesignPartner}
          isAuthenticated={!!user}
          hasStripeCustomer={!!stripeCustomerId}
        />
      </main>

      {/* Footer */}
      {!user && (
        <div className="bg-white">
          <Footer />
        </div>
      )}
    </div>
  );
}
