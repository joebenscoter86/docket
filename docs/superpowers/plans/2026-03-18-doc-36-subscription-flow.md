# DOC-36: Subscription Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Stripe subscription infrastructure — checkout, webhooks, customer portal, and billing UI in Settings.

**Architecture:** Stripe Checkout (hosted) for payment collection. Webhook handler verifies signatures and updates `users.subscription_status`. BillingCard component in Settings renders four states (design partner, no subscription, active, cancelled). All Stripe SDK calls are server-side only.

**Tech Stack:** Stripe Node SDK, Next.js 14 App Router, Supabase (admin client for webhook writes), Vitest for testing.

**Spec:** `docs/superpowers/specs/2026-03-18-doc-36-subscription-flow-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `lib/stripe/client.ts` | Stripe SDK singleton (server-side only) |
| `lib/stripe/helpers.ts` | `getOrCreateStripeCustomer`, `createBillingPortalUrl` |
| `lib/stripe/helpers.test.ts` | Unit tests for helpers |
| `app/api/stripe/checkout/route.ts` | Create Stripe Checkout Session |
| `app/api/stripe/checkout/route.test.ts` | Tests for checkout route |
| `app/api/stripe/webhook/route.ts` | Handle Stripe webhook events |
| `app/api/stripe/webhook/route.test.ts` | Tests for webhook route |
| `app/api/stripe/portal/route.ts` | Create Stripe Customer Portal session |
| `app/api/stripe/portal/route.test.ts` | Tests for portal route |
| `components/settings/BillingCard.tsx` | Billing UI (4 states) |
| `app/(dashboard)/settings/page.tsx` | Modified to use BillingCard |
| `.env.example` | Add `STRIPE_GROWTH_PRICE_ID` |

---

### Task 1: Install Stripe SDK and add env var

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: Install stripe**

```bash
npm install stripe
```

- [ ] **Step 2: Add `STRIPE_GROWTH_PRICE_ID` to `.env.example`**

Add after the existing Stripe vars:

```
STRIPE_GROWTH_PRICE_ID=           # Stripe Price ID for $99/mo Growth plan
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add stripe SDK and STRIPE_GROWTH_PRICE_ID env var (DOC-36)"
```

---

### Task 2: Implement Stripe client

**Files:**
- Modify: `lib/stripe/client.ts`

- [ ] **Step 1: Implement Stripe SDK initialization**

Replace the stub in `lib/stripe/client.ts`:

```typescript
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
```

Note: The SDK defaults to the API version it was built for. No need to specify `apiVersion` manually.

- [ ] **Step 2: Commit**

```bash
git add lib/stripe/client.ts
git commit -m "feat: implement Stripe SDK client initialization (DOC-36)"
```

---

### Task 3: Implement and test `getOrCreateStripeCustomer`

**Files:**
- Modify: `lib/stripe/helpers.ts`
- Create: `lib/stripe/helpers.test.ts`

- [ ] **Step 1: Write failing tests for `getOrCreateStripeCustomer`**

Create `lib/stripe/helpers.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock stripe before importing helpers
vi.mock("@/lib/stripe/client", () => ({
  stripe: {
    customers: {
      create: vi.fn(),
    },
    billingPortal: {
      sessions: {
        create: vi.fn(),
      },
    },
  },
}));

const mockUserSelect = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: vi.fn((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: mockUserSelect,
            })),
          })),
          update: vi.fn(() => ({
            eq: mockUserUpdate,
          })),
        };
      }
      return {};
    }),
  }),
}));

import { getOrCreateStripeCustomer } from "./helpers";
import { stripe } from "@/lib/stripe/client";

