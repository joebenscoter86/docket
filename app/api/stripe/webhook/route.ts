import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";
import type Stripe from "stripe";

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
 * Update a user's subscription status.
 */
async function updateSubscriptionStatus(
  userId: string,
  status: string,
  options?: {
    stripeCustomerId?: string;
    billingPeriodStart?: number;
    billingPeriodEnd?: number;
  }
): Promise<void> {
  const admin = createAdminClient();
  const updates: Record<string, string | null> = { subscription_status: status };

  if (options?.stripeCustomerId) {
    updates.stripe_customer_id = options.stripeCustomerId;
  }
  if (options?.billingPeriodStart !== undefined) {
    updates.billing_period_start = new Date(options.billingPeriodStart * 1000).toISOString();
  }
  if (options?.billingPeriodEnd !== undefined) {
    updates.billing_period_end = new Date(options.billingPeriodEnd * 1000).toISOString();
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
          await updateSubscriptionStatus(userId, "active", {
            stripeCustomerId: session.customer as string,
          });
          logger.info("stripe_webhook.checkout_completed", {
            userId,
            stripeCustomerId: session.customer as string,
            status: "active",
          });
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
          const firstItem = subscription.items.data[0];
          await updateSubscriptionStatus(userId, newStatus, {
            billingPeriodStart: firstItem?.current_period_start,
            billingPeriodEnd: firstItem?.current_period_end,
          });
          logger.info("stripe_webhook.subscription_updated", {
            userId,
            stripeCustomerId: customerId,
            eventType: event.type,
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
          await updateSubscriptionStatus(userId, "cancelled");
          logger.info("stripe_webhook.subscription_deleted", {
            userId,
            stripeCustomerId: customerId,
            status: "cancelled",
          });
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
