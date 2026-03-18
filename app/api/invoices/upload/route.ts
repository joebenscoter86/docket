import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateFileMagicBytes, validateFileSize } from "@/lib/upload/validate";
import { checkInvoiceAccess } from "@/lib/billing/access";
import {
  authError,
  forbiddenError,
  validationError,
  internalError,
  apiSuccess,
  subscriptionRequired,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { runExtraction } from "@/lib/extraction/run";

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
    const { data: membership, error: membershipError } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .single();

    if (membershipError || !membership) {
      logger.warn("invoice_upload_no_org", { userId });
      return forbiddenError("No organization found. Please contact support.");
    }
    orgId = membership.org_id;

    // 2b. Subscription check
    const access = await checkInvoiceAccess(user.id);
    if (!access.allowed) {
      logger.warn("invoice_upload_access_denied", {
        action: "upload",
        userId: user.id,
        orgId,
        reason: access.reason,
        subscriptionStatus: access.subscriptionStatus,
        trialExpired: access.trialExpired,
      });
      return subscriptionRequired("Subscription required to upload invoices.", {
        subscriptionStatus: access.subscriptionStatus,
        trialExpired: access.trialExpired,
      });
    }

    // 3. Parse form data
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return validationError("No file provided.");
    }

    // Extract file metadata — File extends Blob, but in some environments
    // FormData may return a Blob with a name property instead of a File instance.
    const fileName = file instanceof File ? file.name : (file as Blob & { name?: string }).name || "upload";
    const fileType = file.type;
    const fileSize = file.size;

    // 4. Server-side validation
    if (!validateFileSize(fileSize)) {
      return validationError("File exceeds 10MB limit.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
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

    // 5. Upload to Supabase Storage
    const admin = createAdminClient();
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
    const { error: insertError } = await admin
      .from("invoices")
      .insert({
        id: invoiceId,
        org_id: orgId,
        status: "uploading",
        file_path: storagePath,
        file_name: fileName,
        file_type: fileType,
        file_size_bytes: fileSize,
      })
      .select("id")
      .single();

    if (insertError) {
      logger.error("invoice_upload_db_insert_failed", {
        userId,
        orgId,
        invoiceId,
        error: insertError.message,
      });
      return internalError("Upload failed. Please try again.");
    }

    // 7. Update status to extracting
    const { error: updateError } = await admin
      .from("invoices")
      .update({ status: "extracting" })
      .eq("id", invoiceId);

    if (updateError) {
      logger.error("invoice_upload_status_update_failed", {
        userId,
        orgId,
        invoiceId,
        error: updateError.message,
      });
      // Non-fatal: invoice exists, extraction can still proceed
    }

    // 8. Generate signed URL
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
      durationMs,
      status: "success",
    });

    // 9. Auto-trigger extraction (fire-and-forget)
    // Extraction progress is tracked via realtime subscription on the client.
    // Don't block the upload response — return immediately so the progress bar completes.
    runExtraction({
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
    });

    return apiSuccess({
      invoiceId,
      fileName,
      signedUrl: signedUrlData?.signedUrl || null,
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
