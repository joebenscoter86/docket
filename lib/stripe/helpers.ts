import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Get or create a Stripe customer for a user.
 * Race condition guard: only update if stripe_customer_id is still null.
 */
export async function getOrCreateStripeCustomer(
  userId: string,
  email: string
): Promise<string> {
  const admin = createAdminClient();

  // Check if user already has a Stripe customer ID
  const { data: user, error: lookupErr } = await admin
    .from("users")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();

  if (lookupErr || !user) {
    throw new Error("Failed to look up user");
  }

  if (user.stripe_customer_id) {
    return user.stripe_customer_id;
  }

  // Create Stripe customer
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });

  // Store customer ID — race condition guard: only update if still null.
  const { data: updated, error: updateErr } = await admin
    .from("users")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId)
    .is("stripe_customer_id", null)
    .select("stripe_customer_id")
    .single();

  if (updateErr || !updated) {
    // Another request won the race — re-read to get their value
    const { data: reread } = await admin
      .from("users")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();

    if (reread?.stripe_customer_id) {
      return reread.stripe_customer_id;
    }
    throw new Error("Failed to store Stripe customer ID");
  }

  return customer.id;
}

/**
 * Create a Stripe Customer Portal session URL.
 */
export async function createBillingPortalUrl(
  stripeCustomerId: string,
  returnUrl: string
): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });

  return session.url;
}
