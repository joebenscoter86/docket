# Email Notifications with Resend

**Date:** 2026-03-20
**Status:** Draft
**Scope:** Auth emails (confirm, reset), welcome email, Resend infrastructure

---

## Context

Docket currently has zero custom email infrastructure. Supabase Auth sends default-template emails for signup confirmation. Password reset is broken (the "Forgot password" link on the login page loops back to `/login`). There are no app-level transactional emails (welcome, billing, notifications). All emails need to go through Resend for consistent branding, deliverability, and version-controlled templates.

**Outcome:** Users get branded, professional emails for auth flows and onboarding. Password reset actually works. Foundation is laid for future billing/notification emails.

---

## Email Types (In Scope)

### 1. Email Confirmation (auth)
- **Trigger:** Supabase Auth sends automatically on `signUp()`
- **Delivery:** Supabase custom SMTP (configured to use Resend SMTP)
- **Template:** Branded HTML in Supabase dashboard (Docket logo, "Confirm your email" button, footer)
- **Callback:** Existing `/api/auth/confirm` route handles token verification via `verifyOtp`

### 2. Password Reset (auth)
- **Trigger:** User clicks "Forgot password?" on login page, enters email
- **Delivery:** Supabase custom SMTP (Resend) -- Supabase sends the reset email via `resetPasswordForEmail()`
- **Flow:** Uses Supabase PKCE flow. The reset email contains a link to `/api/auth/confirm?token_hash=...&type=recovery&next=/reset-password`. The existing confirm route calls `verifyOtp` (establishing a server-side session), then redirects to `/reset-password`. The reset page calls `supabase.auth.updateUser({ password })` since the session is already active.
- **Template:** Branded HTML in Supabase dashboard (Docket logo, "Reset your password" button, footer)
- **New pages:**
  - `app/(auth)/forgot-password/page.tsx` -- email input form
  - `app/(auth)/reset-password/page.tsx` -- new password + confirm form
- **Fix:** Update login page "Forgot password?" link from `/login` to `/forgot-password`

### 3. Welcome Email (app-level)
- **Trigger:** After email confirmation succeeds in `/api/auth/confirm`, but **only when `type === 'signup'`** (not for recovery or email change)
- **Delivery:** Resend API directly (not SMTP)
- **Template:** React Email component (`lib/email/templates/welcome.tsx`)
- **Content:** Welcome message, quick-start steps (upload invoice, connect accounting), support link
- **Fire-and-forget:** Email failure must never block the auth confirm redirect

---

## Architecture

### New Dependencies
- `resend` -- Resend Node.js SDK
- `@react-email/components` -- JSX email templates with shared components. This is not a UI component library (banned per CLAUDE.md); it provides email-specific HTML primitives (tables, inline styles) that are painful to write by hand. Standard pairing with the Resend SDK.

### New Files

```
lib/email/
  resend.ts              # Resend client (lazy-init, same pattern as lib/stripe/client.ts)
  send.ts                # sendEmail({ to, subject, react }) -- fire-and-forget wrapper
  templates/
    layout.tsx           # Shared email layout (logo, footer, styles)
    welcome.tsx          # Welcome email template

app/(auth)/
  forgot-password/
    page.tsx             # "Enter your email" form
  reset-password/
    page.tsx             # "Enter new password" form
```

### Modified Files

```
app/(auth)/login/page.tsx                    # Fix "Forgot password?" link -> /forgot-password
app/api/auth/confirm/route.ts               # 1) Expand type assertion to include 'recovery'
                                             # 2) Add welcome email send (only for type === 'signup')
lib/supabase/middleware.ts                   # Add /forgot-password to AUTH_PATHS
.env.example                                 # Add RESEND_API_KEY
```

### Env Vars

```
RESEND_API_KEY=re_...          # Resend API key (server-side only, no NEXT_PUBLIC_ prefix)
```

### Supabase Dashboard Configuration (Manual)

1. **Custom SMTP** (Authentication > SMTP Settings):
   - Host: `smtp.resend.com`
   - Port: `465` (SSL)
   - Username: `resend`
   - Password: `<RESEND_API_KEY>`
   - Sender name: `Docket`
   - Sender email: `no-reply@dockett.app`

2. **Email templates** (Authentication > Email Templates):
   - Customize "Confirm signup" and "Reset password" templates with Docket branding
   - Keep the `{{ .ConfirmationURL }}` / `{{ .Token }}` variables Supabase provides
   - Store template HTML copies in `docs/email-templates/` for version control (dashboard templates are not git-tracked)

### Domain Verification (One-time DNS setup)

Add Resend's required DNS records to `dockett.app` in GoDaddy:
- DKIM record (TXT) -- e.g. `resend._domainkey.dockett.app`
- SPF record (TXT)
- DMARC record (TXT)
- Return-path CNAME

Retrieve exact values from Resend dashboard after adding the domain.

---

## Implementation Details

### `lib/email/resend.ts`

Uses lazy initialization to avoid build failures when env var is not set (same pattern as `lib/stripe/client.ts`):

```typescript
import { Resend } from 'resend'

let _resend: Resend | null = null

export function getResend(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('Missing RESEND_API_KEY environment variable')
    }
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}
```

### `lib/email/send.ts`

