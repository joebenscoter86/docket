# Settings Page Redesign

**Date:** 2026-04-04
**Status:** Design approved

## Problem

The settings page is a long vertical scroll of 8 independent card sections at `max-w-[600px]`. Each section has its own uppercase label and a standalone card below it. The page works but feels like a checklist rather than a cohesive, professional settings experience. Related settings (defaults + notifications) are in separate sections. Section ordering puts rarely-touched items (Account) above frequently-checked items (Billing).

## Design Decisions

### Navigation: Refined single scroll (no tabs)
Keep the single-page scroll. The page has ~6 logical sections which doesn't justify the complexity of tab navigation. Upgrade the internal layout of each section instead.

### Section layout: Grouped cards with SectionColumns rows
Each section's settings are grouped inside a card (white, rounded-lg, subtle shadow). Within each card, rows use a two-column layout: label + description on the left, controls on the right. Rows separated by light internal dividers (`border-t border-gray-50`). This is the Vercel/Linear pattern.

### Feature cards: Standalone for connections and ingestion
QBO, Xero, Email Forwarding, and SMS Ingestion keep their current standalone feature card pattern (icon + name + description + status badge + action). These are the "hero" interactions on the page and deserve more visual weight than a SectionColumns row.

### Section ordering (changed)
1. **Connections** -- QBO/Xero cards. Most important, first thing users set up.
2. **Ingestion** -- Email + SMS cards grouped under one label (was separate sections).
3. **Billing** -- Plan card with usage bar. Moved up from bottom (high-traffic).
4. **Team** -- Members list with avatars + invite form.
5. **Account** -- Email (read-only), org name (editable), password (reset link). SectionColumns rows.
6. **Preferences** -- New merged section: default tax code + email notification toggles. SectionColumns rows.

### Preferences section (new)
Merge "Defaults" and "Email Notifications" into a single "Preferences" grouped card. Default tax code becomes a row with a select dropdown. Notification preferences become toggle switch rows.

## Section Specifications

### 1. Connections
- Uppercase label: "Connections"
- ConnectionHealthBanner renders above cards when connected (unchanged)
- QBO card: icon (green `#2CA01C`) + "QuickBooks Online" + company name/date or connect prompt + status badge + Connect/Disconnect button
- Xero card: icon (blue `#13B5EA`) + "Xero" + same pattern
- Disabled state + tooltip when other provider is connected (unchanged logic)
- Cards have hover lift effect (`hover:-translate-y-0.5 hover:shadow-float`)

### 2. Ingestion
- Uppercase label: "Ingestion"
- Email Forwarding card: blue icon + forwarding address (mono) + Active badge + Edit/Copy buttons. Expanded state shows prefix editor, test email link, disable option (unchanged interactions).
- SMS Ingestion card: green icon + registered phone + Docket number + Active badge + Copy. Expanded state shows phone registration flow (unchanged interactions).

### 3. Billing
- Uppercase label: "Billing"
- Grouped card containing:
  - Header row: plan name (bold, 18px) + Active/Design Partner/Trial badge
  - Price line: "$39/mo - 150 invoices/month"
  - Usage bar: label row (used/limit + percentage) + thin progress bar (green/amber/red)
  - Footer: "Manage Subscription" button (right-aligned)
- All existing billing states preserved (design partner, active, trial, cancelled, past_due)

### 4. Team
- Uppercase label: "Team"
- Grouped card containing:
  - Member rows: avatar circle (initials) + email + role badge (Owner blue, Member gray)
  - Pending invite rows: "?" avatar (amber) + email (muted) + Pending badge + Revoke link
  - Owner can remove members and revoke invites (unchanged)
  - Bottom: invite form row with email input + "Send Invite" button (owner only)

### 5. Account
- Uppercase label: "Account"
- Grouped card with SectionColumns rows:
  - **Email**: label "Email" + desc "Your login email address" | value (read-only text)
  - **Organization**: label "Organization" + desc "Your business name" | value + "Edit" link. Click Edit triggers inline editing (unchanged interaction).
  - **Password**: label "Password" + desc "Send a reset link to your email" | "Change password" link

