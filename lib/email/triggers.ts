import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "./send";
import { ExtractionCompleteEmail } from "./templates/extraction-complete";
import { BatchCompleteEmail } from "./templates/batch-complete";
import { SyncSuccessEmail } from "./templates/sync-success";
import { SyncFailureEmail } from "./templates/sync-failure";
import { TrialExhaustedEmail } from "./templates/trial-exhausted";
import { TrialProgressEmail } from "./templates/trial-progress";
import { NoUploadNudgeEmail } from "./templates/no-upload-nudge";
import { NoSyncNudgeEmail } from "./templates/no-sync-nudge";
import { PostTrialFollowupEmail } from "./templates/post-trial-followup";
import { SubscriptionActivatedEmail } from "./templates/subscription-activated";
import { SubscriptionCancelledEmail } from "./templates/subscription-cancelled";
import { ConnectionExpiringEmail } from "./templates/connection-expiring";
import { IngestionNoAttachmentEmail } from "./templates/ingestion-no-attachment";
import { IngestionErrorEmail } from "./templates/ingestion-error";
import { logger } from "@/lib/utils/logger";

/**
 * Look up a user's email by ID. Returns null if not found.
 */
async function getUserEmail(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("users")
    .select("email")
    .eq("id", userId)
    .single();
  return data?.email ?? null;
}

/**
 * Check if a user has a specific notification preference enabled.
 * Defaults to true for extraction/sync, false for marketing.
 */
async function checkPreference(
  userId: string,
  preference: "extraction_notifications" | "sync_notifications" | "billing_notifications" | "marketing_emails"
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("email_preferences")
    .select("extraction_notifications, sync_notifications, billing_notifications, marketing_emails")
    .eq("user_id", userId)
    .single();

  if (!data) {
    // No preferences row yet -- use defaults
    return preference !== "marketing_emails";
  }

  return (data as Record<string, boolean>)[preference] ?? true;
}

/**
 * Check if an email of this type was already sent (dedup guard).
 */
async function wasAlreadySent(
  userId: string,
  emailType: string,
  metadata?: Record<string, string>
): Promise<boolean> {
  const admin = createAdminClient();
  let query = admin
    .from("email_log")
    .select("id")
    .eq("user_id", userId)
    .eq("email_type", emailType)
    .limit(1);

  // For invoice-specific emails, check metadata match
  if (metadata?.invoiceId) {
    query = query.contains("metadata", { invoiceId: metadata.invoiceId });
  }

  const { data } = await query;
  return (data?.length ?? 0) > 0;
}

/**
 * Log an email send for dedup and audit.
 */
async function logEmail(params: {
  userId: string;
  emailAddress: string;
  emailType: string;
  subject: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("email_log").insert({
      user_id: params.userId,
      email_address: params.emailAddress,
      email_type: params.emailType,
      subject: params.subject,
      metadata: params.metadata ?? null,
    });
  } catch (err) {
    logger.error("email_log_insert_failed", {
      emailType: params.emailType,
      userId: params.userId,
      error: String(err),
    });
  }
}

// ------------------------------------------------------------------
// Trigger functions
// ------------------------------------------------------------------

export async function sendExtractionCompleteEmail(
  userId: string,
  invoiceId: string,
  invoiceFileName: string,
  vendorName: string | null,
  totalAmount: string | null,
  confidence: "high" | "medium" | "low"
): Promise<void> {
  try {
    if (!(await checkPreference(userId, "extraction_notifications"))) return;

    const email = await getUserEmail(userId);
    if (!email) return;

    const subject = `Invoice extracted: ${vendorName || invoiceFileName}`;
    await sendEmail({
      to: email,
      subject,
      react: ExtractionCompleteEmail({
        invoiceFileName,
        vendorName,
        totalAmount,
        confidence,
        reviewUrl: `/invoices/${invoiceId}/review`,
      }),
    });

    await logEmail({
      userId,
      emailAddress: email,
      emailType: "extraction_complete",
      subject,
      metadata: { invoiceId },
    });
  } catch (err) {
    logger.error("email_trigger_extraction_complete_failed", {
      userId,
      invoiceId,
      error: String(err),
    });
  }
}

