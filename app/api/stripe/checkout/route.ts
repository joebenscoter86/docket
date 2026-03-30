import { createClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/supabase/helpers";
import { stripe } from "@/lib/stripe/client";
import { getOrCreateStripeCustomer } from "@/lib/stripe/helpers";
import { validatePriceId } from "@/lib/billing/tiers";
import {
  authError,
  validationError,
  conflict,
  internalError,
  apiSuccess,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

export async function POST(request: Request) {
  const start = Date.now();

  // 1. Auth
  const supabase = createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return authError();
  }

  logger.info("stripe_checkout.start", { userId: user.id });

  try {
    // 2. Parse and validate priceId
    const body = await request.json().catch(() => ({}));
    const { priceId } = body as { priceId?: string };

    if (!priceId || typeof priceId !== "string") {
      return validationError("Missing priceId.");
    }

    const priceMapping = validatePriceId(priceId);
    if (!priceMapping) {
      return validationError("Invalid price ID.");
    }

    // 3. Fetch org
    const orgId = (await getActiveOrgId(supabase, user.id)) ?? "";

    // 4. Guard: check design partner and subscription status
    const { data: userData, error: userErr } = await supabase
      .from("users")
      .select("is_design_partner, subscription_status")
      .eq("id", user.id)
      .single();

    if (userErr || !userData) {
      return internalError("Failed to fetch user data");
    }

    if (userData.is_design_partner) {
      return validationError("Design partners don't need a subscription.");
    }

    if (userData.subscription_status === "active") {
      return conflict("Subscription already active.");
    }

    // 5. Get or create Stripe customer
    const stripeCustomerId = await getOrCreateStripeCustomer(
      user.id,
      user.email!
    );

    // 6. Create Checkout Session with tier metadata
    const origin = new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer: stripeCustomerId,
      success_url: `${origin}/app/settings?subscribed=true`,
      cancel_url: `${origin}/app/settings`,
      client_reference_id: user.id,
      subscription_data: {
        metadata: {
          userId: user.id,
          orgId,
          tier: priceMapping.tier,
          billing_period: priceMapping.interval,
        },
      },
    });

    logger.info("stripe_checkout.success", {
      userId: user.id,
      orgId,
      tier: priceMapping.tier,
      billingPeriod: priceMapping.interval,
      status: "success",
      durationMs: Date.now() - start,
    });

    return apiSuccess({ sessionUrl: session.url });
  } catch (err) {
    logger.error("stripe_checkout.error", {
      userId: user.id,
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error",
      durationMs: Date.now() - start,
    });
    return internalError("Failed to create checkout session");
  }
}