describe("getOrCreateStripeCustomer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing stripe_customer_id when already set", async () => {
    mockUserSelect.mockResolvedValue({
      data: { stripe_customer_id: "cus_existing123" },
      error: null,
    });

    const result = await getOrCreateStripeCustomer("user-1", "test@example.com");

    expect(result).toBe("cus_existing123");
    expect(stripe.customers.create).not.toHaveBeenCalled();
  });

  it("creates a new Stripe customer and stores the ID when none exists", async () => {
    mockUserSelect.mockResolvedValue({
      data: { stripe_customer_id: null },
      error: null,
    });
    (stripe.customers.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "cus_new456",
    });
    mockUserUpdate.mockResolvedValue({ error: null });

    const result = await getOrCreateStripeCustomer("user-1", "test@example.com");

    expect(result).toBe("cus_new456");
    expect(stripe.customers.create).toHaveBeenCalledWith({
      email: "test@example.com",
      metadata: { userId: "user-1" },
    });
  });

  it("throws when user lookup fails", async () => {
    mockUserSelect.mockResolvedValue({
      data: null,
      error: { message: "not found" },
    });

    await expect(
      getOrCreateStripeCustomer("user-1", "test@example.com")
    ).rejects.toThrow("Failed to look up user");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/stripe/helpers.test.ts
```

Expected: FAIL — `getOrCreateStripeCustomer` is not exported.

- [ ] **Step 3: Implement `getOrCreateStripeCustomer` and `createBillingPortalUrl`**

Replace the stub in `lib/stripe/helpers.ts`:

```typescript
import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Get or create a Stripe customer for a user.
 * Race condition guard: if a concurrent request already stored a customer ID,
 * re-read and return the existing one.
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
  // If another concurrent request already stored a value, this update
  // matches zero rows and we re-read to get the winner's value.
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/stripe/helpers.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/helpers.ts lib/stripe/helpers.test.ts
git commit -m "feat: implement getOrCreateStripeCustomer and createBillingPortalUrl (DOC-36)"
```

---

### Task 4: Implement and test checkout route

**Files:**
- Modify: `app/api/stripe/checkout/route.ts`
- Create: `app/api/stripe/checkout/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/api/stripe/checkout/route.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stripe/client", () => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
  },
}));

vi.mock("@/lib/stripe/helpers", () => ({
  getOrCreateStripeCustomer: vi.fn(),
}));

const mockGetUser = vi.fn();
const mockMembershipSelect = vi.fn();
const mockUserSelect = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === "org_memberships") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() => ({
                single: mockMembershipSelect,
              })),
            })),
          })),
        };
      }
      if (table === "users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: mockUserSelect,
            })),
          })),
        };
      }
      return {};
    }),
  }),
}));

import { POST } from "./route";
import { stripe } from "@/lib/stripe/client";
import { getOrCreateStripeCustomer } from "@/lib/stripe/helpers";

const fakeUser = { id: "user-1", email: "test@example.com" };

