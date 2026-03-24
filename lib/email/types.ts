// Types for inbound email ingestion
// Separate from outbound email infrastructure (send.ts, triggers.ts, templates/)

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