### 6. Preferences
- Uppercase label: "Preferences"
- Grouped card with mixed row types:
  - **Default tax code**: SectionColumns row with select dropdown on right. Only visible when a provider is connected (unchanged conditional).
  - **Extraction notifications** (`extraction_notifications`): toggle switch row. "Get notified when invoice extraction completes"
  - **Sync notifications** (`sync_notifications`): toggle switch row. "Get notified when invoices are synced or fail to sync"
  - **Product updates** (`marketing_emails`): toggle switch row. "Receive updates about new features and improvements"
  - Footer note: "Billing and security emails cannot be turned off." (existing copy)

## Component Changes

### New components
- `components/settings/SettingsRow.tsx` -- Reusable two-column row (label + desc on left, children on right). Used in Account and Preferences sections.
- `components/settings/ToggleSwitch.tsx` -- Toggle switch component for notification preferences. Replaces whatever the current EmailPreferencesCard uses internally.

### Modified components
- `app/(dashboard)/settings/page.tsx` -- Restructured section ordering, new section grouping, Preferences section replaces separate Defaults + EmailNotifications sections.
- `components/settings/AccountCard.tsx` -- Refactored to render SectionColumns rows inside a grouped card instead of stacked vertical fields. Same interactions (inline edit for org, password reset link).
- `components/settings/BillingCard.tsx` -- Wrapped in grouped card styling. Layout adjusted to match the header/usage/footer pattern.
- `components/settings/TeamCard.tsx` -- Add avatar circles for members. Layout adjusted for grouped card with member rows + invite row at bottom.
- `components/settings/DefaultsCard.tsx` -- Absorbed into new Preferences section. Renders as a SettingsRow with select dropdown.
- `components/settings/EmailPreferencesCard.tsx` -- Absorbed into Preferences section. Renders as toggle switch rows.

### Unchanged components
- `components/settings/QBOConnectionCard.tsx` -- Same feature card pattern, minor styling polish.
- `components/settings/XeroConnectionCard.tsx` -- Same feature card pattern, minor styling polish.
- `components/settings/EmailIngestionCard.tsx` -- Same feature card pattern, same interactions.
- `components/settings/SmsIngestionCard.tsx` -- Same feature card pattern, same interactions.
- `components/settings/ConnectionHealthBanner.tsx` -- Unchanged.
- `components/settings/SettingsAlert.tsx` -- Unchanged.
- `components/settings/UsageLimitBanner.tsx` -- Unchanged.

## Styling Tokens

```
Grouped card:     bg-surface rounded-brand-lg shadow-soft overflow-hidden
Row padding:      px-6 py-4
Row divider:      border-t border-gray-50 (lighter than current border-border)
Section label:    text-[11px] font-bold uppercase tracking-wider text-muted mb-3
Row label title:  text-[13px] font-semibold text-text
Row label desc:   text-[12px] text-muted mt-0.5
Row value text:   text-[13px] text-text
Row value link:   text-[12px] text-primary hover:underline
Toggle switch:    w-10 h-[22px] rounded-full (off: bg-gray-200, on: bg-primary)
Section gap:      space-y-8 between sections (increased from space-y-9)
Page max-width:   max-w-[680px] (increased from 600px for better two-column breathing room)
```

## Mockup Reference

Full-page mockup: `.superpowers/brainstorm/67808-1775309822/content/full-settings-mockup.html`

## Verification

1. All existing functionality preserved (connect/disconnect, inline edit, billing states, team invites, email/SMS setup)
2. Page renders correctly at `max-w-[680px]`
3. Responsive: on mobile (<640px), SectionColumns rows should stack vertically (label on top, control below)
4. All existing API routes unchanged (no backend changes)
5. `npm run lint && npm run build && npx tsc --noEmit` pass clean
6. Visual check: grouped cards have consistent padding, row dividers are light, feature cards maintain hover lift
