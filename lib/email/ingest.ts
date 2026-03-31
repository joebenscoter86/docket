import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";
import { enqueueExtraction } from "@/lib/extraction/queue";
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";
import type { ValidatedAttachment, IngestionResult } from "./types";

/**
 * Ingest an email body (HTML or plain text) as an invoice.
 *
 * Used when an inbound email has no attachments but contains body content
 * that may be an inline invoice (e.g., a forwarded invoice pasted into
 * the email body rather than attached as a PDF).
 *
 * Steps:
 * 1. Save body content to Supabase Storage as .html or .txt
 * 2. Compute file hash for duplicate detection
 * 3. Create invoice row with source='email'
 * 4. Enqueue extraction (Claude reads HTML/text as a text block)
 */
export async function ingestEmailBody(params: {
  orgId: string;
  userId: string;
  htmlBody?: string;
  textBody?: string;
  emailSender: string;
  emailSubject: string;
}): Promise<IngestionResult> {
  const { orgId, userId, htmlBody, textBody, emailSender, emailSubject } = params;

  // Prefer HTML (preserves table layout for invoice extraction), fall back to plain text
  const body = htmlBody ?? textBody;
  if (!body) {
    return { invoiceId: "", fileName: "", status: "error", error: "No body content" };
  }

  const isHtml = !!htmlBody;
  const mimeType = isHtml ? "text/html" : "text/plain";
  const extension = isHtml ? "html" : "txt";
  const fileName = `email-body.${extension}`;
  const content = Buffer.from(body, "utf-8");

  const admin = createAdminClient();
  const invoiceId = crypto.randomUUID();
  const storagePath = `${orgId}/${invoiceId}/${fileName}`;

  try {
    // 1. Upload to Supabase Storage
    const { error: uploadError } = await admin.storage
      .from("invoices")
      .upload(storagePath, content, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      logger.error("email_ingest_body_storage_failed", {
        orgId,
        invoiceId,
        error: uploadError.message,
      });
      return { invoiceId, fileName, status: "error", error: "Storage upload failed" };
    }

    // 2. Compute file hash
    const fileHash = createHash("sha256").update(content).digest("hex");

    // 3. Create invoice row
    const { error: insertError } = await admin
      .from("invoices")
      .insert({
        id: invoiceId,
        org_id: orgId,
        status: "uploaded",
        file_path: storagePath,
        file_name: fileName,
        file_type: mimeType,
        file_size_bytes: content.length,
        file_hash: fileHash,
        source: "email",
        email_sender: emailSender,
        email_subject: emailSubject,
      });

    if (insertError) {
      logger.error("email_ingest_body_db_insert_failed", {
        orgId,
        invoiceId,
        error: insertError.message,
      });
      await admin.storage.from("invoices").remove([storagePath]);
      return { invoiceId, fileName, status: "error", error: "Database insert failed" };
    }

    // 4. Enqueue extraction (awaited -- caller wraps in waitUntil)
    try {
      await enqueueExtraction({
        invoiceId,
        orgId,
        userId,
        filePath: storagePath,
        fileType: mimeType,
      });
    } catch (err) {
      logger.error("email_ingest_body_extraction_failed", {
        orgId,
        invoiceId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Extraction failed but invoice was created -- user can retry from UI
    }

    trackServerEvent(userId, AnalyticsEvents.EMAIL_INGESTION_PROCESSED, {
      orgId,
      invoiceId,
      source: "email_body",
      fileName,
    });

    logger.info("email_ingest_body_success", {
      orgId,
      userId,
      invoiceId,
      fileHash,
      mimeType,
      bodyLength: content.length,
      status: "queued",
    });

    return { invoiceId, fileName, status: "queued" };
  } catch (err) {
    logger.error("email_ingest_body_unexpected_error", {
      orgId,
      invoiceId,
      error: err instanceof Error ? err.message : String(err),
      exception: err instanceof Error ? err : undefined,
    });
    return {
      invoiceId,
      fileName,
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Ingest a single email attachment into the invoice pipeline.
 *
 * Steps:
 * 1. Upload to Supabase Storage
 * 2. Compute file hash for duplicate detection
 * 3. Create invoice row with source='email'
 * 4. Enqueue extraction (async via concurrency limiter)
 *
 * Reuses the same Storage path pattern and extraction queue as manual uploads.
 */
export async function ingestEmailAttachment(params: {
  orgId: string;
  userId: string;
  attachment: ValidatedAttachment;
  emailSender: string;
  emailSubject: string;
}): Promise<IngestionResult> {
  const { orgId, userId, attachment, emailSender, emailSubject } = params;
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
      logger.error("email_ingest_storage_failed", {
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
    const { error: insertError } = await admin
      .from("invoices")
      .insert({
        id: invoiceId,
        org_id: orgId,
        status: "uploaded",
        file_path: storagePath,
        file_name: attachment.filename,
        file_type: attachment.detectedType,
        file_size_bytes: attachment.sizeBytes,
        file_hash: fileHash,
        source: "email",
        email_sender: emailSender,
        email_subject: emailSubject,
      });

    if (insertError) {
      logger.error("email_ingest_db_insert_failed", {
        orgId,
        invoiceId,
        error: insertError.message,
      });
      // Clean up orphaned storage file
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
      logger.error("email_ingest_extraction_failed", {
        orgId,
        invoiceId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Extraction failed but invoice was created -- user can retry from UI
    }

    trackServerEvent(userId, AnalyticsEvents.EMAIL_INGESTION_PROCESSED, {
      orgId,
      invoiceId,
      source: "email",
      fileName: attachment.filename,
    });

    logger.info("email_ingest_success", {
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
    logger.error("email_ingest_unexpected_error", {
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
