# Email Forwarding Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users forward invoices to a unique email address that automatically extracts attachments and feeds them into the existing extraction pipeline.

**Architecture:** Resend Inbound receives emails on `ingest.dockett.app`, fires a webhook to a Vercel API route. The route parses the Resend payload, validates attachments using existing `lib/upload/validate.ts`, uploads to Supabase Storage, and triggers extraction via the existing `lib/extraction/queue.ts` concurrency-limited queue. Notifications use the existing `lib/email/triggers.ts` pattern.

**Tech Stack:** Next.js 14 (App Router), Resend Inbound, Svix (webhook verification), nanoid (address generation), Supabase Postgres + Storage, Vitest + MSW (testing)

**Spec:** `docs/superpowers/specs/2026-03-23-email-forwarding-ingestion-design.md`

**Linear Project:** Email Forwarding Ingestion (DOC-62 through DOC-67, DOC-112)

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `app/api/email/inbound/route.ts` | Webhook endpoint: receive Resend POST, verify signature, orchestrate parsing + ingestion |
| `app/api/email/address/route.ts` | Address management API: GET/POST/DELETE for org inbox addresses |
| `lib/email/parser.ts` | Parse Resend Inbound payload, extract and validate attachments |
| `lib/email/types.ts` | TypeScript types for email ingestion (ParsedEmail, EmailAttachment, etc.) |
| `lib/email/address.ts` | Generate nanoid-based addresses, lookup org by inbound address |
| `lib/email/ingest.ts` | Bridge from parsed attachment to existing extraction pipeline |
| `lib/email/rate-limit.ts` | Per-org rate limiting via `email_ingestion_log` windowed counts |
| `lib/email/templates/ingestion-no-attachment.tsx` | Notification: no valid attachment found |
| `lib/email/templates/ingestion-error.tsx` | Notification: ingestion failure with actionable steps |
| `components/settings/EmailIngestionCard.tsx` | Settings UI: enable/disable, copy address, setup instructions |
| `supabase/migrations/YYYYMMDD01_add_org_inbound_email.sql` | Add `inbound_email_address` to organizations |
| `supabase/migrations/YYYYMMDD02_add_invoice_source.sql` | Add `source`, `email_sender`, `email_subject` to invoices |
| `supabase/migrations/YYYYMMDD03_create_email_ingestion_log.sql` | Create `email_ingestion_log` table with RLS |
| `lib/email/__fixtures__/resend-inbound-pdf.json` | Test fixture: Resend payload with PDF attachment |
| `lib/email/__fixtures__/resend-inbound-multi.json` | Test fixture: payload with multiple attachments |
| `lib/email/__fixtures__/resend-inbound-empty.json` | Test fixture: payload with no attachments |
| `lib/email/parser.test.ts` | Unit tests for email parser |
| `lib/email/address.test.ts` | Unit tests for address generation + lookup |
| `lib/email/ingest.test.ts` | Unit tests for ingestion pipeline |
| `lib/email/rate-limit.test.ts` | Unit tests for rate limiting |
| `app/api/email/inbound/route.test.ts` | API route tests for webhook |
| `app/api/email/address/route.test.ts` | API route tests for address management |

### Modified Files

| File | Change |
|------|--------|
| `middleware.ts` | Exclude `/api/email/inbound` from auth middleware matcher |
| `lib/analytics/events.ts` | Add email ingestion analytics events |
| `lib/email/triggers.ts` | Add ingestion notification trigger functions |
| `components/invoices/InvoiceList.tsx` | Add email source indicator (icon + tooltip) |
| `app/(dashboard)/settings/page.tsx` | Add Email Forwarding section |
| `.env.example` | Add `RESEND_INBOUND_WEBHOOK_SECRET` |
| `CLAUDE.md` | Add Resend Inbound decision to Decisions Log, add Resend gotchas |

---

## Task 1: Database Migrations (DOC-62, DOC-63, DOC-65, DOC-67)

**Files:**
- Create: `supabase/migrations/20260324000000_add_org_inbound_email.sql`
- Create: `supabase/migrations/20260324000001_add_invoice_source.sql`
- Create: `supabase/migrations/20260324000002_create_email_ingestion_log.sql`

All three migrations go first so every subsequent task has the schema it needs.

- [ ] **Step 1: Create org inbound email migration**

```sql
-- Migration: Add inbound email address to organizations
-- Issue: DOC-63 (EML-2)

ALTER TABLE organizations
  ADD COLUMN inbound_email_address TEXT UNIQUE;

-- No RLS change needed: organizations table already has RLS via org_memberships.
-- The new column inherits the existing policy.
```

- [ ] **Step 2: Create invoice source migration**

```sql
-- Migration: Add source tracking to invoices
-- Issue: DOC-65 (EML-4)

-- Source column with CHECK constraint
ALTER TABLE invoices
  ADD COLUMN source TEXT NOT NULL DEFAULT 'upload'
    CHECK (source IN ('upload', 'email', 'api'));

-- Email metadata columns (nullable, only populated for source='email')
ALTER TABLE invoices
  ADD COLUMN email_sender TEXT,
  ADD COLUMN email_subject TEXT;

-- Index for filtering by source (optional, useful for dashboard queries)
CREATE INDEX idx_invoices_source ON invoices(source);
```

- [ ] **Step 3: Create email ingestion log migration**

```sql
-- Migration: Create email ingestion log for dedup, rate limiting, and audit
-- Issue: DOC-67 (EML-6)

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

-- Composite index for rate limit queries: WHERE org_id = $1 AND processed_at > $2
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

- [ ] **Step 4: Apply migrations to Supabase**

Run: Apply all three migrations via Supabase MCP `apply_migration` or dashboard SQL editor. Verify each with a quick `SELECT` to confirm columns/tables exist.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260324000000_add_org_inbound_email.sql supabase/migrations/20260324000001_add_invoice_source.sql supabase/migrations/20260324000002_create_email_ingestion_log.sql
git commit -m "feat: database migrations for email forwarding ingestion (DOC-62, DOC-63, DOC-65, DOC-67)"
```

---

## Task 2: Install Dependencies + Environment Setup (DOC-62)

**Files:**
- Modify: `package.json`
- Modify: `.env.example`

- [ ] **Step 1: Install svix and nanoid**

