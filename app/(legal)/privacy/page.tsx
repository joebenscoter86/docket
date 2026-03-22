// app/(legal)/privacy/page.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy | Docket',
  description: 'How Docket collects, uses, and protects your data.',
  alternates: {
    canonical: '/privacy',
  },
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
