# DOC-141: SMS/MMS Invoice Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users text photos of invoices/receipts to a Docket toll-free number (+1 855 507 3460) for automated extraction and review.

**Architecture:** Twilio webhook receives MMS, identifies user by phone number, stores media in Supabase Storage, creates invoice with `source: 'sms'`, and triggers async extraction via `waitUntil`. Same pipeline as email forwarding (DOC-62). Settings UI adds phone verification card. HEIC images converted to JPEG via `sharp` at ingest time.

**Tech Stack:** Twilio (webhook + SMS sending), sharp (HEIC conversion), Next.js API routes, Supabase (DB + Storage), existing extraction pipeline.

**Spec:** `docs/superpowers/specs/2026-04-03-doc-141-sms-mms-ingestion-design.md`

---

### Task 1: Install Twilio dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install twilio**

```bash
npm install twilio
```

- [ ] **Step 2: Verify installation**

```bash
node -e "const twilio = require('twilio'); console.log('twilio loaded:', typeof twilio)"
```

Expected: `twilio loaded: function`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add twilio dependency (DOC-141)"
```

---

### Task 2: Database migration -- users.phone_number + sms tables

**Files:**
- Create: `supabase/migrations/20260403000001_sms_ingestion.sql`

- [ ] **Step 1: Write migration**

```sql
-- Migration: Add SMS/MMS ingestion support
-- Issue: DOC-141

-- Add phone number to users (E.164 format, e.g. +15551234567)
ALTER TABLE users ADD COLUMN phone_number TEXT UNIQUE;
CREATE INDEX idx_users_phone_number ON users(phone_number);

-- Add 'sms' to invoices source constraint
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_source_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_source_check
  CHECK (source IN ('upload', 'email', 'sms', 'api'));

-- Add sms_body_context to invoices (text sent with the photo)
ALTER TABLE invoices ADD COLUMN sms_body_context TEXT;

-- SMS verification codes (for phone number registration)
CREATE TABLE sms_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  phone_number TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_sms_verification_user ON sms_verification_codes(user_id);

-- SMS ingestion log (audit trail, rate limiting)
CREATE TABLE sms_ingestion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  from_number TEXT NOT NULL,
  num_media INTEGER DEFAULT 0,
  body_text TEXT,
  total_attachment_count INTEGER DEFAULT 0,
  valid_attachment_count INTEGER DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('processed', 'rejected', 'rate_limited')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_sms_ingestion_log_org ON sms_ingestion_log(org_id);
CREATE INDEX idx_sms_ingestion_log_from_created ON sms_ingestion_log(from_number, created_at);

-- RLS for sms_ingestion_log
ALTER TABLE sms_ingestion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_ingestion_log_org_access" ON sms_ingestion_log
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
  );

-- RLS for sms_verification_codes (user can only see their own)
ALTER TABLE sms_verification_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_verification_codes_self_access" ON sms_verification_codes
  FOR ALL
  USING (user_id = auth.uid());

-- Update invoice_list_view to include sms_body_context
DROP VIEW IF EXISTS invoice_list_view;

CREATE VIEW invoice_list_view WITH (security_invoker = true) AS
SELECT
  i.id,
  i.org_id,
  i.file_name,
  i.status,
  i.uploaded_at,
  i.output_type,
  i.batch_id,
  i.source,
  i.email_sender,
  i.error_message,
  i.sms_body_context,
  ed.vendor_name,
  ed.invoice_number,
  ed.invoice_date,
  ed.total_amount
FROM invoices i
LEFT JOIN extracted_data ed ON ed.invoice_id = i.id;
```

- [ ] **Step 2: Apply migration locally**

```bash
npx supabase db push
```

Expected: Migration applies without errors.

- [ ] **Step 3: Regenerate Supabase types**

```bash
npx supabase gen types typescript --local > lib/types/supabase.ts
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260403000001_sms_ingestion.sql lib/types/supabase.ts
git commit -m "feat: add SMS ingestion database schema (DOC-141)"
```

---

### Task 3: Update TypeScript types for SMS source

**Files:**
- Modify: `lib/invoices/types.ts`
- Modify: `lib/analytics/events.ts`

- [ ] **Step 1: Add 'sms' to InvoiceListItem source type**

In `lib/invoices/types.ts`, update the `source` field:

```typescript
source: "upload" | "email" | "sms" | "api";
```

Also add `sms_body_context` to the interface:

```typescript
sms_body_context: string | null;
```

- [ ] **Step 2: Add SMS analytics events**

In `lib/analytics/events.ts`, add to the `AnalyticsEvents` object:

```typescript
SMS_INGESTION_RECEIVED: "sms_ingestion_received",
SMS_INGESTION_PROCESSED: "sms_ingestion_processed",
SMS_PHONE_VERIFIED: "sms_phone_verified",
SMS_PHONE_REMOVED: "sms_phone_removed",
```

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add lib/invoices/types.ts lib/analytics/events.ts
git commit -m "feat: add SMS source type and analytics events (DOC-141)"
```

---

### Task 4: SMS rate limiter

**Files:**
- Create: `lib/sms/rate-limit.ts`

- [ ] **Step 1: Write the rate limiter**

Follows the same pattern as `lib/email/rate-limit.ts` but uses `sms_ingestion_log` and per-phone-number limits (10/hour):