```bash
npm install svix nanoid
```

Note: `svix` is used for webhook signature verification (Resend uses Svix under the hood). `nanoid` is used for generating short unique inbox addresses.

- [ ] **Step 2: Add env var to .env.example**

Add to `.env.example`:
```
# Resend Inbound (email forwarding ingestion)
RESEND_INBOUND_WEBHOOK_SECRET=   # Svix signing secret from Resend dashboard
```

- [ ] **Step 3: Add RESEND_INBOUND_WEBHOOK_SECRET to .env.local**

Get the signing secret from the Resend dashboard (Webhooks section) and add to `.env.local`. Also add to Vercel environment variables for Preview and Production.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add svix and nanoid dependencies for email ingestion (DOC-62)"
```

---

## Task 3: Email Types (DOC-64)

**Files:**
- Create: `lib/email/types.ts` (email ingestion types -- separate from existing `lib/email/` files which handle outbound)

Note: `lib/email/` already exists with outbound email infrastructure (`send.ts`, `resend.ts`, `triggers.ts`, `templates/`). The new inbound types go in the same directory.

- [ ] **Step 1: Create email ingestion types**

```typescript
// lib/email/types.ts -- Types for inbound email ingestion

export interface EmailAttachment {
  filename: string;
  contentType: string;
  sizeBytes: number;
  content: Buffer;
}

export interface ParsedEmail {
  from: string;
  to: string[];
  subject: string;
  messageId: string;
  receivedAt: string; // ISO timestamp
  attachments: EmailAttachment[];
}

export interface ValidatedAttachment extends EmailAttachment {
  /** Detected MIME type from magic bytes (may differ from contentType header) */
  detectedType: string;
}

export interface InboundEmailResult {
  orgId: string;
  parsedEmail: ParsedEmail;
  validAttachments: ValidatedAttachment[];
  rejectedAttachments: Array<{
    filename: string;
    reason: string;
  }>;
}

export interface IngestionResult {
  invoiceId: string;
  fileName: string;
  status: "queued" | "error";
  error?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/email/types.ts
git commit -m "feat: add email ingestion types (DOC-64)"
```

---

## Task 4: Analytics Events (DOC-62)

**Files:**
- Modify: `lib/analytics/events.ts`

- [ ] **Step 1: Add email ingestion events**

Add to the `AnalyticsEvents` object in `lib/analytics/events.ts`:

```typescript
EMAIL_INGESTION_RECEIVED: "email_ingestion_received",
EMAIL_INGESTION_PROCESSED: "email_ingestion_processed",
EMAIL_INGESTION_REJECTED: "email_ingestion_rejected",
EMAIL_FORWARDING_ENABLED: "email_forwarding_enabled",
EMAIL_FORWARDING_DISABLED: "email_forwarding_disabled",
```

- [ ] **Step 2: Commit**

```bash
git add lib/analytics/events.ts
git commit -m "feat: add email ingestion analytics events (DOC-62)"
```

---

## Task 5: Address Generation + Lookup (DOC-63)

**Files:**
- Create: `lib/email/address.ts`
- Test: `lib/email/address.test.ts`
- Create: `app/api/email/address/route.ts`
- Test: `app/api/email/address/route.test.ts`

- [ ] **Step 1: Write failing tests for address generation and lookup**

Create `lib/email/address.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateInboundAddress, getOrgByInboundAddress } from "./address";

// Mock Supabase admin client
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({
            data: null,
            error: null,
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => ({
              data: { inbound_email_address: "invoices-abc1234567@ingest.dockett.app" },
              error: null,
            })),
          })),
        })),
      })),
    })),
  })),
}));

describe("generateInboundAddress", () => {
  it("returns an address matching the expected format", () => {
    const address = generateInboundAddress();
    expect(address).toMatch(/^invoices-[a-z2-9]{10}@ingest\.dockett\.app$/);
  });

  it("generates unique addresses on successive calls", () => {
    const a = generateInboundAddress();
    const b = generateInboundAddress();
    expect(a).not.toBe(b);
  });

  it("uses only unambiguous characters (no 0, 1, l, o)", () => {
    // Generate many addresses and check charset
    for (let i = 0; i < 100; i++) {
      const address = generateInboundAddress();
      const id = address.split("-")[1].split("@")[0];
      expect(id).not.toMatch(/[01lo]/);
    }
  });
});