```typescript
import { getResend } from './resend'
import { logger } from '@/lib/utils/logger'
import type { ReactElement } from 'react'

interface SendEmailOptions {
  to: string
  subject: string
  react: ReactElement
}

export async function sendEmail({ to, subject, react }: SendEmailOptions): Promise<void> {
  try {
    const { error } = await getResend().emails.send({
      from: 'Docket <no-reply@dockett.app>',
      to,
      subject,
      react,
    })
    if (error) {
      logger.error('email_send_failed', { to, subject, error: error.message })
    } else {
      logger.info('email_sent', { to, subject })
    }
  } catch (err) {
    logger.error('email_send_error', { to, subject, error: String(err) })
  }
}
```

### `app/(auth)/forgot-password/page.tsx`
- Client component matching login/signup page design (same card, logo, footer pattern)
- Form: email input + "Send reset link" button
- On submit: `supabase.auth.resetPasswordForEmail(email, { redirectTo: '${origin}/api/auth/confirm?next=/reset-password' })`
  - Note: Supabase PKCE flow will append `token_hash` and `type=recovery` to the redirectTo URL
- Success state: "Check your email for a reset link" message (show regardless of whether email exists, to prevent enumeration)
- Error handling: rate limit, network errors

### `app/(auth)/reset-password/page.tsx`
- Client component, same design pattern
- Form: new password + confirm password
- The user arrives with an active session (established by `/api/auth/confirm` processing the recovery token)
- On submit: `supabase.auth.updateUser({ password })`
- Success: redirect to `/login` with success message
- Error: token expired / session missing, password too short, mismatch
- **Not in AUTH_PATHS** -- must remain accessible regardless of auth state, since the user arrives with a fresh recovery session

### Middleware Changes (`lib/supabase/middleware.ts`)
- Add `/forgot-password` to `AUTH_PATHS` (logged-in users don't need this page)
- `/reset-password` stays unprotected (not in AUTH_PATHS or PROTECTED_PATHS)

### `/api/auth/confirm` Route Changes

1. **Expand type assertion:** Change `type as 'signup' | 'email'` to `type as 'signup' | 'email' | 'recovery'`
2. **Welcome email guard:** Only send for signup confirmations

```typescript
// After successful verifyOtp:
if (type === 'signup') {
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.email) {
    // Fire-and-forget -- don't await, don't block redirect
    sendEmail({
      to: user.email,
      subject: 'Welcome to Docket',
      react: WelcomeEmail({ email: user.email }),
    })
  }
}
```

### Relationship to Settings Change Password

The existing `app/api/settings/change-password/route.ts` is for logged-in users who know their current password. The new forgot-password flow is for users who are locked out. These are separate flows:
- Settings > Change Password: authenticated, knows current password, stays in app
- Forgot Password: unauthenticated, email-based recovery, redirects to `/reset-password`

No changes needed to the settings change-password flow.

---

## Email Template Design

All templates share a consistent layout:
- White background, max-width 600px, centered
- Docket logo at top (hosted image URL, not embedded)
- Clean typography (system font stack)
- Primary CTA button: blue gradient matching the app
- Footer: "Docket by JB Technologies LLC" + support link
- No em dashes in any copy
- **All links use absolute URLs** (`https://dockett.app/upload`, not `/upload`) -- email clients do not resolve relative paths

### Welcome Email Content
- Heading: "Welcome to Docket"
- Body: "You're all set. Here's how to get started:"
- Step 1: Upload your first invoice (link to https://dockett.app/upload)
- Step 2: Connect your accounting software (link to https://dockett.app/settings)
- Step 3: Review and sync (link to https://dockett.app/invoices)
- CTA button: "Upload Your First Invoice"
- Footer with support email

### Supabase Dashboard Templates (reference copies)

Store HTML copies of the Supabase dashboard email templates in `docs/email-templates/` so they are version-controlled:
- `docs/email-templates/confirm-signup.html`
- `docs/email-templates/reset-password.html`

---

## Out of Scope (Future Issues)

These are natural extensions but NOT part of this issue:
- Billing emails (trial ending, payment failed, subscription cancelled)
- Extraction/sync status notifications
- Onboarding nudge emails (haven't uploaded after X days)
- Email preferences/unsubscribe management
- Resend webhook handling (bounces, complaints)
- React Email dev server (`npx email dev`) for template preview -- nice to have, not required

---

## Verification

1. **Domain verification:** Confirm Resend DNS records are live (`resend.com/domains` shows verified)
2. **SMTP config:** Send a test email from Supabase dashboard (Authentication > SMTP > Send test email)
3. **Signup flow:** Create new account, verify branded confirmation email arrives via Resend, click confirm link, verify welcome email arrives
4. **Welcome email guard:** Trigger a password reset, click confirm link -- verify NO welcome email is sent (only recovery type, not signup)
5. **Password reset:** Click "Forgot password?", enter email, verify branded reset email arrives, click link (goes through `/api/auth/confirm`), land on `/reset-password`, set new password, log in with new password
6. **Fire-and-forget:** Temporarily set invalid `RESEND_API_KEY` in `.env.local`, confirm the `/api/auth/confirm` redirect still works (welcome email fails silently, error logged). Note: Supabase SMTP emails (confirm, reset) use the key configured in the Supabase dashboard, so they are unaffected by the local env var.
7. **Middleware:** Verify `/forgot-password` redirects to `/invoices` when logged in. Verify `/reset-password` is accessible regardless of auth state.
8. **Build/lint/types:** `npm run build`, `npm run lint`, `npx tsc --noEmit` all pass
