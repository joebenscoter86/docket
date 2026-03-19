# DOC-38: Onboarding Flow Design

## Overview

3-step onboarding wizard (Welcome → Connect QuickBooks → Upload First Invoice) that guides new users through setup after signup. Lives in a dedicated route group with its own simplified layout. Each step is skippable. Completion tracked via the existing `users.onboarding_completed` flag.

## Architecture: Dedicated Route Group

The onboarding flow lives in `app/(onboarding)/onboarding/` with its own `layout.tsx`. This gives it a distinct sidebar (3 nav items instead of the full app nav) that matches the mockup exactly, while keeping it cleanly separated from the dashboard.

### Routes

| Route | Step | Component |
|-------|------|-----------|
| `/onboarding` | 1 — Welcome | `app/(onboarding)/onboarding/page.tsx` |
| `/onboarding/connect` | 2 — Connect | `app/(onboarding)/onboarding/connect/page.tsx` |
| `/onboarding/upload` | 3 — Upload | `app/(onboarding)/onboarding/upload/page.tsx` |

### Layout

- **Sidebar (left, 280px):** Docket logo, "ONBOARDING" label, 3 nav items (Welcome, Connect, Upload) with active state blue highlight + left border. Completed steps show checkmarks. Progress badge in bottom-left ("PRECISION FLOW — Step X of 3" with progress bar). Width matches dashboard sidebar (280px) for visual consistency.
- **Top bar:** "Onboarding" centered, help (?) icon and profile avatar on the right.
- **Auth gate:** Layout checks auth — unauthenticated users redirect to `/login`.
- **Refresh safety:** Browser refresh on any step is safe. The layout re-derives completion state from the database on each render. No client-side step state is lost.

## Flow Logic

1. After signup → redirect to `/onboarding` (change from current `/invoices` redirect in signup page)
2. Sidebar nav items are always clickable — users can jump between steps freely
3. "Skip for now" on steps 2 and 3 advances to the next step (step 2 → step 3; step 3 → completes onboarding)
4. Completing step 3 (successful upload) or skipping step 3 → `PATCH /api/users/onboarding` sets `onboarding_completed = true`, redirects to `/invoices`
5. If user with `onboarding_completed = false` navigates directly to `/invoices`, a dismissible banner nudges them to complete setup
6. Once `onboarding_completed = true`, the `/onboarding` route is still accessible but never forced. Pages render identically with checkmarks on completed steps. No special handling or different copy needed.
7. Design partner status is not surfaced during onboarding — it appears on the Settings/Billing card only.

### Step Completion Detection (Derived, Not Stored)

No separate onboarding-step tracking table. Completion is derived from existing data:

| Step | Complete when... |
|------|-----------------|
| 2 — Connect | `accounting_connections` has a QBO row for the user's org |
| 3 — Upload | User's org has at least one invoice |

The sidebar shows checkmarks on completed steps. This is fetched on layout mount.

## Copy

### Step 1 — Welcome

- **Badge:** "GETTING STARTED" (with icon)
- **Heading:** "Welcome to Docket. Let AI handle the paperwork while you focus on your business."
- **Subtext:** "Automatically extract data from invoices and sync to QuickBooks in seconds. Save hours every week."
- **CTA:** "Let's get started →" (blue filled button)
- **Blue feature card (right side):** "Turbo Extraction" — "Process multiple documents in minutes. Upload a batch and let AI do the rest."
  - Decorative file list: Invoice_A12.pdf ✓, Supplier_Receipt.png ✓, Syncing to QB...
- **Step indicator bar (bottom):** 1 Welcome (active) · 2 Connect · 3 Upload (uses labeled variant of `StepIndicator`)
- **Feature card 1:** "AI-Powered Extraction" — "Our AI engine reads invoices — typed, scanned, or handwritten — and pulls out the data automatically."
- **Feature card 2:** "Review & Validate" — "See your invoice side-by-side with extracted data. Correct anything the AI missed before syncing."

### Step 2 — Connect

- **Step indicator:** STEP 01 · **STEP 02** · STEP 03
- **Icon:** Connection/sync icon in rounded container
- **Heading:** "Connect your business."
- **Subtext:** "Link your QuickBooks account to automatically sync your verified invoices. No more manual data entry."
- **CTA:** "Connect QuickBooks" (green button with QB icon)
- **Below CTA:** "Skip for now" link
- **Trust badges (bottom):** "AES-256 ENCRYPTION · INTUIT APPROVED APP · REAL-TIME SYNC"

### Step 3 — Upload

