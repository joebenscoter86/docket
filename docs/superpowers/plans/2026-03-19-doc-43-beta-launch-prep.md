# DOC-43: Beta Launch Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add error monitoring (Sentry) and analytics (PostHog) to Docket, then verify the production checklist so the app is ready for beta users.

**Architecture:** Sentry captures client-side and server-side errors via `@sentry/nextjs` (wraps next.config, adds global-error boundary, integrates with existing logger). PostHog tracks funnel events (signup, upload, extract, approve, sync) via `posthog-js` on the client and `posthog-node` for server-side events. Both are initialized via provider components in root layout.

**Tech Stack:** @sentry/nextjs, posthog-js, posthog-node

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | Modify | Add @sentry/nextjs, posthog-js, posthog-node |
| `next.config.mjs` | Modify | Wrap with `withSentryConfig` |
| `sentry.client.config.ts` | Create | Sentry browser SDK init (project root) |
| `sentry.server.config.ts` | Create | Sentry server SDK init (project root) |
| `sentry.edge.config.ts` | Create | Sentry edge runtime init (project root) |
| `app/global-error.tsx` | Create | Next.js root error boundary with Sentry reporting |
| `lib/utils/logger.ts` | Modify | Add Sentry.captureException on error-level logs |
| `lib/analytics/events.ts` | Create | Type-safe event name constants + server-side track helper (includes PostHog Node client) |
| `components/providers/PostHogProvider.tsx` | Create | Client-side PostHog init + provider component |
| `components/providers/PostHogIdentify.tsx` | Create | Identifies authenticated user in PostHog for funnel linking |
| `app/(dashboard)/layout.tsx` | Modify | Add PostHogIdentify for authenticated user tracking |
| `app/layout.tsx` | Modify | Wrap children with PostHogProvider |
| `app/(auth)/signup/page.tsx` | Modify | Track signup event |
| `app/api/invoices/upload/route.ts` | Modify | Track invoice_uploaded event |
| `app/api/invoices/[id]/approve/route.ts` | Modify | Track invoice_approved event |
| `app/api/invoices/[id]/sync/route.ts` | Modify | Track invoice_synced event |
| `app/api/invoices/batch/approve/route.ts` | Modify | Track batch_approved event |
| `app/api/invoices/batch/sync/route.ts` | Modify | Track batch_synced event |
| `.env.example` | Modify | Add PostHog + Sentry build env vars |
| `CLAUDE.md` | Modify | Document production setup |

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Sentry and PostHog packages**

```bash
cd /Users/joeb/Projects/Docket
npm install @sentry/nextjs posthog-js posthog-node
```

- [ ] **Step 2: Verify install succeeded**

```bash
npm ls @sentry/nextjs posthog-js posthog-node
```

Expected: all three packages listed without errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add sentry and posthog dependencies (DOC-43)"
```

---

### Task 2: Configure Sentry

**Files:**
- Create: `sentry.client.config.ts` (project root)
- Create: `sentry.server.config.ts` (project root)
- Create: `sentry.edge.config.ts` (project root)
- Modify: `next.config.mjs`
- Create: `app/global-error.tsx`

- [ ] **Step 1: Create `sentry.client.config.ts`**

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  enabled: process.env.NODE_ENV === "production",
});
```

- [ ] **Step 2: Create `sentry.server.config.ts`**

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === "production",
});
```

- [ ] **Step 3: Create `sentry.edge.config.ts`**

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === "production",
});
```

- [ ] **Step 4: Update `next.config.mjs` to wrap with Sentry**

Replace the entire file with:

```javascript
import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    dirs: ["app", "components", "lib"],
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  },
};

// Only wrap with Sentry when auth token is available (production builds)
const sentryConfig = process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
      widenClientFileUpload: true,
      disableLogger: true,
      hideSourceMaps: true,
    })
  : nextConfig;

export default sentryConfig;
```

- [ ] **Step 5: Create `app/global-error.tsx`**

This is the Next.js root error boundary — catches errors that escape all other boundaries.

