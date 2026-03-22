# DOC-92: Wire Trial Invoice Counter

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increment `trial_invoices_used` on each upload so trial users are correctly metered and blocked at 10 invoices.

**Architecture:** A Postgres function (`increment_trial_invoice`) provides atomic, race-safe increment with a conditional `WHERE trial_invoices_used < 10`. The upload route calls this function via `.rpc()` for trial users BEFORE the file upload, acting as a "reservation." The upload page shows a `TrialProgressBanner` with remaining count. The `UploadQueue` component handles mid-batch trial exhaustion by cancelling remaining files.

**Tech Stack:** Supabase Postgres (RPC function), Next.js API route, React components (Tailwind CSS)

**Conflict note:** DOC-91 (pricing page) is being built by another agent. Zero file overlap -- DOC-91 creates `app/(dashboard)/pricing/page.tsx` and reads `lib/billing/tiers.ts`. We modify the upload route, upload page, UploadZone, and UploadQueue. Both read `lib/billing/tiers.ts` but neither modifies it.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260321200000_add_increment_trial_fn.sql` | Create | Postgres function for atomic trial increment |
| `lib/billing/trial.ts` | Create | Thin wrapper around `admin.rpc("increment_trial_invoice")` |
| `lib/billing/trial.test.ts` | Create | Unit tests for trial increment wrapper |
| `app/api/invoices/upload/route.ts` | Modify | Call trial increment for trial users before upload |
| `app/api/invoices/upload/route.test.ts` | Modify | Add tests for trial increment in upload flow |
| `components/billing/TrialProgressBanner.tsx` | Create | Shows "X of 10 trial invoices used" |
| `app/(dashboard)/upload/page.tsx` | Modify | Render TrialProgressBanner for trial users |
| `components/invoices/UploadQueue.tsx` | Modify | Handle trial exhaustion error code mid-batch |

---

## Task 1: Postgres function for atomic trial increment

**Files:**
- Create: `supabase/migrations/20260321200000_add_increment_trial_fn.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Atomic trial invoice increment with race-condition protection.
-- Returns the new count on success, or -1 if the limit is already reached
-- (or the user is not a trial user).
--
-- IMPORTANT: The limit (10) must match TRIAL_INVOICE_LIMIT in lib/billing/tiers.ts.
CREATE OR REPLACE FUNCTION increment_trial_invoice(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE users
  SET trial_invoices_used = trial_invoices_used + 1
  WHERE id = p_user_id
    AND NOT is_design_partner
    AND subscription_status != 'active'
    AND trial_invoices_used < 10
  RETURNING trial_invoices_used INTO new_count;

  RETURN COALESCE(new_count, -1);
END;
$$;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` (or apply via Supabase dashboard if using remote dev)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260321200000_add_increment_trial_fn.sql
git commit -m "feat: add increment_trial_invoice Postgres function (DOC-92)"
```

---

## Task 2: Trial increment wrapper (`lib/billing/trial.ts`)

**Files:**
- Create: `lib/billing/trial.ts`
- Create: `lib/billing/trial.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/billing/trial.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { incrementTrialInvoice } from "./trial";

const mockRpc = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mockRpc,
  }),
}));

describe("incrementTrialInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns new count on successful increment", async () => {
    mockRpc.mockResolvedValue({ data: 3, error: null });
    const result = await incrementTrialInvoice("user-1");
    expect(result).toEqual({ success: true, newCount: 3 });
    expect(mockRpc).toHaveBeenCalledWith("increment_trial_invoice", {
      p_user_id: "user-1",
    });
  });

  it("returns trialExhausted when function returns -1 (limit reached)", async () => {
    mockRpc.mockResolvedValue({ data: -1, error: null });
    const result = await incrementTrialInvoice("user-1");
    expect(result).toEqual({ success: false, reason: "trial_exhausted" });
  });

  it("returns error on RPC failure (fail-open)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "DB down" } });
    const result = await incrementTrialInvoice("user-1");
    expect(result).toEqual({ success: true, newCount: -1, failedOpen: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/billing/trial.test.ts`
Expected: FAIL -- module not found

- [ ] **Step 3: Write the implementation**

```typescript
// lib/billing/trial.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";

type IncrementResult =
  | { success: true; newCount: number; failedOpen?: boolean }
  | { success: false; reason: "trial_exhausted" };

/**
 * Atomically increment trial_invoices_used for a trial user.
 *
 * Uses a Postgres function with `WHERE trial_invoices_used < 10`
 * to prevent race conditions from exceeding the limit.
 *
 * - Returns { success: true, newCount } on successful increment.
 * - Returns { success: false, reason: "trial_exhausted" } if limit reached (including races).
 * - Fails open on transient DB errors (logs to Sentry, returns success with failedOpen flag).
 */
export async function incrementTrialInvoice(userId: string): Promise<IncrementResult> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("increment_trial_invoice", {
    p_user_id: userId,
  });

  if (error) {
    // Fail-open: don't block upload on transient DB errors
    logger.error("trial_increment_rpc_failed", {
      userId,
      error: error.message,
    });
    return { success: true, newCount: -1, failedOpen: true };
  }

  if (data === -1) {
    return { success: false, reason: "trial_exhausted" };
  }

  return { success: true, newCount: data as number };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- lib/billing/trial.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/billing/trial.ts lib/billing/trial.test.ts
git commit -m "feat: add incrementTrialInvoice wrapper with fail-open (DOC-92)"
```

---

## Task 3: Wire trial increment into upload route

**Files:**
- Modify: `app/api/invoices/upload/route.ts` (after line 71, before line 90)
- Modify: `app/api/invoices/upload/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these tests to the existing `route.test.ts`:

```typescript
// Add at top with other mocks:
const mockIncrementTrialInvoice = vi.fn();
vi.mock("@/lib/billing/trial", () => ({
  incrementTrialInvoice: (...args: unknown[]) => mockIncrementTrialInvoice(...args),
}));

// Add these test cases inside the describe block:

it("increments trial counter for trial users on successful upload", async () => {
  setupSuccessPath();
  mockCheckInvoiceAccess.mockResolvedValueOnce({ allowed: true, reason: "trial" });
  mockIncrementTrialInvoice.mockResolvedValue({ success: true, newCount: 3 });

  const req = createUploadRequest({
    name: "invoice.pdf",
    type: "application/pdf",
    content: Buffer.from("%PDF-1.4"),
  });

  const res = await POST(req);
  expect(res.status).toBe(200);
  expect(mockIncrementTrialInvoice).toHaveBeenCalledWith("user-1");
});

it("does not increment trial counter for active subscribers", async () => {
  setupSuccessPath();
  mockCheckInvoiceAccess.mockResolvedValueOnce({ allowed: true, reason: "active_subscription" });

  const req = createUploadRequest({
    name: "invoice.pdf",
    type: "application/pdf",
    content: Buffer.from("%PDF-1.4"),
  });

  const res = await POST(req);
  expect(res.status).toBe(200);
  expect(mockIncrementTrialInvoice).not.toHaveBeenCalled();
});

it("does not increment trial counter for design partners", async () => {
  setupSuccessPath();
  mockCheckInvoiceAccess.mockResolvedValueOnce({ allowed: true, reason: "design_partner" });

  const req = createUploadRequest({
    name: "invoice.pdf",
    type: "application/pdf",
    content: Buffer.from("%PDF-1.4"),
  });

  const res = await POST(req);
  expect(res.status).toBe(200);
  expect(mockIncrementTrialInvoice).not.toHaveBeenCalled();
});

it("returns 402 when trial increment fails due to race (limit reached)", async () => {
  setupAuthenticatedUser();
  mockCheckInvoiceAccess.mockResolvedValueOnce({ allowed: true, reason: "trial" });
  mockIncrementTrialInvoice.mockResolvedValue({ success: false, reason: "trial_exhausted" });

  const req = createUploadRequest({
    name: "invoice.pdf",
    type: "application/pdf",
    content: Buffer.from("%PDF-1.4"),
  });

  const res = await POST(req);
  const body = await res.json();

  expect(res.status).toBe(402);
  expect(body.code).toBe("SUBSCRIPTION_REQUIRED");
  expect(body.details?.trialExhausted).toBe(true);
  // Should NOT have uploaded the file
  expect(mockStorageUpload).not.toHaveBeenCalled();
});

it("proceeds with upload when trial increment fails open (transient error)", async () => {
  setupSuccessPath();
  mockCheckInvoiceAccess.mockResolvedValueOnce({ allowed: true, reason: "trial" });
  mockIncrementTrialInvoice.mockResolvedValue({ success: true, newCount: -1, failedOpen: true });

  const req = createUploadRequest({
    name: "invoice.pdf",
    type: "application/pdf",
    content: Buffer.from("%PDF-1.4"),
  });

  const res = await POST(req);
  expect(res.status).toBe(200);
});

it("returns trialRemaining in success response for trial users", async () => {
  setupSuccessPath();
  mockCheckInvoiceAccess.mockResolvedValueOnce({ allowed: true, reason: "trial" });
  mockIncrementTrialInvoice.mockResolvedValue({ success: true, newCount: 5 });

  const req = createUploadRequest({
    name: "invoice.pdf",
    type: "application/pdf",
    content: Buffer.from("%PDF-1.4"),
  });

  const res = await POST(req);
  const body = await res.json();

  expect(res.status).toBe(200);
  expect(body.data.trialRemaining).toBe(5);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- app/api/invoices/upload/route.test.ts`
Expected: FAIL -- `incrementTrialInvoice` not called, `trialRemaining` not in response

- [ ] **Step 3: Modify the upload route**

In `app/api/invoices/upload/route.ts`, add the import and trial increment logic:

```typescript
// Add imports at top:
import { incrementTrialInvoice } from "@/lib/billing/trial";
import { TRIAL_INVOICE_LIMIT } from "@/lib/billing/tiers";

// After the access check block (after line 71, before "// 2c. Monthly usage limit check"):

    // 2b-ii. Trial invoice reservation (atomic, race-safe)
    let trialNewCount: number | null = null;
    if (access.allowed && access.reason === "trial") {
      const increment = await incrementTrialInvoice(user.id);
      if (!increment.success) {
        logger.warn("invoice_upload_trial_exhausted_race", {
          action: "upload",
          userId: user.id,
          orgId,
        });
        return subscriptionRequired("Trial limit reached. Choose a plan to continue.", {
          trialExhausted: true,
        });
      }
      trialNewCount = increment.newCount;
    }
```

Then in the success response (around line 336), add `trialRemaining`:

```typescript
    return apiSuccess({
      invoiceId,
      fileName,
      signedUrl: signedUrlData?.signedUrl || null,
      duplicateWarning,
      ...(trialNewCount !== null && trialNewCount >= 0 && {
        trialRemaining: TRIAL_INVOICE_LIMIT - trialNewCount,
      }),
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- app/api/invoices/upload/route.test.ts`
Expected: PASS (all existing + 6 new tests)

- [ ] **Step 5: Run full test suite**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add app/api/invoices/upload/route.ts app/api/invoices/upload/route.test.ts
git commit -m "feat: wire trial increment into upload route with race protection (DOC-92)"
```

---

## Task 4: TrialProgressBanner component

**Files:**
- Create: `components/billing/TrialProgressBanner.tsx`
- Modify: `app/(dashboard)/upload/page.tsx`

- [ ] **Step 1: Create TrialProgressBanner component**

```typescript
// components/billing/TrialProgressBanner.tsx
import Link from "next/link";

interface TrialProgressBannerProps {
  used: number;
  limit: number;
}

export function TrialProgressBanner({ used, limit }: TrialProgressBannerProps) {
  const remaining = Math.max(0, limit - used);
  const percentUsed = (used / limit) * 100;
  const isWarning = remaining <= 2 && remaining > 0;

  const bgColor = isWarning ? "bg-amber-50" : "bg-blue-50";
  const borderColor = isWarning ? "border-amber-200" : "border-blue-200";
  const textColor = isWarning ? "text-amber-800" : "text-blue-800";
  const subtextColor = isWarning ? "text-amber-700" : "text-blue-700";
  const barColor = isWarning ? "bg-amber-500" : "bg-blue-500";

  return (
    <div className={`rounded-brand-md border ${borderColor} ${bgColor} px-4 py-3`}>
      <div className="flex items-center justify-between">
        <p className={`text-sm font-medium ${textColor}`}>
          {isWarning
            ? `${remaining} trial invoice${remaining === 1 ? "" : "s"} remaining`
            : `${used} of ${limit} trial invoices used`}
        </p>
        <Link
          href="/pricing"
          className={`text-sm ${subtextColor} underline hover:no-underline`}
        >
          View plans
        </Link>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full ${barColor} transition-all`}
          style={{ width: `${Math.min(percentUsed, 100)}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into upload page**

In `app/(dashboard)/upload/page.tsx`, add the `TrialProgressBanner` import and render it for trial users:

```typescript
// Add import:
import { TrialProgressBanner } from "@/components/billing/TrialProgressBanner";

// Replace the usageInfo banner block (lines 65-72) with:
        {usageInfo && usageInfo.limit !== null && (
          <UsageLimitBanner
            used={usageInfo.used}
            limit={usageInfo.limit}
            percentUsed={usageInfo.percentUsed}
            periodEnd={usageInfo.periodEnd.toISOString()}
          />
        )}
        {usageInfo && usageInfo.isTrial && (
          <TrialProgressBanner
            used={usageInfo.trialInvoicesUsed}
            limit={usageInfo.trialLimit}
          />
        )}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add components/billing/TrialProgressBanner.tsx app/(dashboard)/upload/page.tsx
git commit -m "feat: add TrialProgressBanner to upload page (DOC-92)"
```

---

## Task 5: Handle trial exhaustion in UploadQueue (batch uploads)

**Files:**
- Modify: `components/invoices/UploadQueue.tsx` (line 230)

- [ ] **Step 1: Update UploadQueue error handling**

In `components/invoices/UploadQueue.tsx`, the `uploadFile` callback (around line 229) currently checks for `body.code === "USAGE_LIMIT"`. Add trial exhaustion handling:

```typescript
        if (!res.ok) {
          // Trial exhausted or monthly usage limit -- cancel remaining files
          if (
            body.code === "USAGE_LIMIT_REACHED" ||
            (body.code === "SUBSCRIPTION_REQUIRED" && body.details?.trialExhausted)
          ) {
            const msg = body.details?.trialExhausted
              ? "Trial limit reached."
              : "Monthly limit reached.";
            updateEntry(entry.id, {
              status: "error",
              errorMessage: msg,
              usageLimitHit: true,
            });
            cancelRemaining(msg);
            return;
          }
          updateEntry(entry.id, {
            status: "error",
            errorMessage: body.error || "Upload failed.",
          });
          return;
        }
```

Note: This also fixes the pre-existing bug where `body.code === "USAGE_LIMIT"` didn't match the actual error code `"USAGE_LIMIT_REACHED"` from `lib/utils/errors.ts`.

- [ ] **Step 2: Update cancelRemaining to accept a reason parameter**

In the `cancelRemaining` callback (around line 196), add an optional `reason` parameter so the message reflects whether it was a trial limit or monthly limit:

```typescript
  const cancelRemaining = useCallback((reason?: string) => {
    cancelledRef.current = true;
    const message = reason || "Upload limit reached.";
    setEntries((prev) =>
      prev.map((e) =>
        e.status === "queued"
          ? { ...e, status: "error", errorMessage: message, usageLimitHit: true }
          : e
      )
    );
  }, []);
```

The only call site is in `uploadFile` (Step 1 above), which already passes `cancelRemaining(msg)`.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add components/invoices/UploadQueue.tsx
git commit -m "feat: handle trial exhaustion in batch uploads, fix USAGE_LIMIT code mismatch (DOC-92)"
```

---

## Task 6: Lint, type-check, and final verification

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: Zero warnings, zero errors

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Self-review checklist**

- No `any` types in new code
- No `console.log` -- uses `logger` from `lib/utils/logger.ts`
- Server-side secrets not exposed in client bundles
- Atomic DB operation (Postgres function, not read-then-write)
- Fail-open on transient errors
- Design partners and active subscribers skip trial counter
- Trial progress visible in upload UI

---

## Acceptance Criteria Mapping

| Criterion | Task |
|-----------|------|
| `trial_invoices_used` increments by 1 on single upload for trial users | Task 3 |
| `trial_invoices_used` increments by N on batch upload for trial users | Task 3 (each file in batch is a separate POST, each increments by 1) |
| Upload blocked when trial user reaches 10 invoices | Task 1 (Postgres function) + Task 3 (route integration) |
| Partial batch: if 2 of 5 files would exceed limit, accept 2 and reject 3 with message | Task 5 (UploadQueue handles mid-batch rejection) |
| No increment for design partners or active subscribers | Task 3 (only increments when `access.reason === "trial"`) |
| Atomic increment prevents race conditions | Task 1 (Postgres `WHERE trial_invoices_used < 10`) |
| Trial progress visible in upload UI | Task 4 (TrialProgressBanner) |