- **Progress bar:** 3 segments, all filled blue
- **Heading:** "Ready for the magic?"
- **Subtext:** "Upload your first invoice to see how Docket automatically extracts everything for you."
- **Drop zone:** Dashed border, upload icon, "Drop your invoice here", "Support for PDF, JPG, or PNG files (up to 10MB)"
- **CTA:** "Browse Files" (blue button)
- **Feature pills (bottom row):** "Secure Storage — 256-bit encryption for every document" · "Instant Extraction — AI analyzes your data in seconds." · "Auto-Sync — Connects to your existing accounting tools."
- **Footer:** "Skip for now" (left), "Finish Setup" button (right, disabled until upload succeeds). After a successful upload, the button enables. Clicking it calls `PATCH /api/users/onboarding` and redirects to `/invoices`.

## Components

### New Components

| Component | Purpose |
|-----------|---------|
| `app/(onboarding)/onboarding/layout.tsx` | Auth gate, onboarding sidebar, top bar, progress indicator |
| `app/(onboarding)/onboarding/page.tsx` | Welcome step |
| `app/(onboarding)/onboarding/connect/page.tsx` | Connect QBO step |
| `app/(onboarding)/onboarding/upload/page.tsx` | Upload step |
| `components/onboarding/OnboardingSidebar.tsx` | Simplified sidebar: 3 nav items + progress badge |
| `components/onboarding/StepIndicator.tsx` | Accepts `currentStep` prop (1-3) and `variant` prop ("labeled" for step 1's "1 Welcome · 2 Connect · 3 Upload", "numbered" for step 2's "STEP 01 · STEP 02 · STEP 03", "bar" for step 3's 3-segment progress bar). Three visual styles per the mockup. |
| `components/onboarding/FeatureCard.tsx` | Icon + heading + description cards (Welcome step) |
| `components/onboarding/TrustBadges.tsx` | "AES-256 ENCRYPTION · INTUIT APPROVED APP · REAL-TIME SYNC" row |

### Reused Components

| Component | Usage |
|-----------|-------|
| `UploadZone` | Step 3 — uses `UploadZone` directly (not `UploadFlow`), since onboarding only needs upload success confirmation, not extraction progress tracking |
| QBO connect logic from `QBOConnectionCard` | Step 2 — reuse the connect handler, custom card UI |
| `Button` | Primary, outline variants throughout |

## API

### New Endpoint

**`PATCH /api/users/onboarding`**
- Sets `onboarding_completed = true` on the authenticated user's record
- Uses the Supabase service role client (`lib/supabase/admin.ts`) to update `users.onboarding_completed`, since the `users` table RLS policy restricts direct writes from the authenticated user
- Called when: step 3 upload succeeds, user skips step 3, or user dismisses the dashboard banner
- Returns `{ data: { onboarding_completed: true } }`
- **Error handling:** If the PATCH call fails, redirect to `/invoices` anyway. The dashboard banner will reappear on next load, which is acceptable.

### Existing Endpoints (Minor Change)

- `GET /api/quickbooks/connect` — Initiates QBO OAuth flow (step 2). **Change:** Accept an optional `returnTo` query parameter. Pass it through the OAuth `state` payload so the callback route can redirect back to `/onboarding/connect` instead of `/settings` when initiated from onboarding. Validate `returnTo` against an allowlist (`/settings`, `/onboarding/connect`) to prevent open redirects.
- `GET /api/auth/callback/quickbooks` — **Change:** Read `returnTo` from the decoded `state` parameter and redirect there (with success/error query params) instead of always redirecting to `/settings`.
- `POST /api/invoices/upload` — Handles file upload (step 3, no changes)

## Dashboard Banner

When `onboarding_completed = false` and user is on any dashboard page:

- Show a dismissible top banner inside the dashboard layout
- Banner checks what's incomplete:
  - No QBO connection → "Complete setup: Connect QuickBooks" with link to `/onboarding/connect`
  - No invoices → "Complete setup: Upload your first invoice" with link to `/onboarding/upload`
  - Both incomplete → prioritize QBO connection message
- Dismissing the banner calls `PATCH /api/users/onboarding` to set `onboarding_completed = true`

## Signup Redirect Change

In `app/(auth)/signup/page.tsx`, change the post-signup redirect from `/invoices` to `/onboarding`.

## Design Notes

- Follows the Precision Flow design system (Cabinet Grotesk headings, Satoshi body, blue-600 accent, rounded-brand-* radii, shadow-soft cards)
- Light gradient background matching the mockup's soft blue-to-white feel
- The blue "Turbo Extraction" card on step 1 is a decorative illustration, not interactive
- Step 2's green "Connect QuickBooks" button uses QuickBooks brand green per Intuit guidelines