```typescript
import { createAdminClient } from "@/lib/supabase/admin";

export const SMS_HOURLY_LIMIT = 10;

type RateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: "hourly" };

/**
 * Check if a phone number is within SMS ingestion rate limits.
 * Uses windowed count on sms_ingestion_log.created_at.
 */
export async function checkSmsRateLimit(fromNumber: string): Promise<RateLimitResult> {
  const admin = createAdminClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const { count, error } = await admin
    .from("sms_ingestion_log")
    .select("*", { count: "exact", head: true })
    .eq("from_number", fromNumber)
    .gte("created_at", oneHourAgo.toISOString());

  if (!error && (count ?? 0) >= SMS_HOURLY_LIMIT) {
    return { allowed: false, reason: "hourly" };
  }

  return { allowed: true };
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/sms/rate-limit.ts
git commit -m "feat: add SMS ingestion rate limiter (DOC-141)"
```

---

### Task 5: SMS user lookup

**Files:**
- Create: `lib/sms/lookup.ts`

- [ ] **Step 1: Write the phone-to-org lookup**

```typescript
import { createAdminClient } from "@/lib/supabase/admin";

interface SmsUserLookup {
  userId: string;
  orgId: string;
}

/**
 * Look up a user and their default org by phone number.
 * Returns null if the phone number is not registered.
 */
export async function getUserByPhone(phoneNumber: string): Promise<SmsUserLookup | null> {
  const admin = createAdminClient();

  // Find user with this phone number
  const { data: user, error } = await admin
    .from("users")
    .select("id")
    .eq("phone_number", phoneNumber)
    .single();

  if (error || !user) {
    return null;
  }

  // Get their primary org (first org membership, ordered by created_at)
  const { data: membership } = await admin
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!membership) {
    return null;
  }

  return { userId: user.id, orgId: membership.org_id };
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/sms/lookup.ts
git commit -m "feat: add SMS phone-to-user lookup (DOC-141)"
```

---

### Task 6: SMS media fetcher and HEIC converter

**Files:**
- Create: `lib/sms/media.ts`

- [ ] **Step 1: Write the media fetcher**

This module fetches media from Twilio's hosted URLs (requires basic auth), detects MIME type, converts HEIC to JPEG, and validates.

```typescript
import { validateFileMagicBytes, validateFileSize } from "@/lib/upload/validate";
import { logger } from "@/lib/utils/logger";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// HEIC magic bytes: starts with ftyp box at offset 4
const HEIC_FTYP_SIGNATURES = ["heic", "heix", "hevc", "mif1"];

export interface SmsMediaAttachment {
  filename: string;
  content: Buffer;
  detectedType: string;
  sizeBytes: number;
}

interface FetchResult {
  valid: SmsMediaAttachment[];
  rejected: Array<{ filename: string; reason: string }>;
}

/**
 * Check if a buffer contains HEIC/HEIF data by looking for the ftyp box.
 */
function isHeic(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  const ftypStr = buffer.subarray(4, 8).toString("ascii");
  if (ftypStr !== "ftyp") return false;
  const brand = buffer.subarray(8, 12).toString("ascii");
  return HEIC_FTYP_SIGNATURES.includes(brand);
}

/**
 * Convert HEIC buffer to JPEG using sharp.
 * High quality (95) to preserve detail on blurry receipts.
 */
async function convertHeicToJpeg(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(buffer).jpeg({ quality: 95 }).toBuffer();
}

/**
 * Fetch and validate media attachments from a Twilio MMS.
 *
 * Twilio hosts media at MediaUrl0..N for ~24 hours. Fetching requires
 * basic auth with the Twilio Account SID and Auth Token. We follow
 * redirects to the actual CDN URL.
 */
export async function fetchSmsMedia(params: {
  numMedia: number;
  getMediaUrl: (i: number) => string;
  getMediaContentType: (i: number) => string;
  maxAttachments?: number;
}): Promise<FetchResult> {
  const { numMedia, getMediaUrl, getMediaContentType, maxAttachments = 5 } = params;
  const valid: SmsMediaAttachment[] = [];
  const rejected: Array<{ filename: string; reason: string }> = [];

  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const authHeader = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const count = Math.min(numMedia, maxAttachments);

  for (let i = 0; i < count; i++) {
    const mediaUrl = getMediaUrl(i);
    const claimedType = getMediaContentType(i);
    const filename = `sms-attachment-${i}.${extensionFromMime(claimedType)}`;

    try {
      // Fetch media from Twilio (follows redirects to CDN)
      const response = await fetch(mediaUrl, {
        headers: { Authorization: authHeader },
        redirect: "follow",
      });

      if (!response.ok) {
        rejected.push({ filename, reason: `Fetch failed: HTTP ${response.status}` });
        continue;
      }

      let buffer = Buffer.from(await response.arrayBuffer());
      const sizeBytes = buffer.length;

      // Size check
      if (!validateFileSize(sizeBytes)) {
        rejected.push({ filename, reason: "File exceeds 10MB limit" });
        continue;
      }

      // HEIC detection and conversion
      if (isHeic(buffer)) {
        try {
          buffer = await convertHeicToJpeg(buffer);
          logger.info("sms_heic_converted", {
            action: "fetch_sms_media",
            originalSize: sizeBytes,
            convertedSize: buffer.length,
          });
        } catch (err) {
          rejected.push({
            filename,
            reason: `HEIC conversion failed: ${err instanceof Error ? err.message : "unknown"}`,
          });
          continue;
        }
        // After conversion, validate as JPEG
        const validation = validateFileMagicBytes(buffer, "image/jpeg");
        if (!validation.valid) {
          rejected.push({ filename, reason: validation.error ?? "Invalid after HEIC conversion" });
          continue;
        }
        valid.push({
          filename: filename.replace(/\.\w+$/, ".jpg"),
          content: buffer,
          detectedType: "image/jpeg",
          sizeBytes: buffer.length,
        });
        continue;
      }

      // Standard magic byte validation for non-HEIC files
      const validation = validateFileMagicBytes(buffer, claimedType);
      if (!validation.valid) {
        rejected.push({ filename, reason: validation.error ?? "Magic bytes mismatch" });
        continue;
      }

      valid.push({
        filename,
        content: buffer,
        detectedType: validation.detectedType!,
        sizeBytes,
      });
    } catch (err) {
      rejected.push({
        filename,
        reason: `Fetch error: ${err instanceof Error ? err.message : "unknown"}`,
      });
    }
  }

  // If more than maxAttachments were sent, note the extras
  if (numMedia > maxAttachments) {
    rejected.push({
      filename: `attachments ${maxAttachments + 1}-${numMedia}`,
      reason: `Only ${maxAttachments} attachments per message are supported`,
    });
  }

  return { valid, rejected };
}

function extensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/heic": "heic",
    "image/heif": "heif",
    "application/pdf": "pdf",
  };
  return map[mimeType] ?? "bin";
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/sms/media.ts
git commit -m "feat: add SMS media fetcher with HEIC conversion (DOC-141)"
```

