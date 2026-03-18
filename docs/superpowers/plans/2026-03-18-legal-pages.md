# Legal Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Privacy Policy and Terms of Service pages at `/privacy` and `/terms` to satisfy Intuit's production app review and establish legal foundation.

**Architecture:** Static pages in a new `app/(legal)/` route group with a shared minimal layout. A reusable `Footer` component is added and integrated into the landing page, auth pages, and dashboard. No database, no auth, no API calls — pure static content rendered as JSX with Tailwind.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-18-legal-pages-design.md`

---

### Task 0: Create feature branch

- [ ] **Step 1: Create and switch to feature branch**

```bash
git checkout -b feature/DOC-77-legal-pages
```

---

### Task 1: Create shared Footer component

**Files:**
- Create: `components/layout/Footer.tsx`

- [ ] **Step 1: Create the reusable Footer component**

```tsx
// components/layout/Footer.tsx
import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t border-border px-6 py-6 text-center text-sm text-muted">
      <div className="flex items-center justify-center gap-4">
        <Link href="/privacy" className="hover:text-text hover:underline">Privacy Policy</Link>
        <span>·</span>
        <Link href="/terms" className="hover:text-text hover:underline">Terms of Service</Link>
      </div>
      <p className="mt-2">&copy; {new Date().getFullYear()} JB Technologies LLC</p>
    </footer>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/layout/Footer.tsx
git commit -m "feat: add shared Footer component with legal links (DOC-77)"
```

---

### Task 2: Create the legal page layout

**Files:**
- Create: `app/(legal)/layout.tsx`

- [ ] **Step 1: Create the legal route group layout**

```tsx
// app/(legal)/layout.tsx
import Link from 'next/link'
import Footer from '@/components/layout/Footer'

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <Link href="/" className="font-headings text-lg font-bold text-text hover:text-accent">
            Docket
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        {children}
      </main>
      <Footer />
    </div>
  )
}
```

- [ ] **Step 2: Verify the layout renders**

Run: `npm run build`
Expected: Build succeeds (pages don't exist yet but layout should compile)

- [ ] **Step 3: Commit**

```bash
git add "app/(legal)/layout.tsx"
git commit -m "feat: add legal pages layout with minimal header (DOC-77)"
```

---

### Task 3: Create the Privacy Policy page

**Files:**
- Create: `app/(legal)/privacy/page.tsx`

- [ ] **Step 1: Create the privacy policy page**

```tsx
// app/(legal)/privacy/page.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy | Docket',
  description: 'How Docket collects, uses, and protects your data.',
}

