import {
  validateFileMagicBytes,
  validateFileSize,
} from "@/lib/upload/validate";
import type {
  ParsedEmail,
  EmailAttachment,
  ValidatedAttachment,
} from "./types";

/** MIME types we accept from email attachments */
const SUPPORTED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

/**
 * Parse the Resend Inbound webhook payload into a structured ParsedEmail.
 *
 * Resend POSTs a JSON payload with these fields:
 * - from, to, subject, message_id, created_at
 * - attachments: Array<{ filename, content_type, content (base64) }>
 */
export function parseInboundEmail(payload: Record<string, unknown>): ParsedEmail {
  const from = String(payload.from ?? "");
  const to = Array.isArray(payload.to) ? payload.to.map(String) : [String(payload.to ?? "")];
  const subject = String(payload.subject ?? "(no subject)");
  const messageId = String(payload.message_id ?? payload.messageId ?? "");
  const receivedAt = String(payload.created_at ?? new Date().toISOString());

  const rawAttachments = Array.isArray(payload.attachments)
    ? payload.attachments
    : [];

  const attachments: EmailAttachment[] = rawAttachments
    .filter(
      (att: Record<string, unknown>) =>
        att && typeof att.content === "string" && att.content.length > 0
    )
    .map((att: Record<string, unknown>) => {
      const content = Buffer.from(String(att.content), "base64");
      return {
        filename: String(att.filename ?? "attachment"),
        contentType: String(att.content_type ?? att.contentType ?? "application/octet-stream"),
        sizeBytes: content.length,
        content,
      };
    });

  return { from, to, subject, messageId, receivedAt, attachments };
}

/**
 * Validate and filter attachments from a parsed email.
 * Returns valid attachments and a list of rejected ones with reasons.
 */
export function validateAttachments(attachments: EmailAttachment[]): {
  valid: ValidatedAttachment[];
  rejected: Array<{ filename: string; reason: string }>;
} {
  const valid: ValidatedAttachment[] = [];
  const rejected: Array<{ filename: string; reason: string }> = [];

  for (const att of attachments) {
    // Skip inline images (cid: references)
    if (att.filename.startsWith("cid:") || att.contentType.startsWith("image/") && att.sizeBytes < 1024) {
      // Tiny images are likely inline/signature images, skip silently
      continue;
    }

    // Check file size
    if (!validateFileSize(att.sizeBytes)) {
      rejected.push({
        filename: att.filename,
        reason: `File exceeds 10MB limit (${Math.round(att.sizeBytes / 1024 / 1024)}MB)`,
      });
      continue;
    }

    // Check if content type is supported
    if (!SUPPORTED_TYPES.has(att.contentType)) {
      rejected.push({
        filename: att.filename,
        reason: `Unsupported file type: ${att.contentType}`,
      });
      continue;
    }

    // Validate magic bytes
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
