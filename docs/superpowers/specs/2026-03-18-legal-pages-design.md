# Legal Pages Design Spec

**Date:** 2026-03-18
**Issue:** DOC-77 (prerequisite — Intuit production app requires privacy policy and license agreement URLs)
**Status:** Draft

## Overview

Add a Privacy Policy and Terms of Service as static public pages at `dockett.app/privacy` and `dockett.app/terms`. These satisfy Intuit's production app review requirements and serve as the standard legal foundation for the product.

## Entity

- **Legal entity:** JB Technologies LLC
- **Product name:** Docket
- **Production domain:** dockett.app
- **Effective date:** 2026-03-18

## Routes

| URL | Page | Purpose |
|-----|------|---------|
| `/privacy` | Privacy Policy | Required by Intuit, linked from footer/signup |
| `/terms` | Terms of Service | Doubles as EULA/license agreement for Intuit |

Both are public (no auth required).

## Route Group

New route group: `app/(legal)/`

```
app/(legal)/
├── layout.tsx          # Shared layout: minimal header (logo + home link), no sidebar, no auth
├── privacy/page.tsx    # Privacy Policy content
└── terms/page.tsx      # Terms of Service content
```

The layout uses the same visual style as the landing page — clean, centered content, max-width prose container.

## Privacy Policy Content

Sections in order:

1. **Introduction** — JB Technologies LLC ("we") operates Docket at dockett.app
2. **Information We Collect**
   - Account info: email address, name
   - Invoice data: uploaded documents (PDF, JPG, PNG), AI-extracted structured data (vendor, amounts, dates, line items)
   - Accounting connection: QuickBooks Online OAuth tokens (encrypted at rest with AES-256-GCM)
   - Billing: managed by Stripe — we do not store credit card numbers
   - Usage data: page views, feature usage (via analytics when added)
3. **How We Use Your Information**
   - Process and extract invoice data using AI
   - Sync approved invoices to your connected QuickBooks account
   - Manage your subscription and billing
   - Improve extraction accuracy over time
   - Send transactional emails (via Resend)
4. **Third-Party Services**
   - Supabase (database, file storage, authentication)
   - Anthropic / Claude (AI invoice extraction — invoice content sent for processing)
   - Intuit / QuickBooks Online (accounting sync)
   - Stripe (subscription billing)
   - Vercel (hosting)
   - Sentry (error monitoring — no invoice content, only error metadata)
   - Resend (transactional email)
5. **Data Storage & Security**
   - Data stored in Supabase (cloud-hosted Postgres + object storage)
   - OAuth tokens encrypted at rest (AES-256-GCM)
   - Row Level Security on all database tables
   - All traffic over HTTPS
6. **Data Retention**
   - Invoice data retained while your account is active
   - On account deletion request, all invoices, extracted data, and connection tokens are deleted
   - Billing records retained as required by law
7. **Your Rights**
   - Access your data
   - Correct inaccurate extracted data
   - Request deletion of your account and data
   - Disconnect third-party integrations at any time
   - Contact: privacy@dockett.app (or a general contact email)
8. **Cookies**
   - Authentication session cookies only (functional, not tracking)
   - Analytics cookies disclosed when analytics is added
9. **Changes to This Policy**
   - We may update this policy; users notified via email for material changes
10. **Contact** — Email address for privacy inquiries

## Terms of Service Content

Sections in order:

1. **Acceptance** — By creating an account or using Docket, you agree to these terms
2. **Service Description** — AI-powered invoice processing: upload invoices, review AI-extracted data, sync to QuickBooks Online
3. **Accounts**
   - One account per person
   - You're responsible for your login credentials
   - Must be 18+ or authorized to act on behalf of a business
4. **Acceptable Use**
   - Legitimate business invoices only
   - No illegal content, no abuse of the service, no automated scraping
5. **Your Content**
   - You retain ownership of all uploaded invoices and business data
   - You grant JB Technologies LLC a limited license to process your content for the purpose of providing the service (AI extraction, storage, sync)
   - We do not sell or share your invoice content with third parties except as needed to provide the service (see Privacy Policy)
6. **AI-Assisted Processing**
   - Extraction results are AI-generated and may contain errors
   - You are responsible for reviewing extracted data before approving and syncing to QuickBooks
   - Docket is a tool to assist your workflow, not a replacement for professional accounting judgment
7. **Third-Party Integrations**
   - QuickBooks Online connection is governed by Intuit's own terms of service
   - Stripe billing is governed by Stripe's terms
   - We facilitate these connections but do not guarantee third-party uptime or accuracy
8. **Billing & Subscription**
   - Paid plans billed monthly via Stripe
   - Design partner program: first 10 users receive free access to MVP features (capped at 100 invoices/month)
   - Cancellation takes effect at end of billing period
9. **Limitation of Liability**
   - Service provided "as is"
   - Not liable for errors in AI extraction, QuickBooks sync failures, or accounting decisions made based on extracted data
   - Total liability limited to fees paid in the prior 12 months
10. **Termination**
    - Either party may terminate at any time
    - On termination, you may request deletion of your data
    - We may suspend accounts that violate these terms
11. **Governing Law** — State of registration for JB Technologies LLC
12. **Changes to Terms** — Material changes notified via email, continued use = acceptance
13. **Contact** — Email for legal inquiries

## Implementation Notes

- Content rendered as JSX with Tailwind typography classes, not markdown
- Shared layout: minimal header with Docket logo linking to `/`, centered prose container (`max-w-3xl mx-auto`), footer with links to both legal pages
- Styling consistent with landing page aesthetic
- No database, no API calls, no auth — pure static content
- Add footer links to landing page (`app/page.tsx`) and signup page (`app/(auth)/signup/page.tsx`)

## Contact Email

Policies reference a contact email. Options:
- `support@dockett.app` (general — configure in Resend)
- `privacy@dockett.app` (dedicated — optional alias)

Use `support@dockett.app` for both unless Joe sets up a dedicated privacy alias.

## What This Unblocks

- **DOC-77:** Intuit production app review requires both URLs
- **Landing page footer:** Professional footer with legal links
- **Signup page:** "By signing up you agree to our Terms and Privacy Policy" link
