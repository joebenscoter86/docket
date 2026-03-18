# DOC-36: Subscription Flow Design

**Issue:** [DOC-36 — BIL-2: Build subscription flow (pricing page, Checkout, webhook handler)](https://linear.app/jkbtech/issue/DOC-36/bil-2-build-subscription-flow-pricing-page-checkout-webhook-handler)
**Date:** 2026-03-18
**Status:** Approved

---

## Overview

Build the Stripe subscription infrastructure: checkout flow, webhook handler, customer portal integration, and billing UI in Settings. Design partners bypass billing entirely. Access gating (DOC-37) is out of scope — this issue builds the plumbing.

## Existing Infrastructure

- `users` table already has `stripe_customer_id`, `subscription_status`, `is_design_partner` columns
- Stripe env vars defined in `.env.example` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`)
- API route stubs exist at `/api/stripe/checkout` and `/api/stripe/webhook` (return 501)
- Lib stubs exist at `lib/stripe/client.ts` and `lib/stripe/helpers.ts`
- Settings page has a billing section placeholder with design partner badge

## Design

### 1. Stripe SDK & Client Setup

**`lib/stripe/client.ts`**

Initialize the Stripe SDK with `STRIPE_SECRET_KEY`. Single server-side instance. Throws at import time if env var is missing.

**`lib/stripe/helpers.ts`**

Three exported functions:

- `getOrCreateStripeCustomer(userId: string, email: string): Promise<string>` — Checks `users.stripe_customer_id`. If null, creates a Stripe customer with `email` and `metadata: { userId }`, stores the ID back via admin Supabase client, returns the customer ID. If already set, returns existing ID. **Race condition guard:** If two concurrent requests both see null, both create Stripe customers. Mitigate by attempting the DB update first — if another request already stored a `stripe_customer_id`, re-read and return the existing one (same upsert pattern used in DOC-49 for QBO connections).

- `createBillingPortalUrl(stripeCustomerId: string, returnUrl: string): Promise<string>` — Creates a Stripe Customer Portal session and returns the URL.

All DB writes use the admin Supabase client (`createAdminClient()`) since webhook context has no auth session.

### 2. Checkout Flow

**Route:** `POST /api/stripe/checkout`

**Auth:** Required (standard `supabase.auth.getUser()` pattern).

**Flow:**
1. Authenticate user
2. Fetch org membership (existing pattern)
3. **Guard:** If `is_design_partner = true`, return `VALIDATION_ERROR`: "Design partners don't need a subscription." If `subscription_status = 'active'`, return `CONFLICT`: "Subscription already active."
4. Call `getOrCreateStripeCustomer(user.id, user.email)` to ensure Stripe customer exists
5. Create Stripe Checkout Session:
   - `mode: 'subscription'`
   - `line_items`: single item with `price: STRIPE_GROWTH_PRICE_ID` (env var), `quantity: 1`
   - `customer`: Stripe customer ID
   - `success_url`: `{origin}/app/settings?subscribed=true`
   - `cancel_url`: `{origin}/app/settings`
   - `client_reference_id`: user UUID
   - `subscription_data.metadata`: `{ userId, orgId }`
6. Return `{ data: { sessionUrl: session.url } }`

**Client behavior:** On button click, POST to the route, then `window.location.href = sessionUrl`.

**Logging:** Structured logging at entry and exit per Architecture Rule 8: `logger.info('stripe_checkout', { userId, orgId, status, durationMs })`.

**New env var:** `STRIPE_GROWTH_PRICE_ID` — the Stripe Price ID for the $99/mo Growth plan. Added to `.env.example`.

### 3. Webhook Handler

**Route:** `POST /api/stripe/webhook`

**Auth:** None (called by Stripe). Verify webhook signature via `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)`. Return 400 on verification failure.

**Raw body handling:** Use `Buffer.from(await request.arrayBuffer())` to get the raw body as a Buffer. This is safer than `request.text()` — avoids potential encoding issues that could cause signature verification to fail silently.

**Events:**

| Event | User Lookup | Action |
|-------|-------------|--------|
| `checkout.session.completed` | `client_reference_id` (user UUID) | Set `subscription_status = 'active'`. Store `stripe_customer_id` if not already set. |
| `customer.subscription.created` | `stripe_customer_id` from `users` table | Same mapping as `.updated`. Covers subscriptions created via Stripe dashboard/API. |
| `customer.subscription.updated` | `stripe_customer_id` from `users` table | Map Stripe status: `active`\|`trialing` → `'active'`, `past_due` → `'past_due'`, `canceled`\|`unpaid` → `'cancelled'`. |
| `customer.subscription.deleted` | `stripe_customer_id` from `users` table | Set `subscription_status = 'cancelled'`. |

**Idempotency:** All operations are idempotent upserts (setting status to a deterministic value). No dedup table needed at MVP scale.

**User lookup for non-checkout events:** Extract `customer` (Stripe customer ID) from the event object, query `users` table where `stripe_customer_id` matches.

**Logging:** Every event gets `logger.info('stripe_webhook', { eventType, stripeCustomerId, userId?, status })`. Signature failures get `logger.error`.

**Returns:** 200 for all successfully verified events (even unhandled types). 400 for invalid signatures.

### 4. Customer Portal

**Route:** `POST /api/stripe/portal`

**Auth:** Required.

**Flow:**
1. Authenticate user via auth-scoped Supabase client
2. Fetch `stripe_customer_id` from `users` table (auth-scoped client — user's own row, RLS handles it)
3. If no customer ID, return `VALIDATION_ERROR`: "No billing account found"
4. Call `createBillingPortalUrl(stripeCustomerId, returnUrl)`
5. Return `{ data: { portalUrl } }`

**Logging:** Structured logging at entry and exit: `logger.info('stripe_portal', { userId, status, durationMs })`.

**Client behavior:** Same pattern as checkout — POST, then redirect.

### 5. Settings Billing UI

Extract billing section into `components/settings/BillingCard.tsx`, following the `QBOConnectionCard.tsx` pattern (self-contained component with state-dependent rendering).

**Props:** `user: { id, email, stripe_customer_id, subscription_status, is_design_partner }`

**Three states:**

**State A — Design Partner** (`is_design_partner = true`):
- Design partner badge (amber, already styled)
- "You have free access to all MVP features as a design partner."
- No action buttons

**State B — No Active Subscription** (`is_design_partner = false`, `subscription_status !== 'active'`):
- Growth plan card: "Growth Plan — $99/mo"
- Feature list: Unlimited invoices, AI extraction, QuickBooks sync
- "Subscribe" button (primary) → POST `/api/stripe/checkout` → redirect
- If `subscription_status = 'past_due'`: warning banner with "Your payment failed. Please update your payment method." + "Update Payment" button → portal

**State C — Active Subscription** (`subscription_status = 'active'`):
- "Growth Plan" with green "Active" badge
- "Manage Subscription" button (outline) → POST `/api/stripe/portal` → redirect

**State D — Cancelled** (`subscription_status = 'cancelled'`):
- "Your subscription has been cancelled."
- "Subscribe" button (primary) to re-subscribe via checkout
- Differentiated from State B's "never subscribed" copy

**Success toast:** When URL has `?subscribed=true`, show brief success message: "Subscription activated! You're on the Growth plan." Clear the param from URL after displaying.

**Webhook timing gap:** When the user returns from Stripe Checkout to `?subscribed=true`, the webhook may not have fired yet — `subscription_status` could still be stale. The success toast displays based on the URL param regardless. If the status hasn't updated, the page still shows the subscribe UI behind the toast. A page refresh after a few seconds resolves it. Acceptable for MVP; a polling mechanism is overkill at this scale.

### 6. Middleware

No changes needed. The webhook route (`/api/stripe/webhook`) is already outside the auth middleware's protected route list. DOC-37 handles access gating separately.

### 7. Environment Variables

New env var added to `.env.example`:
```
STRIPE_GROWTH_PRICE_ID=           # Stripe Price ID for $99/mo Growth plan
```

## Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `lib/stripe/client.ts` | Implement | Stripe SDK initialization |
| `lib/stripe/helpers.ts` | Implement | `getOrCreateStripeCustomer`, `getSubscriptionStatus`, `createBillingPortalUrl` |
| `app/api/stripe/checkout/route.ts` | Implement | Create Checkout Session |
| `app/api/stripe/webhook/route.ts` | Implement | Handle subscription lifecycle events |
| `app/api/stripe/portal/route.ts` | Create | Create Customer Portal session |
| `components/settings/BillingCard.tsx` | Create | Billing UI component (3 states) |
| `app/(dashboard)/settings/page.tsx` | Modify | Replace inline billing section with `BillingCard` |
| `.env.example` | Modify | Add `STRIPE_GROWTH_PRICE_ID` |
| `package.json` | Modify | Add `stripe` dependency |

## Testing

| Test File | Coverage |
|-----------|----------|
| `lib/stripe/helpers.test.ts` | `getOrCreateStripeCustomer` (creates new, returns existing), status mapping |
| `app/api/stripe/checkout/route.test.ts` | Happy path, auth failure, customer creation |
| `app/api/stripe/webhook/route.test.ts` | Valid signature + each event type, invalid signature (400), unknown event (200 no-op) |
| `app/api/stripe/portal/route.test.ts` | Happy path, missing customer ID error |

All Stripe SDK calls mocked via `vi.mock('stripe')`. DB calls mocked via `vi.mock('@/lib/supabase/server')` and `vi.mock('@/lib/supabase/admin')`.

## Out of Scope

- Access gating (DOC-37)
- Usage tracking (DOC-39)
- Public pricing page (DOC-42)
- Stripe live mode credentials (DOC-35, blocked on LLC)
- Trial period logic (future — MVP is design partners + paid)
