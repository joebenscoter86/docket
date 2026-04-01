import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/supabase/helpers";
import { validateFileMagicBytes, validateFileSize, isZipFile, MAX_ZIP_SIZE } from "@/lib/upload/validate";
import { extractZipFiles } from "@/lib/upload/zip";
import { checkInvoiceAccess } from "@/lib/billing/access";
import { checkUsageLimit } from "@/lib/billing/usage";
import { incrementTrialInvoice } from "@/lib/billing/trial";
import { TRIAL_INVOICE_LIMIT } from "@/lib/billing/tiers";
import {
  authError,
  forbiddenError,
  validationError,
  internalError,
  apiSuccess,
  subscriptionRequired,
  usageLimitError,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { enqueueExtraction } from "@/lib/extraction/queue";
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";
import { sendTrialExhaustedEmail, sendTrialProgressEmail } from "@/lib/email/triggers";
import { waitUntil } from "@vercel/functions";
import type { DuplicateWarning } from "@/lib/types/invoice";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH_SIZE_CAP = 25;

export async function POST(request: Request) {
  const startTime = Date.now();
  let userId: string | undefined;
  let orgId: string | undefined;

  try {
    // 1. Auth check
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.warn("invoice_upload_auth_failed", { status: "unauthorized" });
      return authError();
    }
    userId = user.id;

    // 2. Org lookup
    const resolvedOrgId = await getActiveOrgId(supabase, user.id);
    if (!resolvedOrgId) {
      logger.warn("invoice_upload_no_org", { userId });
      return forbiddenError("No organization found. Please contact support.");
    }
    orgId = resolvedOrgId;

    // 2b. Subscription check
    const access = await checkInvoiceAccess(user.id);
    if (!access.allowed) {
      logger.warn("invoice_upload_access_denied", {
        action: "upload",
        userId: user.id,
        orgId,
        reason: access.reason,
        subscriptionStatus: access.subscriptionStatus,
        trialExhausted: access.trialExhausted,
      });
      // Fire-and-forget trial exhausted email if applicable (deduped in trigger)
      if (access.trialExhausted) {
        sendTrialExhaustedEmail(user.id, TRIAL_INVOICE_LIMIT);
      }

      return subscriptionRequired("Subscription required to upload invoices.", {
        subscriptionStatus: access.subscriptionStatus,
        trialExhausted: access.trialExhausted,
      });
    }

    // 2b-ii. Trial invoice reservation (atomic, race-safe)
    let trialNewCount: number | null = null;
    if (access.allowed && access.reason === "trial") {
      const increment = await incrementTrialInvoice(user.id);
      if (!increment.success) {
        logger.warn("invoice_upload_trial_exhausted_race", {
          action: "upload",
          userId: user.id,
          orgId,
        });
        // Fire-and-forget trial exhausted email (deduped in trigger)
        sendTrialExhaustedEmail(user.id, TRIAL_INVOICE_LIMIT);

        return subscriptionRequired("Trial limit reached. Choose a plan to continue.", {
          trialExhausted: true,
        });
      }
      trialNewCount = increment.newCount;

      // Fire trial-progress email at 8/10 (deduped in trigger)
      if (trialNewCount === 8) {
        sendTrialProgressEmail(user.id, trialNewCount, TRIAL_INVOICE_LIMIT);
      }
    }

    // 2c. Monthly usage limit check
    const usageCheck = await checkUsageLimit(orgId!, user.id);
    if (!usageCheck.allowed) {
      logger.warn("invoice_upload_usage_limit", {
        action: "upload",
        userId: user.id,
        orgId,
        used: usageCheck.usage.used,
        limit: usageCheck.usage.limit,
      });
      return usageLimitError("Monthly invoice limit reached (100/month).", {
        used: usageCheck.usage.used,
        limit: usageCheck.usage.limit,
        resetsAt: usageCheck.usage.periodEnd.toISOString(),
      });
    }

    // Initialize admin client early — needed for both zip and non-zip paths
    const admin = createAdminClient();

    // 3. Parse form data
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return validationError("No file provided.");
    }

    // 3b. Parse optional batch_id
    const rawBatchId = formData.get("batch_id");
    let batchId: string | null = null;
    if (rawBatchId) {
      const batchIdStr = String(rawBatchId);
      if (!UUID_REGEX.test(batchIdStr)) {
        return validationError("batch_id must be a valid UUID.");
      }
      batchId = batchIdStr;
    }

    // Extract file metadata — File extends Blob, but in some environments
    // FormData may return a Blob with a name property instead of a File instance.
    const fileName = file instanceof File ? file.name : (file as Blob & { name?: string }).name || "upload";
    const fileType = file.type;
    const fileSize = file.size;

    // 4. Server-side validation
    const buffer = Buffer.from(await file.arrayBuffer());
    const isZip = isZipFile(buffer);

    if (!isZip && !validateFileSize(fileSize)) {
      return validationError("File exceeds 10MB limit.");
    }
    if (isZip && fileSize > MAX_ZIP_SIZE) {
      return validationError("Zip file exceeds 50MB limit.");
    }

    const magicResult = validateFileMagicBytes(buffer, fileType);

    if (!magicResult.valid) {
      logger.warn("invoice_upload_invalid_magic_bytes", {
        userId,
        orgId,
        fileName,
        claimedType: fileType,
        error: magicResult.error,
      });
      return validationError(
        magicResult.error || "File content does not match expected type."
      );
    }

    // 4b. ZIP UPLOAD PATH — handle before the single-file path
    if (isZip) {
      const zipResult = await extractZipFiles(buffer);

      if (zipResult.files.length === 0) {
        return validationError(
          "No supported files found in zip. Only PDF, JPG, and PNG files are accepted.",
          { skippedFiles: zipResult.skipped }
        );
      }

      // Enforce batch size cap
      if (zipResult.files.length > BATCH_SIZE_CAP) {
        return validationError(
          `Zip contains ${zipResult.files.length} files. Maximum ${BATCH_SIZE_CAP} per upload.`
        );
      }

      // Generate batch ID for the group
      const zipBatchId = crypto.randomUUID();
      const invoiceIds: string[] = [];

      for (const extractedFile of zipResult.files) {
        const fileInvoiceId = crypto.randomUUID();
        const fileHash = createHash("sha256").update(extractedFile.buffer).digest("hex");
        const storagePath = `${orgId}/${fileInvoiceId}/${extractedFile.name}`;

        // Upload to storage
        const { error: fileUploadError } = await admin.storage
          .from("invoices")
          .upload(storagePath, extractedFile.buffer, {
            contentType: extractedFile.mimeType,
            upsert: false,
          });

        if (fileUploadError) {
          logger.error("zip_file_upload_storage_failed", {
            userId, orgId, invoiceId: fileInvoiceId,
            fileName: extractedFile.name,
            error: fileUploadError.message,
          });
          continue;
        }

        // Create invoice row
        const { error: fileInsertError } = await admin
          .from("invoices")
          .insert({
            id: fileInvoiceId,
            org_id: orgId,
            status: "uploaded",
            file_path: storagePath,
            file_name: extractedFile.name,
            file_type: extractedFile.mimeType,
            file_size_bytes: extractedFile.sizeBytes,
            file_hash: fileHash,
            uploaded_by: userId,
            batch_id: zipBatchId,
          });

        if (fileInsertError) {
          logger.error("zip_file_db_insert_failed", {
            userId, orgId, invoiceId: fileInvoiceId,
            error: fileInsertError.message,
          });
          await admin.storage.from("invoices").remove([storagePath]);
          continue;
        }

        invoiceIds.push(fileInvoiceId);

        // Enqueue extraction (fire-and-forget)
        waitUntil(
          enqueueExtraction({
            invoiceId: fileInvoiceId,
            orgId: orgId!,
            userId: userId!,
            filePath: storagePath,
            fileType: extractedFile.mimeType,
          }).catch(() => {
            logger.warn("zip_file_extraction_failed", {
              userId, orgId, invoiceId: fileInvoiceId,
            });
          })
        );
      }

      const durationMs = Date.now() - startTime;
      logger.info("zip_upload_success", {
        userId, orgId, batchId: zipBatchId,
        totalFiles: zipResult.files.length + zipResult.skipped.length,
        processedFiles: invoiceIds.length,
        skippedFiles: zipResult.skipped.length,
        durationMs,
      });

      trackServerEvent(userId!, AnalyticsEvents.INVOICE_UPLOADED, {
        fileType: "application/zip",
        fileSizeBytes: fileSize,
        batchSize: invoiceIds.length,
      });

      return apiSuccess({
        batchId: zipBatchId,
        invoiceIds,
        totalFiles: zipResult.files.length + zipResult.skipped.length,
        processedFiles: invoiceIds.length,
        skippedFiles: zipResult.skipped,
      });
    }

    // 4c. Compute file hash for duplicate detection (single-file path)
    const fileHash = createHash("sha256").update(buffer).digest("hex");

    // 4d. Batch size cap enforcement
    if (batchId) {
      const { count, error: countError } = await admin
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", batchId);

      if (countError) {
        logger.error("invoice_upload_batch_count_failed", {
          userId,
          orgId,
          batchId,
          error: countError.message,
        });
        return internalError("Upload failed. Please try again.");
      }

      if ((count ?? 0) >= BATCH_SIZE_CAP) {
        logger.warn("invoice_upload_batch_size_exceeded", {
          userId,
          orgId,
          batchId,
          count,
          cap: BATCH_SIZE_CAP,
        });
        return validationError(
          `Batch limit reached. Maximum ${BATCH_SIZE_CAP} invoices per batch.`
        );
      }
    }

    // 4e. Check for file hash duplicates (advisory only, never blocks upload)
    let duplicateWarning: DuplicateWarning | null = null;
    try {
      const { data: hashMatches } = await admin
        .from("invoices")
        .select("id, file_name, status, uploaded_at")
        .eq("org_id", orgId)
        .eq("file_hash", fileHash)
        .neq("status", "error")
        .limit(5);

      if (hashMatches && hashMatches.length > 0) {
        duplicateWarning = {
          type: "file_hash",
          message: "This file has been uploaded before.",
          matches: hashMatches.map((m) => ({
            invoiceId: m.id,
            fileName: m.file_name,
            status: m.status,
            uploadedAt: m.uploaded_at,
          })),
        };
        logger.info("invoice_upload_hash_duplicate_found", {
          userId, orgId, fileHash, matchCount: hashMatches.length,
        });
      }
    } catch (err) {
      logger.warn("invoice_upload_hash_check_failed", {
        userId, orgId, error: err instanceof Error ? err.message : String(err),
      });
    }

    // 5. Upload to Supabase Storage
    const invoiceId = crypto.randomUUID();
    const storagePath = `${orgId}/${invoiceId}/${fileName}`;

    const { error: uploadError } = await admin.storage
      .from("invoices")
      .upload(storagePath, buffer, {
        contentType: fileType,
        upsert: false,
      });

    if (uploadError) {
      logger.error("invoice_upload_storage_failed", {
        userId,
        orgId,
        invoiceId,
        error: uploadError.message,
      });
      return internalError("Upload failed. Please try again.");
    }

    // 6. Create invoice row
    const insertData: Record<string, unknown> = {
      id: invoiceId,
      org_id: orgId,
      status: "uploaded",
      file_path: storagePath,
      file_name: fileName,
      file_type: fileType,
      file_size_bytes: fileSize,
      file_hash: fileHash,
      uploaded_by: userId,
    };
    if (batchId) {
      insertData.batch_id = batchId;
    }

    const { error: insertError } = await admin
      .from("invoices")
      .insert(insertData)
      .select("id")
      .single();

    if (insertError) {
      logger.error("invoice_upload_db_insert_failed", {
        userId,
        orgId,
        invoiceId,
        error: insertError.message,
      });

      // Orphan cleanup: delete the uploaded file from storage since DB insert failed
      await admin.storage
        .from("invoices")
        .remove([storagePath])
        .then(({ error: removeError }) => {
          if (removeError) {
            logger.error("invoice_upload_orphan_cleanup_failed", {
              userId,
              orgId,
              invoiceId,
              storagePath,
              error: removeError.message,
            });
          } else {
            logger.info("invoice_upload_orphan_cleanup_success", {
              userId,
              orgId,
              invoiceId,
              storagePath,
            });
          }
        });

      return internalError("Upload failed. Please try again.");
    }

    // 7. Generate signed URL
    const { data: signedUrlData, error: signedUrlError } = await admin.storage
      .from("invoices")
      .createSignedUrl(storagePath, 3600); // 1 hour

    if (signedUrlError) {
      logger.error("invoice_upload_signed_url_failed", {
        userId,
        orgId,
        invoiceId,
        error: signedUrlError.message,
      });
      // Non-fatal: upload succeeded, URL can be regenerated
    }

    const durationMs = Date.now() - startTime;
    logger.info("invoice_upload_success", {
      userId,
      orgId,
      invoiceId,
      fileName,
      fileType,
      fileSizeBytes: fileSize,
      batchId,
      durationMs,
      status: "success",
    });

    trackServerEvent(user.id, AnalyticsEvents.INVOICE_UPLOADED, {
      fileType,
      fileSizeBytes: fileSize,
    });

    // 8. Auto-trigger extraction (fire-and-forget via waitUntil)
    // Extraction progress is tracked via realtime subscription on the client.
    // waitUntil keeps the serverless function alive after the response is sent,
    // so the extraction promise completes instead of being killed by Vercel.
    waitUntil(
      enqueueExtraction({
        invoiceId,
        orgId: orgId!,
        userId: userId!,
        filePath: storagePath,
        fileType,
      }).catch(() => {
        // Extraction failure is non-fatal for the upload response.
        // Invoice status is already set to 'error' by runExtraction.
        // User can retry via the extract endpoint.
        logger.warn("invoice_upload_extraction_failed", {
          userId,
          orgId,
          invoiceId,
          status: "extraction_failed",
        });
      })
    );

    return apiSuccess({
      invoiceId,
      fileName,
      signedUrl: signedUrlData?.signedUrl || null,
      duplicateWarning,
      ...(trialNewCount !== null && trialNewCount >= 0 && {
        trialRemaining: TRIAL_INVOICE_LIMIT - trialNewCount,
      }),
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error("invoice_upload_unexpected_error", {
      userId,
      orgId,
      durationMs,
      error: error instanceof Error ? error.message : "unknown",
    });
    return internalError("Upload failed. Please try again.");
  }
}
