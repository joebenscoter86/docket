# Email Forwarding Ingestion -- Design Spec

**Date:** 2026-03-23
**Status:** Approved
**Linear Project:** Email Forwarding Ingestion
**Tickets:** DOC-62 through DOC-67, DOC-112

---

## Overview

Users forward invoices from their email to a unique org-specific address. Docket automatically extracts PDF/image attachments and feeds them into the existing extraction pipeline. Invoices appear in the user's list at `pending_review` status without any manual intervention.

**Key decisions:**
- **Resend Inbound** for email reception (consolidates with existing outbound email vendor)
- **Ungated** -- available on all tiers including trial (table stakes, not upsell)
- **Attachments only for v1** -- no HTML body rendering/extraction
- **No nested `.eml` parsing for v1** -- reject with notification, defer to v2
- **Ungating requires Decisions Log update** -- move email forwarding from Growth-only to all tiers

---

## Architecture

### Core Flow

1. User enables email forwarding in Settings, gets `invoices-{nanoid}@ingest.dockett.app`
2. User sets up auto-forwarding in Gmail/Outlook (one-time setup)
3. Email arrives at Resend Inbound, webhook fires to `POST /api/email/inbound`
4. Webhook verifies signature, parses payload, looks up org by recipient address
5. Validates attachments (magic bytes, size, type) using existing `lib/upload/validate.ts`
6. Each valid attachment: upload to Supabase Storage, create invoice row, fire extraction via `enqueueExtraction()`
7. Invoice appears in list with `source = 'email'`, sender/subject metadata visible

### What We Reuse (Existing Infrastructure)

| Component | File | What It Does |
|-----------|------|-------------|
| Extraction queue | `lib/extraction/queue.ts` | Concurrency-limited async extraction with `waitUntil` |
| Extraction orchestration | `lib/extraction/run.ts` | Claude Vision, GL suggestions, duplicate detection, status updates |
| File validation | `lib/upload/validate.ts` | Magic byte validation, file size checks |
| Email notifications | `lib/email/triggers.ts` | Preference checks, dedup guards, fire-and-forget, structured logging |
| Email sending | `lib/email/send.ts` | Resend SDK wrapper |
| Billing access | `lib/billing/access.ts` | Trial/subscription validation |
| Usage limits | `lib/billing/usage.ts` | Monthly cap enforcement |
| Storage pattern | `app/api/invoices/upload/route.ts` | `{orgId}/{invoiceId}/{filename}` path convention |

### What's Net-New

| Component | File(s) | Purpose |
|-----------|---------|---------|
| Webhook endpoint | `app/api/email/inbound/route.ts` | Receives Resend Inbound POST, signature verification |
| Email parser | `lib/email/parser.ts`, `lib/email/types.ts` | Parse Resend payload, extract attachments |
| Address management | `lib/email/address.ts`, `app/api/email/address/route.ts` | Generate/lookup/delete org inbox addresses |
| Ingestion function | `lib/email/ingest.ts` | Bridge parsed attachments into existing pipeline |
| Rate limiter | `lib/email/rate-limit.ts` | Per-org hourly/daily rate limiting |
| Notification templates | `lib/email/templates/ingestion-*.tsx` | Error notifications for email ingestion |
| Settings UI | `components/settings/EmailIngestionCard.tsx` | Enable/disable, copy address, setup instructions |

---

## Data Model Changes

### Migration 1: Org Inbox Address

```sql
ALTER TABLE organizations
  ADD COLUMN inbound_email_address TEXT UNIQUE;
```

- Nullable (generated on-demand when user enables the feature)
- Format: `invoices-{nanoid(10)}@ingest.dockett.app`
- nanoid uses lowercase alphanumeric charset (no ambiguous chars: 0/O, 1/l)

### Migration 2: Invoice Source Tracking

```sql
ALTER TABLE invoices
  ADD COLUMN source TEXT NOT NULL DEFAULT 'upload'
    CHECK (source IN ('upload', 'email', 'api')),
  ADD COLUMN email_sender TEXT,
  ADD COLUMN email_subject TEXT;
```

- Backfill existing invoices as `'upload'`
- `'api'` reserved for Phase 4 API access
- `email_sender` and `email_subject` nullable, populated only for `source = 'email'`

