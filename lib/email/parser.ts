import {
  validateFileMagicBytes,
  validateFileSize,
} from "@/lib/upload/validate";
import { logger } from "@/lib/utils/logger";
import type {
  ParsedEmail,
  AttachmentMeta,
  EmailAttachment,
  ValidatedAttachment,
} from "./types";

/**
 * Extract a bare email address from formats like:
 * - "user@example.com"
 * - "<user@example.com>"
 * - "Display Name <user@example.com>"
 */
function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase().trim();
  const emailMatch = raw.match(/[\w.+-]+@[\w.-]+\.\w+/);
  if (emailMatch) return emailMatch[0].toLowerCase().trim();
  return raw.toLowerCase().trim();
}

/** MIME types we accept from email attachments */
const SUPPORTED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

/**
 * Parse the Resend webhook payload for an email.received event.
 *
 * Resend wraps the email data in a `data` object:
 * { type: "email.received", created_at: "...", data: { email_id, from, to, subject, ... } }
 *
 * Attachments in the webhook are metadata only (id, filename, content_type).
 * Actual content must be fetched separately via the Resend Received Emails API.
 */
export function parseInboundEmail(payload: Record<string, unknown>): ParsedEmail {
  // Unwrap the data object -- handle both wrapped and flat payloads
  const data = (payload.data as Record<string, unknown>) ?? payload;

  const from = extractEmailAddress(String(data.from ?? ""));
  const to = (Array.isArray(data.to) ? data.to.map(String) : [String(data.to ?? "")])
    .map(extractEmailAddress)
    .filter(Boolean);
  const subject = String(data.subject ?? "(no subject)");
  const messageId = String(data.message_id ?? data.messageId ?? "");
  const emailId = String(data.email_id ?? data.emailId ?? "");
  const receivedAt = String(data.created_at ?? payload.created_at ?? new Date().toISOString());

  const rawAttachments = Array.isArray(data.attachments) ? data.attachments : [];

  const attachmentMetas: AttachmentMeta[] = rawAttachments
    .filter((att: Record<string, unknown>) => att && att.filename)
    .map((att: Record<string, unknown>) => ({
      id: String(att.id ?? ""),
      filename: String(att.filename ?? "attachment"),
      contentType: String(att.content_type ?? att.contentType ?? "application/octet-stream"),
    }));

  return { emailId, from, to, subject, messageId, receivedAt, attachmentMetas };
}

/**
 * Fetch attachment content from Resend's Received Emails API.
 * Returns the binary content as a Buffer.
 */
export async function fetchAttachmentContent(
  emailId: string,
  attachmentId: string
): Promise<Buffer | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.error("email_fetch_attachment_no_api_key", {
      error: "RESEND_API_KEY is not configured",
    });
    return null;
  }

  try {
    // Step 1: Get attachment metadata (includes a signed download URL)
    const metaResponse = await fetch(
      `https://api.resend.com/emails/receiving/${emailId}/attachments/${attachmentId}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    if (!metaResponse.ok) {
      logger.error("email_fetch_attachment_meta_failed", {
        emailId,
        attachmentId,
        status: metaResponse.status,
        error: await metaResponse.text(),
      });
      return null;
    }

    const meta = (await metaResponse.json()) as Record<string, unknown>;
    // Resend returns { data: { id, filename, url, ... } }
    const metaData = (meta.data as Record<string, unknown>) ?? meta;
    const downloadUrl = String(metaData.download_url ?? metaData.url ?? "");

    if (!downloadUrl) {
      logger.error("email_fetch_attachment_no_url", {
        emailId,
        attachmentId,
        metaKeys: Object.keys(metaData),
      });
      return null;
    }

    // Step 2: Download the actual file binary from the signed URL
    const fileResponse = await fetch(downloadUrl);
    if (!fileResponse.ok) {
      logger.error("email_fetch_attachment_download_failed", {
        emailId,
        attachmentId,
        status: fileResponse.status,
      });
      return null;
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    logger.error("email_fetch_attachment_error", {
      emailId,
      attachmentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Fetch all supported attachments for an email, returning full EmailAttachment objects.
 * Filters by supported MIME type before fetching (avoids downloading ZIPs, etc.).
 */
export async function fetchEmailAttachments(
  emailId: string,
  metas: AttachmentMeta[]
): Promise<{
  fetched: EmailAttachment[];
  rejected: Array<{ filename: string; reason: string }>;
}> {
  const fetched: EmailAttachment[] = [];
  const rejected: Array<{ filename: string; reason: string }> = [];

  for (const meta of metas) {
    // Pre-filter by content type before fetching
    if (!SUPPORTED_TYPES.has(meta.contentType)) {
      rejected.push({
        filename: meta.filename,
        reason: `Unsupported file type: ${meta.contentType}`,
      });
      continue;
    }

    if (!meta.id) {
      rejected.push({
        filename: meta.filename,
        reason: "Missing attachment ID",
      });
      continue;
    }

    const content = await fetchAttachmentContent(emailId, meta.id);
    if (!content) {
      rejected.push({
        filename: meta.filename,
        reason: "Failed to fetch attachment content from Resend",
      });
      continue;
    }

    fetched.push({
      filename: meta.filename,
      contentType: meta.contentType,
      sizeBytes: content.length,
      content,
    });
  }

  return { fetched, rejected };
}

/**
 * Validate and filter attachments that have already been fetched.
 * Checks file size and magic bytes.
 */
export function validateAttachments(attachments: EmailAttachment[]): {
  valid: ValidatedAttachment[];
  rejected: Array<{ filename: string; reason: string }>;
} {
  const valid: ValidatedAttachment[] = [];
  const rejected: Array<{ filename: string; reason: string }> = [];

  for (const att of attachments) {
    // Skip inline images (cid: references or tiny images)
    if (att.filename.startsWith("cid:") || (att.contentType.startsWith("image/") && att.sizeBytes < 1024)) {
      continue;
    }

    if (!validateFileSize(att.sizeBytes)) {
      rejected.push({
        filename: att.filename,
        reason: `File exceeds 10MB limit (${Math.round(att.sizeBytes / 1024 / 1024)}MB)`,
      });
      continue;
    }

    const magicResult = validateFileMagicBytes(att.content, att.contentType);
    if (!magicResult.valid) {
      rejected.push({
        filename: att.filename,
        reason: magicResult.error ?? "File content does not match expected type",
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
