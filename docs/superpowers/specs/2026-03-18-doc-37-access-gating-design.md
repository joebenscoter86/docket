# DOC-37: Access Gating Design

## Overview

Gate invoice processing behind subscription status. Users without an active subscription, active trial, or design partner flag cannot upload, extract, or sync invoices. They can still log in, view the dashboard, browse existing invoices, connect QuickBooks, and manage settings/billing.

## Access Rules

A user can process invoices if **any** of these are true:
1. `is_design_partner === true` — bypasses all billing checks
2. `subscription_status === 'active'` — paying customer
3. `trial_ends_at > now()` — within 14-day free trial window

A user is **gated** if none of the above apply. Gated users see the dashboard but cannot upload, extract, or sync.

`past_due` is treated as **gated** — the user's payment failed and they need to fix it before continuing. This is a deliberate choice: past_due users have a broken payment method, and allowing continued processing creates a growing unpaid balance.

## Database Changes

### Migration: Add `trial_ends_at` column

```sql
ALTER TABLE users ADD COLUMN trial_ends_at TIMESTAMPTZ;
```

### Migration: Update `handle_new_user()` trigger

The existing trigger creates the user row on signup. Update it to set `trial_ends_at` to 14 days from now. The migration must use `CREATE OR REPLACE FUNCTION` with the complete function body (reference the existing function in `20260315000000_create_core_tables.sql` for the full context — only the INSERT line changes):

```sql
-- The key change inside the function body:
INSERT INTO public.users (id, email, trial_ends_at)
VALUES (NEW.id, NEW.email, now() + interval '14 days')
RETURNING id INTO new_user_id;
```

Existing users (created before this migration) will have `trial_ends_at = NULL`, which means their trial has expired. This is correct — they're either design partners (bypass) or need to subscribe.

## Access Check Utility

### `lib/billing/access.ts`

```typescript
export type AccessStatus =
  | { allowed: true; reason: 'design_partner' | 'active_subscription' | 'trial' }
  | {
      allowed: false;
      reason: 'no_subscription';
      subscriptionStatus: string;  // 'inactive' | 'past_due' | 'cancelled'
      trialExpired: boolean;
    };

export async function checkInvoiceAccess(userId: string): Promise<AccessStatus>
```

**Implementation:**
1. Query `users` table for `is_design_partner`, `subscription_status`, `trial_ends_at`
2. Check design partner first (short-circuit)
3. Check `subscription_status === 'active'`
4. Check `trial_ends_at > now()` — compare using JS `new Date().toISOString()` in the Supabase `.gt()` filter to avoid clock skew between app server and DB
5. If none match, return denied status with `subscriptionStatus` and `trialExpired` flag

**Subscription status values and their gating behavior:**

| `subscription_status` | Gated? | Notes |
|----------------------|--------|-------|
| `active` | No | Paying customer |
| `inactive` (default) | Yes | Never subscribed or just signed up |
| `past_due` | Yes | Payment failed — must fix before continuing |
| `cancelled` | Yes | Subscription ended — must resubscribe |

The `subscriptionStatus` field on the denied response lets the UI distinguish these states and show appropriate copy (e.g., "Update your payment method" for `past_due` vs "Resubscribe" for `cancelled`). The `trialExpired` flag tells the UI whether to show "Your trial has ended" vs "Subscribe to get started."

**Why query the DB instead of caching?** Subscription status changes via webhook (Stripe), and trial expiry is time-based. Querying the DB on each gated action ensures we always have the latest state. At MVP scale (<10 users), this is a single indexed query adding ~2ms. No caching needed.

## API Route Gating

Three routes get gated. Each adds the access check **after auth, before any business logic.** All three use the same pattern — check access, log the denial, return 402:

```typescript
// Shared pattern for all gated routes
const access = await checkInvoiceAccess(user.id);
if (!access.allowed) {
  logger.warn("access_denied", {
    action: "upload" | "extract" | "sync",
    userId: user.id,
    reason: access.reason,
    subscriptionStatus: access.subscriptionStatus,
    trialExpired: access.trialExpired,
  });
  return subscriptionRequired("Subscription required to process invoices.", {
    subscriptionStatus: access.subscriptionStatus,
    trialExpired: access.trialExpired,
  });
}
```

### `POST /api/invoices/upload`

Insert after the org membership check (line ~43 in current code), before form data parsing.

### `POST /api/invoices/[id]/extract`

Insert after the auth check (line ~22 in current code), before the invoice lookup. Note: the extract route uses RLS for ownership instead of an explicit org lookup, so the access check goes directly after auth.

### `POST /api/invoices/[id]/sync`

Insert after the org membership check (line ~48 in current code), before the invoice lookup.

### Error code addition

Add `SUBSCRIPTION_REQUIRED` to the `ErrorCode` type in `lib/utils/errors.ts`, and add a helper:

```typescript
export function subscriptionRequired(message: string, details?: Record<string, unknown>) {
  return apiError({ error: message, code: "SUBSCRIPTION_REQUIRED", status: 402, details });
}
```

HTTP 402 "Payment Required" is the semantically correct status code for this.

