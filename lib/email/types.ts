// Types for inbound email ingestion
// Separate from outbound email infrastructure (send.ts, triggers.ts, templates/)

/** Attachment metadata from the webhook (no content -- must be fetched separately) */
export interface AttachmentMeta {
  id: string;
  filename: string;
  contentType: string;
}

/** Attachment with content fetched from Resend API */
export interface EmailAttachment {
  filename: string;
  contentType: string;
  sizeBytes: number;
  content: Buffer;
}

export interface ParsedEmail {
  emailId: string;
  from: string;
  to: string[];
  subject: string;
  messageId: string;
  receivedAt: string; // ISO timestamp
  attachmentMetas: AttachmentMeta[];
  /** HTML body of the email (if present). Preferred over textBody for extraction. */
  htmlBody?: string;
  /** Plain text body of the email (fallback when no HTML). */
  textBody?: string;
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
