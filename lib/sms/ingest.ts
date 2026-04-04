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
      return { invoiceId, fileName: attachment.filename, status: "error", error: "Storage upload failed" };
    }

    const fileHash = createHash("sha256").update(attachment.content).digest("hex");

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
      logger.error("sms_ingest_db_insert_failed", { orgId, invoiceId, error: insertError.message });
      await admin.storage.from("invoices").remove([storagePath]);
      return { invoiceId, fileName: attachment.filename, status: "error", error: "Database insert failed" };
    }

    try {
      await enqueueExtraction({ invoiceId, orgId, userId, filePath: storagePath, fileType: attachment.detectedType });
    } catch (err) {
      logger.error("sms_ingest_extraction_failed", {
        orgId, invoiceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    trackServerEvent(userId, AnalyticsEvents.SMS_INGESTION_PROCESSED, {
      orgId, invoiceId, source: "sms", fileName: attachment.filename,
    });

    logger.info("sms_ingest_success", {
      orgId, userId, invoiceId, filename: attachment.filename, fileHash, status: "queued",
    });

    return { invoiceId, fileName: attachment.filename, status: "queued" };
  } catch (err) {
    logger.error("sms_ingest_unexpected_error", {
      orgId, invoiceId, filename: attachment.filename,
      error: err instanceof Error ? err.message : String(err),
      exception: err instanceof Error ? err : undefined,
    });
    return {
      invoiceId, fileName: attachment.filename, status: "error",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
