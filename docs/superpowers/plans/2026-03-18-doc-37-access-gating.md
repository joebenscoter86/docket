# DOC-37: Access Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate invoice upload, extraction, and sync behind subscription status, with a 14-day free trial for new signups and a design partner bypass.

**Architecture:** A `checkInvoiceAccess(userId)` utility queries the `users` table for `is_design_partner`, `subscription_status`, and `trial_ends_at`. Three API routes (upload, extract, sync) call this function early and return HTTP 402 if denied. The upload page becomes a server component that renders either the upload UI or an upgrade prompt based on the access check.

**Tech Stack:** Next.js 14 (App Router), Supabase Postgres, Vitest, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-18-doc-37-access-gating-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260318100000_add_trial_ends_at.sql` | DB migration: add column + update trigger |
| `lib/billing/access.ts` | **New.** `checkInvoiceAccess()` — single source of truth for access decisions |
| `lib/billing/access.test.ts` | **New.** Unit tests for all access scenarios |
| `lib/utils/errors.ts` | Add `SUBSCRIPTION_REQUIRED` error code + `subscriptionRequired()` helper |
| `app/api/invoices/upload/route.ts` | Add access check after org lookup |
| `app/api/invoices/[id]/extract/route.ts` | Add access check after auth |
| `app/api/invoices/[id]/sync/route.ts` | Add access check after org lookup |
| `components/invoices/UploadFlow.tsx` | **New.** Client component — existing upload page logic extracted here |
| `components/billing/UploadGate.tsx` | **New.** Upgrade prompt shown when access is denied |
| `components/billing/UploadGate.test.tsx` | **New.** Component tests for all four denial states |
| `app/(dashboard)/upload/page.tsx` | Convert from client to server component with access check |
| `app/api/invoices/upload/route.test.ts` | Add access mock + 402 test case |
| `app/api/invoices/[id]/extract/route.test.ts` | Add access mock + 402 test case |

---

### Task 1: Database Migration — `trial_ends_at` Column + Trigger Update

**Files:**
- Create: `supabase/migrations/20260318100000_add_trial_ends_at.sql`

- [ ] **Step 1: Write migration file**

Create `supabase/migrations/20260318100000_add_trial_ends_at.sql`:

```sql
-- Migration: Add trial_ends_at column and update signup trigger
-- Issue: DOC-37 (BIL-3)

-- 1. Add trial_ends_at column
-- Existing users get NULL (no trial), which is correct — they're
-- either design partners or need to subscribe.
ALTER TABLE users ADD COLUMN trial_ends_at TIMESTAMPTZ;

-- 2. Replace handle_new_user() to set trial_ends_at on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_user_id UUID;
  new_org_id UUID;
  org_name TEXT;
  email_domain TEXT;
BEGIN
  -- Extract domain from email for default org name
  email_domain := split_part(NEW.email, '@', 2);
  IF email_domain IS NOT NULL AND email_domain != '' THEN
    org_name := initcap(split_part(email_domain, '.', 1));
  ELSE
    org_name := 'My Organization';
  END IF;

  -- Create user row with 14-day trial
  INSERT INTO public.users (id, email, trial_ends_at)
  VALUES (NEW.id, NEW.email, now() + interval '14 days')
  RETURNING id INTO new_user_id;

  -- Create default organization
  INSERT INTO public.organizations (name, owner_id)
  VALUES (org_name, new_user_id)
  RETURNING id INTO new_org_id;

  -- Create org membership
  INSERT INTO public.org_memberships (user_id, org_id, role)
  VALUES (new_user_id, new_org_id, 'owner');

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user trigger failed for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Apply migration to dev database**

Run: `npx supabase db push` (if using remote dev) or apply via Supabase MCP `apply_migration` tool.

- [ ] **Step 3: Verify migration**

Run SQL to confirm column exists:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'trial_ends_at';
```
Expected: one row with `trial_ends_at`, `timestamp with time zone`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260318100000_add_trial_ends_at.sql
git commit -m "feat: add trial_ends_at column and update signup trigger (DOC-37)"
```

---

### Task 2: Error Helper — `SUBSCRIPTION_REQUIRED`

**Files:**
- Modify: `lib/utils/errors.ts`