describe("POST /api/stripe/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMembershipSelect.mockResolvedValue({
      data: { org_id: "org-1" },
      error: null,
    });
    mockUserSelect.mockResolvedValue({
      data: { is_design_partner: false, subscription_status: null },
      error: null,
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(new Request("http://localhost/api/stripe/checkout", { method: "POST" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });

  it("returns 400 when user is a design partner", async () => {
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    mockUserSelect.mockResolvedValue({
      data: { is_design_partner: true, subscription_status: null },
      error: null,
    });

    const res = await POST(new Request("http://localhost/api/stripe/checkout", { method: "POST" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 when subscription is already active", async () => {
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    mockUserSelect.mockResolvedValue({
      data: { is_design_partner: false, subscription_status: "active" },
      error: null,
    });

    const res = await POST(new Request("http://localhost/api/stripe/checkout", { method: "POST" }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("CONFLICT");
  });

  it("creates checkout session and returns sessionUrl on success", async () => {
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    (getOrCreateStripeCustomer as ReturnType<typeof vi.fn>).mockResolvedValue("cus_123");
    (stripe.checkout.sessions.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      url: "https://checkout.stripe.com/session/cs_test_123",
    });

    const res = await POST(new Request("http://localhost/api/stripe/checkout", { method: "POST" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.sessionUrl).toBe("https://checkout.stripe.com/session/cs_test_123");
    expect(getOrCreateStripeCustomer).toHaveBeenCalledWith("user-1", "test@example.com");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run app/api/stripe/checkout/route.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the checkout route**

Replace `app/api/stripe/checkout/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";
import { getOrCreateStripeCustomer } from "@/lib/stripe/helpers";
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
    // 2. Fetch org membership
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    const orgId = membership?.org_id ?? "";

    // 3. Guard: check design partner and subscription status
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

    // 4. Get or create Stripe customer
    const stripeCustomerId = await getOrCreateStripeCustomer(
      user.id,
      user.email!
    );

    // 5. Create Checkout Session
    const origin = new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: process.env.STRIPE_GROWTH_PRICE_ID!,
          quantity: 1,
        },
      ],
      customer: stripeCustomerId,
      success_url: `${origin}/app/settings?subscribed=true`,
      cancel_url: `${origin}/app/settings`,
      client_reference_id: user.id,
      subscription_data: {
        metadata: { userId: user.id, orgId },
      },
    });

    logger.info("stripe_checkout.success", {
      userId: user.id,
      orgId,
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run app/api/stripe/checkout/route.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/stripe/checkout/route.ts app/api/stripe/checkout/route.test.ts
git commit -m "feat: implement Stripe checkout route with guards (DOC-36)"
```

---

### Task 5: Implement and test webhook handler

**Files:**
- Modify: `app/api/stripe/webhook/route.ts`
- Create: `app/api/stripe/webhook/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/api/stripe/webhook/route.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConstructEvent = vi.fn();

vi.mock("@/lib/stripe/client", () => ({
  stripe: {
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
  },
}));

const mockUserUpdate = vi.fn();
const mockUserSelect = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: mockUserUpdate,
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockUserSelect,
        })),
      })),
    })),
  }),
}));

import { POST } from "./route";

function makeWebhookRequest(body: string, signature = "valid-sig") {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body,
  });
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserUpdate.mockResolvedValue({ error: null });
  });

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const res = await POST(makeWebhookRequest("{}"));
    expect(res.status).toBe(400);
  });

  it("handles checkout.session.completed — sets status to active", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "user-1",
          customer: "cus_123",
        },
      },
    });

    const res = await POST(makeWebhookRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalled();
  });

  it("handles customer.subscription.updated — maps active status", async () => {
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_123",
          status: "active",
        },
      },
    });
    mockUserSelect.mockResolvedValue({
      data: { id: "user-1" },
      error: null,
    });

    const res = await POST(makeWebhookRequest("{}"));
    expect(res.status).toBe(200);
  });

  it("handles customer.subscription.updated — maps past_due status", async () => {
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_123",
          status: "past_due",
        },
      },
    });
    mockUserSelect.mockResolvedValue({
      data: { id: "user-1" },
      error: null,
    });

    const res = await POST(makeWebhookRequest("{}"));
    expect(res.status).toBe(200);
  });

  it("handles customer.subscription.deleted — sets cancelled", async () => {
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: {
        object: {
          customer: "cus_123",
        },
      },
    });
    mockUserSelect.mockResolvedValue({
      data: { id: "user-1" },
      error: null,
    });

    const res = await POST(makeWebhookRequest("{}"));
    expect(res.status).toBe(200);
  });

  it("returns 200 for unknown event types (no-op)", async () => {
    mockConstructEvent.mockReturnValue({
      type: "some.unknown.event",
      data: { object: {} },
    });

    const res = await POST(makeWebhookRequest("{}"));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run app/api/stripe/webhook/route.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the webhook handler**

Replace `app/api/stripe/webhook/route.ts`:

```typescript
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
  stripeCustomerId?: string
): Promise<void> {
  const admin = createAdminClient();
  const updates: Record<string, string> = { subscription_status: status };

  if (stripeCustomerId) {
    updates.stripe_customer_id = stripeCustomerId;
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
          await updateSubscriptionStatus(
            userId,
            "active",
            session.customer as string
          );
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
          await updateSubscriptionStatus(userId, newStatus);
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run app/api/stripe/webhook/route.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/stripe/webhook/route.ts app/api/stripe/webhook/route.test.ts
git commit -m "feat: implement Stripe webhook handler with signature verification (DOC-36)"
```

---

### Task 6: Implement and test portal route

**Files:**
- Create: `app/api/stripe/portal/route.ts`
- Create: `app/api/stripe/portal/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/api/stripe/portal/route.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stripe/helpers", () => ({
  createBillingPortalUrl: vi.fn(),
}));

const mockGetUser = vi.fn();
const mockUserSelect = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockUserSelect,
        })),
      })),
    })),
  }),
}));

import { POST } from "./route";
import { createBillingPortalUrl } from "@/lib/stripe/helpers";

