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

/**
 * Rate limit: track recent requests per global window.
 * Simple in-memory counter for MVP. Resets on cold start.
 */
const rateLimitWindow = { count: 0, windowStart: Date.now() };
const RATE_LIMIT_MAX = 50; // per minute globally
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkGlobalRateLimit(): boolean {
  const now = Date.now();
  if (now - rateLimitWindow.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitWindow.count = 0;
    rateLimitWindow.windowStart = now;
  }
  rateLimitWindow.count++;
  return rateLimitWindow.count <= RATE_LIMIT_MAX;
}

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

  // Rate limit check
  if (!checkGlobalRateLimit()) {
    logger.warn("email_inbound_rate_limited", { status: "rate_limited" });
    return NextResponse.json({ received: true }, { status: 200 });
  }

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

  trackServerEvent(ownerId, AnalyticsEvents.EMAIL_INGESTION_RECEIVED, {
    orgId,
    from: parsedEmail.from,
    attachmentCount: parsedEmail.attachmentMetas.length,
  });

  // Check for duplicate (same message_id)
  const admin = createAdminClient();
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
