import Stripe from "stripe";

let _stripe: Stripe | null = null;

/**
 * Lazy-initialized Stripe client. Defers initialization to first use
 * so the build step (which collects page data) doesn't throw when
 * STRIPE_SECRET_KEY is not set in the build environment.
 */
export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("Missing STRIPE_SECRET_KEY environment variable");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

/**
 * @deprecated Use getStripe() instead. Kept for backwards compat during migration.
 */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return getStripe()[prop as keyof Stripe];
  },
});