```tsx
"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
          <h2>Something went wrong</h2>
          <p>An unexpected error occurred. Our team has been notified.</p>
          <button
            onClick={reset}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              backgroundColor: "#2563eb",
              color: "white",
              border: "none",
              borderRadius: "0.375rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Verify build passes**

```bash
npm run build
```

Expected: build succeeds (Sentry will warn about missing DSN in dev, that's fine).

- [ ] **Step 7: Commit**

```bash
git add sentry.client.config.ts sentry.server.config.ts sentry.edge.config.ts next.config.mjs app/global-error.tsx
git commit -m "feat: configure sentry error monitoring (DOC-43)"
```

---

### Task 3: Integrate Sentry with Logger

**Files:**
- Modify: `lib/utils/logger.ts`

- [ ] **Step 1: Add Sentry.captureException to error-level logs**

Modify `lib/utils/logger.ts` to capture errors in Sentry when `level === "error"`. Only import Sentry on the server side (logger runs in API routes).

Replace the `log` function body's error case:

Add `import * as Sentry from "@sentry/nextjs"` at the top. Add an optional `exception` field to `LogEntry`:

```typescript
interface LogEntry {
  level: LogLevel;
  action: string;
  invoiceId?: string;
  orgId?: string;
  userId?: string;
  durationMs?: number;
  status?: string;
  error?: string;
  exception?: Error; // pass actual Error object to preserve stack traces in Sentry
  [key: string]: unknown;
}
```

Then update the `log` function's error case to use the actual exception when available:

```typescript
    case "error":
      // eslint-disable-next-line no-console
      console.error(formatted);
      Sentry.captureException(
        entry.exception || new Error(entry.error || entry.action),
        {
          tags: { action: entry.action },
          extra: { invoiceId: entry.invoiceId, orgId: entry.orgId, userId: entry.userId },
        }
      );
      break;
```

Callers with a caught error should pass `{ error: err.message, exception: err }` to preserve the stack trace.

- [ ] **Step 2: Verify build passes**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add lib/utils/logger.ts
git commit -m "feat: integrate sentry with structured logger (DOC-43)"
```

---

### Task 4: Configure PostHog (Server + Client)

**Files:**
- Create: `lib/analytics/events.ts`
- Create: `components/providers/PostHogProvider.tsx`
- Modify: `app/layout.tsx`
- Modify: `.env.example`

- [ ] **Step 1: Add PostHog env vars to `.env.example`**

Append to `.env.example`:

```
# PostHog Analytics
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

# Sentry Build (for source map uploads — optional in dev)
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

- [ ] **Step 2: Create `lib/analytics/events.ts`**

Type-safe event constants and a server-side track helper:

```typescript
import { PostHog } from "posthog-node";

export const AnalyticsEvents = {
  SIGNUP: "signup",
  INVOICE_UPLOADED: "invoice_uploaded",
  INVOICE_EXTRACTED: "invoice_extracted",
  INVOICE_APPROVED: "invoice_approved",
  INVOICE_SYNCED: "invoice_synced",
  BATCH_APPROVED: "batch_approved",
  BATCH_SYNCED: "batch_synced",
  QBO_CONNECTED: "qbo_connected",
} as const;

export type AnalyticsEvent = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

let posthogClient: PostHog | null = null;

function getPostHogClient(): PostHog | null {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return null;

  if (!posthogClient) {
    posthogClient = new PostHog(apiKey, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    });
  }
  return posthogClient;
}

export function trackServerEvent(
  userId: string,
  event: AnalyticsEvent,
  properties?: Record<string, unknown>
): void {
  const client = getPostHogClient();
  if (!client) return;
  client.capture({ distinctId: userId, event, properties });
  // Flush immediately — Vercel serverless functions may terminate after response
  client.flush();
}
```

- [ ] **Step 3: Create `components/providers/PostHogProvider.tsx`**

```tsx
"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