describe("getOrgByInboundAddress", () => {
  it("returns null for unknown addresses", async () => {
    // Default mock returns null
    const result = await getOrgByInboundAddress("unknown@ingest.dockett.app");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/email/address.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement address generation and lookup**

Create `lib/email/address.ts`:

```typescript
import { customAlphabet } from "nanoid";
import { createAdminClient } from "@/lib/supabase/admin";

const INBOUND_DOMAIN = "ingest.dockett.app";
const ADDRESS_PREFIX = "invoices";
const ID_LENGTH = 10;

// Lowercase alphanumeric minus ambiguous chars: 0/O, 1/l/i
// Uses 2-9 (8) + a-h,j-k,m-n,p-z (23) = 31 chars
const generateId = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", ID_LENGTH);

/**
 * Generate a new inbound email address for an org.
 * Format: invoices-{nanoid10}@ingest.dockett.app
 */
export function generateInboundAddress(): string {
  return `${ADDRESS_PREFIX}-${generateId()}@${INBOUND_DOMAIN}`;
}

/**
 * Look up which org owns a given inbound email address.
 * Returns null if the address is not registered (unknown/disabled).
 */
export async function getOrgByInboundAddress(
  address: string
): Promise<{ orgId: string; ownerId: string } | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("organizations")
    .select("id")
    .eq("inbound_email_address", address)
    .single();

  if (error || !data) return null;

  // Resolve the org owner for userId context
  const { data: membership } = await admin
    .from("org_memberships")
    .select("user_id")
    .eq("org_id", data.id)
    .eq("role", "owner")
    .single();

  if (!membership) return null;

  return { orgId: data.id, ownerId: membership.user_id };
}

/**
 * Assign an inbound email address to an org.
 * Idempotent: if the org already has one, returns it.
 */
export async function assignInboundAddress(
  orgId: string
): Promise<string> {
  const admin = createAdminClient();

  // Check if org already has an address
  const { data: existing } = await admin
    .from("organizations")
    .select("inbound_email_address")
    .eq("id", orgId)
    .single();

  if (existing?.inbound_email_address) {
    return existing.inbound_email_address;
  }

  // Generate and assign
  const address = generateInboundAddress();
  const { data, error } = await admin
    .from("organizations")
    .update({ inbound_email_address: address })
    .eq("id", orgId)
    .select("inbound_email_address")
    .single();

  if (error) {
    throw new Error("Failed to assign inbound email address: " + error.message);
  }

  return data!.inbound_email_address;
}

/**
 * Remove the inbound email address from an org (disable email forwarding).
 */
export async function removeInboundAddress(orgId: string): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from("organizations")
    .update({ inbound_email_address: null })
    .eq("id", orgId);

  if (error) {
    throw new Error("Failed to remove inbound email address: " + error.message);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/email/address.test.ts`
Expected: PASS

- [ ] **Step 5: Build the address management API route**

Create `app/api/email/address/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { assignInboundAddress, removeInboundAddress } from "@/lib/email/address";
import { authError, forbiddenError, internalError, apiSuccess } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";

async function getAuthContext() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!membership) return null;

  return { userId: user.id, orgId: membership.org_id };
}

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return authError();

  const supabase = createClient();
  const { data } = await supabase
    .from("organizations")
    .select("inbound_email_address")
    .eq("id", ctx.orgId)
    .single();

  return apiSuccess({ address: data?.inbound_email_address ?? null });
}

export async function POST() {
  const ctx = await getAuthContext();
  if (!ctx) return authError();

  try {
    const address = await assignInboundAddress(ctx.orgId);

    logger.info("email_forwarding_enabled", {
      userId: ctx.userId,
      orgId: ctx.orgId,
      address,
    });

    trackServerEvent(ctx.userId, AnalyticsEvents.EMAIL_FORWARDING_ENABLED, {
      orgId: ctx.orgId,
    });

    return apiSuccess({ address });
  } catch (err) {
    logger.error("email_address_assign_failed", {
      userId: ctx.userId,
      orgId: ctx.orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return internalError("Failed to enable email forwarding.");
  }
}

export async function DELETE() {
  const ctx = await getAuthContext();
  if (!ctx) return authError();

  try {
    await removeInboundAddress(ctx.orgId);

    logger.info("email_forwarding_disabled", {
      userId: ctx.userId,
      orgId: ctx.orgId,
    });

    trackServerEvent(ctx.userId, AnalyticsEvents.EMAIL_FORWARDING_DISABLED, {
      orgId: ctx.orgId,
    });

    return apiSuccess({ address: null });
  } catch (err) {
    logger.error("email_address_remove_failed", {
      userId: ctx.userId,
      orgId: ctx.orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return internalError("Failed to disable email forwarding.");
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/email/address.ts lib/email/address.test.ts app/api/email/address/route.ts
git commit -m "feat: org inbox address generation, lookup, and API routes (DOC-63)"
```

---

## Task 6: Email Parser (DOC-64)

**Files:**
- Create: `lib/email/parser.ts`
- Create: `lib/email/__fixtures__/resend-inbound-pdf.json`
- Create: `lib/email/__fixtures__/resend-inbound-multi.json`
- Create: `lib/email/__fixtures__/resend-inbound-empty.json`
- Test: `lib/email/parser.test.ts`

- [ ] **Step 1: Create test fixtures**

Create realistic Resend Inbound webhook payloads. Resend's inbound webhook payload format includes `from`, `to`, `subject`, `headers.message-id`, and `attachments` as an array of `{ filename, content_type, size, content (base64) }`.

Create `lib/email/__fixtures__/resend-inbound-pdf.json` with a valid PDF attachment (use a small base64-encoded PDF).

Create `lib/email/__fixtures__/resend-inbound-multi.json` with a PDF + JPEG attachment.

Create `lib/email/__fixtures__/resend-inbound-empty.json` with no attachments.

Check Resend's inbound webhook documentation for exact payload shape before creating fixtures. The key fields are typically:
- `from`: sender email
- `to`: array of recipient emails
- `subject`: email subject
- `headers`: object with `message-id`
- `attachments`: array of `{ filename, content_type, size, content }`

- [ ] **Step 2: Write failing parser tests**

Create `lib/email/parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseInboundEmail, filterValidAttachments } from "./parser";
import pdfFixture from "./__fixtures__/resend-inbound-pdf.json";
import multiFixture from "./__fixtures__/resend-inbound-multi.json";
import emptyFixture from "./__fixtures__/resend-inbound-empty.json";

describe("parseInboundEmail", () => {
  it("parses sender, recipient, subject, and messageId from Resend payload", () => {
    const result = parseInboundEmail(pdfFixture);
    expect(result.from).toBeTruthy();
    expect(result.to.length).toBeGreaterThan(0);
    expect(result.subject).toBeTruthy();
    expect(result.messageId).toBeTruthy();
  });

  it("extracts PDF attachment with correct metadata", () => {
    const result = parseInboundEmail(pdfFixture);
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].contentType).toBe("application/pdf");
    expect(result.attachments[0].content).toBeInstanceOf(Buffer);
  });

  it("extracts multiple attachments", () => {
    const result = parseInboundEmail(multiFixture);
    expect(result.attachments.length).toBeGreaterThan(1);
  });

  it("returns empty attachments array for emails with no attachments", () => {
    const result = parseInboundEmail(emptyFixture);
    expect(result.attachments).toHaveLength(0);
  });
});

describe("filterValidAttachments", () => {
  it("accepts valid PDF by magic bytes", () => {
    const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, ...Array(100).fill(0)]);
    const attachment = {
      filename: "invoice.pdf",
      contentType: "application/pdf",
      sizeBytes: pdfBuffer.length,
      content: pdfBuffer,
    };
    const { valid, rejected } = filterValidAttachments([attachment]);
    expect(valid).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  it("rejects files exceeding 10MB", () => {
    const bigBuffer = Buffer.alloc(11 * 1024 * 1024);
    // Write PDF magic bytes so it passes type check
    bigBuffer[0] = 0x25; bigBuffer[1] = 0x50; bigBuffer[2] = 0x44; bigBuffer[3] = 0x46;
    const attachment = {
      filename: "huge.pdf",
      contentType: "application/pdf",
      sizeBytes: bigBuffer.length,
      content: bigBuffer,
    };
    const { valid, rejected } = filterValidAttachments([attachment]);
    expect(valid).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toContain("10MB");
  });

  it("rejects files with mismatched magic bytes", () => {
    const textBuffer = Buffer.from("This is not a PDF");
    const attachment = {
      filename: "fake.pdf",
      contentType: "application/pdf",
      sizeBytes: textBuffer.length,
      content: textBuffer,
    };
    const { valid, rejected } = filterValidAttachments([attachment]);
    expect(valid).toHaveLength(0);
    expect(rejected).toHaveLength(1);
  });

  it("rejects unsupported file types (ZIP)", () => {
    const zipBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Array(100).fill(0)]);
    const attachment = {
      filename: "archive.zip",
      contentType: "application/zip",
      sizeBytes: zipBuffer.length,
      content: zipBuffer,
    };
    const { valid, rejected } = filterValidAttachments([attachment]);
    expect(valid).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toContain("Unsupported");
  });

  it("rejects .eml attachments with notification message", () => {
    const emlBuffer = Buffer.from("From: test@example.com\r\n");
    const attachment = {
      filename: "forwarded.eml",
      contentType: "message/rfc822",
      sizeBytes: emlBuffer.length,
      content: emlBuffer,
    };
    const { valid, rejected } = filterValidAttachments([attachment]);
    expect(valid).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toContain("not currently supported");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run lib/email/parser.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement the parser**

Create `lib/email/parser.ts`:

```typescript
import { validateFileMagicBytes, validateFileSize } from "@/lib/upload/validate";
import type { ParsedEmail, EmailAttachment, ValidatedAttachment } from "./types";

/**
 * Parse a Resend Inbound webhook payload into a structured email.
 *
 * Resend Inbound docs: https://resend.com/docs/dashboard/webhooks/introduction
 * Payload fields used: from, to, subject, headers.message-id, attachments[]
 */
export function parseInboundEmail(payload: Record<string, unknown>): ParsedEmail {
  const from = String(payload.from ?? "");
  const to = Array.isArray(payload.to) ? payload.to.map(String) : [String(payload.to ?? "")];
  const subject = String(payload.subject ?? "(no subject)");

  // Message-ID is in headers
  const headers = (payload.headers ?? {}) as Record<string, string>;
  const messageId = headers["message-id"] ?? headers["Message-ID"] ?? "";

  // Parse attachments
  const rawAttachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  const attachments: EmailAttachment[] = rawAttachments.map(
    (att: Record<string, unknown>) => ({
      filename: String(att.filename ?? "attachment"),
      contentType: String(att.content_type ?? att.contentType ?? "application/octet-stream"),
      sizeBytes: Number(att.size ?? 0),
      content: Buffer.from(String(att.content ?? ""), "base64"),
    })
  );

  return {
    from,
    to,
    subject,
    messageId,
    receivedAt: new Date().toISOString(),
    attachments,
  };
}

/**
 * Filter and validate email attachments.
 * Reuses existing magic byte validation from lib/upload/validate.ts.
 *
 * Returns valid attachments (ready for ingestion) and rejected ones (with reasons).
 */
export function filterValidAttachments(attachments: EmailAttachment[]): {
  valid: ValidatedAttachment[];
  rejected: Array<{ filename: string; reason: string }>;
} {
  const valid: ValidatedAttachment[] = [];
  const rejected: Array<{ filename: string; reason: string }> = [];

  for (const att of attachments) {
    // Skip inline images and .eml files
    if (att.contentType === "message/rfc822" || att.filename.endsWith(".eml")) {
      rejected.push({
        filename: att.filename,
        reason: "Attached email files (.eml) are not currently supported. Please forward the email directly or extract the PDF attachment.",
      });
      continue;
    }

    // Check supported types
    const supportedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
    if (!supportedTypes.has(att.contentType)) {
      rejected.push({
        filename: att.filename,
        reason: `Unsupported file type: ${att.contentType}. Attachments must be PDF, JPEG, or PNG.`,
      });
      continue;
    }

    // Check file size (10MB limit) -- use actual buffer length, not claimed size
    if (!validateFileSize(att.content.length)) {
      rejected.push({
        filename: att.filename,
        reason: `File exceeds 10MB limit (${Math.round(att.sizeBytes / 1024 / 1024)}MB).`,
      });
      continue;
    }

    // Validate magic bytes
    const magicResult = validateFileMagicBytes(att.content, att.contentType);
    if (!magicResult.valid) {
      rejected.push({
        filename: att.filename,
        reason: magicResult.error ?? "File content does not match expected type.",
      });
      continue;
    }

    valid.push({
      ...att,
      detectedType: magicResult.detectedType ?? att.contentType,
    });
  }

  return { valid, rejected };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/email/parser.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/email/parser.ts lib/email/parser.test.ts "lib/email/__fixtures__/"
git commit -m "feat: email parser with attachment validation (DOC-64)"
```

---

## Task 7: Rate Limiting (DOC-67)

**Files:**
- Create: `lib/email/rate-limit.ts`
- Test: `lib/email/rate-limit.test.ts`

- [ ] **Step 1: Write failing rate limit tests**

Create `lib/email/rate-limit.test.ts` testing:
- Under limit: returns `{ allowed: true }`
- At hourly limit (50): returns `{ allowed: false, reason: "hourly" }`
- At daily limit (100): returns `{ allowed: false, reason: "daily" }`

Mock the admin client to return different counts.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/email/rate-limit.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement rate limiter**

Create `lib/email/rate-limit.ts`:

```typescript
import { createAdminClient } from "@/lib/supabase/admin";

const HOURLY_LIMIT = 50;
const DAILY_LIMIT = 100;

type RateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: "hourly" | "daily" };

/**
 * Check if an org is within email ingestion rate limits.
 * Uses windowed counts on email_ingestion_log.processed_at.
 */
export async function checkEmailRateLimit(orgId: string): Promise<RateLimitResult> {
  const admin = createAdminClient();
  const now = new Date();

  // Hourly check
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const { count: hourlyCount, error: hourlyError } = await admin
    .from("email_ingestion_log")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("processed_at", oneHourAgo.toISOString());

  if (!hourlyError && (hourlyCount ?? 0) >= HOURLY_LIMIT) {
    return { allowed: false, reason: "hourly" };
  }

  // Daily check
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const { count: dailyCount, error: dailyError } = await admin
    .from("email_ingestion_log")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("processed_at", oneDayAgo.toISOString());

  if (!dailyError && (dailyCount ?? 0) >= DAILY_LIMIT) {
    return { allowed: false, reason: "daily" };
  }

  return { allowed: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/email/rate-limit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/email/rate-limit.ts lib/email/rate-limit.test.ts
git commit -m "feat: per-org email ingestion rate limiting (DOC-67)"
```

---

## Task 8: Ingestion Pipeline (DOC-65)

**Files:**
- Create: `lib/email/ingest.ts`
- Test: `lib/email/ingest.test.ts`

This is the bridge between parsed email attachments and the existing extraction pipeline.

- [ ] **Step 1: Write failing ingestion tests**

Create `lib/email/ingest.test.ts` testing:
- Happy path: attachment uploaded to Storage, invoice row created, extraction enqueued
- Returns `invoiceId` on success
- Computes file hash for duplicate detection

Mock: `createAdminClient` (storage + DB), `enqueueExtraction`

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/email/ingest.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement ingestion pipeline**

Create `lib/email/ingest.ts`:

```typescript
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueExtraction } from "@/lib/extraction/queue";
import { logger } from "@/lib/utils/logger";
import type { ValidatedAttachment, IngestionResult } from "./types";

interface EmailMetadata {
  sender: string;
  subject: string;
}

/**
 * Ingest a single email attachment into the invoice pipeline.
 *
 * Mirrors the upload route logic:
 * 1. Upload to Supabase Storage
 * 2. Compute file hash
 * 3. Create invoice row with source='email'
 * 4. Enqueue extraction (async via waitUntil)
 */
export async function ingestEmailAttachment(
  orgId: string,
  userId: string,
  attachment: ValidatedAttachment,
  metadata: EmailMetadata
): Promise<IngestionResult> {
  const admin = createAdminClient();
  const invoiceId = crypto.randomUUID();
  const storagePath = `${orgId}/${invoiceId}/${attachment.filename}`;

  try {
    // 1. Upload to Supabase Storage
    const { error: uploadError } = await admin.storage
      .from("invoices")
      .upload(storagePath, attachment.content, {
        contentType: attachment.contentType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error("Storage upload failed: " + uploadError.message);
    }

    // 2. Compute file hash
    const fileHash = createHash("sha256").update(attachment.content).digest("hex");

    // 3. Create invoice row
    const { error: insertError } = await admin
      .from("invoices")
      .insert({
        id: invoiceId,
        org_id: orgId,
        status: "uploaded",
        file_path: storagePath,
        file_name: attachment.filename,
        file_type: attachment.contentType,
        file_size_bytes: attachment.sizeBytes,
        file_hash: fileHash,
        source: "email",
        email_sender: metadata.sender,
        email_subject: metadata.subject,
      });

    if (insertError) {
      // Orphan cleanup
      await admin.storage.from("invoices").remove([storagePath]);
      throw new Error("Invoice record creation failed: " + insertError.message);
    }

    // 4. Enqueue extraction (will be called with waitUntil in the webhook)
    // Don't await here -- the webhook handles waitUntil
    // Just return the params needed for enqueueExtraction
    logger.info("email_ingest_invoice_created", {
      invoiceId,
      orgId,
      userId,
      fileName: attachment.filename,
      fileType: attachment.contentType,
      source: "email",
    });

    return {
      invoiceId,
      fileName: attachment.filename,
      status: "queued",
    };
  } catch (error) {
    logger.error("email_ingest_attachment_failed", {
      orgId,
      userId,
      fileName: attachment.filename,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      invoiceId,
      fileName: attachment.filename,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/email/ingest.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/email/ingest.ts lib/email/ingest.test.ts
git commit -m "feat: email attachment ingestion pipeline (DOC-65)"
```

---

## Task 9: Ingestion Notification Templates (DOC-67)

**Files:**
- Create: `lib/email/templates/ingestion-no-attachment.tsx`
- Create: `lib/email/templates/ingestion-error.tsx`
- Modify: `lib/email/triggers.ts`

- [ ] **Step 1: Create ingestion-no-attachment template**

Follow the existing template pattern in `lib/email/templates/extraction-complete.tsx`. Use `EmailLayout`, `PrimaryButton`, and `styles` from `lib/email/templates/layout.tsx`.

Template content: "We received your email but couldn't find a PDF or image attachment. Try forwarding the original email with the invoice attached."

Include a "Go to Settings" button linking to the Settings page.

- [ ] **Step 2: Create ingestion-error template**

Template content: dynamic based on error type. Include:
- What went wrong (e.g., "File [filename] exceeds the 10MB limit")
- What the user can do ("Try uploading the file manually in Docket")
- Link to the invoice list

- [ ] **Step 3: Add trigger functions to `lib/email/triggers.ts`**

Add `sendIngestionNoAttachmentEmail(userId, emailSubject)` and `sendIngestionErrorEmail(userId, details)` following the existing pattern:
- Check `extraction_notifications` preference
- Look up user email
- Send via `sendEmail()`
- Log to `email_log`
- Wrap in try/catch (fire-and-forget)

- [ ] **Step 4: Commit**

```bash
git add lib/email/templates/ingestion-no-attachment.tsx lib/email/templates/ingestion-error.tsx lib/email/triggers.ts
git commit -m "feat: email ingestion notification templates and triggers (DOC-67)"
```

---

## Task 10: Webhook Endpoint (DOC-62, DOC-64, DOC-65, DOC-67)

**Files:**
- Create: `app/api/email/inbound/route.ts`
- Test: `app/api/email/inbound/route.test.ts`

This is the main orchestration endpoint that ties everything together.

- [ ] **Step 1: Write failing webhook route tests**

Create `app/api/email/inbound/route.test.ts` testing:
- Valid signature + PDF attachment: returns 200, invoice created
- Invalid signature: returns 401
- Unknown recipient address: returns 200, no invoice
- No attachments: returns 200, no invoice, notification sent
- Rate limited: returns 200, logged
- Duplicate Message-ID: returns 200, no new invoice

Mock: `svix` Webhook verify, `createAdminClient`, `enqueueExtraction`, `sendEmail`

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/email/inbound/route.test.ts`
Expected: FAIL

- [ ] **Step 3: Exclude webhook from auth middleware**

Update `middleware.ts` to exclude `/api/email/inbound` from the matcher. This prevents wasteful `auth.getUser()` calls on every inbound email webhook (which has no Supabase session):

```typescript
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/email/inbound|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 4: Implement the webhook endpoint**

Create `app/api/email/inbound/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseInboundEmail, filterValidAttachments } from "@/lib/email/parser";
import { getOrgByInboundAddress } from "@/lib/email/address";
import { ingestEmailAttachment } from "@/lib/email/ingest";
import { checkEmailRateLimit } from "@/lib/email/rate-limit";
import { checkInvoiceAccess } from "@/lib/billing/access";
import { checkUsageLimit } from "@/lib/billing/usage";
import { incrementTrialInvoice } from "@/lib/billing/trial";
import { enqueueExtraction } from "@/lib/extraction/queue";
import {
  sendIngestionNoAttachmentEmail,
  sendIngestionErrorEmail,
  sendTrialExhaustedEmail,
} from "@/lib/email/triggers";
import { TRIAL_INVOICE_LIMIT } from "@/lib/billing/tiers";
import { logger } from "@/lib/utils/logger";
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";
import { waitUntil } from "@vercel/functions";

// Always return 200 -- non-200 causes Resend to retry
const OK = () => NextResponse.json({ received: true }, { status: 200 });
const UNAUTHORIZED = () => NextResponse.json({ error: "Invalid signature" }, { status: 401 });

export async function POST(request: Request) {
  const startTime = Date.now();

  // 1. Verify webhook signature
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    logger.warn("email_inbound_missing_signature_headers", {
      action: "email_inbound",
    });
    return UNAUTHORIZED();
  }

  const body = await request.text();
  let payload: Record<string, unknown>;

  try {
    const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
    if (!secret) throw new Error("Missing RESEND_INBOUND_WEBHOOK_SECRET");

    const wh = new Webhook(secret);
    payload = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as Record<string, unknown>;
  } catch (err) {
    logger.warn("email_inbound_signature_invalid", {
      action: "email_inbound",
      error: err instanceof Error ? err.message : String(err),
    });
    return UNAUTHORIZED();
  }

  // 2. Parse the email
  const parsedEmail = parseInboundEmail(payload);

  // 3. Look up org by recipient address
  // Find the first recipient that matches our ingest domain
  const ingestRecipient = parsedEmail.to.find((addr) =>
    addr.includes("@ingest.dockett.app")
  );

  if (!ingestRecipient) {
    logger.warn("email_inbound_no_ingest_recipient", {
      action: "email_inbound",
      to: parsedEmail.to,
    });
    return OK();
  }

  const orgLookup = await getOrgByInboundAddress(ingestRecipient);
  if (!orgLookup) {
    logger.warn("email_inbound_unknown_address", {
      action: "email_inbound",
      address: ingestRecipient,
      from: parsedEmail.from,
    });
    return OK();
  }

  const { orgId, ownerId: userId } = orgLookup;
  const admin = createAdminClient();

  // 4. Check dedup (Message-ID)
  if (parsedEmail.messageId) {
    const { data: existing } = await admin
      .from("email_ingestion_log")
      .select("id")
      .eq("message_id", parsedEmail.messageId)
      .single();

    if (existing) {
      logger.info("email_inbound_duplicate", {
        action: "email_inbound",
        orgId,
        messageId: parsedEmail.messageId,
      });
      // Log duplicate to ingestion log for audit trail
      await admin.from("email_ingestion_log").insert({
        org_id: orgId,
        message_id: parsedEmail.messageId + "_dup_" + Date.now(),
        sender: parsedEmail.from,
        subject: parsedEmail.subject,
        total_attachment_count: parsedEmail.attachments.length,
        valid_attachment_count: 0,
        status: "duplicate",
        rejection_reason: "Duplicate Message-ID: " + parsedEmail.messageId,
      });
      return OK();
    }
  }

  // 5. Check rate limit
  const rateCheck = await checkEmailRateLimit(orgId);
  if (!rateCheck.allowed) {
    await admin.from("email_ingestion_log").insert({
      org_id: orgId,
      message_id: parsedEmail.messageId || crypto.randomUUID(),
      sender: parsedEmail.from,
      subject: parsedEmail.subject,
      total_attachment_count: parsedEmail.attachments.length,
      valid_attachment_count: 0,
      status: "rate_limited",
      rejection_reason: `Rate limit exceeded: ${rateCheck.reason}`,
    });

    logger.warn("email_inbound_rate_limited", {
      action: "email_inbound",
      orgId,
      reason: rateCheck.reason,
    });
    return OK();
  }

  // 6. Check billing access
  const access = await checkInvoiceAccess(userId);
  if (!access.allowed) {
    await admin.from("email_ingestion_log").insert({
      org_id: orgId,
      message_id: parsedEmail.messageId || crypto.randomUUID(),
      sender: parsedEmail.from,
      subject: parsedEmail.subject,
      total_attachment_count: parsedEmail.attachments.length,
      valid_attachment_count: 0,
      status: "rejected",
      rejection_reason: `Billing: ${access.reason}`,
    });

    if (access.trialExhausted) {
      sendTrialExhaustedEmail(userId, TRIAL_INVOICE_LIMIT);
    } else {
      sendIngestionErrorEmail(userId, {
        type: "billing",
        emailSubject: parsedEmail.subject,
        message: "Your subscription is inactive. Please update your billing to continue processing invoices via email.",
      });
    }

    trackServerEvent(userId, AnalyticsEvents.EMAIL_INGESTION_REJECTED, {
      orgId,
      reason: access.reason,
    });
    return OK();
  }

  // 7. Filter and validate attachments
  const { valid: validAttachments, rejected: rejectedAttachments } =
    filterValidAttachments(parsedEmail.attachments);

  trackServerEvent(userId, AnalyticsEvents.EMAIL_INGESTION_RECEIVED, {
    orgId,
    attachmentCount: parsedEmail.attachments.length,
    validAttachmentCount: validAttachments.length,
  });

  if (validAttachments.length === 0) {
    await admin.from("email_ingestion_log").insert({
      org_id: orgId,
      message_id: parsedEmail.messageId || crypto.randomUUID(),
      sender: parsedEmail.from,
      subject: parsedEmail.subject,
      total_attachment_count: parsedEmail.attachments.length,
      valid_attachment_count: 0,
      status: "rejected",
      rejection_reason: rejectedAttachments.length > 0
        ? rejectedAttachments.map((r) => `${r.filename}: ${r.reason}`).join("; ")
        : "No attachments found",
    });

    // Notify user
    if (parsedEmail.attachments.length === 0) {
      sendIngestionNoAttachmentEmail(userId, parsedEmail.subject);
    } else {
      sendIngestionErrorEmail(userId, {
        type: "invalid_attachments",
        emailSubject: parsedEmail.subject,
        message: rejectedAttachments.map((r) => `${r.filename}: ${r.reason}`).join("\n"),
      });
    }

    logger.info("email_inbound_no_valid_attachments", {
      action: "email_inbound",
      orgId,
      from: parsedEmail.from,
      totalAttachments: parsedEmail.attachments.length,
      rejectedAttachments: rejectedAttachments.length,
    });
    return OK();
  }

  // 8. Check usage limit
  const usageCheck = await checkUsageLimit(orgId, userId);
  if (!usageCheck.allowed) {
    await admin.from("email_ingestion_log").insert({
      org_id: orgId,
      message_id: parsedEmail.messageId || crypto.randomUUID(),
      sender: parsedEmail.from,
      subject: parsedEmail.subject,
      total_attachment_count: parsedEmail.attachments.length,
      valid_attachment_count: validAttachments.length,
      status: "rejected",
      rejection_reason: `Usage limit: ${usageCheck.reason}`,
    });

    sendIngestionErrorEmail(userId, {
      type: "usage_limit",
      emailSubject: parsedEmail.subject,
      message: "Monthly invoice limit reached. Upgrade your plan to process more invoices.",
    });
    return OK();
  }

  // 9. Ingest each valid attachment
  const results = [];
  const emailMetadata = { sender: parsedEmail.from, subject: parsedEmail.subject };
  const extractionPromises: Promise<unknown>[] = [];

  for (const attachment of validAttachments) {
    // Trial increment per attachment
    if (access.allowed && access.reason === "trial") {
      const increment = await incrementTrialInvoice(userId);
      if (!increment.success) {
        sendTrialExhaustedEmail(userId, TRIAL_INVOICE_LIMIT);
        break; // Stop processing more attachments
      }
    }

    const result = await ingestEmailAttachment(orgId, userId, attachment, emailMetadata);
    results.push(result);

    if (result.status === "queued") {
      // Fire extraction async
      extractionPromises.push(
        enqueueExtraction({
          invoiceId: result.invoiceId,
          orgId,
          userId,
          filePath: `${orgId}/${result.invoiceId}/${attachment.filename}`,
          fileType: attachment.contentType,
        }).catch((err) => {
          logger.warn("email_ingest_extraction_failed", {
            invoiceId: result.invoiceId,
            orgId,
            error: err instanceof Error ? err.message : String(err),
          });
        })
      );
    }
  }

  // Keep serverless function alive for extraction
  if (extractionPromises.length > 0) {
    waitUntil(Promise.allSettled(extractionPromises));
  }

  // 10. Log to ingestion log
  const invoicesCreated = results.filter((r) => r.status === "queued").length;
  await admin.from("email_ingestion_log").insert({
    org_id: orgId,
    message_id: parsedEmail.messageId || crypto.randomUUID(),
    sender: parsedEmail.from,
    subject: parsedEmail.subject,
    total_attachment_count: parsedEmail.attachments.length,
    valid_attachment_count: validAttachments.length,
    status: invoicesCreated > 0 ? "processed" : "rejected",
    rejection_reason: invoicesCreated === 0 ? "All attachments failed ingestion" : null,
  });

  const durationMs = Date.now() - startTime;
  logger.info("email_inbound_processed", {
    action: "email_inbound",
    orgId,
    userId,
    from: parsedEmail.from,
    totalAttachments: parsedEmail.attachments.length,
    validAttachments: validAttachments.length,
    invoicesCreated,
    durationMs,
  });

  trackServerEvent(userId, AnalyticsEvents.EMAIL_INGESTION_PROCESSED, {
    orgId,
    invoicesCreated,
  });

  return OK();
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run app/api/email/inbound/route.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `npm run test`
Expected: All tests pass, no regressions

- [ ] **Step 7: Commit**

```bash
git add middleware.ts app/api/email/inbound/route.ts app/api/email/inbound/route.test.ts
git commit -m "feat: inbound email webhook endpoint with full pipeline (DOC-62, DOC-64, DOC-65, DOC-67)"
```

---

## Task 11: Settings UI (DOC-66)

**Files:**
- Create: `components/settings/EmailIngestionCard.tsx`
- Modify: `app/(dashboard)/settings/page.tsx`

Reference the existing `QBOConnectionCard.tsx` for card styling patterns and `UIdesign.md` for Precision Flow tokens.

- [ ] **Step 1: Build the EmailIngestionCard component**

Create `components/settings/EmailIngestionCard.tsx` as a `"use client"` component with:
- State: `address` (string | null), `loading` (boolean), `showConfirm` (boolean), `copied` (boolean), `instructionsOpen` (boolean)
- `useEffect` on mount: `GET /api/email/address` to check if enabled
- Enable handler: `POST /api/email/address` -> set address
- Disable handler: `DELETE /api/email/address` -> set address to null
- Copy handler: `navigator.clipboard.writeText(address)` -> toast
- Two visual states: not-enabled (CTA button) and enabled (address + copy + instructions + disable)
- Use `JetBrains Mono` (`font-mono` in Tailwind) for the email address display
- Collapsible setup instructions for Gmail, Outlook, and generic
- `mailto:` link for "Send a test email"
- Match card styling from `QBOConnectionCard.tsx`: `bg-surface rounded-brand-lg shadow-soft px-6 py-5`

- [ ] **Step 2: Add EmailIngestionCard to Settings page**

Modify `app/(dashboard)/settings/page.tsx`:
- Import `EmailIngestionCard`
- Add a new section below the accounting connections section
- Section heading: "Email Forwarding"

- [ ] **Step 3: Run build to verify no errors**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add components/settings/EmailIngestionCard.tsx "app/(dashboard)/settings/page.tsx"
git commit -m "feat: email ingestion settings UI with copy and setup instructions (DOC-66)"
```

---

## Task 12: Invoice List Source Indicator (DOC-66)

**Files:**
- Modify: `components/invoices/InvoiceList.tsx`

- [ ] **Step 1: Add email source indicator to invoice list**

In `components/invoices/InvoiceList.tsx`, for each invoice row:
- Check if `invoice.source === 'email'`
- If yes, render a small "via Email" pill (e.g., `<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-xs font-medium">` with an envelope icon)
- Add a `title` attribute (tooltip) showing `From: ${invoice.email_sender}\nSubject: ${invoice.email_subject}`

Reference: The invoice list already renders `InvoiceStatusBadge` for status. Add the source indicator near the file name or status column.

- [ ] **Step 2: Run build to verify no errors**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add components/invoices/InvoiceList.tsx
git commit -m "feat: email source indicator in invoice list (DOC-66)"
```

---

## Task 13: CLAUDE.md Updates + DNS Setup (DOC-62)

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.env.example`

- [ ] **Step 1: Add Resend Inbound decision to Decisions Log**

Add to the Decisions Log table in `CLAUDE.md`:

```
| 2026-03-24 | Resend Inbound for email forwarding (not Postmark/Mailgun) | Already using Resend for outbound email. Consolidates to one vendor, one SDK, one billing relationship. Svix for webhook verification. | DOC-62 |
| 2026-03-24 | Email forwarding ungated (all tiers including trial) | Competitors shipping this as standard. Table stakes differentiator, not upsell lever. Trial users count email-ingested invoices toward the 10-invoice limit. | DOC-62 |
| 2026-03-24 | Nested .eml parsing deferred to v2 | MIME parsing of forwarded email files adds significant complexity and security surface. v1 rejects .eml with a notification suggesting the user forward directly. | DOC-64 |
```

- [ ] **Step 2: Add Resend Inbound gotchas section**

Add a "Resend Inbound" section to Common Gotchas in `CLAUDE.md`:

```
**Resend Inbound:**
- Webhook signature verification uses Svix. Headers: `svix-id`, `svix-timestamp`, `svix-signature`. Library: `svix` npm package.
- Always return 200 to the webhook, even on errors. Non-200 causes Resend to retry.
- Attachments are base64-encoded in the payload. Decode with `Buffer.from(content, "base64")`.
- The `from` field may include display name: `"John Doe <john@example.com>"`. Parse accordingly.
- MX records for `ingest.dockett.app` point to Resend's inbound servers.
- Webhook endpoint (`/api/email/inbound`) is NOT behind auth middleware -- it authenticates via Svix signature only, uses admin client for all DB operations.
```

- [ ] **Step 3: Update pricing tier documentation**

Update the Decisions Log entry from DOC-91/DOC-93 to reflect that email forwarding is now available on all tiers (not Growth-only "coming soon").

- [ ] **Step 4: Configure DNS (manual step)**

Add MX records for `ingest.dockett.app` in GoDaddy pointing to Resend's inbound servers. The specific MX values come from the Resend dashboard after configuring the inbound domain. Verify propagation with `dig MX ingest.dockett.app`.

- [ ] **Step 5: Configure Resend Inbound (manual step)**

In the Resend dashboard:
1. Add inbound domain `ingest.dockett.app`
2. Set webhook URL to `https://dockett.app/api/email/inbound`
3. Copy the Svix signing secret to `.env.local` and Vercel env vars

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md .env.example
git commit -m "docs: add email ingestion decisions, gotchas, and env vars (DOC-62)"
```

---

## Task 14: Integration Testing (DOC-112)

**Files:**
- Complete: `app/api/email/inbound/route.test.ts` (expand from Task 10)
- Complete: `app/api/email/address/route.test.ts`
- All test files from previous tasks

- [ ] **Step 1: Expand webhook route tests**

Add comprehensive tests to `app/api/email/inbound/route.test.ts`:
- Multiple attachments: each creates separate invoice
- One attachment fails, others succeed
- Trial user: incrementTrialInvoice called per attachment
- Trial exhausted mid-batch: stops processing
- Usage limit reached: rejected with notification
- Rate limited: silently dropped

- [ ] **Step 2: Write address management API tests**

Create `app/api/email/address/route.test.ts`:
- GET returns null when no address
- POST generates address
- POST again returns same address (idempotent)
- DELETE removes address
- Unauthenticated: returns 401

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 4: Run lint, type check, and build**

```bash
npm run lint && npx tsc --noEmit && npm run build
```

Expected: All pass with zero errors and zero warnings

- [ ] **Step 5: Commit**

```bash
git add app/api/email/inbound/route.test.ts app/api/email/address/route.test.ts
git commit -m "test: comprehensive tests for email ingestion pipeline (DOC-112)"
```

---

## Task 15: End-to-End Verification

- [ ] **Step 1: Manual smoke test**

1. Start dev server: `npm run dev`
2. Go to Settings page
3. Click "Enable Email Forwarding"
4. Verify address appears in monospace format
5. Click Copy, verify clipboard
6. Send a test email with a PDF attachment to the generated address
7. Check Vercel logs (or dev server console) for webhook receipt
8. Verify invoice appears in invoice list with "via Email" indicator
9. Verify extraction runs and invoice reaches `pending_review` status
10. Verify email metadata (sender, subject) visible on hover

- [ ] **Step 2: Test error scenarios**

1. Send email with no attachment -- verify notification email received
2. Send email with a .txt file renamed to .pdf -- verify magic byte rejection
3. Disable email forwarding in Settings -- verify address removed
4. Send to old address -- verify silently ignored

- [ ] **Step 3: Run completion self-check**

```bash
npm run lint        # Zero warnings, zero errors
npm run build       # Completes without errors
npx tsc --noEmit    # No type errors
npm run test        # No failures
```

- [ ] **Step 4: Final commit and status report**

Deliver status report in the format specified in CLAUDE.md.