## UI Gating

### Upload Page (`app/(dashboard)/upload/page.tsx`)

The upload page becomes a server component wrapper that checks access, then renders either the upload UI or the upgrade prompt.

**Current:** Client component that renders `UploadZone` directly.

**New:** Server component that:
1. Gets the authenticated user
2. Calls `checkInvoiceAccess(userId)`
3. If allowed → renders the existing client-side upload UI (extracted to a client component)
4. If gated → renders the `UploadGate` component (upgrade prompt)

This means splitting the current upload page into:
- `app/(dashboard)/upload/page.tsx` — server component, does the access check
- `components/invoices/UploadFlow.tsx` — client component, the existing upload + extraction progress logic

### `UploadGate` Component

`components/billing/UploadGate.tsx` — displayed when access is denied.

**Content varies by state:**

| State | Heading | Body | CTA |
|-------|---------|------|-----|
| Trial expired | "Your free trial has ended" | "Subscribe to continue processing invoices." | "View Plans" → `/app/settings` (billing section) |
| Never subscribed | "Subscribe to process invoices" | "Start your subscription to upload, extract, and sync invoices." | "View Plans" → `/app/settings` (billing section) |
| Subscription cancelled | "Your subscription is inactive" | "Resubscribe to continue processing invoices." | "Manage Subscription" → Stripe portal |
| Past due | "Payment issue" | "Update your payment method to continue processing." | "Update Payment" → Stripe portal |

Design: centered card with icon, heading, body text, and CTA button. Follows the existing empty-state pattern (see invoice list empty state).

### Review Page — Sync/Extract Buttons

On the review page (`app/(dashboard)/invoices/[id]/review/page.tsx`), the "Sync to QuickBooks" button should still appear for gated users viewing previously processed invoices, but the API will return 402 if they try to re-sync. The button text doesn't change — the 402 error surfaces via the existing error handling toast.

**Rationale:** The review page is read-only for gated users in practice — they're viewing invoices they already processed. The sync button only matters if they somehow have an approved-but-unsynced invoice, which is an edge case not worth adding UI complexity for.

### Invoice List — No Changes

Gated users can still view their invoice list. No changes needed. They just can't upload new ones.

## What's NOT Gated

Explicitly ungated (users can always access):
- `GET /api/invoices` — list invoices (read-only)
- `GET /api/invoices/[id]` — view single invoice
- `POST /api/quickbooks/connect` — initiate QBO OAuth
- `GET /api/auth/callback/quickbooks` — QBO OAuth callback
- `POST /api/stripe/checkout` — start checkout (obviously)
- `POST /api/stripe/portal` — manage billing
- Settings page, billing page, dashboard layout

## Testing Strategy

### Unit tests (`lib/billing/access.test.ts`)

- Design partner → allowed (regardless of subscription status or trial)
- Active subscription → allowed
- Trial not expired → allowed
- Trial expired + no subscription → denied, `trialExpired: true`
- Never had trial (null `trial_ends_at`) + no subscription → denied, `trialExpired: false`
- Past due → denied
- Cancelled → denied

### API route tests

For each gated route (upload, extract, sync):
- Returns 402 with `SUBSCRIPTION_REQUIRED` code when access denied
- Returns normal response when access allowed
- Design partner bypasses the check

### Component tests

- `UploadGate` renders correct copy for each denial state
- Upload page renders `UploadZone` when access allowed
- Upload page renders `UploadGate` when access denied

## Edge Cases

1. **Trial expires mid-session:** User is on the upload page, trial expires while they're looking at it. The server-side access check on page load won't catch this (page already loaded). But the API route will return 402 when they try to upload. The client handles the 402 by showing an error message. Acceptable for MVP.

2. **Webhook delay:** User subscribes via Stripe Checkout, but the webhook hasn't updated `subscription_status` yet. The checkout success URL redirects to `/app/settings?subscribed=true`. If they immediately navigate to upload, they might get gated for a few seconds. The settings page already shows a success message. Acceptable — webhooks typically fire within 1-2 seconds.

3. **Design partner + expired trial:** Design partner flag always wins. Even if a design partner's trial expires, they keep full access.

4. **User downgrades mid-invoice:** User has an approved invoice, subscription lapses, tries to sync. The sync route returns 402. They see an error. They can subscribe again and retry. No data loss.

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/YYYYMMDD_add_trial_ends_at.sql` | Add `trial_ends_at` column + update trigger |
| `lib/billing/access.ts` | New file: `checkInvoiceAccess()` utility |
| `lib/billing/access.test.ts` | New file: unit tests |
| `lib/utils/errors.ts` | Add `SUBSCRIPTION_REQUIRED` code + helper |
| `app/api/invoices/upload/route.ts` | Add access check |
| `app/api/invoices/[id]/extract/route.ts` | Add access check |
| `app/api/invoices/[id]/sync/route.ts` | Add access check |
| `app/(dashboard)/upload/page.tsx` | Convert to server component with access check |
| `components/invoices/UploadFlow.tsx` | New file: extracted client-side upload logic |
| `components/billing/UploadGate.tsx` | New file: upgrade prompt component |