export async function sendBatchCompleteEmail(
  userId: string,
  batchId: string,
  totalCount: number,
  successCount: number
): Promise<void> {
  try {
    if (!(await checkPreference(userId, "extraction_notifications"))) return;

    const email = await getUserEmail(userId);
    if (!email) return;

    const failedCount = totalCount - successCount;
    const subject = `Batch extraction complete: ${successCount} of ${totalCount} invoices ready`;
    await sendEmail({
      to: email,
      subject,
      react: BatchCompleteEmail({ totalCount, successCount, failedCount }),
    });

    await logEmail({
      userId,
      emailAddress: email,
      emailType: "batch_complete",
      subject,
      metadata: { batchId },
    });
  } catch (err) {
    logger.error("email_trigger_batch_complete_failed", {
      userId,
      batchId,
      error: String(err),
    });
  }
}

export async function sendSyncSuccessEmail(
  userId: string,
  invoiceId: string,
  invoiceFileName: string,
  vendorName: string,
  totalAmount: string,
  provider: "quickbooks" | "xero",
  providerBillId: string
): Promise<void> {
  try {
    if (!(await checkPreference(userId, "sync_notifications"))) return;

    const email = await getUserEmail(userId);
    if (!email) return;

    const subject = `Invoice synced: ${vendorName} - ${totalAmount}`;
    await sendEmail({
      to: email,
      subject,
      react: SyncSuccessEmail({
        invoiceFileName,
        vendorName,
        totalAmount,
        provider,
        providerBillId,
      }),
    });

    await logEmail({
      userId,
      emailAddress: email,
      emailType: "sync_success",
      subject,
      metadata: { invoiceId, provider },
    });
  } catch (err) {
    logger.error("email_trigger_sync_success_failed", {
      userId,
      invoiceId,
      error: String(err),
    });
  }
}

export async function sendSyncFailureEmail(
  userId: string,
  invoiceId: string,
  invoiceFileName: string,
  vendorName: string | null,
  provider: "quickbooks" | "xero",
  errorMessage: string
): Promise<void> {
  try {
    if (!(await checkPreference(userId, "sync_notifications"))) return;

    const email = await getUserEmail(userId);
    if (!email) return;

    const subject = `Sync failed: ${vendorName || invoiceFileName}`;
    await sendEmail({
      to: email,
      subject,
      react: SyncFailureEmail({
        invoiceFileName,
        vendorName,
        provider,
        errorMessage,
        reviewUrl: `/invoices/${invoiceId}/review`,
      }),
    });

    await logEmail({
      userId,
      emailAddress: email,
      emailType: "sync_failure",
      subject,
      metadata: { invoiceId, provider, errorMessage },
    });
  } catch (err) {
    logger.error("email_trigger_sync_failure_failed", {
      userId,
      invoiceId,
      error: String(err),
    });
  }
}

export async function sendTrialExhaustedEmail(
  userId: string,
  invoicesProcessed: number
): Promise<void> {
  try {
    // Dedup: only send once per user
    if (await wasAlreadySent(userId, "trial_exhausted")) return;

    const email = await getUserEmail(userId);
    if (!email) return;

    const subject = "Your Docket trial has ended";
    await sendEmail({
      to: email,
      subject,
      react: TrialExhaustedEmail({ invoicesProcessed }),
    });

    await logEmail({
      userId,
      emailAddress: email,
      emailType: "trial_exhausted",
      subject,
    });
  } catch (err) {
    logger.error("email_trigger_trial_exhausted_failed", {
      userId,
      error: String(err),
    });
  }
}

export async function sendSubscriptionActivatedEmail(
  userId: string,
  tierName: string,
  monthlyPrice: string,
  invoiceCap: number
): Promise<void> {
  try {
    const email = await getUserEmail(userId);
    if (!email) return;

    const subject = `Your Docket ${tierName} plan is active`;
    await sendEmail({
      to: email,
      subject,
      react: SubscriptionActivatedEmail({ tierName, monthlyPrice, invoiceCap }),
    });

    await logEmail({
      userId,
      emailAddress: email,
      emailType: "subscription_activated",
      subject,
      metadata: { tierName },
    });
  } catch (err) {
    logger.error("email_trigger_subscription_activated_failed", {
      userId,
      error: String(err),
    });
  }
}