export default function PostHogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;

    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      capture_pageview: true,
      capture_pageleave: true,
    });
  }, []);

  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return <>{children}</>;
  }

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
```

- [ ] **Step 3b: Create `components/providers/PostHogIdentify.tsx`**

Client component that identifies the authenticated user in PostHog. Used in the dashboard layout where the user is known.

```tsx
"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

export default function PostHogIdentify({ userId, email }: { userId: string; email: string }) {
  useEffect(() => {
    if (userId) {
      posthog.identify(userId, { email });
    }
  }, [userId, email]);

  return null;
}
```

This component will be added to `app/(dashboard)/layout.tsx` in Task 5, after the user is fetched from Supabase Auth:

```tsx
import PostHogIdentify from "@/components/providers/PostHogIdentify";

// Inside the return, alongside OnboardingBanner:
<PostHogIdentify userId={user.id} email={user.email ?? ""} />
```

- [ ] **Step 4: Wrap root layout with PostHogProvider**

Modify `app/layout.tsx` — add the provider import and wrap `{children}`:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import PostHogProvider from "@/components/providers/PostHogProvider";

export const metadata: Metadata = {
  title: "Docket",
  description: "Invoice processing for small businesses",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@700,800&f[]=satoshi@400,500,700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased">
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Verify build passes**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add lib/analytics/events.ts components/providers/PostHogProvider.tsx components/providers/PostHogIdentify.tsx app/layout.tsx .env.example
git commit -m "feat: configure posthog analytics (DOC-43)"
```

---

### Task 5: Add Analytics Events to API Routes

**Files:**
- Modify: `app/(auth)/signup/page.tsx`
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `app/api/invoices/upload/route.ts`
- Modify: `app/api/invoices/[id]/approve/route.ts`
- Modify: `app/api/invoices/[id]/sync/route.ts`
- Modify: `app/api/invoices/batch/approve/route.ts`
- Modify: `app/api/invoices/batch/sync/route.ts`

The issue asks for: page views (handled by PostHog auto-capture), signups, invoice uploads, extractions, approvals, QBO syncs.

Extraction events are already fired from `lib/extraction/run.ts` which is called by both single extract and batch upload — add the event there instead of the route.

- [ ] **Step 1: Add signup tracking in `app/(auth)/signup/page.tsx`**

After successful signup (after the `supabase.auth.signUp` call succeeds), add:

```typescript
import posthog from "posthog-js";
import { AnalyticsEvents } from "@/lib/analytics/events";

// Inside handleSubmit, after successful signUp (when data.user exists):
posthog.identify(data.user.id, { email: data.user.email });
posthog.capture(AnalyticsEvents.SIGNUP);
```

- [ ] **Step 1b: Add PostHogIdentify to dashboard layout**

In `app/(dashboard)/layout.tsx`, import and render the PostHogIdentify component (created in Task 4 Step 3b). Add it inside the `<AppShell>` return, before `{children}`:

```typescript
import PostHogIdentify from "@/components/providers/PostHogIdentify";

// Inside the return, add before {children}:
<PostHogIdentify userId={user.id} email={user.email ?? ""} />
```

- [ ] **Step 2: Add server-side events to upload route**

In `app/api/invoices/upload/route.ts`, after successful invoice creation, add:

```typescript
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";

// After successful upload (after DB insert), before returning response:
trackServerEvent(user.id, AnalyticsEvents.INVOICE_UPLOADED, {
  fileType: file.type,
  fileSizeBytes: file.size,
});
```

- [ ] **Step 3: Add tracking to extraction orchestration**

In `lib/extraction/run.ts`, after successful extraction (when status is set to `pending_review`), add:

```typescript
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";

// After successful extraction:
trackServerEvent(userId, AnalyticsEvents.INVOICE_EXTRACTED, {
  invoiceId,
  confidenceScore: extractedData.confidence_score,
  durationMs: extractedData.extraction_duration_ms,
});
```

- [ ] **Step 4: Add tracking to approve route**

In `app/api/invoices/[id]/approve/route.ts`, after successful approval:

```typescript
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";

// After successful approval:
trackServerEvent(user.id, AnalyticsEvents.INVOICE_APPROVED, { invoiceId: id });
```