### Migration 3: Email Ingestion Log (Dedup + Audit)

```sql
CREATE TABLE email_ingestion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  sender TEXT,
  subject TEXT,
  total_attachment_count INTEGER DEFAULT 0,
  valid_attachment_count INTEGER DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('processed', 'rejected', 'duplicate', 'rate_limited')),
  rejection_reason TEXT,
  processed_at TIMESTAMPTZ DEFAULT now()
);

-- Composite index for rate limit queries (WHERE org_id = $1 AND processed_at > $2)
CREATE INDEX idx_email_ingestion_log_org_processed ON email_ingestion_log(org_id, processed_at);

-- RLS
ALTER TABLE email_ingestion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_ingestion_log_org_access" ON email_ingestion_log
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
  );
```

- `message_id UNIQUE` prevents duplicate processing
- Composite index on `(org_id, processed_at)` for efficient rate limit windowed queries
- `rejection_reason` captures why an email was rejected (for debugging/audit)
- `total_attachment_count` vs `valid_attachment_count` for visibility into filtering
- RLS via standard `org_memberships` pattern

---

## Webhook Pipeline

### Request Flow

```
Resend Inbound POST
  |
  v
Verify Svix signature (401 if invalid)
  |
  v
Parse payload (sender, recipient, subject, messageId, attachments)
  |
  v
Lookup org by recipient address
  |-- Unknown address --> log warning, return 200
  |
  v
Check dedup (message_id in email_ingestion_log)
  |-- Duplicate --> log, return 200
  |
  v
Check rate limit (50/hour, 100/day per org)
  |-- Exceeded --> log, return 200
  |
  v
Check billing (checkInvoiceAccess + checkUsageLimit + incrementTrialInvoice)
  |-- Blocked --> notify user, return 200
  |
  v
Filter & validate attachments (type, magic bytes, size)
  |-- No valid attachments --> notify user, return 200
  |
  v
For each valid attachment:
  Upload to Storage --> Create invoice row --> enqueueExtraction()
  |
  v
Log to email_ingestion_log, return 200
```

**Critical rule: Always return 200.** Non-200 causes Resend to retry, which creates duplicate processing. All error handling happens internally.

**Auth strategy:** This endpoint is called by Resend, not an authenticated user. It must be **excluded from auth middleware** (`lib/supabase/middleware.ts`). Authentication is via Svix signature verification only. All DB operations use the admin client (service role) since there is no user session.

**Trial increment:** For trial users, each valid attachment must call `incrementTrialInvoice()` (same as the upload route). Without this, trial users could bypass the 10-invoice limit via email forwarding.

### Attachment Validation