describe("POST /api/stripe/portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(new Request("http://localhost/api/stripe/portal", { method: "POST" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });

  it("returns 400 when user has no stripe_customer_id", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
      error: null,
    });
    mockUserSelect.mockResolvedValue({
      data: { stripe_customer_id: null },
      error: null,
    });

    const res = await POST(new Request("http://localhost/api/stripe/portal", { method: "POST" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns portal URL on success", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" } },
      error: null,
    });
    mockUserSelect.mockResolvedValue({
      data: { stripe_customer_id: "cus_123" },
      error: null,
    });
    (createBillingPortalUrl as ReturnType<typeof vi.fn>).mockResolvedValue(
      "https://billing.stripe.com/session/bps_test_123"
    );

    const res = await POST(new Request("http://localhost/api/stripe/portal", { method: "POST" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.portalUrl).toBe("https://billing.stripe.com/session/bps_test_123");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run app/api/stripe/portal/route.test.ts
```

Expected: FAIL — route file doesn't exist.

- [ ] **Step 3: Implement the portal route**

Create `app/api/stripe/portal/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { createBillingPortalUrl } from "@/lib/stripe/helpers";
import {
  authError,
  validationError,
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

  logger.info("stripe_portal.start", { userId: user.id });

  try {
    // 2. Fetch stripe_customer_id
    const { data: userData, error: userErr } = await supabase
      .from("users")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (userErr || !userData) {
      return internalError("Failed to fetch user data");
    }

    if (!userData.stripe_customer_id) {
      return validationError("No billing account found.");
    }

    // 3. Create portal session
    const origin = new URL(request.url).origin;
    const portalUrl = await createBillingPortalUrl(
      userData.stripe_customer_id,
      `${origin}/app/settings`
    );

    logger.info("stripe_portal.success", {
      userId: user.id,
      status: "success",
      durationMs: Date.now() - start,
    });

    return apiSuccess({ portalUrl });
  } catch (err) {
    logger.error("stripe_portal.error", {
      userId: user.id,
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error",
      durationMs: Date.now() - start,
    });
    return internalError("Failed to create billing portal session");
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run app/api/stripe/portal/route.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/stripe/portal/route.ts app/api/stripe/portal/route.test.ts
git commit -m "feat: implement Stripe customer portal route (DOC-36)"
```

---

### Task 7: Build BillingCard component

**Files:**
- Create: `components/settings/BillingCard.tsx`

- [ ] **Step 1: Create the BillingCard component**

Create `components/settings/BillingCard.tsx`:

```tsx
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
}

export function BillingCard({ user }: BillingCardProps) {
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
        <p className="font-body text-sm text-muted mb-5">
          Your subscription is active. Manage your payment method, view
          invoices, or cancel anytime.
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
        <p className="font-body text-sm text-muted mb-5">
          Your subscription has been cancelled. Subscribe again to continue
          using Docket.
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
```

- [ ] **Step 2: Commit**

```bash
git add components/settings/BillingCard.tsx
git commit -m "feat: create BillingCard component with 4 states (DOC-36)"
```

---

### Task 8: Integrate BillingCard into Settings page

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Update Settings page to use BillingCard**

In `app/(dashboard)/settings/page.tsx`, make these changes:

1. Add import at the top:
```typescript
import { BillingCard } from "@/components/settings/BillingCard";
```

2. After the org membership fetch (around line 26), add user data fetch:
```typescript
  // Fetch user billing data
  const { data: userData } = await supabase
    .from("users")
    .select("id, stripe_customer_id, subscription_status, is_design_partner")
    .eq("id", user!.id)
    .single();

  const billingUser = {
    id: user!.id,
    email: user!.email!,
    stripe_customer_id: userData?.stripe_customer_id ?? null,
    subscription_status: userData?.subscription_status ?? null,
    is_design_partner: userData?.is_design_partner ?? false,
  };
```

3. Add success toast alert — after the QBO alerts (around line 66), add:
```typescript
      {searchParams.subscribed === "true" && (
        <SettingsAlert type="success" message="Subscription activated! You're on the Growth plan." />
      )}
```

4. Update the `searchParams` type to include `subscribed`:
```typescript
  searchParams: { qbo_success?: string; qbo_error?: string; subscribed?: string };
```

5. Replace the entire Billing Section (the `<div>` containing "Billing" heading and the hardcoded card) with:
```tsx
      {/* Billing Section */}
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wider text-muted mb-3">
          Billing
        </p>
        <BillingCard user={billingUser} />
      </div>
```

- [ ] **Step 2: Verify build passes**

```bash
npx tsc --noEmit && npm run build
```

Expected: No type errors, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/settings/page.tsx
git commit -m "feat: integrate BillingCard into Settings page (DOC-36)"
```

---

### Task 9: Run full verification

- [ ] **Step 1: Run linter**

```bash
npm run lint
```

Expected: Zero warnings, zero errors.

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Run all tests**

```bash
npm run test
```

Expected: All tests pass, including the 4 new test files.

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 5: Fix any issues found, then commit fixes**

If any step fails, fix the issue and commit the fix before proceeding.

---

### Task 10: Create feature branch and PR

- [ ] **Step 1: Create feature branch and push**

```bash
git checkout -b feature/BIL-2-subscription-flow
git push -u origin feature/BIL-2-subscription-flow
```

Note: If you've been committing on `main`, cherry-pick or rebase the commits onto the feature branch instead.

- [ ] **Step 2: Create PR**

```bash
gh pr create --title "DOC-36: Build subscription flow (pricing, Checkout, webhook handler)" --body "$(cat <<'EOF'
## Summary
- Stripe Checkout integration for $99/mo Growth plan
- Webhook handler for subscription lifecycle events (created, updated, deleted, checkout completed)
- Customer Portal integration for self-service subscription management
- BillingCard component in Settings with 4 states (design partner, no subscription, active, cancelled)

## Files
- `lib/stripe/client.ts` — Stripe SDK initialization
- `lib/stripe/helpers.ts` — `getOrCreateStripeCustomer`, `createBillingPortalUrl`
- `app/api/stripe/checkout/route.ts` — Create Checkout Session
- `app/api/stripe/webhook/route.ts` — Handle Stripe webhook events
- `app/api/stripe/portal/route.ts` — Create Customer Portal session
- `components/settings/BillingCard.tsx` — Billing UI (4 states)
- `app/(dashboard)/settings/page.tsx` — Integrated BillingCard

## Test plan
- [ ] `npm run test` — all tests pass
- [ ] `npm run build` — builds cleanly
- [ ] Design partner user sees free access badge
- [ ] Non-partner user sees subscribe button
- [ ] Checkout redirects to Stripe (test mode)
- [ ] Webhook events update subscription_status correctly
- [ ] Active user sees "Manage Subscription" button
- [ ] Cancelled user sees re-subscribe option

Closes DOC-36
EOF
)"
```

- [ ] **Step 3: Deliver status report**

```
STATUS REPORT - DOC-36: Build subscription flow

1. FILES CHANGED
   lib/stripe/client.ts — Stripe SDK initialization
   lib/stripe/helpers.ts — getOrCreateStripeCustomer, createBillingPortalUrl
   lib/stripe/helpers.test.ts — Unit tests for helpers
   app/api/stripe/checkout/route.ts — Checkout Session creation with guards
   app/api/stripe/checkout/route.test.ts — Tests for checkout route
   app/api/stripe/webhook/route.ts — Webhook handler (4 event types)
   app/api/stripe/webhook/route.test.ts — Tests for webhook route
   app/api/stripe/portal/route.ts — Customer Portal session creation
   app/api/stripe/portal/route.test.ts — Tests for portal route
   components/settings/BillingCard.tsx — 4-state billing UI component
   app/(dashboard)/settings/page.tsx — Integrated BillingCard, added subscribed param
   .env.example — Added STRIPE_GROWTH_PRICE_ID
   package.json — Added stripe dependency

2. DEPENDENCIES
   stripe — Stripe Node SDK for Checkout, webhooks, portal

3. ACCEPTANCE CRITERIA CHECK
   ✅ Subscribe button creates Stripe Checkout Session
   ✅ Webhook handler verifies signatures, handles 4 event types
   ✅ checkout.session.completed → active
   ✅ customer.subscription.created/updated → mapped status
   ✅ customer.subscription.deleted → cancelled
   ✅ Manage Subscription → Stripe Customer Portal
   ✅ Design partners see free access badge
   ✅ Idempotent webhook processing
   ✅ Guards: design partner and active sub blocked from checkout

4. SELF-REVIEW
   a) No shortcuts. Race condition guard on customer creation.
   b) No TypeScript errors suppressed.
   c) Webhook timing gap on return from Checkout documented (known MVP limitation).
   d) No files touched outside issue scope.
   e) Confidence: High

5. NEXT STEPS
   - DOC-37: Access gating (subscription check middleware)
   - DOC-35: Plug in real Stripe credentials when LLC is ready
   - Create Growth plan price in Stripe Dashboard (test mode) and set STRIPE_GROWTH_PRICE_ID
   - Configure Stripe webhook endpoint URL in Dashboard
```