export async function sendSubscriptionCancelledEmail(
  userId: string,
  tierName: string
): Promise<void> {
  try {
    const email = await getUserEmail(userId);
    if (!email) return;

    const subject = "Your Docket subscription has been cancelled";
    await sendEmail({
      to: email,
      subject,
      react: SubscriptionCancelledEmail({ tierName }),
    });

    await logEmail({
      userId,
      emailAddress: email,
      emailType: "subscription_cancelled",
      subject,
      metadata: { tierName },
    });
  } catch (err) {
    logger.error("email_trigger_subscription_cancelled_failed", {
      userId,
      error: String(err),
    });
  }
}

export async function sendConnectionExpiringEmail(
  userId: string,
  provider: "quickbooks" | "xero",
  expiresAt: string
): Promise<void> {
  try {
    // Dedup: only send once per provider expiry
    if (await wasAlreadySent(userId, `connection_expiring_${provider}`)) return;

    const email = await getUserEmail(userId);
    if (!email) return;

    const providerNames = { quickbooks: "QuickBooks Online", xero: "Xero" };
    const subject = `Your ${providerNames[provider]} connection expires soon`;
    await sendEmail({
      to: email,
      subject,
      react: ConnectionExpiringEmail({ provider, expiresAt }),
    });

    await logEmail({
      userId,
      emailAddress: email,
      emailType: `connection_expiring_${provider}`,
      subject,
      metadata: { provider, expiresAt },
    });
  } catch (err) {
    logger.error("email_trigger_connection_expiring_failed", {
      userId,
      provider,
      error: String(err),
    });
  }
}

export async function sendIngestionNoAttachmentEmail(
  userId: string,
  emailSubject: string
): Promise<void> {
  try {
    if (!(await checkPreference(userId, "extraction_notifications"))) return;
    const email = await getUserEmail(userId);
    if (!email) return;
    const subject = "No invoice attachment found in your email";
    await sendEmail({
      to: email,
      subject,
      react: IngestionNoAttachmentEmail({ emailSubject }),
    });
    await logEmail({
      userId,
      emailAddress: email,
      emailType: "ingestion_no_attachment",
      subject,
      metadata: { emailSubject },
    });
  } catch (err) {
    logger.error("email_trigger_ingestion_no_attachment_failed", {
      userId,
      error: String(err),
    });
  }
}

export async function sendIngestionErrorEmail(
  userId: string,
  details: {
    type: "invalid_attachments" | "billing" | "usage_limit" | "extraction_failed";
    emailSubject: string;
    message: string;
  }
): Promise<void> {
  try {
    if (!(await checkPreference(userId, "extraction_notifications"))) return;
    const email = await getUserEmail(userId);
    if (!email) return;
    const subject = "Issue processing your forwarded invoice";
    await sendEmail({
      to: email,
      subject,
      react: IngestionErrorEmail(details),
    });
    await logEmail({
      userId,
      emailAddress: email,
      emailType: "ingestion_error",
      subject,
      metadata: { type: details.type, emailSubject: details.emailSubject },
    });
  } catch (err) {
    logger.error("email_trigger_ingestion_error_failed", {
      userId,
      error: String(err),
    });
  }
}

// ------------------------------------------------------------------
// Lifecycle email triggers (used by cron + event triggers)
// ------------------------------------------------------------------

export async function sendTrialProgressEmail(
  userId: string,
  invoicesUsed: number,
  invoiceLimit: number
): Promise<void> {
  try {
    // Dedup: only send once per user
    if (await wasAlreadySent(userId, "trial_progress")) return;

    const email = await getUserEmail(userId);
    if (!email) return;

    const subject = `You've used ${invoicesUsed} of ${invoiceLimit} trial invoices`;
    await sendEmail({
      to: email,
      subject,
      react: TrialProgressEmail({ invoicesUsed, invoiceLimit }),
    });

    await logEmail({
      userId,
      emailAddress: email,
      emailType: "trial_progress",
      subject,
    });
  } catch (err) {
    logger.error("email_trigger_trial_progress_failed", {
      userId,
      error: String(err),
    });
  }
}

