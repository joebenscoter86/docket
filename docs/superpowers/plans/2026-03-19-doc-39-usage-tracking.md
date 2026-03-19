# DOC-39: Usage Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add monthly invoice usage tracking with limit enforcement for design partners (100/mo) and usage visibility for all users.

**Architecture:** Centralized usage utility (`lib/billing/usage.ts`) counts invoices from the existing `invoices` table. Upload route enforces limits before file processing. Settings and upload pages display usage with warning/limit states. Stripe webhook caches billing period boundaries on the `users` table.

**Tech Stack:** Next.js 14 API routes, Supabase Postgres, Stripe SDK, Vitest

**Spec:** `docs/superpowers/specs/2026-03-19-doc-39-usage-tracking-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260319000000_add_usage_tracking.sql` | DB migration: composite index + billing period columns |
| `lib/billing/usage.ts` | `getUsageThisPeriod()`, `checkUsageLimit()` — all usage logic |
| `lib/billing/usage.test.ts` | Unit tests for usage utility |
| `lib/utils/errors.ts` | Add `USAGE_LIMIT_REACHED` code + `usageLimitError` helper |
| `app/api/stripe/webhook/route.ts` | Cache billing period from subscription events |
| `app/api/invoices/upload/route.ts` | Enforce usage limit before file processing |
| `components/settings/UsageLimitBanner.tsx` | Warning/limit-reached banner (reused on upload + settings) |
| `components/settings/BillingCard.tsx` | Accept `UsageInfo`, add progress bar for design partners |
| `app/(dashboard)/settings/page.tsx` | Replace inline count with `getUsageThisPeriod()` |
| `app/(dashboard)/upload/page.tsx` | Fetch usage, show warning/limit states |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260319000000_add_usage_tracking.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- DOC-39: Usage tracking support
-- 1. Composite index for efficient monthly invoice counting
CREATE INDEX IF NOT EXISTS idx_invoices_org_uploaded_at ON invoices(org_id, uploaded_at);