- [ ] **Step 1: Add error code and helper to `lib/utils/errors.ts`**

Add `"SUBSCRIPTION_REQUIRED"` to the `ErrorCode` union type:

```typescript
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "AUTH_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UNPROCESSABLE"
  | "SUBSCRIPTION_REQUIRED"
  | "INTERNAL_ERROR"
  | "NOT_IMPLEMENTED";
```

Add the helper function at the end of the file (before the `apiSuccess` function):

```typescript
export function subscriptionRequired(message: string, details?: Record<string, unknown>) {
  return apiError({ error: message, code: "SUBSCRIPTION_REQUIRED", status: 402, details });
}
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/utils/errors.ts
git commit -m "feat: add SUBSCRIPTION_REQUIRED error code and helper (DOC-37)"
```

---

### Task 3: Access Check Utility — `checkInvoiceAccess()`

**Files:**
- Create: `lib/billing/access.ts`
- Create: `lib/billing/access.test.ts`

- [ ] **Step 1: Write the test file `lib/billing/access.test.ts`**

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkInvoiceAccess } from "./access";

// Mock the admin client
const mockUserSelect = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockUserSelect,
        })),
      })),
    })),
  }),
}));

function mockUser(overrides: {
  is_design_partner?: boolean;
  subscription_status?: string;
  trial_ends_at?: string | null;
} = {}) {
  mockUserSelect.mockResolvedValue({
    data: {
      is_design_partner: overrides.is_design_partner ?? false,
      subscription_status: overrides.subscription_status ?? "inactive",
      trial_ends_at: overrides.trial_ends_at ?? null,
    },
    error: null,
  });
}

