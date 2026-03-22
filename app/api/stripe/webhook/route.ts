import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";
import type Stripe from "stripe";
import { getTierConfig, type SubscriptionTier } from "@/lib/billing/tiers";
import {
  sendSubscriptionActivatedEmail,
  sendSubscriptionCancelledEmail,
} from "@/lib/email/triggers";

/**
 * Map Stripe subscription status to our internal status.
 */
function mapSubscriptionStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
      return "cancelled";
    default:
      return "inactive";
  }
}

/**
 * Extract the subscription tier from metadata.
 */
function extractTier(
  metadata: Record<string, string> | null
): SubscriptionTier | null {
  const tier = metadata?.tier;
  if (tier === "starter" || tier === "pro" || tier === "growth") {
    return tier;
  }
  return null;
}

/**
 * Look up a user by their Stripe customer ID.
 */
async function findUserByStripeCustomerId(
  stripeCustomerId: string
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("users")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .single();

  return data?.id ?? null;
}

/**
 * Update a user's subscription status and tier.
 */
async function updateSubscriptionStatus(
  userId: string,
  status: string,
  options?: {
    stripeCustomerId?: string;
    subscriptionTier?: SubscriptionTier | null;
    billingPeriodStart?: number;
    billingPeriodEnd?: number;
  }
): Promise<void> {
  const admin = createAdminClient();
  const updates: Record<string, string | null> = {
    subscription_status: status,
  };

  if (options?.stripeCustomerId) {
    updates.stripe_customer_id = options.stripeCustomerId;
  }
  if (options?.subscriptionTier !== undefined) {
    updates.subscription_tier = options.subscriptionTier;
  }
  if (options?.billingPeriodStart !== undefined) {
    updates.billing_period_start = new Date(
      options.billingPeriodStart * 1000
    ).toISOString();
  }
  if (options?.billingPeriodEnd !== undefined) {
    updates.billing_period_end = new Date(
      options.billingPeriodEnd * 1000
    ).toISOString();
  }

  await admin.from("users").update(updates).eq("id", userId);
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    const body = Buffer.from(await request.arrayBuffer());
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    logger.error("stripe_webhook.signature_failed", {
      error: err instanceof Error ? err.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 }
    );
  }

  logger.info("stripe_webhook.received", {
    eventType: event.type,
    status: "processing",
  });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;

        if (userId) {
          // Retrieve subscription to get tier metadata
          let tier: SubscriptionTier | null = null;
          if (session.subscription) {
            const subscription = await stripe.subscriptions.retrieve(
              session.subscription as string
            );
            tier = extractTier(
              subscription.metadata as Record<string, string>
            );
          }

          await updateSubscriptionStatus(userId, "active", {
            stripeCustomerId: session.customer as string,
            subscriptionTier: tier,
          });
          logger.info("stripe_webhook.checkout_completed", {
            userId,
            stripeCustomerId: session.customer as string,
            tier,
            status: "active",
          });

          // Email notification (fire-and-forget)
          if (tier) {
            const config = getTierConfig(tier);
            sendSubscriptionActivatedEmail(
              userId,
              config.name,
              `$${config.monthlyPrice}/mo`,
              config.invoiceCap
            );
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const userId = await findUserByStripeCustomerId(customerId);

        if (userId) {
          const newStatus = mapSubscriptionStatus(subscription.status);
          const tier = extractTier(
            subscription.metadata as Record<string, string>
          );
          const firstItem = subscription.items.data[0];
          await updateSubscriptionStatus(userId, newStatus, {
            subscriptionTier: tier,
            billingPeriodStart: firstItem?.current_period_start,
            billingPeriodEnd: firstItem?.current_period_end,
          });
          logger.info("stripe_webhook.subscription_updated", {
            userId,
            stripeCustomerId: customerId,
            eventType: event.type,
            tier,
            status: newStatus,
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const userId = await findUserByStripeCustomerId(customerId);

        if (userId) {
          const cancelledTier = extractTier(
            subscription.metadata as Record<string, string>
          );
          await updateSubscriptionStatus(userId, "cancelled", {
            subscriptionTier: null,
          });
          logger.info("stripe_webhook.subscription_deleted", {
            userId,
            stripeCustomerId: customerId,
            status: "cancelled",
          });

          // Email notification (fire-and-forget)
          const tierName = cancelledTier
            ? getTierConfig(cancelledTier).name
            : "your";
          sendSubscriptionCancelledEmail(userId, tierName);
        }
        break;
      }

      default:
        logger.info("stripe_webhook.unhandled", {
          eventType: event.type,
          status: "ignored",
        });
    }
  } catch (err) {
    logger.error("stripe_webhook.processing_error", {
      eventType: event.type,
      error: err instanceof Error ? err.message : "Unknown error",
      status: "error",
    });
    // Return 500 so Stripe retries. Operations are idempotent, so retries are safe.
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