Reuses existing `lib/upload/validate.ts`:
- Supported types: PDF (`application/pdf`), JPEG (`image/jpeg`), PNG (`image/png`)
- Magic byte verification (Architecture Rule #11)
- Max 10MB per attachment (matches upload limit)
- Inline images (embedded in HTML) are ignored
- ZIP files rejected
- `.eml` attachments rejected with notification (deferred to v2 -- MIME parsing adds significant complexity and security surface)

### User Resolution

Email ingestion is org-scoped but the extraction pipeline requires a `userId` for logging, analytics, and notifications. For MVP (single-user orgs), use the org owner's userId from `org_memberships WHERE role = 'owner'`. Revisit for Phase 3 multi-user.

---

## Error Handling & Notifications

| Scenario | Action | Notify User? |
|----------|--------|-------------|
| Unknown recipient address | Log warning, return 200 | No |
| No attachments in email | Log info, return 200 | Yes |
| All attachments unsupported type | Log info, return 200 | Yes |
| Attachment too large (>10MB) | Skip attachment, log | Yes |
| Attachment fails magic byte check | Skip attachment, log | Yes |
| Extraction fails | Invoice created with error status | Yes |
| Trial exhausted | Reject, log | Yes (reuse existing template) |
| Monthly usage limit reached | Reject, log | Yes |
| Rate limit exceeded | Reject, return 200, log | No |
| Duplicate email (same Message-ID) | Skip, return 200, log | No |

Notifications follow the existing `lib/email/triggers.ts` pattern:
- Check user preferences (`extraction_notifications`)
- Fire-and-forget (notification failure never blocks ingestion)
- Log to `email_log` for dedup/audit
- Actionable messages with links to Settings or invoice list

---

## Rate Limiting

- **Per-org:** 50 emails/hour, 100 emails/day
- **Implementation:** DB-backed windowed counts on `email_ingestion_log.processed_at`
- **MVP scale:** <10 orgs, DB queries are fine. No Redis needed.
- **Rate-limited emails:** return 200 silently (no user notification, likely abuse)
- **Billing limits:** email-ingested invoices count toward the same trial/monthly limits as manual uploads

---

## Address Management API

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| `GET` | `/api/email/address` | Authenticated user | Returns org's current inbound address (or `null` if not enabled) |
| `POST` | `/api/email/address` | Authenticated user | Generates address for org. Idempotent -- returns existing if already set. |
| `DELETE` | `/api/email/address` | Authenticated user | Nulls out `inbound_email_address`. Emails to old address silently ignored. |

All routes verify org membership via `org_memberships`. Uses standard Supabase auth (not admin client).

**Disable while in-flight:** If a user disables forwarding while Resend has queued emails, the next webhook hits the "unknown address" path and silently drops. This is acceptable -- the user explicitly chose to disable.

---

## Analytics Events

New PostHog events for email ingestion funnel:

| Event | When | Properties |
|-------|------|-----------|
| `email_ingestion_received` | Webhook receives any email for a valid org | `orgId`, `attachmentCount`, `validAttachmentCount` |
| `email_ingestion_processed` | At least one invoice created from email | `orgId`, `invoicesCreated` |
| `email_ingestion_rejected` | Email rejected (no attachments, billing limit, rate limit) | `orgId`, `reason` |
| `email_forwarding_enabled` | User enables email forwarding in Settings | `orgId` |
| `email_forwarding_disabled` | User disables email forwarding in Settings | `orgId` |

---

## Settings UI

### Email Forwarding Card

Lives on Settings page below accounting connections. Two states:

**Not enabled:**
- Card with heading "Email Forwarding"
- Subtext: "Forward invoices from your email to automatically extract and process them."
- "Enable Email Forwarding" primary button

**Enabled:**
- Monospace (`JetBrains Mono`) read-only input showing the address
- Prominent Copy button (clipboard API + toast "Address copied!")
- `mailto:` link for sending a test email
- Collapsible setup instructions (Gmail, Outlook, generic)
- "Disable Email Forwarding" danger button with confirmation modal

### Invoice List Source Indicator

- Email icon or "via Email" pill on invoices with `source = 'email'`
- Tooltip shows sender email and subject on hover
- No source filter at MVP

---

## Ticket Sequence

| Order | Ticket | Title | Depends On | Can Parallel With |
|-------|--------|-------|-----------|-------------------|
| 1 | DOC-62 | EML-1: Resend Inbound setup + webhook | None | -- |
| 2 | DOC-63 | EML-2: Org inbox address generation | EML-1 | -- |
| 3 | DOC-64 | EML-3: Email parsing + attachment validation | EML-1, EML-2 | -- |
| 4 | DOC-65 | EML-4: Ingestion pipeline | EML-1, EML-2, EML-3 | -- |
| 5a | DOC-66 | EML-5: Settings UI + invoice list | EML-2, EML-4 | EML-6 |
| 5b | DOC-67 | EML-6: Error notifications + rate limiting + dedup | EML-1-4 | EML-5 |
| 6 | DOC-112 | EML-7: E2E testing | EML-1-6 | -- |

EML-5 and EML-6 can be built in parallel. Everything else is sequential.

---

## DNS Requirements

- MX records for `ingest.dockett.app` pointing to Resend's inbound servers
- Configured in GoDaddy (same DNS provider as `dockett.app`)
- No interference with existing apex domain MX records

## Environment Variables (New)

```
RESEND_INBOUND_WEBHOOK_SECRET=   # Svix signature verification secret
```

## Dependencies (New Packages)

- `svix` -- webhook signature verification (Resend uses Svix)
- `nanoid` -- short unique ID generation for email addresses (check if already installed)