export default function PrivacyPolicyPage() {
  return (
    <article className="space-y-8">
      <header>
        <h1 className="font-headings text-2xl font-bold text-text">Privacy Policy</h1>
        <p className="mt-1 text-sm text-muted">Last updated: March 18, 2026</p>
      </header>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">1. Introduction</h2>
        <p className="text-sm leading-relaxed text-text">
          JB Technologies LLC (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates Docket, an
          invoice processing service available at dockett.app. This Privacy Policy explains how we collect,
          use, disclose, and safeguard your information when you use our service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">2. Information We Collect</h2>
        <p className="text-sm leading-relaxed text-text">We collect the following categories of information:</p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-text">
          <li><strong>Account information:</strong> Email address and name, provided when you create an account.</li>
          <li><strong>Invoice data:</strong> Documents you upload (PDF, JPG, PNG), AI-extracted structured data (vendor name, amounts, dates, line items), and correction history (original vs. corrected values, used to improve extraction accuracy).</li>
          <li><strong>Accounting connection:</strong> QuickBooks Online OAuth tokens, encrypted at rest using AES-256-GCM encryption.</li>
          <li><strong>Billing information:</strong> Payment processing is handled by Stripe. We do not store your credit card numbers.</li>
          <li><strong>Usage data:</strong> Page views and feature usage, collected via analytics tools when enabled.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">3. How We Use Your Information</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-text">
          <li>Process and extract invoice data using AI</li>
          <li>Sync approved invoices to your connected QuickBooks Online account</li>
          <li>Manage your subscription and billing</li>
          <li>Improve extraction accuracy over time using your correction history</li>
          <li>Send transactional emails (account confirmations, password resets, billing receipts)</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">4. Third-Party Services</h2>
        <p className="text-sm leading-relaxed text-text">We use the following third-party services to operate Docket:</p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-text">
          <li><strong>Supabase:</strong> Database, file storage, and authentication.</li>
          <li><strong>Anthropic (Claude):</strong> AI invoice extraction. Invoice content is sent for processing only and is not used to train AI models, per Anthropic&rsquo;s API data usage policy.</li>
          <li><strong>Intuit (QuickBooks Online):</strong> Accounting sync for bill creation and document attachment.</li>
          <li><strong>Stripe:</strong> Subscription billing and payment processing.</li>
          <li><strong>Vercel:</strong> Application hosting.</li>
          <li><strong>Sentry:</strong> Error monitoring. No invoice content is sent — only error metadata.</li>
          <li><strong>Resend:</strong> Transactional email delivery.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">5. Data Storage &amp; Security</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-text">
          <li>Data is stored in Supabase (cloud-hosted PostgreSQL and object storage).</li>
          <li>OAuth tokens are encrypted at rest using AES-256-GCM encryption.</li>
          <li>Row Level Security is enforced on all database tables.</li>
          <li>All traffic is transmitted over HTTPS.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">6. Data Processing Location</h2>
        <p className="text-sm leading-relaxed text-text">
          Your data is processed and stored in the United States via our cloud infrastructure providers.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">7. Data Retention</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-text">
          <li>Invoice data is retained while your account is active.</li>
          <li>On account deletion request, all invoices, extracted data, and connection tokens are deleted.</li>
          <li>Billing records are retained as required by applicable law.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">8. Your Rights</h2>
        <p className="text-sm leading-relaxed text-text">You have the right to:</p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-text">
          <li>Access the personal data we hold about you</li>
          <li>Correct inaccurate extracted data</li>
          <li>Request deletion of your account and all associated data</li>
          <li>Disconnect third-party integrations at any time via Settings</li>
        </ul>
        <p className="text-sm leading-relaxed text-text">
          To exercise any of these rights, contact us at{' '}
          <a href="mailto:support@dockett.app" className="text-accent hover:underline">support@dockett.app</a>.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">9. California Privacy Rights (CCPA)</h2>
        <p className="text-sm leading-relaxed text-text">
          If you are a California resident, you have additional rights under the California Consumer Privacy Act:
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-text">
          <li>We do not sell your personal information.</li>
          <li>You may request disclosure of the categories and specific pieces of personal information we have collected.</li>
          <li>You may request deletion of your personal information.</li>
        </ul>
        <p className="text-sm leading-relaxed text-text">
          To exercise these rights, contact us at{' '}
          <a href="mailto:support@dockett.app" className="text-accent hover:underline">support@dockett.app</a>.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">10. Children&rsquo;s Privacy</h2>
        <p className="text-sm leading-relaxed text-text">
          Docket is not directed at children under 18. We do not knowingly collect personal information from minors.
          If you believe a minor has provided us with personal information, please contact us and we will delete it.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">11. Cookies</h2>
        <p className="text-sm leading-relaxed text-text">
          Docket uses authentication session cookies only. These are functional cookies required for you to stay
          signed in and are not used for tracking or advertising. If we add analytics in the future, we will
          update this section and notify you.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">12. Changes to This Policy</h2>
        <p className="text-sm leading-relaxed text-text">
          We may update this Privacy Policy from time to time. We will notify you of material changes by sending
          an email to the address associated with your account. Your continued use of Docket after such changes
          constitutes acceptance of the updated policy.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">13. Contact</h2>
        <p className="text-sm leading-relaxed text-text">
          If you have questions about this Privacy Policy, contact us at{' '}
          <a href="mailto:support@dockett.app" className="text-accent hover:underline">support@dockett.app</a>.
        </p>
        <p className="text-sm leading-relaxed text-text">
          JB Technologies LLC<br />
          dockett.app
        </p>
      </section>
    </article>
  )
}
```

- [ ] **Step 2: Verify the page renders**

Run: `npm run build`
Expected: Build succeeds. Visit `http://localhost:3000/privacy` to confirm rendering.

- [ ] **Step 3: Commit**

```bash
git add "app/(legal)/privacy/page.tsx"
git commit -m "feat: add privacy policy page at /privacy (DOC-77)"
```

---

### Task 4: Create the Terms of Service page

**Files:**
- Create: `app/(legal)/terms/page.tsx`

- [ ] **Step 1: Create the terms of service page**

```tsx
// app/(legal)/terms/page.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service | Docket',
  description: 'Terms and conditions for using Docket.',
}

export default function TermsOfServicePage() {
  return (
    <article className="space-y-8">
      <header>
        <h1 className="font-headings text-2xl font-bold text-text">Terms of Service</h1>
        <p className="mt-1 text-sm text-muted">Last updated: March 18, 2026</p>
      </header>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">1. Acceptance of Terms</h2>
        <p className="text-sm leading-relaxed text-text">
          By creating an account or using Docket (operated by JB Technologies LLC), you agree to be bound by
          these Terms of Service and our{' '}
          <a href="/privacy" className="text-accent hover:underline">Privacy Policy</a>.
          If you do not agree, do not use the service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">2. Service Description</h2>
        <p className="text-sm leading-relaxed text-text">
          Docket is an AI-powered invoice processing service. You upload invoices, our AI extracts structured
          data, you review and correct the extracted data, and then sync approved invoices as bills to your
          connected QuickBooks Online account.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">3. Accounts</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-text">
          <li>You must be at least 18 years old or authorized to act on behalf of a business to use Docket.</li>
          <li>One account per person. You are responsible for maintaining the security of your login credentials.</li>
          <li>You must provide accurate and complete information when creating your account.</li>
          <li>You are responsible for all activity that occurs under your account.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">4. Acceptable Use</h2>
        <p className="text-sm leading-relaxed text-text">You agree to use Docket only for:</p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-text">
          <li>Processing legitimate business invoices</li>
          <li>Lawful purposes in compliance with all applicable laws</li>
        </ul>
        <p className="text-sm leading-relaxed text-text">You agree not to:</p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-text">
          <li>Upload illegal, fraudulent, or misleading content</li>
          <li>Attempt to abuse, disrupt, or exploit the service</li>
          <li>Use automated scripts or bots to access the service without prior written consent</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">5. Your Content</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-text">
          <li>You retain full ownership of all invoices and business data you upload to Docket.</li>
          <li>
            You grant JB Technologies LLC a limited, non-exclusive license to process your content solely for
            the purpose of providing the service (AI extraction, storage, and sync to your accounting system).
          </li>
          <li>
            We do not sell or share your invoice content with third parties except as necessary to provide the
            service (see our <a href="/privacy" className="text-accent hover:underline">Privacy Policy</a>).
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">6. AI-Assisted Processing</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-text">
          <li>Invoice extraction results are generated by artificial intelligence and may contain errors.</li>
          <li>
            You are responsible for reviewing all extracted data before approving and syncing it to QuickBooks.
          </li>
          <li>
            Docket is a tool to assist your invoice processing workflow. It is not a substitute for professional
            accounting judgment.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">7. Third-Party Integrations</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-text">
          <li>
            Your QuickBooks Online connection is governed by Intuit&rsquo;s terms of service. We access your
            QuickBooks data to: (a) read your vendor list and chart of accounts for invoice mapping,
            (b) create bills from approved invoices, and (c) attach source documents to created bills.
            We do not read or modify other QuickBooks data.
          </li>
          <li>Subscription billing is processed by Stripe and governed by Stripe&rsquo;s terms of service.</li>
          <li>We facilitate these integrations but do not guarantee third-party service uptime or accuracy.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">8. Billing &amp; Subscription</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-text">
          <li>Paid plans are billed monthly via Stripe.</li>
          <li>
            Design partner program: the first 10 users receive free access to all MVP features, capped at
            100 invoices per month.
          </li>
          <li>Cancellation takes effect at the end of your current billing period.</li>
          <li>We reserve the right to change pricing with 30 days&rsquo; notice via email.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">9. Limitation of Liability</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-text">
          <li>Docket is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind.</li>
          <li>
            JB Technologies LLC is not liable for errors in AI extraction, QuickBooks sync failures, or
            accounting decisions made based on extracted data.
          </li>
          <li>
            Our total liability to you for any claims arising from your use of Docket is limited to the
            fees you paid us in the 12 months preceding the claim.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">10. Indemnification</h2>
        <p className="text-sm leading-relaxed text-text">
          You agree to indemnify and hold harmless JB Technologies LLC from any claims, damages, or expenses
          arising from: (a) your use of the service, (b) data you approve and sync to QuickBooks,
          or (c) your violation of these terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">11. Termination</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-text">
          <li>Either party may terminate your account at any time.</li>
          <li>On termination, you may request deletion of your data by contacting us.</li>
          <li>We may suspend or terminate accounts that violate these terms without prior notice.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">12. Dispute Resolution</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-text">
          <li>
            Any disputes arising from these terms or your use of Docket will be resolved by binding
            arbitration on an individual basis (not as a class action), with a carve-out for claims that
            qualify for small claims court.
          </li>
          <li>These terms are governed by the laws of the State of California.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">13. Changes to Terms</h2>
        <p className="text-sm leading-relaxed text-text">
          We may update these Terms of Service from time to time. We will notify you of material changes by
          sending an email to the address associated with your account. Your continued use of Docket after
          such changes constitutes acceptance of the updated terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-headings text-lg font-semibold text-text">14. Contact</h2>
        <p className="text-sm leading-relaxed text-text">
          If you have questions about these Terms of Service, contact us at{' '}
          <a href="mailto:support@dockett.app" className="text-accent hover:underline">support@dockett.app</a>.
        </p>
        <p className="text-sm leading-relaxed text-text">
          JB Technologies LLC<br />
          dockett.app
        </p>
      </section>
    </article>
  )
}
```

- [ ] **Step 2: Verify both legal pages render**

Run: `npm run build && npm run dev`
Expected: Build succeeds. Visit `http://localhost:3000/privacy` and `http://localhost:3000/terms` — both render with correct layout, header, and footer.

- [ ] **Step 3: Commit**

```bash
git add "app/(legal)/terms/page.tsx"
git commit -m "feat: add terms of service page at /terms (DOC-77)"
```

---

### Task 5: Add legal links to signup page

**Files:**
- Modify: `app/(auth)/signup/page.tsx:131-136`

- [ ] **Step 1: Add terms agreement text below the submit button**

In `app/(auth)/signup/page.tsx`, find the existing "Already have an account?" paragraph (line 131) and add a terms agreement line above it:

```tsx
// Add this BEFORE the "Already have an account?" paragraph
<p className="mt-3 text-center text-xs text-muted">
  By creating an account, you agree to our{' '}
  <a href="/terms" className="text-accent hover:underline">Terms of Service</a>
  {' '}and{' '}
  <a href="/privacy" className="text-accent hover:underline">Privacy Policy</a>.
</p>
```

Use `Link` from `next/link` for consistency — route groups don't affect client-side routing in Next.js.

- [ ] **Step 2: Verify the signup page**

Run: `npm run dev`
Visit `http://localhost:3000/signup` — confirm the terms/privacy links appear below the submit button and link correctly.

- [ ] **Step 3: Commit**

```bash
git add "app/(auth)/signup/page.tsx"
git commit -m "feat: add terms and privacy links to signup page (DOC-77)"
```

---

### Task 6: Add Footer to landing page

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Add Footer to the landing page**

The current landing page is a single `<main>` element. Wrap it in a flex column container and add the Footer component. This changes the structure from `<main>` only to `<div flex-col> <main flex-1> + <Footer>` so the footer sits at the page bottom.

```tsx
import Footer from '@/components/layout/Footer'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 flex-col items-center justify-center p-6">
        <h1 className="text-3xl font-semibold text-primary">Docket</h1>
        <p className="mt-2 text-sm text-muted">
          Invoice processing for small businesses
        </p>
      </main>
      <Footer />
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Visit `http://localhost:3000` — footer with legal links visible at bottom.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add footer to landing page (DOC-77)"
```

---

### Task 7: Add Footer to dashboard layout

**Files:**
- Modify: `components/layout/AppShell.tsx`

- [ ] **Step 1: Add Footer inside the AppShell main content area**

In `components/layout/AppShell.tsx`, import Footer and add it after the `<main>` element, inside the flex column container (the `<div className="flex flex-1 flex-col overflow-hidden">` wrapper):

```tsx
// Add import at top
import Footer from './Footer'

// Inside the flex-1 flex-col div, after <main>...</main>, add:
<Footer />
```

The `<main>` already has `flex-1` so it will push the footer to the bottom of the scrollable area.

- [ ] **Step 2: Verify**

Log in and visit `http://localhost:3000/invoices` — footer with legal links visible at bottom of main content area.

- [ ] **Step 3: Commit**

```bash
git add components/layout/AppShell.tsx
git commit -m "feat: add footer to dashboard layout (DOC-77)"
```

---

### Task 8: Final verification and PR

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: Zero warnings, zero errors

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds with all routes compiled

- [ ] **Step 4: Manual smoke test**

Visit all pages and confirm:
- `http://localhost:3000/privacy` — renders privacy policy with header, content, footer
- `http://localhost:3000/terms` — renders terms of service with header, content, footer
- `http://localhost:3000` — landing page has footer with working legal links
- `http://localhost:3000/signup` — shows terms/privacy agreement text with working links
- `http://localhost:3000/invoices` — dashboard has footer at bottom of main content

- [ ] **Step 5: Commit any lint/type fixes if needed**

- [ ] **Step 6: Push and create PR**

```bash
git push -u origin feature/DOC-77-legal-pages
gh pr create --title "feat: add privacy policy and terms of service pages (DOC-77)" --body "$(cat <<'EOF'
## Summary
- Adds `/privacy` and `/terms` static pages in new `app/(legal)/` route group
- Creates shared `Footer` component with legal links and copyright
- Integrates Footer into landing page, signup page, and dashboard layout
- Satisfies Intuit production app review URL requirements (DOC-77)

## Test plan
- [ ] Visit `/privacy` — renders full privacy policy with correct layout
- [ ] Visit `/terms` — renders full terms of service with correct layout
- [ ] Landing page footer links work
- [ ] Signup page shows "By creating an account, you agree to..." with working links
- [ ] Dashboard footer links work
- [ ] `npm run lint` passes clean
- [ ] `npm run build` succeeds

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