export async function sendNoUploadNudgeEmail(
  userId: string
): Promise<void> {
  try {
    if (await wasAlreadySent(userId, "no_upload_nudge")) return;

    if (!(await checkPreference(userId, "marketing_emails"))) {
      // Fall back to billing_notifications for lifecycle nudges
      if (!(await checkPreference(userId, "billing_notifications"))) return;
    }

    const email = await getUserEmail(userId);
    if (!email) return;

    const subject = "Ready to try your first invoice? Just drag a PDF in.";
    await sendEmail({
      to: email,
      subject,
      react: NoUploadNudgeEmail(),
    });

    await logEmail({
      userId,
      emailAddress: email,
      emailType: "no_upload_nudge",
      subject,
    });
  } catch (err) {
    logger.error("email_trigger_no_upload_nudge_failed", {
      userId,
      error: String(err),
    });
  }
}

export async function sendNoSyncNudgeEmail(
  userId: string,
  extractedCount: number
): Promise<void> {
  try {
    if (await wasAlreadySent(userId, "no_sync_nudge")) return;

    if (!(await checkPreference(userId, "marketing_emails"))) {
      if (!(await checkPreference(userId, "billing_notifications"))) return;
    }

    const email = await getUserEmail(userId);
    if (!email) return;

    const subject = `You've extracted ${extractedCount} invoices but haven't synced any yet`;
    await sendEmail({
      to: email,
      subject,
      react: NoSyncNudgeEmail({ extractedCount }),
    });

    await logEmail({
      userId,
      emailAddress: email,
      emailType: "no_sync_nudge",
      subject,
    });
  } catch (err) {
    logger.error("email_trigger_no_sync_nudge_failed", {
      userId,
      error: String(err),
    });
  }
}

export async function sendPostTrialFollowupEmail(
  userId: string,
  sequenceNumber: 1 | 2 | 3,
  invoicesProcessed: number
): Promise<void> {
  try {
    const emailType = `post_trial_followup_${sequenceNumber}`;
    if (await wasAlreadySent(userId, emailType)) return;

    if (!(await checkPreference(userId, "billing_notifications"))) return;

    const email = await getUserEmail(userId);
    if (!email) return;

    const subjects: Record<number, string> = {
      1: "Your extracted data is still here. Pick up where you left off.",
      2: "Still entering invoices by hand? There's a faster way.",
      3: "Last chance: your Docket trial data will be archived soon.",
    };

    const subject = subjects[sequenceNumber];
    await sendEmail({
      to: email,
      subject,
      react: PostTrialFollowupEmail({ sequenceNumber, invoicesProcessed }),
    });

    await logEmail({
      userId,
      emailAddress: email,
      emailType,
      subject,
    });
  } catch (err) {
    logger.error("email_trigger_post_trial_followup_failed", {
      userId,
      sequenceNumber,
      error: String(err),
    });
  }
}

/**
 * Check if a batch is complete (all invoices extracted or errored).
 * If so, send a batch summary email.
 */
export async function checkAndSendBatchCompleteEmail(
  userId: string,
  batchId: string
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: batchInvoices } = await admin
      .from("invoices")
      .select("status")
      .eq("batch_id", batchId);

    if (!batchInvoices || batchInvoices.length === 0) return;

    // Check if any are still processing
    const stillProcessing = batchInvoices.some(
      (inv) => inv.status === "uploaded" || inv.status === "extracting"
    );
    if (stillProcessing) return;

    // All done - count results
    const totalCount = batchInvoices.length;
    const successCount = batchInvoices.filter(
      (inv) => inv.status === "pending_review" || inv.status === "approved" || inv.status === "synced"
    ).length;

    // Dedup: check if batch email was already sent
    if (await wasAlreadySent(userId, "batch_complete", { invoiceId: batchId })) return;

    await sendBatchCompleteEmail(userId, batchId, totalCount, successCount);
  } catch (err) {
    logger.error("email_trigger_batch_check_failed", {
      userId,
      batchId,
      error: String(err),
    });
  }
}
