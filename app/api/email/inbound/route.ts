import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { waitUntil } from "@vercel/functions";
import { logger } from "@/lib/utils/logger";
import {
  parseInboundEmail,
  fetchEmailAttachments,
  validateAttachments,
} from "@/lib/email/parser";
import { getOrgByInboundAddress } from "@/lib/email/address";
import { ingestEmailAttachment } from "@/lib/email/ingest";
import { checkInvoiceAccess } from "@/lib/billing/access";
import { checkUsageLimit } from "@/lib/billing/usage";
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkEmailRateLimit } from "@/lib/email/rate-limit";
import {
  sendIngestionNoAttachmentEmail,
  sendIngestionErrorEmail,
  sendTrialExhaustedEmail,
} from "@/lib/email/triggers";
import { TRIAL_INVOICE_LIMIT } from "@/lib/billing/tiers";

/**
 * Verify the Resend/Svix webhook signature.
 */
function verifyWebhookSignature(
  body: string,
  headers: Headers
): Record<string, unknown> {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("RESEND_INBOUND_WEBHOOK_SECRET is not configured");
  }

  const wh = new Webhook(secret);
  const svixId = headers.get("svix-id") ?? "";
  const svixTimestamp = headers.get("svix-timestamp") ?? "";
  const svixSignature = headers.get("svix-signature") ?? "";

  return wh.verify(body, {
    "svix-id": svixId,
    "svix-timestamp": svixTimestamp,
    "svix-signature": svixSignature,
  }) as Record<string, unknown>;
}