-- 2. Cache Stripe billing period on users table (avoids Stripe API call per upload)
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_period_start TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_period_end TIMESTAMPTZ;
```

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase db push` (or apply via Supabase MCP `apply_migration`)
Expected: Migration applies cleanly, no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260319000000_add_usage_tracking.sql
git commit -m "feat: add usage tracking migration — index + billing period columns (DOC-39)"
```

---

## Task 2: Add `usageLimitError` to Error Helpers

**Files:**
- Modify: `lib/utils/errors.ts`

- [ ] **Step 1: Add `USAGE_LIMIT_REACHED` to `ErrorCode` type**

In `lib/utils/errors.ts`, add `"USAGE_LIMIT_REACHED"` to the `ErrorCode` union type (after `"SUBSCRIPTION_REQUIRED"`).

- [ ] **Step 2: Add `usageLimitError` helper function**

Add after the `subscriptionRequired` function (line 58):

```typescript
export function usageLimitError(message: string, details?: Record<string, unknown>) {
  return apiError({ error: message, code: "USAGE_LIMIT_REACHED", status: 429, details });
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add lib/utils/errors.ts
git commit -m "feat: add usageLimitError helper (429/USAGE_LIMIT_REACHED) (DOC-39)"
```

---

## Task 3: Usage Utility — Tests First

**Files:**
- Create: `lib/billing/usage.test.ts`

- [ ] **Step 1: Write failing tests for `getUsageThisPeriod`**

Create `lib/billing/usage.test.ts`. Follow the same mock pattern as `lib/billing/access.test.ts`. Test cases:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getUsageThisPeriod, checkUsageLimit } from "./usage";

// Mock admin client with chainable query builder
const mockInvoiceCount = vi.fn();
const mockUserSelect = vi.fn();

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
        };
      }
      if (table === "invoices") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                not: vi.fn(() => mockInvoiceCount),
              })),
            })),
          })),
        };
      }
      return {};
    }),
  }),
}));

function mockUser(overrides: {
  is_design_partner?: boolean;
  subscription_status?: string;
  billing_period_start?: string | null;
  billing_period_end?: string | null;
} = {}) {
  mockUserSelect.mockResolvedValue({
    data: {
      is_design_partner: overrides.is_design_partner ?? false,
      subscription_status: overrides.subscription_status ?? "inactive",
      billing_period_start: overrides.billing_period_start ?? null,
      billing_period_end: overrides.billing_period_end ?? null,
    },
    error: null,
  });
}

function mockInvoiceCountResult(count: number) {
  mockInvoiceCount.mockResolvedValue({ count, error: null });
}

describe("getUsageThisPeriod", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns calendar month period for design partners", async () => {
    mockUser({ is_design_partner: true });
    mockInvoiceCountResult(42);

    const result = await getUsageThisPeriod("org-1", "user-1");

    expect(result.used).toBe(42);
    expect(result.limit).toBe(100);
    expect(result.percentUsed).toBeCloseTo(42);
    expect(result.isDesignPartner).toBe(true);
    expect(result.periodStart).toEqual(new Date("2026-03-01T00:00:00.000Z"));
    expect(result.periodEnd).toEqual(new Date("2026-04-01T00:00:00.000Z"));
  });

  it("returns Stripe billing period for active subscribers with cached dates", async () => {
    mockUser({
      subscription_status: "active",
      billing_period_start: "2026-03-10T00:00:00Z",
      billing_period_end: "2026-04-10T00:00:00Z",
    });
    mockInvoiceCountResult(15);

    const result = await getUsageThisPeriod("org-1", "user-1");

    expect(result.used).toBe(15);
    expect(result.limit).toBe(null);
    expect(result.percentUsed).toBe(null);
    expect(result.isDesignPartner).toBe(false);
    expect(result.periodStart).toEqual(new Date("2026-03-10T00:00:00Z"));
    expect(result.periodEnd).toEqual(new Date("2026-04-10T00:00:00Z"));
  });

  it("falls back to calendar month when billing period not cached", async () => {
    mockUser({ subscription_status: "active" });
    mockInvoiceCountResult(5);

    const result = await getUsageThisPeriod("org-1", "user-1");

    expect(result.periodStart).toEqual(new Date("2026-03-01T00:00:00.000Z"));
    expect(result.periodEnd).toEqual(new Date("2026-04-01T00:00:00.000Z"));
  });

  it("returns calendar month for trial users", async () => {
    mockUser({ subscription_status: "inactive" });
    mockInvoiceCountResult(3);

    const result = await getUsageThisPeriod("org-1", "user-1");

    expect(result.used).toBe(3);
    expect(result.limit).toBe(null);
    expect(result.isDesignPartner).toBe(false);
  });

  it("throws when user lookup fails", async () => {
    mockUserSelect.mockResolvedValue({ data: null, error: { message: "not found" } });
    await expect(getUsageThisPeriod("org-1", "bad-id")).rejects.toThrow();
  });
});

describe("checkUsageLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows when design partner under limit", async () => {
    mockUser({ is_design_partner: true });
    mockInvoiceCountResult(80);

    const result = await checkUsageLimit("org-1", "user-1");
    expect(result.allowed).toBe(true);
    expect(result.usage.used).toBe(80);
  });

  it("blocks when design partner at limit", async () => {
    mockUser({ is_design_partner: true });
    mockInvoiceCountResult(100);

    const result = await checkUsageLimit("org-1", "user-1");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("monthly_limit_reached");
    }
  });

  it("blocks when design partner over limit", async () => {
    mockUser({ is_design_partner: true });
    mockInvoiceCountResult(105);

    const result = await checkUsageLimit("org-1", "user-1");
    expect(result.allowed).toBe(false);
  });

  it("always allows active subscribers (unlimited)", async () => {
    mockUser({ subscription_status: "active" });
    mockInvoiceCountResult(9999);

    const result = await checkUsageLimit("org-1", "user-1");
    expect(result.allowed).toBe(true);
  });

  it("always allows trial users (no hard limit)", async () => {
    mockUser({ subscription_status: "inactive" });
    mockInvoiceCountResult(500);

    const result = await checkUsageLimit("org-1", "user-1");
    expect(result.allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- lib/billing/usage.test.ts`
Expected: FAIL — `getUsageThisPeriod` and `checkUsageLimit` not found.

- [ ] **Step 3: Commit failing tests**

```bash
git add lib/billing/usage.test.ts
git commit -m "test: add usage tracking tests (red) (DOC-39)"
```

---

## Task 4: Usage Utility — Implementation

**Files:**
- Create: `lib/billing/usage.ts`

- [ ] **Step 1: Implement `getUsageThisPeriod` and `checkUsageLimit`**

```typescript
import { createAdminClient } from "@/lib/supabase/admin";

const DESIGN_PARTNER_LIMIT = 100;

export interface UsageInfo {
  used: number;
  limit: number | null;
  percentUsed: number | null;
  periodStart: Date;
  periodEnd: Date;
  isDesignPartner: boolean;
}

type UsageLimitResult =
  | { allowed: true; usage: UsageInfo }
  | { allowed: false; usage: UsageInfo; reason: "monthly_limit_reached" };

/**
 * Get the current billing period boundaries.
 *
 * - Design partners: calendar month
 * - Active subscribers with cached Stripe dates: Stripe billing cycle
 * - Everyone else: calendar month
 */
function getBillingPeriod(user: {
  is_design_partner: boolean;
  subscription_status: string;
  billing_period_start: string | null;
  billing_period_end: string | null;
}): { periodStart: Date; periodEnd: Date } {
  // Active subscribers with cached Stripe billing period
  if (
    user.subscription_status === "active" &&
    user.billing_period_start &&
    user.billing_period_end
  ) {
    return {
      periodStart: new Date(user.billing_period_start),
      periodEnd: new Date(user.billing_period_end),
    };
  }

  // Calendar month for everyone else
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return { periodStart, periodEnd };
}

/**
 * Count invoices processed this billing period for an org.
 * Excludes 'uploading' (incomplete) and 'error' (failed) statuses.
 */
async function countInvoicesInPeriod(orgId: string, periodStart: Date): Promise<number> {
  const admin = createAdminClient();

  const { count, error } = await admin
    .from("invoices")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("uploaded_at", periodStart.toISOString())
    .not("status", "in", '("uploading","error")');

  if (error) {
    // Fail-open: if count fails, don't block uploads
    return 0;
  }

  return count ?? 0;
}

/**
 * Get usage info for the current billing period.
 */
export async function getUsageThisPeriod(orgId: string, userId: string): Promise<UsageInfo> {
  const admin = createAdminClient();

  const { data: user, error } = await admin
    .from("users")
    .select("is_design_partner, subscription_status, billing_period_start, billing_period_end")
    .eq("id", userId)
    .single();

  if (error || !user) {
    throw new Error("Failed to look up user for usage check");
  }

  const { periodStart, periodEnd } = getBillingPeriod(user);
  const used = await countInvoicesInPeriod(orgId, periodStart);

  const isDesignPartner = user.is_design_partner ?? false;
  const limit = isDesignPartner ? DESIGN_PARTNER_LIMIT : null;
  const percentUsed = limit !== null ? (used / limit) * 100 : null;

  return {
    used,
    limit,
    percentUsed,
    periodStart,
    periodEnd,
    isDesignPartner,
  };
}

/**
 * Check if an org can upload more invoices this period.
 * Only design partners have a hard limit (100/mo).
 * All other plans are unlimited for now.
 */
export async function checkUsageLimit(orgId: string, userId: string): Promise<UsageLimitResult> {
  const usage = await getUsageThisPeriod(orgId, userId);

  if (usage.limit !== null && usage.used >= usage.limit) {
    return { allowed: false, usage, reason: "monthly_limit_reached" };
  }

  return { allowed: true, usage };
}
```

- [ ] **Step 2: Run tests**

Run: `npm run test -- lib/billing/usage.test.ts`
Expected: All tests pass. If the Supabase mock chaining doesn't match, adjust the mock to match the actual query chain (`.select().eq().gte().not()`).

- [ ] **Step 3: Commit**

```bash
git add lib/billing/usage.ts lib/billing/usage.test.ts
git commit -m "feat: add usage tracking utility with tests (DOC-39)"
```

---

## Task 5: Stripe Webhook — Cache Billing Period

**Files:**
- Modify: `app/api/stripe/webhook/route.ts`

- [ ] **Step 1: Update `updateSubscriptionStatus` to accept billing period**

Modify the `updateSubscriptionStatus` function (line 44-57) to accept optional billing period dates:

```typescript
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
```

- [ ] **Step 2: Update all callers of `updateSubscriptionStatus`**

**checkout.session.completed handler** (line 99-111) — pass `stripeCustomerId` via options:

```typescript
await updateSubscriptionStatus(userId, "active", {
  stripeCustomerId: session.customer as string,
});
```

**subscription.created/updated handler** (line 114-129) — pass billing period:

```typescript
if (userId) {
  const newStatus = mapSubscriptionStatus(subscription.status);
  await updateSubscriptionStatus(userId, newStatus, {
    billingPeriodStart: subscription.current_period_start,
    billingPeriodEnd: subscription.current_period_end,
  });
  logger.info("stripe_webhook.subscription_updated", {
    userId,
    stripeCustomerId: customerId,
    eventType: event.type,
    status: newStatus,
  });
}
```

**subscription.deleted handler** (line 133-147) — clear billing period:

```typescript
if (userId) {
  await updateSubscriptionStatus(userId, "cancelled");
  // billing_period_start/end left as-is (historical reference)
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/stripe/webhook/route.ts
git commit -m "feat: cache Stripe billing period on subscription events (DOC-39)"
```

---

## Task 6: Upload Route — Enforce Usage Limit

**Files:**
- Modify: `app/api/invoices/upload/route.ts`

- [ ] **Step 1: Add usage limit check after access check**

After the existing access check block (line 48-63), add:

```typescript
import { checkUsageLimit } from "@/lib/billing/usage";
import { usageLimitError } from "@/lib/utils/errors"; // add to existing import
```

Then after the `checkInvoiceAccess` block and before form data parsing (line 65):

```typescript
    // 2c. Monthly usage limit check
    const usageCheck = await checkUsageLimit(orgId, user.id);
    if (!usageCheck.allowed) {
      logger.warn("invoice_upload_usage_limit", {
        action: "upload",
        userId: user.id,
        orgId,
        used: usageCheck.usage.used,
        limit: usageCheck.usage.limit,
      });
      return usageLimitError("Monthly invoice limit reached (100/month).", {
        used: usageCheck.usage.used,
        limit: usageCheck.usage.limit,
        resetsAt: usageCheck.usage.periodEnd.toISOString(),
      });
    }
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/invoices/upload/route.ts
git commit -m "feat: enforce monthly usage limit on upload (DOC-39)"
```

---

## Task 7: UsageLimitBanner Component

**Files:**
- Create: `components/settings/UsageLimitBanner.tsx`

- [ ] **Step 1: Create the banner component**

This component renders three states based on usage percentage:
- Hidden when no limit or under 80%
- Amber warning at 80-99%
- Red limit-reached at 100%+

```typescript
import Link from "next/link";

interface UsageLimitBannerProps {
  used: number;
  limit: number | null;
  percentUsed: number | null;
  periodEnd: string; // ISO string
  variant?: "warning" | "limit-reached";
}

export function UsageLimitBanner({ used, limit, percentUsed, periodEnd, variant }: UsageLimitBannerProps) {
  // Auto-detect variant from usage if not explicitly set
  const effectiveVariant = variant ?? (
    percentUsed !== null && percentUsed >= 100 ? "limit-reached" :
    percentUsed !== null && percentUsed >= 80 ? "warning" :
    null
  );

  if (!effectiveVariant) return null;

  const resetDate = new Date(periodEnd).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });

  if (effectiveVariant === "limit-reached") {
    return (
      <div className="rounded-brand-md border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-sm font-medium text-red-800">
          You&apos;ve reached your monthly limit of {limit} invoices.
        </p>
        <p className="mt-1 text-sm text-red-700">
          Your limit resets on {resetDate}.{" "}
          <Link href="/app/settings" className="underline hover:no-underline">
            Manage billing
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-brand-md border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-medium text-amber-800">
        You&apos;ve used {used} of {limit} invoices this month.
      </p>
      <p className="mt-1 text-sm text-amber-700">
        Usage resets on {resetDate}.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add components/settings/UsageLimitBanner.tsx
git commit -m "feat: add UsageLimitBanner component (DOC-39)"
```

---

## Task 8: Upload Page — Show Usage State

**Files:**
- Modify: `app/(dashboard)/upload/page.tsx`

- [ ] **Step 1: Fetch usage info and render states**

Replace the current upload page with usage-aware version:

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkInvoiceAccess } from "@/lib/billing/access";
import { getUsageThisPeriod } from "@/lib/billing/usage";
import UploadFlow from "@/components/invoices/UploadFlow";
import UploadGate from "@/components/billing/UploadGate";
import { UsageLimitBanner } from "@/components/settings/UsageLimitBanner";