---

### Task 7: SMS ingestion function

**Files:**
- Create: `lib/sms/ingest.ts`

- [ ] **Step 1: Write the ingestion function**

Follows the same pattern as `lib/email/ingest.ts` -- stores file, creates invoice record, enqueues extraction:

```typescript
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";
import { enqueueExtraction } from "@/lib/extraction/queue";
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";
import type { SmsMediaAttachment } from "./media";

export interface SmsIngestionResult {
  invoiceId: string;
  fileName: string;
  status: "queued" | "error";
  error?: string;
}

/**
 * Ingest a single SMS media attachment into the invoice pipeline.
 *
 * Steps:
 * 1. Upload to Supabase Storage
 * 2. Compute file hash for duplicate detection
 * 3. Create invoice row with source='sms'
 * 4. Enqueue extraction (awaited -- caller wraps in waitUntil)
 */
export async function ingestSmsAttachment(params: {
  orgId: string;
  userId: string;
  attachment: SmsMediaAttachment;
  fromNumber: string;
  bodyText: string | null;
}): Promise<SmsIngestionResult> {
  const { orgId, userId, attachment, fromNumber, bodyText } = params;
  const admin = createAdminClient();

  const invoiceId = crypto.randomUUID();
  const storagePath = `${orgId}/${invoiceId}/${attachment.filename}`;

  try {
    // 1. Upload to Supabase Storage
    const { error: uploadError } = await admin.storage
      .from("invoices")
      .upload(storagePath, attachment.content, {
        contentType: attachment.detectedType,
        upsert: false,
      });

    if (uploadError) {
      logger.error("sms_ingest_storage_failed", {
        orgId,
        invoiceId,
        filename: attachment.filename,
        error: uploadError.message,
      });
      return {
        invoiceId,
        fileName: attachment.filename,
        status: "error",
        error: "Storage upload failed",
      };
    }

    // 2. Compute file hash
    const fileHash = createHash("sha256")
      .update(attachment.content)
      .digest("hex");

    // 3. Create invoice row
    const fileName = bodyText
      ? `${bodyText.substring(0, 60).trim()}.${attachment.filename.split(".").pop()}`
      : attachment.filename;

    const { error: insertError } = await admin
      .from("invoices")
      .insert({
        id: invoiceId,
        org_id: orgId,
        status: "uploaded",
        file_path: storagePath,
        file_name: fileName,
        file_type: attachment.detectedType,
        file_size_bytes: attachment.sizeBytes,
        file_hash: fileHash,
        source: "sms",
        sms_body_context: bodyText,
      });

    if (insertError) {
      logger.error("sms_ingest_db_insert_failed", {
        orgId,
        invoiceId,
        error: insertError.message,
      });
      await admin.storage.from("invoices").remove([storagePath]);
      return {
        invoiceId,
        fileName: attachment.filename,
        status: "error",
        error: "Database insert failed",
      };
    }

    // 4. Run extraction (awaited -- caller wraps in waitUntil)
    try {
      await enqueueExtraction({
        invoiceId,
        orgId,
        userId,
        filePath: storagePath,
        fileType: attachment.detectedType,
      });
    } catch (err) {
      logger.error("sms_ingest_extraction_failed", {
        orgId,
        invoiceId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Extraction failed but invoice was created -- user can retry from UI
    }

    trackServerEvent(userId, AnalyticsEvents.SMS_INGESTION_PROCESSED, {
      orgId,
      invoiceId,
      source: "sms",
      fileName: attachment.filename,
    });

    logger.info("sms_ingest_success", {
      orgId,
      userId,
      invoiceId,
      filename: attachment.filename,
      fileHash,
      status: "queued",
    });

    return {
      invoiceId,
      fileName: attachment.filename,
      status: "queued",
    };
  } catch (err) {
    logger.error("sms_ingest_unexpected_error", {
      orgId,
      invoiceId,
      filename: attachment.filename,
      error: err instanceof Error ? err.message : String(err),
      exception: err instanceof Error ? err : undefined,
    });
    return {
      invoiceId,
      fileName: attachment.filename,
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/sms/ingest.ts
git commit -m "feat: add SMS attachment ingestion function (DOC-141)"
```

---

### Task 8: TwiML response helper

**Files:**
- Create: `lib/sms/twiml.ts`

- [ ] **Step 1: Write TwiML helper**

Twilio expects responses as XML with `<Response><Message>` tags. This avoids pulling in the full Twilio helper library for response generation.

