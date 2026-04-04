import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { logger } from "@/lib/utils/logger";
import { validateTwilioSignature } from "@/lib/sms/validate-signature";
import { getUserByPhone } from "@/lib/sms/lookup";
import { fetchSmsMedia } from "@/lib/sms/media";
import { ingestSmsAttachment } from "@/lib/sms/ingest";
import { checkSmsRateLimit } from "@/lib/sms/rate-limit";
import { twimlResponse } from "@/lib/sms/twiml";
import { checkInvoiceAccess } from "@/lib/billing/access";
import { checkUsageLimit } from "@/lib/billing/usage";
import { trackServerEvent, AnalyticsEvents } from "@/lib/analytics/events";
import { createAdminClient } from "@/lib/supabase/admin";

const TWIML_CONTENT_TYPE = "text/xml";

function twimlReply(message: string) {
  return new NextResponse(twimlResponse(message), {
    status: 200,
    headers: { "Content-Type": TWIML_CONTENT_TYPE },
  });
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  let formData: URLSearchParams;
  try {
    const body = await request.text();
    formData = new URLSearchParams(body);
  } catch {
    logger.error("sms_inbound_body_read_failed", {
      error: "Failed to read request body",
    });
    return twimlReply("Something went wrong. Try again or upload at dockett.app/upload");
  }

  // Validate Twilio signature
  const signature = request.headers.get("x-twilio-signature") ?? "";
  const requestUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://dockett.app"}/api/sms/inbound`;
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = value;
  });

  try {
    const valid = validateTwilioSignature(requestUrl, params, signature);
    if (!valid) {
      logger.error("sms_inbound_signature_invalid", {
        error: "Invalid Twilio signature",
      });
      return new NextResponse("Invalid signature", { status: 401 });
    }
  } catch (err) {
    logger.error("sms_inbound_signature_error", {
      error: err instanceof Error ? err.message : "Signature validation error",
    });
    return new NextResponse("Signature validation failed", { status: 401 });
  }

  const from = formData.get("From") ?? "";
  const body = formData.get("Body") ?? "";
  const numMedia = parseInt(formData.get("NumMedia") ?? "0", 10);

  logger.info("sms_inbound_received", {
    from,
    numMedia,
    hasBody: body.length > 0,
    bodyLength: body.length,
  });

  const userLookup = await getUserByPhone(from);

  if (!userLookup) {
    logger.info("sms_inbound_unregistered", { from, status: "unregistered" });
    return twimlReply(
      "This number isn't registered with Dockett. Add your phone at dockett.app/settings"
    );
  }

  const { userId, orgId } = userLookup;
  const admin = createAdminClient();

  if (numMedia === 0) {
    logger.info("sms_inbound_no_media", { from, orgId, status: "no_media" });
    return twimlReply("Attach a photo of an invoice or receipt to process it.");
  }

  const rateLimit = await checkSmsRateLimit(from);
  if (!rateLimit.allowed) {
    await admin.from("sms_ingestion_log").insert({
      org_id: orgId,
      from_number: from,
      num_media: numMedia,
      body_text: body || null,
      total_attachment_count: numMedia,
      valid_attachment_count: 0,
      status: "rate_limited" as const,
      rejection_reason: `Rate limited: ${rateLimit.reason}`,
    });
    logger.warn("sms_inbound_rate_limited", { orgId, from, reason: rateLimit.reason, status: "rate_limited" });
    return twimlReply("Too many messages. Try again in a few minutes.");
  }

  trackServerEvent(userId, AnalyticsEvents.SMS_INGESTION_RECEIVED, { orgId, from, numMedia });

  const access = await checkInvoiceAccess(userId);
  if (!access.allowed) {
    logger.warn("sms_inbound_billing_blocked", { orgId, userId, reason: access.reason, status: "rejected" });
    return twimlReply("Your Dockett subscription is inactive. Visit dockett.app/settings");
  }

  const usageCheck = await checkUsageLimit(orgId, userId);
  if (!usageCheck.allowed) {
    logger.warn("sms_inbound_usage_limit", {
      orgId, userId, used: usageCheck.usage.used, limit: usageCheck.usage.limit, status: "rejected",
    });
    return twimlReply("Monthly invoice limit reached. Upgrade at dockett.app/settings");
  }

  const { valid, rejected } = await fetchSmsMedia({
    numMedia,
    getMediaUrl: (i) => formData.get(`MediaUrl${i}`) ?? "",
    getMediaContentType: (i) => formData.get(`MediaContentType${i}`) ?? "",
  });

  for (const r of rejected) {
    logger.info("sms_inbound_attachment_rejected", { orgId, filename: r.filename, reason: r.reason });
  }

  const logStatus = valid.length > 0 ? "processed" : "rejected";
  const rejectionReason =
    valid.length === 0
      ? rejected.length > 0 ? "all_attachments_invalid" : "fetch_failed"
      : null;

  await admin.from("sms_ingestion_log").insert({
    org_id: orgId,
    from_number: from,
    num_media: numMedia,
    body_text: body || null,
    total_attachment_count: numMedia,
    valid_attachment_count: valid.length,
    status: logStatus as "processed" | "rejected",
    rejection_reason: rejectionReason,
  });

  if (valid.length === 0) {
    logger.info("sms_inbound_no_valid_attachments", {
      orgId, from, totalAttachments: numMedia, rejectedCount: rejected.length, status: "no_valid_attachments",
    });
    return twimlReply("Unsupported file type. Send a photo (JPEG, PNG, HEIC) or PDF.");
  }

  const bodyText = body.trim() || null;

  const ingestionPromise = Promise.allSettled(
    valid.map((attachment) =>
      ingestSmsAttachment({ orgId, userId, attachment, fromNumber: from, bodyText })
    )
  ).then((results) => {
    const succeeded = results.filter(
      (r) => r.status === "fulfilled" && r.value.status === "queued"
    ).length;
    const failed = results.length - succeeded;
    logger.info("sms_inbound_ingestion_complete", {
      orgId, from, totalAttachments: valid.length, succeeded, failed, durationMs: Date.now() - startTime,
    });
  });

  waitUntil(ingestionPromise);

  const invoiceCount = valid.length;
  const replyMessage =
    invoiceCount === 1
      ? "Got it! Processing 1 invoice. Review at dockett.app/invoices"
      : `Got it! Processing ${invoiceCount} invoices. Review at dockett.app/invoices`;

  logger.info("sms_inbound_processed", {
    orgId, from, validAttachmentCount: valid.length, rejectedCount: rejected.length,
    durationMs: Date.now() - startTime, status: "processed",
  });

  return twimlReply(replyMessage);
}