export default async function UploadPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const access = await checkInvoiceAccess(user.id);

  if (!access.allowed) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="font-headings font-bold text-[32px] text-text tracking-tight">Upload Invoices</h1>
        <p className="font-body text-[15px] text-muted mt-2">
          Drop your PDF or image files — AI will extract the data automatically.
        </p>
        <div className="mt-6">
          <UploadGate
            subscriptionStatus={access.subscriptionStatus}
            trialExpired={access.trialExpired}
          />
        </div>
      </div>
    );
  }

  // Fetch org for usage check
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  const orgId = membership?.org_id;
  let usageInfo: Awaited<ReturnType<typeof getUsageThisPeriod>> | null = null;

  if (orgId) {
    try {
      usageInfo = await getUsageThisPeriod(orgId, user.id);
    } catch {
      // Fail-open: if usage check fails, allow upload
    }
  }

  const isAtLimit = usageInfo?.limit !== null &&
    usageInfo !== null &&
    usageInfo.used >= (usageInfo.limit ?? Infinity);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-headings font-bold text-[32px] text-text tracking-tight">Upload Invoices</h1>
      <p className="font-body text-[15px] text-muted mt-2">
        Drop your PDF or image files — AI will extract the data automatically.
      </p>
      <div className="mt-6 space-y-4">
        {usageInfo && usageInfo.limit !== null && (
          <UsageLimitBanner
            used={usageInfo.used}
            limit={usageInfo.limit}
            percentUsed={usageInfo.percentUsed}
            periodEnd={usageInfo.periodEnd.toISOString()}
          />
        )}
        {isAtLimit ? (
          <UploadGate
            subscriptionStatus="usage_limit"
            trialExpired={false}
          />
        ) : (
          <UploadFlow />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add usage limit state to UploadGate**

In `components/billing/UploadGate.tsx`, add a case for `subscriptionStatus === "usage_limit"` in `getGateContent`:

```typescript
if (subscriptionStatus === "usage_limit") {
  return {
    heading: "Monthly limit reached",
    body: "You've reached your invoice limit for this month. Your limit will reset at the start of your next billing period.",
    ctaText: "View Billing",
    ctaHref: "/app/settings",
  };
}
```

Add this at the top of the function, before the `trialExpired` check.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add app/(dashboard)/upload/page.tsx components/billing/UploadGate.tsx
git commit -m "feat: show usage warnings and limit gate on upload page (DOC-39)"
```

---

## Task 9: BillingCard — Usage Progress Bar

**Files:**
- Modify: `components/settings/BillingCard.tsx`
- Modify: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Update BillingCard props to accept UsageInfo**

Replace the `invoicesThisMonth: number` prop with structured usage data:

```typescript
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
```

- [ ] **Step 2: Update design partner section with progress bar**

Replace the simple "X / 100 invoices this month" text (lines 73-79) with:

```tsx
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
```

- [ ] **Step 3: Update active subscriber section**

Replace `{invoicesThisMonth} invoices this month` (line 101) with:

```tsx
<p className="font-body text-sm text-muted mb-5">
  {usage.used} invoices this billing period
</p>
```

- [ ] **Step 4: Update remaining states**

For cancelled and no-subscription states, replace `{invoicesThisMonth} invoices this month` with `{usage.used} invoices this month`.

- [ ] **Step 5: Update Settings page to use `getUsageThisPeriod`**

In `app/(dashboard)/settings/page.tsx`, replace the inline count query (lines 65-76) with:

```typescript
import { getUsageThisPeriod } from "@/lib/billing/usage";

// Replace the inline count block with:
let usage = { used: 0, limit: null as number | null, percentUsed: null as number | null, periodEnd: new Date().toISOString() };
if (orgId) {
  try {
    const usageInfo = await getUsageThisPeriod(orgId, user!.id);
    usage = {
      used: usageInfo.used,
      limit: usageInfo.limit,
      percentUsed: usageInfo.percentUsed,
      periodEnd: usageInfo.periodEnd.toISOString(),
    };
  } catch {
    // Fail-open: show 0 usage if query fails
  }
}
```

Update the `<BillingCard>` call:

```tsx
<BillingCard user={billingUser} usage={usage} />
```

- [ ] **Step 6: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 7: Run all tests**

Run: `npm run test`
Expected: All tests pass (including existing BillingCard tests if any, plus new usage tests).

- [ ] **Step 8: Commit**

```bash
git add components/settings/BillingCard.tsx app/(dashboard)/settings/page.tsx
git commit -m "feat: usage progress bar in BillingCard, replace inline count (DOC-39)"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: Zero warnings, zero errors.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Apply migration to remote**

Apply the migration to the Supabase project via MCP or `supabase db push`.

- [ ] **Step 6: Write status report**

```
STATUS REPORT - DOC-39: BIL-5: Add Usage Tracking

1. FILES CHANGED
   [list all files with what changed]

2. DEPENDENCIES
   None added.

3. ACCEPTANCE CRITERIA CHECK
   ✅/❌ for each criterion from the Linear issue

4. SELF-REVIEW
   a-e per template

5. NEXT STEPS
```