describe("checkInvoiceAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows design partners regardless of subscription or trial", async () => {
    mockUser({ is_design_partner: true, subscription_status: "inactive", trial_ends_at: null });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({ allowed: true, reason: "design_partner" });
  });

  it("allows users with active subscription", async () => {
    mockUser({ subscription_status: "active" });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({ allowed: true, reason: "active_subscription" });
  });

  it("allows users within trial period", async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    mockUser({ trial_ends_at: futureDate });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({ allowed: true, reason: "trial" });
  });

  it("denies users with expired trial", async () => {
    const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    mockUser({ trial_ends_at: pastDate });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({
      allowed: false,
      reason: "no_subscription",
      subscriptionStatus: "inactive",
      trialExpired: true,
    });
  });

  it("denies users with null trial_ends_at (pre-migration users)", async () => {
    mockUser({ trial_ends_at: null });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({
      allowed: false,
      reason: "no_subscription",
      subscriptionStatus: "inactive",
      trialExpired: false,
    });
  });

  it("denies users with past_due subscription", async () => {
    mockUser({ subscription_status: "past_due" });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({
      allowed: false,
      reason: "no_subscription",
      subscriptionStatus: "past_due",
      trialExpired: false,
    });
  });

  it("denies users with cancelled subscription", async () => {
    mockUser({ subscription_status: "cancelled" });
    const result = await checkInvoiceAccess("user-1");
    expect(result).toEqual({
      allowed: false,
      reason: "no_subscription",
      subscriptionStatus: "cancelled",
      trialExpired: false,
    });
  });

  it("throws when user lookup fails", async () => {
    mockUserSelect.mockResolvedValue({ data: null, error: { message: "not found" } });
    await expect(checkInvoiceAccess("bad-id")).rejects.toThrow("Failed to look up user for access check");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/billing/access.test.ts`
Expected: FAIL — module `./access` not found.

- [ ] **Step 3: Write `lib/billing/access.ts`**

```typescript
import { createAdminClient } from "@/lib/supabase/admin";

export type AccessStatus =
  | { allowed: true; reason: "design_partner" | "active_subscription" | "trial" }
  | {
      allowed: false;
      reason: "no_subscription";
      subscriptionStatus: string;
      trialExpired: boolean;
    };

/**
 * Check whether a user can process invoices (upload, extract, sync).
 *
 * Access is granted if ANY of:
 * 1. User is a design partner
 * 2. subscription_status is 'active'
 * 3. trial_ends_at is in the future
 *
 * Uses the admin client to bypass RLS — this is a billing check,
 * not a data access check.
 */
export async function checkInvoiceAccess(userId: string): Promise<AccessStatus> {
  const admin = createAdminClient();

  const { data: user, error } = await admin
    .from("users")
    .select("is_design_partner, subscription_status, trial_ends_at")
    .eq("id", userId)
    .single();

  if (error || !user) {
    throw new Error("Failed to look up user for access check");
  }

  // 1. Design partners bypass everything
  if (user.is_design_partner) {
    return { allowed: true, reason: "design_partner" };
  }

  // 2. Active subscription
  if (user.subscription_status === "active") {
    return { allowed: true, reason: "active_subscription" };
  }

  // 3. Active trial
  if (user.trial_ends_at && new Date(user.trial_ends_at) > new Date()) {
    return { allowed: true, reason: "trial" };
  }

  // Denied — determine if trial existed and expired
  const trialExpired = user.trial_ends_at !== null;

  return {
    allowed: false,
    reason: "no_subscription",
    subscriptionStatus: user.subscription_status ?? "inactive",
    trialExpired,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/billing/access.test.ts`
Expected: all 8 tests PASS.

- [ ] **Step 5: Verify no type errors**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/billing/access.ts lib/billing/access.test.ts
git commit -m "feat: add checkInvoiceAccess utility with tests (DOC-37)"
```

---

### Task 4: Gate Upload API Route

**Files:**
- Modify: `app/api/invoices/upload/route.ts`

- [ ] **Step 1: Add access check to upload route**

In `app/api/invoices/upload/route.ts`, add the import at the top (with the other imports):

```typescript
import { checkInvoiceAccess } from "@/lib/billing/access";
import { subscriptionRequired } from "@/lib/utils/errors";
```

Note: `subscriptionRequired` is a new import. The existing `authError`, `forbiddenError`, etc. imports stay.

Insert the access check **after the org membership check** (after line 43 — after `orgId = membership.org_id;`) and **before the form data parsing** (before line 46 — `const formData = await request.formData();`):

```typescript
    // 2b. Subscription check
    const access = await checkInvoiceAccess(user.id);
    if (!access.allowed) {
      logger.warn("invoice_upload_access_denied", {
        action: "upload",
        userId: user.id,
        orgId,
        reason: access.reason,
        subscriptionStatus: access.subscriptionStatus,
        trialExpired: access.trialExpired,
      });
      return subscriptionRequired("Subscription required to upload invoices.", {
        subscriptionStatus: access.subscriptionStatus,
        trialExpired: access.trialExpired,
      });
    }
```

- [ ] **Step 2: Add `checkInvoiceAccess` mock to upload route tests**

In `app/api/invoices/upload/route.test.ts`, add this mock at the top with the other `vi.mock` calls. This is mandatory — the existing admin client mock won't return user billing data, so `checkInvoiceAccess` will throw without this:

```typescript
const mockCheckInvoiceAccess = vi.fn().mockResolvedValue({ allowed: true, reason: "active_subscription" });
vi.mock("@/lib/billing/access", () => ({
  checkInvoiceAccess: (...args: unknown[]) => mockCheckInvoiceAccess(...args),
}));
```

- [ ] **Step 3: Add 402 access denied test case**

Add this test to the upload route test file:

```typescript
it("returns 402 when user subscription check fails", async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  // Mock org membership lookup to succeed
  // (use the existing mock pattern from the test file)
  mockCheckInvoiceAccess.mockResolvedValueOnce({
    allowed: false,
    reason: "no_subscription",
    subscriptionStatus: "inactive",
    trialExpired: true,
  });

  const formData = new FormData();
  formData.append("file", new Blob(["test"], { type: "application/pdf" }), "test.pdf");
  const request = new Request("http://localhost/api/invoices/upload", {
    method: "POST",
    body: formData,
  });

  const response = await POST(request);
  expect(response.status).toBe(402);

  const body = await response.json();
  expect(body.code).toBe("SUBSCRIPTION_REQUIRED");
  expect(body.details.trialExpired).toBe(true);
});
```

- [ ] **Step 4: Run upload route tests**

Run: `npx vitest run app/api/invoices/upload`
Expected: all tests PASS (existing + new 402 test).

- [ ] **Step 5: Commit**

```bash
git add app/api/invoices/upload/route.ts app/api/invoices/upload/route.test.ts
git commit -m "feat: gate upload route behind subscription check (DOC-37)"
```

---

### Task 5: Gate Extract API Route

**Files:**
- Modify: `app/api/invoices/[id]/extract/route.ts`

- [ ] **Step 1: Add access check to extract route**

In `app/api/invoices/[id]/extract/route.ts`, add imports at the top:

```typescript
import { checkInvoiceAccess } from "@/lib/billing/access";
import { subscriptionRequired } from "@/lib/utils/errors";
```

Insert the access check **after the auth check** (after line 24 — after `logger.info("extract_route_start", ...)`) and **before the invoice ownership check** (before line 27 — `const { data: invoice ... }`).

Note: the extract route uses RLS for ownership instead of an explicit org lookup, so the access check goes directly after auth.

```typescript
  // 1b. Subscription check
  const access = await checkInvoiceAccess(user.id);
  if (!access.allowed) {
    logger.warn("extract_route_access_denied", {
      action: "extract",
      invoiceId,
      userId: user.id,
      reason: access.reason,
      subscriptionStatus: access.subscriptionStatus,
      trialExpired: access.trialExpired,
    });
    return subscriptionRequired("Subscription required to extract invoice data.", {
      subscriptionStatus: access.subscriptionStatus,
      trialExpired: access.trialExpired,
    });
  }
```

- [ ] **Step 2: Update extract route tests**

In `app/api/invoices/[id]/extract/route.test.ts`, add a mock for `checkInvoiceAccess` at the top (with the other mocks). This is mandatory — `checkInvoiceAccess` calls `createAdminClient` internally which is already mocked for invoice data, not user data:

```typescript
const mockCheckInvoiceAccess = vi.fn().mockResolvedValue({ allowed: true, reason: "active_subscription" });
vi.mock("@/lib/billing/access", () => ({
  checkInvoiceAccess: (...args: unknown[]) => mockCheckInvoiceAccess(...args),
}));
```

- [ ] **Step 3: Add 402 access denied test case**

Add this test to the extract route test file:

```typescript
it("returns 402 when subscription check fails", async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mockCheckInvoiceAccess.mockResolvedValueOnce({
    allowed: false,
    reason: "no_subscription",
    subscriptionStatus: "inactive",
    trialExpired: true,
  });

  const { request, params } = makeRequest("inv-1");
  const response = await POST(request, { params });
  expect(response.status).toBe(402);

  const body = await response.json();
  expect(body.code).toBe("SUBSCRIPTION_REQUIRED");
});
```

- [ ] **Step 4: Run extract route tests**

Run: `npx vitest run "app/api/invoices/[id]/extract/route.test.ts"`
Expected: all tests PASS (existing + new 402 test).

- [ ] **Step 5: Commit**

```bash
git add "app/api/invoices/[id]/extract/route.ts" "app/api/invoices/[id]/extract/route.test.ts"
git commit -m "feat: gate extract route behind subscription check (DOC-37)"
```

---

### Task 6: Gate Sync API Route

**Files:**
- Modify: `app/api/invoices/[id]/sync/route.ts`

- [ ] **Step 1: Add access check to sync route**

In `app/api/invoices/[id]/sync/route.ts`, add imports at the top:

```typescript
import { checkInvoiceAccess } from "@/lib/billing/access";
import { subscriptionRequired } from "@/lib/utils/errors";
```

Insert the access check **after the org membership check** (after line 48 — after `const orgId = membership.org_id;`) and **before the admin client creation and invoice lookup** (before line 53 — `const adminSupabase = createAdminClient();`):

```typescript
    // 2b. Subscription check
    const access = await checkInvoiceAccess(user.id);
    if (!access.allowed) {
      logger.warn("sync_route_access_denied", {
        action: "sync",
        invoiceId,
        userId: user.id,
        orgId,
        reason: access.reason,
        subscriptionStatus: access.subscriptionStatus,
        trialExpired: access.trialExpired,
      });
      return subscriptionRequired("Subscription required to sync invoices.", {
        subscriptionStatus: access.subscriptionStatus,
        trialExpired: access.trialExpired,
      });
    }
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/invoices/[id]/sync/route.ts"
git commit -m "feat: gate sync route behind subscription check (DOC-37)"
```

---

### Task 7: Extract Upload Flow to Client Component

**Files:**
- Create: `components/invoices/UploadFlow.tsx`
- Modify: `app/(dashboard)/upload/page.tsx`

This task splits the upload page. The existing client-side logic moves to `UploadFlow.tsx`, and the page becomes a thin server component.

- [ ] **Step 1: Create `components/invoices/UploadFlow.tsx`**

Move the entire current contents of `app/(dashboard)/upload/page.tsx` into this new file. Change the component name from `UploadPage` to `UploadFlow` and remove the heading/description (those stay in the page):

```typescript
"use client";

import { useState, useCallback } from "react";
import UploadZone from "@/components/invoices/UploadZone";
import ExtractionProgress from "@/components/invoices/ExtractionProgress";
import { useInvoiceStatus } from "@/lib/hooks/useInvoiceStatus";

export default function UploadFlow() {
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const { status, errorMessage } = useInvoiceStatus(invoiceId);

  const handleUploadComplete = useCallback((id: string) => {
    setInvoiceId(id);
  }, []);

  const handleUploadAnother = useCallback(() => {
    setInvoiceId(null);
    setRetryError(null);
  }, []);

  const handleRetry = useCallback(async () => {
    if (!invoiceId) return;
    setRetryError(null);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/retry`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json();
        setRetryError(body.error || "Retry failed. Please try again.");
      }
    } catch {
      setRetryError("Retry failed. Please check your connection.");
    }
  }, [invoiceId]);

  return (
    <>
      {!invoiceId ? (
        <UploadZone onUploadComplete={handleUploadComplete} />
      ) : (
        <div className="rounded-brand-lg border border-border bg-surface p-8">
          <ExtractionProgress
            invoiceId={invoiceId}
            status={status}
            errorMessage={errorMessage}
            retryError={retryError}
            onRetry={handleRetry}
            onUploadAnother={handleUploadAnother}
          />
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/invoices/UploadFlow.tsx
git commit -m "refactor: extract UploadFlow client component from upload page (DOC-37)"
```

---

### Task 8: UploadGate Component

**Files:**
- Create: `components/billing/UploadGate.tsx`

- [ ] **Step 1: Create `components/billing/UploadGate.tsx`**

```typescript
import Link from "next/link";

interface UploadGateProps {
  subscriptionStatus: string;
  trialExpired: boolean;
}

function getGateContent(subscriptionStatus: string, trialExpired: boolean) {
  if (trialExpired) {
    return {
      heading: "Your free trial has ended",
      body: "Subscribe to continue processing invoices.",
      ctaText: "View Plans",
      ctaHref: "/app/settings",
    };
  }

  if (subscriptionStatus === "cancelled") {
    return {
      heading: "Your subscription is inactive",
      body: "Resubscribe to continue processing invoices.",
      ctaText: "Manage Subscription",
      ctaHref: "/app/settings",
    };
  }

  if (subscriptionStatus === "past_due") {
    return {
      heading: "Payment issue",
      body: "Update your payment method to continue processing invoices.",
      ctaText: "Update Payment",
      ctaHref: "/app/settings",
    };
  }

  // Default: never subscribed
  return {
    heading: "Subscribe to process invoices",
    body: "Start your subscription to upload, extract, and sync invoices.",
    ctaText: "View Plans",
    ctaHref: "/app/settings",
  };
}

export default function UploadGate({ subscriptionStatus, trialExpired }: UploadGateProps) {
  const { heading, body, ctaText, ctaHref } = getGateContent(subscriptionStatus, trialExpired);

  return (
    <div className="flex flex-col items-center justify-center rounded-brand-lg border border-border bg-surface px-8 py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
        <svg
          className="h-6 w-6 text-amber-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
          />
        </svg>
      </div>
      <h2 className="font-headings text-xl font-semibold text-text">{heading}</h2>
      <p className="mt-2 font-body text-[15px] text-muted max-w-md">{body}</p>
      <Link
        href={ctaHref}
        className="mt-6 inline-flex items-center rounded-brand bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
      >
        {ctaText}
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/billing/UploadGate.tsx
git commit -m "feat: add UploadGate upgrade prompt component (DOC-37)"
```

---

### Task 9: UploadGate Component Tests

**Files:**
- Create: `components/billing/UploadGate.test.tsx`

- [ ] **Step 1: Write `components/billing/UploadGate.test.tsx`**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import UploadGate from "./UploadGate";

describe("UploadGate", () => {
  it("shows trial expired copy when trialExpired is true", () => {
    render(<UploadGate subscriptionStatus="inactive" trialExpired={true} />);
    expect(screen.getByText("Your free trial has ended")).toBeInTheDocument();
    expect(screen.getByText("Subscribe to continue processing invoices.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Plans" })).toHaveAttribute("href", "/app/settings");
  });

  it("shows cancelled copy when subscriptionStatus is cancelled", () => {
    render(<UploadGate subscriptionStatus="cancelled" trialExpired={false} />);
    expect(screen.getByText("Your subscription is inactive")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage Subscription" })).toHaveAttribute("href", "/app/settings");
  });

  it("shows past_due copy when subscriptionStatus is past_due", () => {
    render(<UploadGate subscriptionStatus="past_due" trialExpired={false} />);
    expect(screen.getByText("Payment issue")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Update Payment" })).toHaveAttribute("href", "/app/settings");
  });

  it("shows default never-subscribed copy", () => {
    render(<UploadGate subscriptionStatus="inactive" trialExpired={false} />);
    expect(screen.getByText("Subscribe to process invoices")).toBeInTheDocument();
    expect(screen.getByText("Start your subscription to upload, extract, and sync invoices.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Plans" })).toHaveAttribute("href", "/app/settings");
  });
});
```

- [ ] **Step 2: Run UploadGate tests**

Run: `npx vitest run components/billing/UploadGate.test.tsx`
Expected: all 4 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add components/billing/UploadGate.test.tsx
git commit -m "test: add UploadGate component tests for all denial states (DOC-37)"
```

---

### Task 10: Convert Upload Page to Server Component with Access Check

> Note: This was originally Task 9 before UploadGate tests were added.

**Files:**
- Modify: `app/(dashboard)/upload/page.tsx`

- [ ] **Step 1: Rewrite `app/(dashboard)/upload/page.tsx` as server component**

Replace the entire file contents:

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkInvoiceAccess } from "@/lib/billing/access";
import UploadFlow from "@/components/invoices/UploadFlow";
import UploadGate from "@/components/billing/UploadGate";

export default async function UploadPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const access = await checkInvoiceAccess(user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-headings font-bold text-[32px] text-text tracking-tight">Upload Invoices</h1>
      <p className="font-body text-[15px] text-muted mt-2">
        Drop your PDF or image files — AI will extract the data automatically.
      </p>
      <div className="mt-6">
        {access.allowed ? (
          <UploadFlow />
        ) : (
          <UploadGate
            subscriptionStatus={access.subscriptionStatus}
            trialExpired={access.trialExpired}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/upload/page.tsx"
git commit -m "feat: convert upload page to server component with access gating (DOC-37)"
```

---

### Task 11: Full Verification

- [ ] **Step 1: Run all tests**

Run: `npm run test`
Expected: all tests pass.

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: zero warnings, zero errors.

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: build completes without errors.

- [ ] **Step 5: Commit any test/lint fixes if needed**

If any fixes were required, commit them:
```bash
git add -A
git commit -m "fix: address lint/test issues from access gating (DOC-37)"
```

- [ ] **Step 6: Push branch and create PR**

```bash
git push -u origin feature/BIL-3-access-gating
gh pr create --title "DOC-37: Implement access gating (subscription check before invoice processing)" --body "$(cat <<'EOF'
## Summary
- Adds `trial_ends_at` column to users table; new signups get 14-day free trial
- `checkInvoiceAccess()` utility checks design partner / active subscription / trial
- Gates upload, extract, and sync API routes (returns 402 if denied)
- Upload page shows upgrade prompt for gated users
- Design partners bypass all billing checks

## Test plan
- [ ] Unit tests for all 7 access scenarios (design partner, active, trial, expired, null trial, past_due, cancelled)
- [ ] Existing API route tests still pass with access mock
- [ ] Upload page renders UploadFlow for allowed users
- [ ] Upload page renders UploadGate for denied users
- [ ] API routes return 402 with correct error code for denied users

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
