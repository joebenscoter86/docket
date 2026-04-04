import { PostHog } from "posthog-node";

export const AnalyticsEvents = {
  SIGNUP: "signup",
  INVOICE_UPLOADED: "invoice_uploaded",
  INVOICE_EXTRACTED: "invoice_extracted",
  INVOICE_APPROVED: "invoice_approved",
  INVOICE_SYNCED: "invoice_synced",
  BATCH_APPROVED: "batch_approved",
  BATCH_SYNCED: "batch_synced",
  QBO_CONNECTED: "qbo_connected",
  EMAIL_INGESTION_RECEIVED: "email_ingestion_received",
  EMAIL_INGESTION_PROCESSED: "email_ingestion_processed",
  EMAIL_INGESTION_REJECTED: "email_ingestion_rejected",
  EMAIL_FORWARDING_ENABLED: "email_forwarding_enabled",
  EMAIL_FORWARDING_DISABLED: "email_forwarding_disabled",
  EMAIL_FORWARDING_PREFIX_UPDATED: "email_forwarding_prefix_updated",
  SMS_INGESTION_RECEIVED: "sms_ingestion_received",
  SMS_INGESTION_PROCESSED: "sms_ingestion_processed",
  SMS_PHONE_VERIFIED: "sms_phone_verified",
  SMS_PHONE_REMOVED: "sms_phone_removed",
} as const;

export type AnalyticsEvent = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

let posthogClient: PostHog | null = null;

function getPostHogClient(): PostHog | null {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return null;

  if (!posthogClient) {
    posthogClient = new PostHog(apiKey, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    });
  }
  return posthogClient;
}

export function trackServerEvent(
  userId: string,
  event: AnalyticsEvent,
  properties?: Record<string, unknown>
): void {
  const client = getPostHogClient();
  if (!client) return;
  client.capture({ distinctId: userId, event, properties });
  // Flush immediately — Vercel serverless functions may terminate after response
  client.flush();
}
