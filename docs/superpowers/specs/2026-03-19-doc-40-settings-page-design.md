# DOC-40: Settings Page Enhancements

## Summary

Add three missing features to the existing Settings page: editable organization name (inline edit), change password (via Supabase reset email), and invoice usage display in the billing section.

## Current State

The Settings page (`app/(dashboard)/settings/page.tsx`) already exists with three sections:
- **Connections**: QBO connect/disconnect card (fully functional)
- **Account**: Email and org name displayed read-only
- **Billing**: Subscription status, design partner badge, checkout/portal flows

## Changes

### 1. Editable Organization Name

**Interaction pattern:** Inline edit (click-to-reveal input).

**Default state:**
- Org name displays in the existing `bg-background rounded-brand-md px-3.5 py-2.5` read-only div
- A pencil icon (inline SVG, matching existing icon patterns in the codebase) appears on the right side of the field on hover
- Cursor changes to indicate editability
- If no org membership exists, the field shows "—" with no edit affordance

**Edit state:**
- Clicking the field or icon replaces the div with an `Input` component pre-filled with current name (`maxLength={100}`)
- Auto-focus the input on entering edit mode
- Enter key saves, Escape key cancels
- Save and Cancel buttons appear below the input (right-aligned, matching existing button patterns)
- Save: `h-9 px-3 text-[13px]` primary variant
- Cancel: `h-9 px-3 text-[13px]` outline variant

**Save behavior:**
- Calls `PATCH /api/settings/organization` with `{ name: string }`
- On success: swap back to read-only, show brief inline "Saved" text (green, fades after 2s via `setTimeout` with cleanup on unmount)
- On error: show red error text below the input, stay in edit mode
- Optimistic: disable Save button during request, show "Saving..."

**API route:** `PATCH /api/settings/organization`
- File: `app/api/settings/organization/route.ts`
- Body: `{ name: string }`
- Validation: non-empty after trim, max 100 characters
- Auth: verify user is authenticated, look up org via `org_memberships` where `user_id = auth.uid()`
- Authorization: user must have a membership for the org (owner check not needed for MVP — single-user orgs). **The org_id must be derived from the server-side membership lookup. Never accept org_id from the request body.**
- Updates: `organizations.name` via admin client (RLS doesn't cover org table writes from user context)
- Returns success: `{ data: { name: string } }`
- Returns errors: `VALIDATION_ERROR` (400), `AUTH_ERROR` (401), `NOT_FOUND` (404)
- Structured logging: `settings.update_org_name` action
- Cache: call `revalidatePath("/settings")` after successful update to bust the server component cache

### 2. Change Password

**Interaction pattern:** Text link that triggers Supabase password reset email.

**UI:**
- Below the org name field in the Account card, add a "Change password" link
- Styled as a text button: `text-sm text-primary hover:text-primary-hover underline cursor-pointer`
- Clicking sends a password reset email to the authenticated user's email
- On success: replace the link text with "Password reset email sent to [email]." (green text)
- On error: show red error text
- Disable the link during the request to prevent double-sends

**API route:** `POST /api/settings/change-password`
- File: `app/api/settings/change-password/route.ts`
- No request body (uses the authenticated user's email)
- Auth: verify user is authenticated
- Calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: '{origin}/settings' })` (the settings page resolves at `/settings` — the `(dashboard)` route group does not add a URL segment)
- Returns success: `{ data: { message: "Password reset email sent." } }`
- Returns errors: `AUTH_ERROR` (401), `INTERNAL_ERROR` (500)
- Structured logging: `settings.change_password` action
- Note: Supabase rate-limits password reset emails internally (default: 1 per 60s per email)

### 3. Invoice Usage Display

**Data source:** Count of invoices uploaded in the current calendar month for the user's org.

**Query (server-side in settings page):**
```sql
SELECT COUNT(*) FROM invoices
WHERE org_id = :orgId
AND uploaded_at >= date_trunc('month', now())
```

**UI placement:** In the BillingCard, below the plan description text, before any action buttons.

**Display:**
- Design partners: "X / 100 invoices this month" (reflects their 100/mo cap)
- Active subscribers: "X invoices this month"
- No subscription / cancelled: "X invoices this month" (still useful context)

**Implementation:**
- Settings page fetches the count server-side and passes `invoicesThisMonth: number` as a new prop to `BillingCard`
- BillingCard renders the usage line in all states
- Styled: `text-sm text-muted` consistent with existing description text

## Component Structure

### New Components
- **`components/settings/AccountCard.tsx`** — Client component extracted from the inline Account section. Manages inline edit state for org name and change password action.

### Modified Components
- **`components/settings/BillingCard.tsx`** — Add `invoicesThisMonth` prop, render usage line in all billing states.
- **`app/(dashboard)/settings/page.tsx`** — Add invoice count query, replace inline Account markup with `AccountCard`, pass new props.

### New API Routes
- **`app/api/settings/organization/route.ts`** — PATCH handler for org name update
- **`app/api/settings/change-password/route.ts`** — POST handler for password reset trigger

## Design Consistency

All new UI elements follow the existing Settings page patterns:
- Cards use `bg-surface rounded-brand-lg shadow-soft px-6 py-6`
- Labels use `text-sm font-medium text-muted block mb-1.5`
- Read-only fields use `bg-background rounded-brand-md px-3.5 py-2.5 text-[14px] text-text`
- Buttons use the existing `Button` component with `h-9 px-3 text-[13px]` for inline actions
- Section headers use `text-[13px] font-bold uppercase tracking-wider text-muted mb-3`
- Success/error feedback uses inline text, not toast notifications (matches existing `SettingsAlert` pattern)

## Testing

### API Route Tests (Vitest)
- `app/api/settings/organization/route.test.ts`:
  - Happy path: valid name update returns 200
  - Auth failure: no session returns 401
  - Validation: empty name returns 400
  - Validation: name > 100 chars returns 400
  - Not found: no org membership returns 404

- `app/api/settings/change-password/route.test.ts`:
  - Happy path: triggers reset email, returns 200
  - Auth failure: no session returns 401
  - Supabase error: reset fails, returns 500

### Component Tests
- `components/settings/AccountCard.test.tsx`:
  - Renders email and org name in read-only mode
  - Click org name → enters edit mode
  - Save triggers API call, returns to read-only on success
  - Cancel returns to read-only without API call
  - Change password link triggers API call, shows success message

## Out of Scope
- Editing email address (requires email verification flow — future)
- Deleting account (not in MVP)
- Team member management (Phase 3)
- Changing password inline (Supabase handles via email)
