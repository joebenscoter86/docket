# DOC-39: Usage Tracking Design

## Summary

Add invoice usage tracking with monthly limit enforcement for design partners (100/mo cap) and usage visibility for all users. Consolidate existing inline count logic into a reusable utility, enforce limits at the upload API, and surface warnings in the UI.

## Current State

- **Settings page** ([settings/page.tsx](app/(dashboard)/settings/page.tsx#L65-L76)) already counts invoices this month via inline Supabase query
- **BillingCard** ([BillingCard.tsx](components/settings/BillingCard.tsx#L78)) already displays "X / 100 invoices this month" for design partners
- **Upload route** ([upload/route.ts](app/api/invoices/upload/route.ts#L48-L63)) calls `checkInvoiceAccess()` but only checks subscription status, not monthly count
- **Upload page** ([upload/page.tsx](app/(dashboard)/upload/page.tsx)) gates on access but has no usage awareness
- **No reusable usage utility exists** — count logic is inline in the Settings page
- **No `(org_id, uploaded_at)` index** — monthly count queries scan the full org partition

## Design

### 1. Usage Utility — `lib/billing/usage.ts`

Two functions:

```typescript
interface UsageInfo {
  used: number;
  limit: number | null;       // null = unlimited
  periodStart: Date;
  periodEnd: Date;
  isDesignPartner: boolean;
}

async function getUsageThisPeriod(orgId: string, userId: string): Promise<UsageInfo>
```

**Period calculation:**
- **Design partners:** Calendar month (1st of current month → 1st of next month)
- **Active subscribers:** Stripe billing cycle (`subscription.current_period_start` → `current_period_end`). Fetched via Stripe SDK using the user's `stripe_customer_id`. Falls back to calendar month if Stripe data unavailable.
- **Trial users / no subscription:** Calendar month (usage is tracked even if not enforced)

**Count query:** Count invoices where `org_id = X` AND `status != 'uploading'` AND `uploaded_at >= periodStart`. Uses the admin client to bypass RLS (billing check, not data access).

```typescript
async function checkUsageLimit(orgId: string, userId: string): Promise<
  | { allowed: true; usage: UsageInfo }
  | { allowed: false; usage: UsageInfo; reason: "monthly_limit_reached" }
>
```

Wraps `getUsageThisPeriod` and compares `used` against `limit`. Returns the usage info in both cases so callers can display it.

### 2. Upload Route Enforcement

In [upload/route.ts](app/api/invoices/upload/route.ts), after the existing `checkInvoiceAccess()` call (line 49), add a usage limit check:

```typescript
const usageCheck = await checkUsageLimit(orgId, user.id);
if (!usageCheck.allowed) {
  return forbiddenError("Monthly invoice limit reached (100/month). Your limit resets on [date].", {
    code: "USAGE_LIMIT_REACHED",
    used: usageCheck.usage.used,
    limit: usageCheck.usage.limit,
    resetsAt: usageCheck.usage.periodEnd.toISOString(),
  });
}
```

This runs **before** file parsing/upload so we fail fast without wasting bandwidth.

### 3. Upload Page — Limit-Reached State

Expand the upload page to fetch usage info server-side and show one of three states:

- **Under limit:** Normal `<UploadFlow />` (no change)
- **Warning (>80%):** `<UploadFlow />` with a yellow banner: "You've used X of 100 invoices this month. Usage resets [date]."
- **At limit:** Replace `<UploadFlow />` with a limit-reached card: "You've reached your monthly limit of 100 invoices. Your limit resets on [date]." + link to Settings/billing

This prevents users from even starting an upload that will be rejected by the API.

### 4. BillingCard Enhancements

Pass `UsageInfo` to BillingCard instead of raw `invoicesThisMonth` number. Update the component to:

- **Design partner state:** Show progress bar (used/100) with color coding:
  - Green (< 80%): normal
  - Amber (80-99%): "Approaching limit"
  - Red (100%): "Limit reached"
- **Active subscriber state:** Show "X invoices this billing period" (no limit, no progress bar)
- **Other states:** Show "X invoices this month" (unchanged)

### 5. Database Migration

Add composite index for efficient monthly counting:

```sql
CREATE INDEX idx_invoices_org_uploaded_at ON invoices(org_id, uploaded_at);
```

This makes the `WHERE org_id = X AND uploaded_at >= Y` query use an index scan instead of a sequential scan on the org partition.

### 6. No New Tables

We do NOT need a `usage_events` table. The `invoices` table already has `org_id`, `uploaded_at`, and `status` — everything needed for accurate counting. At MVP scale, a single indexed count query is fast and correct.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Stripe API unavailable for billing period lookup | Fall back to calendar month |
| User has no `stripe_customer_id` | Use calendar month |
| Count query fails | Let upload proceed (fail-open for billing, not security) |
| Race condition (two concurrent uploads at limit) | Both may succeed — off-by-one at the boundary is acceptable for MVP |

## Files Changed

| File | Change |
|------|--------|
| `lib/billing/usage.ts` | **New** — `getUsageThisPeriod()`, `checkUsageLimit()` |
| `lib/billing/usage.test.ts` | **New** — Unit tests |
| `app/api/invoices/upload/route.ts` | Add usage limit check after access check |
| `app/(dashboard)/upload/page.tsx` | Fetch usage info, pass to gate/warning components |
| `components/billing/UsageLimitBanner.tsx` | **New** — Warning/limit-reached banner for upload page |
| `components/settings/BillingCard.tsx` | Accept `UsageInfo`, add progress bar for design partners |
| `app/(dashboard)/settings/page.tsx` | Replace inline count with `getUsageThisPeriod()` |
| `supabase/migrations/YYYYMMDD_add_usage_index.sql` | Add `(org_id, uploaded_at)` index |

## Out of Scope

- Per-plan tiered limits (Growth plan is unlimited for now)
- Usage analytics dashboard
- Usage alerts via email
- Stripe metered billing / usage records API
- Real-time usage counter updates (page refresh is fine for MVP)