```typescript
/**
 * Build a TwiML XML response with an SMS reply message.
 * Returns a string that should be sent with Content-Type: text/xml.
 */
export function twimlResponse(message: string): string {
  // Escape XML special characters in the message
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Message>${escaped}</Message></Response>`;
}

/**
 * Build a TwiML XML response with no reply (empty response).
 */
export function twimlEmpty(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response></Response>`;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/sms/twiml.ts
git commit -m "feat: add TwiML response helper (DOC-141)"
```

---

### Task 9: Twilio signature validation

**Files:**
- Create: `lib/sms/validate-signature.ts`

- [ ] **Step 1: Write signature validator**

```typescript
import twilio from "twilio";

/**
 * Validate a Twilio webhook request signature.
 *
 * Twilio signs each request with HMAC-SHA1 using the Auth Token.
 * The signature is in the X-Twilio-Signature header.
 * The URL must match exactly what Twilio sees (including https, host, path).
 */
export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    throw new Error("TWILIO_AUTH_TOKEN is not configured");
  }

  return twilio.validateRequest(authToken, signature, url, params);
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/sms/validate-signature.ts
git commit -m "feat: add Twilio signature validation (DOC-141)"
```

---

### Task 10: Inbound SMS webhook handler

**Files:**
- Create: `app/api/sms/inbound/route.ts`

- [ ] **Step 1: Write the webhook handler**

This is the core route. Follows the same structure as `app/api/email/inbound/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { logger } from "@/lib/utils/logger";
import { validateTwilioSignature } from "@/lib/sms/validate-signature";
import { getUserByPhone } from "@/lib/sms/lookup";
import { fetchSmsMedia } from "@/lib/sms/media";
import { ingestSmsAttachment } from "@/lib/sms/ingest";
import { checkSmsRateLimit } from "@/lib/sms/rate-limit";
import { twimlResponse } from "@/lib/sms/twiml";
import { checkInvoiceAccess } from "@/lib/billing/access";
import { checkUsageLimit } from "@/lib/billing/usage";
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";
import { createAdminClient } from "@/lib/supabase/admin";

const TWIML_CONTENT_TYPE = "text/xml";

function twimlReply(message: string) {
  return new NextResponse(twimlResponse(message), {
    status: 200,
    headers: { "Content-Type": TWIML_CONTENT_TYPE },
  });
}

/**
 * POST /api/sms/inbound
 *
 * Receives inbound SMS/MMS from Twilio via webhook.
 * Validates signature, identifies user by phone number, processes
 * media attachments, and triggers extraction.
 *
 * ALWAYS returns 200 with TwiML to prevent Twilio retry loops.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // Parse the form body
  let formData: URLSearchParams;
  try {
    const body = await request.text();
    formData = new URLSearchParams(body);
  } catch {
    logger.error("sms_inbound_body_read_failed", {
      error: "Failed to read request body",
    });
    return twimlReply("Something went wrong. Try again or upload at dockett.app/upload");
  }

  // Validate Twilio signature
  const signature = request.headers.get("x-twilio-signature") ?? "";
  const requestUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://dockett.app"}/api/sms/inbound`;
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = value;
  });

  try {
    const valid = validateTwilioSignature(requestUrl, params, signature);
    if (!valid) {
      logger.error("sms_inbound_signature_invalid", {
        error: "Invalid Twilio signature",
      });
      return new NextResponse("Invalid signature", { status: 401 });
    }
  } catch (err) {
    logger.error("sms_inbound_signature_error", {
      error: err instanceof Error ? err.message : "Signature validation error",
    });
    return new NextResponse("Signature validation failed", { status: 401 });
  }

  // Extract message fields
  const from = formData.get("From") ?? "";
  const body = formData.get("Body") ?? "";
  const numMedia = parseInt(formData.get("NumMedia") ?? "0", 10);

  logger.info("sms_inbound_received", {
    from,
    numMedia,
    hasBody: body.length > 0,
    bodyLength: body.length,
  });

  // Look up user by phone number
  const userLookup = await getUserByPhone(from);

  if (!userLookup) {
    logger.info("sms_inbound_unregistered", {
      from,
      status: "unregistered",
    });
    return twimlReply(
      "This number isn't registered with Dockett. Add your phone at dockett.app/settings"
    );
  }

  const { userId, orgId } = userLookup;
  const admin = createAdminClient();

  // No media attached
  if (numMedia === 0) {
    logger.info("sms_inbound_no_media", {
      from,
      orgId,
      status: "no_media",
    });
    return twimlReply(
      "Attach a photo of an invoice or receipt to process it."
    );
  }

  // Rate limit check
  const rateLimit = await checkSmsRateLimit(from);
  if (!rateLimit.allowed) {
    await admin.from("sms_ingestion_log").insert({
      org_id: orgId,
      from_number: from,
      num_media: numMedia,
      body_text: body || null,
      total_attachment_count: numMedia,
      valid_attachment_count: 0,
      status: "rate_limited" as const,
      rejection_reason: `Rate limited: ${rateLimit.reason}`,
    });
    logger.warn("sms_inbound_rate_limited", {
      orgId,
      from,
      reason: rateLimit.reason,
      status: "rate_limited",
    });
    return twimlReply("Too many messages. Try again in a few minutes.");
  }

  trackServerEvent(userId, AnalyticsEvents.SMS_INGESTION_RECEIVED, {
    orgId,
    from,
    numMedia,
  });

  // Billing/usage checks
  const access = await checkInvoiceAccess(userId);
  if (!access.allowed) {
    logger.warn("sms_inbound_billing_blocked", {
      orgId,
      userId,
      reason: access.reason,
      status: "rejected",
    });
    return twimlReply(
      "Your Dockett subscription is inactive. Visit dockett.app/settings"
    );
  }

  const usageCheck = await checkUsageLimit(orgId, userId);
  if (!usageCheck.allowed) {
    logger.warn("sms_inbound_usage_limit", {
      orgId,
      userId,
      used: usageCheck.usage.used,
      limit: usageCheck.usage.limit,
      status: "rejected",
    });
    return twimlReply(
      "Monthly invoice limit reached. Upgrade at dockett.app/settings"
    );
  }

  // Fetch and validate media attachments
  const { valid, rejected } = await fetchSmsMedia({
    numMedia,
    getMediaUrl: (i) => formData.get(`MediaUrl${i}`) ?? "",
    getMediaContentType: (i) => formData.get(`MediaContentType${i}`) ?? "",
  });

  for (const r of rejected) {
    logger.info("sms_inbound_attachment_rejected", {
      orgId,
      filename: r.filename,
      reason: r.reason,
    });
  }

  // Log to sms_ingestion_log
  const logStatus = valid.length > 0 ? "processed" : "rejected";
  const rejectionReason =
    valid.length === 0
      ? rejected.length > 0
        ? "all_attachments_invalid"
        : "fetch_failed"
      : null;

  await admin.from("sms_ingestion_log").insert({
    org_id: orgId,
    from_number: from,
    num_media: numMedia,
    body_text: body || null,
    total_attachment_count: numMedia,
    valid_attachment_count: valid.length,
    status: logStatus as "processed" | "rejected",
    rejection_reason: rejectionReason,
  });

  if (valid.length === 0) {
    logger.info("sms_inbound_no_valid_attachments", {
      orgId,
      from,
      totalAttachments: numMedia,
      rejectedCount: rejected.length,
      status: "no_valid_attachments",
    });
    return twimlReply(
      "Unsupported file type. Send a photo (JPEG, PNG, HEIC) or PDF."
    );
  }

  // Ingest each valid attachment (async via waitUntil)
  const bodyText = body.trim() || null;

  const ingestionPromise = Promise.allSettled(
    valid.map((attachment) =>
      ingestSmsAttachment({
        orgId,
        userId,
        attachment,
        fromNumber: from,
        bodyText,
      })
    )
  ).then((results) => {
    const succeeded = results.filter(
      (r) => r.status === "fulfilled" && r.value.status === "queued"
    ).length;
    const failed = results.length - succeeded;

    logger.info("sms_inbound_ingestion_complete", {
      orgId,
      from,
      totalAttachments: valid.length,
      succeeded,
      failed,
      durationMs: Date.now() - startTime,
    });
  });

  waitUntil(ingestionPromise);

  // Reply with confirmation
  const invoiceCount = valid.length;
  const replyMessage =
    invoiceCount === 1
      ? "Got it! Processing 1 invoice. Review at dockett.app/invoices"
      : `Got it! Processing ${invoiceCount} invoices. Review at dockett.app/invoices`;

  logger.info("sms_inbound_processed", {
    orgId,
    from,
    validAttachmentCount: valid.length,
    rejectedCount: rejected.length,
    durationMs: Date.now() - startTime,
    status: "processed",
  });

  return twimlReply(replyMessage);
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/sms/inbound/route.ts
git commit -m "feat: add inbound SMS/MMS webhook handler (DOC-141)"
```

---

### Task 11: Phone verification API routes

**Files:**
- Create: `app/api/sms/verify/send/route.ts`
- Create: `app/api/sms/verify/confirm/route.ts`
- Create: `app/api/sms/phone/route.ts`

- [ ] **Step 1: Write the send-verification-code route**

```typescript
// app/api/sms/verify/send/route.ts