/**
 * POST /api/email/inbound
 *
 * Receives inbound emails from Resend via webhook.
 * Verifies signature, parses email metadata, fetches attachments
 * via Resend API, validates, and routes to the correct org.
 *
 * ALWAYS returns 200 to prevent Resend retry loops.
 * Errors are logged, not surfaced via HTTP status.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  let body: string;
  try {
    body = await request.text();
  } catch {
    logger.error("email_inbound_body_read_failed", {
      error: "Failed to read request body",
    });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Verify webhook signature
  let payload: Record<string, unknown>;
  try {
    payload = verifyWebhookSignature(body, request.headers);
  } catch (err) {
    logger.error("email_inbound_signature_invalid", {
      error: err instanceof Error ? err.message : "Invalid signature",
    });
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 401 }
    );
  }

  // Parse the email metadata (unwraps data from webhook envelope)
  const parsedEmail = parseInboundEmail(payload);

  logger.info("email_inbound_received", {
    emailId: parsedEmail.emailId,
    from: parsedEmail.from,
    subject: parsedEmail.subject,
    messageId: parsedEmail.messageId,
    attachmentCount: parsedEmail.attachmentMetas.length,
    recipients: parsedEmail.to,
  });

  // Find the recipient org
  const recipientAddress = parsedEmail.to[0];
  const orgLookup = await getOrgByInboundAddress(recipientAddress);

  if (!orgLookup) {
    logger.warn("email_inbound_unknown_recipient", {
      to: recipientAddress,
      allTo: parsedEmail.to,
      from: parsedEmail.from,
      status: "ignored",
    });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const { orgId, ownerId } = orgLookup;
  const admin = createAdminClient();

  // Per-org rate limit check (DB-backed: 50/hr, 100/day)
  const rateLimit = await checkEmailRateLimit(orgId);
  if (!rateLimit.allowed) {
    void Promise.resolve(
      admin.from("email_ingestion_log").insert({
        org_id: orgId,
        message_id: parsedEmail.messageId || `no-id-${Date.now()}-ratelimited`,
        sender: parsedEmail.from,
        subject: parsedEmail.subject,
        total_attachment_count: parsedEmail.attachmentMetas.length,
        valid_attachment_count: 0,
        status: "rate_limited" as const,
        rejection_reason: `Rate limited: ${rateLimit.reason}`,
      })
    ).catch(() => {}); // fire-and-forget audit
    logger.warn("email_inbound_rate_limited", {
      orgId,
      reason: rateLimit.reason,
      status: "rate_limited",
    });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  trackServerEvent(ownerId, AnalyticsEvents.EMAIL_INGESTION_RECEIVED, {
    orgId,
    from: parsedEmail.from,
    attachmentCount: parsedEmail.attachmentMetas.length,
  });

  // Check for duplicate (same message_id)
  if (parsedEmail.messageId) {
    const { data: existing } = await admin
      .from("email_ingestion_log")
      .select("id")
      .eq("message_id", parsedEmail.messageId)
      .single();

    if (existing) {
      logger.info("email_inbound_duplicate", {
        orgId,
        messageId: parsedEmail.messageId,
        status: "duplicate",
      });
      // Audit trail (modified message_id to avoid UNIQUE constraint)
      void Promise.resolve(
        admin.from("email_ingestion_log").insert({
          org_id: orgId,
          message_id: parsedEmail.messageId + "_dup_" + Date.now(),
          sender: parsedEmail.from,
          subject: parsedEmail.subject,
          total_attachment_count: parsedEmail.attachmentMetas.length,
          valid_attachment_count: 0,
          status: "duplicate" as const,
          rejection_reason: "Duplicate Message-ID: " + parsedEmail.messageId,
        })
      ).catch(() => {}); // fire-and-forget
      return NextResponse.json({ received: true }, { status: 200 });
    }
  }

  // No attachment metadata at all?
  if (parsedEmail.attachmentMetas.length === 0) {
    await admin.from("email_ingestion_log").insert({
      org_id: orgId,
      message_id: parsedEmail.messageId || `no-id-${Date.now()}`,
      sender: parsedEmail.from,
      subject: parsedEmail.subject,
      total_attachment_count: 0,
      valid_attachment_count: 0,
      status: "rejected",
      rejection_reason: "no_attachments",
    });

    logger.info("email_inbound_no_attachments", {
      orgId,
      from: parsedEmail.from,
      status: "no_attachments",
    });
    sendIngestionNoAttachmentEmail(ownerId, parsedEmail.subject);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Fetch attachment content from Resend API (webhook only has metadata)
  const { fetched, rejected: fetchRejected } = await fetchEmailAttachments(
    parsedEmail.emailId,
    parsedEmail.attachmentMetas
  );

  // Validate fetched attachments (magic bytes, file size)
  const { valid, rejected: validateRejected } = validateAttachments(fetched);

  const allRejected = [...fetchRejected, ...validateRejected];

  for (const r of allRejected) {
    logger.info("email_inbound_attachment_rejected", {
      orgId,
      filename: r.filename,
      reason: r.reason,
    });
  }

  // Log to email_ingestion_log
  const logStatus = valid.length > 0 ? "processed" : "rejected";
  const rejectionReason =
    valid.length === 0
      ? allRejected.length > 0
        ? "all_attachments_invalid"
        : "fetch_failed"
      : null;

  await admin.from("email_ingestion_log").insert({
    org_id: orgId,
    message_id: parsedEmail.messageId || `no-id-${Date.now()}`,
    sender: parsedEmail.from,
    subject: parsedEmail.subject,
    total_attachment_count: parsedEmail.attachmentMetas.length,
    valid_attachment_count: valid.length,
    status: logStatus,
    rejection_reason: rejectionReason,
  });

  if (valid.length === 0) {
    logger.info("email_inbound_no_valid_attachments", {
      orgId,
      from: parsedEmail.from,
      totalAttachments: parsedEmail.attachmentMetas.length,
      rejectedCount: allRejected.length,
      status: "no_valid_attachments",
    });
    sendIngestionErrorEmail(ownerId, {
      type: "invalid_attachments",
      emailSubject: parsedEmail.subject,
      message: allRejected.map((r) => `${r.filename}: ${r.reason}`).join("\n"),
    });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Billing checks before ingestion
  const access = await checkInvoiceAccess(ownerId);
  if (!access.allowed) {
    logger.warn("email_inbound_billing_blocked", {
      orgId,
      userId: ownerId,
      reason: access.reason,
      status: "rejected",
    });
    if (access.trialExhausted) {
      sendTrialExhaustedEmail(ownerId, TRIAL_INVOICE_LIMIT);
    } else {
      sendIngestionErrorEmail(ownerId, {
        type: "billing",
        emailSubject: parsedEmail.subject,
        message:
          "Your subscription is inactive. Please update your billing to continue processing invoices via email.",
      });
    }
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const usageCheck = await checkUsageLimit(orgId, ownerId);
  if (!usageCheck.allowed) {
    logger.warn("email_inbound_usage_limit", {
      orgId,
      userId: ownerId,
      used: usageCheck.usage.used,
      limit: usageCheck.usage.limit,
      status: "rejected",
    });
    sendIngestionErrorEmail(ownerId, {
      type: "usage_limit",
      emailSubject: parsedEmail.subject,
      message:
        "Monthly invoice limit reached. Upgrade your plan to process more invoices.",
    });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Ingest each valid attachment as a separate invoice (async via waitUntil)
  const ingestionPromise = Promise.allSettled(
    valid.map((attachment) =>
      ingestEmailAttachment({
        orgId,
        userId: ownerId,
        attachment,
        emailSender: parsedEmail.from,
        emailSubject: parsedEmail.subject,
      })
    )
  ).then((results) => {
    const succeeded = results.filter(
      (r) => r.status === "fulfilled" && r.value.status === "queued"
    ).length;
    const failed = results.length - succeeded;

    logger.info("email_inbound_ingestion_complete", {
      orgId,
      from: parsedEmail.from,
      totalAttachments: valid.length,
      succeeded,
      failed,
      durationMs: Date.now() - startTime,
    });
  });

  waitUntil(ingestionPromise);

  logger.info("email_inbound_processed", {
    orgId,
    from: parsedEmail.from,
    validAttachmentCount: valid.length,
    rejectedCount: allRejected.length,
    durationMs: Date.now() - startTime,
    status: "processed",
  });

  return NextResponse.json({ received: true }, { status: 200 });
}
