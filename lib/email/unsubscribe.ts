import { createHmac } from "crypto";

/**
 * Generate an HMAC-SHA256 token for unsubscribe links.
 * Uses ENCRYPTION_KEY as the signing secret.
 */
export function generateUnsubscribeToken(email: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("Missing ENCRYPTION_KEY for unsubscribe token generation");
  }
  return createHmac("sha256", key)
    .update(email.toLowerCase())
    .digest("hex")
    .slice(0, 32);
}

/**
 * Generate a full unsubscribe URL for use in marketing emails.
 */
export function generateUnsubscribeUrl(email: string): string {
  const token = generateUnsubscribeToken(email);
  return `https://dockett.app/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}