import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";

/**
 * POST /api/sms/verify/send
 *
 * Sends a 6-digit verification code to the provided phone number.
 * Rate limited: max 3 codes per phone number per hour.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const phoneNumber = body.phoneNumber?.trim();

  // Validate E.164 format
  if (!phoneNumber || !/^\+1\d{10}$/.test(phoneNumber)) {
    return NextResponse.json(
      { error: "Invalid phone number. Use US format: +1XXXXXXXXXX" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Check if this number is already registered to another user
  const { data: existing } = await admin
    .from("users")
    .select("id")
    .eq("phone_number", phoneNumber)
    .single();

  if (existing && existing.id !== user.id) {
    return NextResponse.json(
      { error: "This phone number is already registered to another account." },
      { status: 409 }
    );
  }

  // Rate limit: max 3 codes per phone per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const { count } = await admin
    .from("sms_verification_codes")
    .select("*", { count: "exact", head: true })
    .eq("phone_number", phoneNumber)
    .gte("created_at", oneHourAgo.toISOString());

  if ((count ?? 0) >= 3) {
    return NextResponse.json(
      { error: "Too many verification attempts. Try again later." },
      { status: 429 }
    );
  }

  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Store verification code
  await admin.from("sms_verification_codes").insert({
    user_id: user.id,
    phone_number: phoneNumber,
    code,
    expires_at: expiresAt.toISOString(),
  });

  // Send SMS via Twilio
  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );

    await client.messages.create({
      to: phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER!,
      body: `Your Dockett verification code is: ${code}. Expires in 5 minutes.`,
    });

    logger.info("sms_verification_sent", {
      userId: user.id,
      phoneNumber,
    });

    return NextResponse.json({ data: { sent: true } });
  } catch (err) {
    logger.error("sms_verification_send_failed", {
      userId: user.id,
      phoneNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to send verification code. Please try again." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Write the confirm-verification route**

```typescript
// app/api/sms/verify/confirm/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";

/**
 * POST /api/sms/verify/confirm
 *
 * Validates a 6-digit verification code and saves the phone number to the user.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { phoneNumber, code } = body;

  if (!phoneNumber || !code) {
    return NextResponse.json(
      { error: "Phone number and code are required." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Find valid (non-expired) verification code
  const { data: verification } = await admin
    .from("sms_verification_codes")
    .select("id, code, expires_at")
    .eq("user_id", user.id)
    .eq("phone_number", phoneNumber)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!verification) {
    return NextResponse.json(
      { error: "No verification code found. Please request a new one." },
      { status: 400 }
    );
  }

  if (new Date(verification.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "Verification code expired. Please request a new one." },
      { status: 400 }
    );
  }

  if (verification.code !== code) {
    return NextResponse.json(
      { error: "Invalid verification code." },
      { status: 400 }
    );
  }

  // Save phone number to user
  const { error: updateError } = await admin
    .from("users")
    .update({ phone_number: phoneNumber })
    .eq("id", user.id);

  if (updateError) {
    // Unique constraint violation = another user registered this number between send and confirm
    if (updateError.code === "23505") {
      return NextResponse.json(
        { error: "This phone number was just registered to another account." },
        { status: 409 }
      );
    }
    logger.error("sms_verification_save_failed", {
      userId: user.id,
      error: updateError.message,
    });
    return NextResponse.json(
      { error: "Failed to save phone number." },
      { status: 500 }
    );
  }

  // Clean up verification codes for this user
  await admin
    .from("sms_verification_codes")
    .delete()
    .eq("user_id", user.id);

  trackServerEvent(user.id, AnalyticsEvents.SMS_PHONE_VERIFIED, {
    phoneNumber,
  });

  logger.info("sms_phone_verified", {
    userId: user.id,
    phoneNumber,
  });

  return NextResponse.json({ data: { verified: true, phoneNumber } });
}
```

- [ ] **Step 3: Write the remove-phone route**

```typescript
// app/api/sms/phone/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";

/**
 * DELETE /api/sms/phone
 *
 * Removes the user's registered phone number.
 */