- [ ] **Step 5: Add tracking to sync route**

In `app/api/invoices/[id]/sync/route.ts`, after successful QBO sync:

```typescript
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";

// After successful sync:
trackServerEvent(user.id, AnalyticsEvents.INVOICE_SYNCED, { invoiceId });
```

- [ ] **Step 6: Add tracking to batch approve route**

In `app/api/invoices/batch/approve/route.ts`, after successful batch approval:

```typescript
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";

// After batch approval completes:
trackServerEvent(user.id, AnalyticsEvents.BATCH_APPROVED, {
  count: successCount,
});
```

- [ ] **Step 7: Add tracking to batch sync route**

In `app/api/invoices/batch/sync/route.ts`, after successful batch sync:

```typescript
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";

// After batch sync completes:
trackServerEvent(user.id, AnalyticsEvents.BATCH_SYNCED, {
  count: successCount,
});
```

- [ ] **Step 8: Verify build passes**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 9: Commit**

```bash
git add app/(auth)/signup/page.tsx app/api/invoices/upload/route.ts lib/extraction/run.ts app/api/invoices/[id]/approve/route.ts app/api/invoices/[id]/sync/route.ts app/api/invoices/batch/approve/route.ts app/api/invoices/batch/sync/route.ts
git commit -m "feat: add analytics events for funnel tracking (DOC-43)"
```

---

### Task 6: Production Checklist Verification

This task is a manual verification pass. Check each item and document results.

- [ ] **Step 1: Verify Vercel production env vars are set**

Check that all required env vars from `.env.example` are configured in Vercel Production environment. The following must exist:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `QBO_CLIENT_ID` (production value)
- `QBO_CLIENT_SECRET` (production value)
- `QBO_REDIRECT_URI` (https://dockett.app/api/auth/callback/quickbooks)
- `QBO_ENVIRONMENT` (production)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `ENCRYPTION_KEY`
- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN`

These need to be set via the Vercel dashboard — not something the agent can do. Flag any missing ones for Joe.

- [ ] **Step 2: Verify custom domain and SSL**

```bash
curl -sI https://dockett.app | head -5
```

Expected: HTTP/2 200, valid SSL.

- [ ] **Step 3: Verify production QBO credentials**

Already confirmed working per CLAUDE.md (production smoke test passed 2026-03-18). Document as verified.

- [ ] **Step 4: Document remaining manual items for Joe**

Create a checklist summary of items that require Joe's action:
- Set Sentry DSN env vars in Vercel (requires Sentry account setup)
- Set PostHog key env vars in Vercel (requires PostHog account setup)
- Confirm Supabase is on paid plan
- Confirm Stripe is in live mode with real pricing
- Remove test data from production database
- Seed design partner accounts

- [ ] **Step 5: Commit documentation updates**

```bash
git add CLAUDE.md
git commit -m "docs: add beta launch production checklist status (DOC-43)"
```

---

### Task 7: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add PostHog to Tech Stack table**

Add row: `| Analytics | PostHog (free tier) |`

- [ ] **Step 2: Add analytics env vars to Environment Variables section**

Add `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` entries.

- [ ] **Step 3: Add Decisions Log entry**

Add entry: PostHog chosen over Plausible for analytics — free tier (1M events/month), built-in funnel tracking, no paid subscription required for beta.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document posthog analytics and sentry setup (DOC-43)"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Run full completion self-check**

```bash
npm run lint && npx tsc --noEmit && npm run test && npm run build
```

All four must pass.

- [ ] **Step 2: Verify no `any` types in new code**

```bash
grep -rn ': any' lib/analytics/ components/providers/PostHogProvider.tsx sentry.*.config.ts app/global-error.tsx || echo "No any types found"
```

- [ ] **Step 3: Verify no console.log in new production code**

```bash
grep -rn 'console.log' lib/analytics/ components/providers/PostHogProvider.tsx || echo "No console.log found"
```

- [ ] **Step 4: Deliver status report**