export async function DELETE() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("users")
    .update({ phone_number: null })
    .eq("id", user.id);

  if (error) {
    logger.error("sms_phone_remove_failed", {
      userId: user.id,
      error: error.message,
    });
    return NextResponse.json(
      { error: "Failed to remove phone number." },
      { status: 500 }
    );
  }

  trackServerEvent(user.id, AnalyticsEvents.SMS_PHONE_REMOVED, {});

  logger.info("sms_phone_removed", { userId: user.id });

  return NextResponse.json({ data: { removed: true } });
}

/**
 * GET /api/sms/phone
 *
 * Returns the user's registered phone number (if any).
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: userData } = await admin
    .from("users")
    .select("phone_number")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    data: {
      phoneNumber: userData?.phone_number ?? null,
      docketNumber: process.env.TWILIO_PHONE_NUMBER ?? null,
    },
  });
}
```

- [ ] **Step 4: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app/api/sms/verify/send/route.ts app/api/sms/verify/confirm/route.ts app/api/sms/phone/route.ts
git commit -m "feat: add phone verification and management API routes (DOC-141)"
```

---

### Task 12: SMS Ingestion Settings Card

**Files:**
- Create: `components/settings/SmsIngestionCard.tsx`

- [ ] **Step 1: Write the component**

Follows the same pattern as `components/settings/EmailIngestionCard.tsx`. Three states: not registered, verification pending, verified.

```tsx
"use client";

import { useState, useEffect } from "react";
import Button from "@/components/ui/Button";

type CardState = "loading" | "not_registered" | "verify_pending" | "verified";

function formatPhoneDisplay(e164: string): string {
  // +15551234567 -> (555) 123-4567
  const digits = e164.replace(/^\+1/, "");
  if (digits.length !== 10) return e164;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function formatDocketNumber(e164: string): string {
  // +18555073460 -> (855) 507-3460
  const digits = e164.replace(/^\+1/, "");
  if (digits.length !== 10) return e164;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function SmsIngestionCard() {
  const [state, setState] = useState<CardState>("loading");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [docketNumber, setDocketNumber] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [pendingPhone, setPendingPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/sms/phone")
      .then((r) => r.json())
      .then((res) => {
        setDocketNumber(res.data?.docketNumber ?? "");
        if (res.data?.phoneNumber) {
          setPhoneNumber(res.data.phoneNumber);
          setState("verified");
        } else {
          setState("not_registered");
        }
      })
      .catch(() => setState("not_registered"));
  }, []);

  function toE164(input: string): string {
    const digits = input.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return "";
  }

  async function handleSendCode() {
    const e164 = toE164(phoneInput);
    if (!e164) {
      setError("Enter a valid US phone number.");
      return;
    }

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/sms/verify/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: e164 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send code.");
        return;
      }
      setPendingPhone(e164);
      setState("verify_pending");
    } catch {
      setError("Failed to send code. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleVerify() {
    if (verifyCode.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }

    setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/sms/verify/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: pendingPhone, code: verifyCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed.");
        return;
      }
      setPhoneNumber(pendingPhone);
      setState("verified");
      setVerifyCode("");
      setPendingPhone("");
      setPhoneInput("");
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await fetch("/api/sms/phone", { method: "DELETE" });
      setPhoneNumber("");
      setState("not_registered");
      setShowConfirm(false);
    } catch {
      // Fail silently
    } finally {
      setRemoving(false);
    }
  }

  function handleCopyDocketNumber() {
    navigator.clipboard.writeText(docketNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (state === "loading") {
    return (
      <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-5">
        <div className="animate-pulse h-11 bg-gray-100 rounded-brand-md" />
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-5 transition-all duration-150 ease-in-out hover:-translate-y-0.5 hover:shadow-float">
      <div className="flex items-center gap-5">
        {/* Phone icon */}
        <div className="flex h-11 w-11 items-center justify-center rounded-brand-md bg-green-600 text-white font-bold text-sm flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 012.43 8.326 13.019 13.019 0 012 5V3.5z" clipRule="evenodd" />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="font-body font-bold text-[15px] text-text">
            SMS Ingestion
          </p>
          <p className="font-body text-[13px] text-muted">
            Text photos of invoices and receipts to process them instantly.
          </p>
        </div>

        {/* Action for not_registered */}
        {state === "not_registered" && !phoneInput && (
          <Button onClick={() => setPhoneInput(" ")}>
            Add Phone Number
          </Button>
        )}
      </div>

      {/* Not registered: phone input */}
      {state === "not_registered" && phoneInput !== "" && (
        <div className="mt-5 space-y-3">
          <div>
            <label className="block text-[13px] font-medium text-muted mb-1.5">
              Your phone number
            </label>
            <div className="flex items-center gap-2">
              <input
                type="tel"
                value={phoneInput === " " ? "" : phoneInput}
                onChange={(e) => {
                  setPhoneInput(e.target.value);
                  setError(null);
                }}
                placeholder="(555) 123-4567"
                className="flex-1 font-mono text-[14px] bg-white border border-border rounded-brand-md px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSendCode();
                  if (e.key === "Escape") setPhoneInput("");
                }}
              />
              <Button onClick={handleSendCode} disabled={sending}>
                {sending ? "Sending..." : "Send Code"}
              </Button>
            </div>
            <p className="mt-1 text-[12px] text-muted">
              We'll send a 6-digit verification code via SMS.
            </p>
          </div>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <button
            onClick={() => {
              setPhoneInput("");
              setError(null);
            }}
            className="text-[13px] font-medium text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Verification pending: code input */}
      {state === "verify_pending" && (
        <div className="mt-5 space-y-3">
          <div>
            <label className="block text-[13px] font-medium text-muted mb-1.5">
              Enter verification code sent to {formatPhoneDisplay(pendingPhone)}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={verifyCode}
                onChange={(e) => {
                  setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setError(null);
                }}
                placeholder="000000"
                maxLength={6}
                className="w-32 font-mono text-[14px] text-center tracking-widest bg-white border border-border rounded-brand-md px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleVerify();
                }}
              />
              <Button onClick={handleVerify} disabled={verifying}>
                {verifying ? "Verifying..." : "Verify"}
              </Button>
            </div>
          </div>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSending(true);
                fetch("/api/sms/verify/send", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ phoneNumber: pendingPhone }),
                })
                  .then((r) => r.json())
                  .then((data) => {
                    if (data.error) setError(data.error);
                  })
                  .catch(() => setError("Failed to resend code."))
                  .finally(() => setSending(false));
              }}
              disabled={sending}
              className="text-[13px] font-medium text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-50"
            >
              {sending ? "Resending..." : "Resend code"}
            </button>
            <button
              onClick={() => {
                setState("not_registered");
                setVerifyCode("");
                setError(null);
              }}
              className="text-[13px] font-medium text-muted hover:text-text transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Verified: show phone + Docket number */}
      {state === "verified" && (
        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-muted mb-1.5">
              Your registered phone number
            </label>
            <input
              type="text"
              readOnly
              value={formatPhoneDisplay(phoneNumber)}
              className="font-mono text-[14px] bg-gray-50 border border-border rounded-brand-md px-3 py-2 text-text w-full"
            />
          </div>

          {docketNumber && (
            <div>
              <label className="block text-[13px] font-medium text-muted mb-1.5">
                Text invoices to this number
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={formatDocketNumber(docketNumber)}
                  className="flex-1 font-mono text-[14px] bg-gray-50 border border-border rounded-brand-md px-3 py-2 text-text select-all"
                />
                <button
                  onClick={handleCopyDocketNumber}
                  className="px-3 py-2 text-[13px] font-medium bg-blue-600 text-white rounded-brand-md hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}

          {/* Test MMS link */}
          <a
            href={`sms:${docketNumber}`}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-blue-600 hover:text-blue-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M2.87 2.298a.75.75 0 00-1.24.845L5.22 8 1.63 12.857a.75.75 0 001.24.845L7.25 8.5h5a.75.75 0 100-1.5h-5L2.87 2.298z" />
            </svg>
            Send a test MMS
          </a>

          <p className="text-[12px] text-muted">
            Take a photo of an invoice or receipt and text it to the number above. We'll extract the data automatically.
          </p>

          {/* Remove phone */}
          <div className="pt-2 border-t border-border">
            {!showConfirm ? (
              <button
                onClick={() => setShowConfirm(true)}
                className="text-[13px] font-medium text-red-600 hover:text-red-700 transition-colors"
              >
                Remove Phone Number
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-[13px] text-muted">
                  SMS ingestion will be disabled.
                </p>
                <button
                  onClick={handleRemove}
                  disabled={removing}
                  className="px-3 py-1.5 text-[13px] font-medium bg-red-600 text-white rounded-brand-md hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {removing ? "Removing..." : "Confirm"}
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="text-[13px] font-medium text-muted hover:text-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/settings/SmsIngestionCard.tsx
git commit -m "feat: add SMS Ingestion settings card component (DOC-141)"
```

---

### Task 13: Add SMS card to Settings page

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Import and add the SmsIngestionCard**

Add the import at the top of the file, alongside the existing imports:

```typescript
import { SmsIngestionCard } from "@/components/settings/SmsIngestionCard";
```

Add the SMS section right after the Email Forwarding section. Find the `{/* Email Forwarding Section */}` block and add after its closing `</div>`:

```tsx
{/* SMS Ingestion Section */}
<div>
  <p className="text-[13px] font-bold uppercase tracking-wider text-muted mb-3">
    SMS Ingestion
  </p>
  <SmsIngestionCard />
</div>
```

- [ ] **Step 2: Verify types compile and app builds**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/settings/page.tsx
git commit -m "feat: add SMS Ingestion card to Settings page (DOC-141)"
```

---

### Task 14: Add SMS source badge to Invoice List

**Files:**
- Modify: `components/invoices/InvoiceList.tsx`

- [ ] **Step 1: Add SMS badge alongside existing email badge**

Find the block in `renderDesktopInvoiceRow` that renders the email source badge (around line 287):

```tsx
{invoice.source === "email" && (
  <span
    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-medium bg-blue-50 text-blue-600 rounded-full"
    title={invoice.email_sender ? `From: ${invoice.email_sender}` : "Received via email"}
  >
    ...
  </span>
)}
```

Add an SMS badge right after the email badge closing `)}`:

```tsx
{invoice.source === "sms" && (
  <span
    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-medium bg-green-50 text-green-600 rounded-full"
    title={invoice.sms_body_context ? `Note: ${invoice.sms_body_context}` : "Received via SMS"}
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
      <path fillRule="evenodd" d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 012.43 8.326 13.019 13.019 0 012 5V3.5z" clipRule="evenodd" />
    </svg>
    SMS
  </span>
)}
```

Also check if there's a mobile row renderer in the same file and add the same badge there.

- [ ] **Step 2: Add `sms_body_context` to the InvoiceListItem query if needed**

Check `lib/invoices/queries.ts` to see if `sms_body_context` is being fetched from `invoice_list_view`. If the view already includes it (from Task 2's migration), just add `sms_body_context` to the select query. If the query uses explicit column selection, add `sms_body_context` to the list.

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/invoices/InvoiceList.tsx lib/invoices/queries.ts
git commit -m "feat: add SMS source badge to invoice list (DOC-141)"
```

---

### Task 15: Add env vars to .env.example and CLAUDE.md

**Files:**
- Modify: `.env.example`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Twilio vars to .env.example**

Add to the end of `.env.example`:

```
# Twilio (SMS/MMS ingestion)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

- [ ] **Step 2: Add Twilio vars to CLAUDE.md Environment Variables section**

Add under the PostHog section:

```
# Twilio (SMS/MMS ingestion)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

- [ ] **Step 3: Add SMS gotchas to CLAUDE.md Common Gotchas section**

Add a "Twilio" subsection:

```
**Twilio (SMS/MMS ingestion, validated YYYY-MM-DD):**
- **Toll-free number:** +1 (855) 507-3460. One number serves all users; sender phone identifies the user.
- **Media URLs expire in ~24 hours.** Fetch immediately in the webhook handler, don't defer.
- **Twilio sends form-encoded POST, not JSON.** Parse with `URLSearchParams`, not `request.json()`.
- **Signature validation requires the exact public URL.** Must match what Twilio sees including protocol and path. Use `NEXT_PUBLIC_APP_URL` + `/api/sms/inbound`.
- **HEIC is common from iPhones.** Converted to JPEG (quality 95) at ingest time via sharp. The existing `ensureMinimumResolution` pipeline handles upscaling during extraction.
- **Always return 200 with TwiML XML.** Non-200 causes Twilio retry loops (same pattern as Resend webhooks).
- **`waitUntil` for extraction must await the promise.** Same lesson as DOC-62 email forwarding.
- **Reply messages must be under 160 chars** to avoid multi-segment SMS charges.
```

- [ ] **Step 4: Commit**

```bash
git add .env.example CLAUDE.md
git commit -m "docs: add Twilio env vars and SMS gotchas (DOC-141)"
```

---

### Task 16: Build, lint, and verify

**Files:** None (verification only)

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Expected: Zero warnings, zero errors.

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Run tests**

```bash
npm run test
```

Expected: All existing tests pass. New code doesn't break anything.

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 5: Fix any issues found**

If lint, types, tests, or build fail, fix the issues and re-run until clean.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve lint/type/build issues (DOC-141)"
```

---

### Task 17: Manual smoke test

**Files:** None (testing only)

- [ ] **Step 1: Start dev server**

```bash
npm run dev -- --port 3000
```

- [ ] **Step 2: Test Settings UI**

1. Navigate to `localhost:3000/settings`
2. Verify the SMS Ingestion card appears below Email Forwarding
3. Click "Add Phone Number" -- verify input appears
4. Enter your phone number and click "Send Code"
5. Enter the code and verify
6. Verify the card shows your number + the Docket toll-free number
7. Test "Remove Phone Number" flow

- [ ] **Step 3: Test inbound webhook (via ngrok or Twilio console)**

Set up a tunnel to test the webhook locally:

```bash
ngrok http 3000
```

Update the Twilio webhook URL to `https://<ngrok-url>/api/sms/inbound` temporarily.

1. Text a photo to the Docket number from your verified phone
2. Check server logs for `sms_inbound_received` and `sms_ingest_success`
3. Verify the invoice appears in the invoice list with the SMS badge
4. Verify extraction runs and invoice reaches `pending_review`
5. Text from an unregistered number -- verify the "not registered" reply
6. Text without an attachment -- verify the "attach a photo" reply

- [ ] **Step 4: Reset Twilio webhook URL**

Set the webhook URL back to `https://dockett.app/api/sms/inbound` for production.
