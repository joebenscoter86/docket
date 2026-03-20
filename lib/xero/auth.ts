// lib/xero/auth.ts
import { randomBytes, createHash } from "crypto";

// ─── Configuration ───

export const XERO_AUTH_URL =
  "https://login.xero.com/identity/connect/authorize";
export const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
export const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
export const XERO_REVOKE_URL =
  "https://identity.xero.com/connect/revocation";
export const XERO_SCOPES =
  "openid offline_access accounting.invoices accounting.contacts accounting.settings accounting.attachments";

// Buffer before actual expiry to avoid edge-case failures (5 minutes)
export const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export function getXeroConfig() {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const redirectUri =
    process.env.XERO_REDIRECT_URI ||
    "http://localhost:3000/api/auth/callback/xero";

  if (!clientId || !clientSecret) {
    throw new Error("Missing XERO_CLIENT_ID or XERO_CLIENT_SECRET");
  }

  return { clientId, clientSecret, redirectUri };
}

// ─── PKCE ───

/**
 * Generate a PKCE code_verifier and code_challenge pair.
 * Verifier: 32 random bytes → base64url (43 chars).
 * Challenge: SHA256(verifier) → base64url.
 */
export function generatePKCE(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  return { codeVerifier, codeChallenge };
}

// ─── OAuth2 Flow ───

/**
 * Generate a cryptographic random state parameter for CSRF protection.
 */
export function generateState(): string {
  return randomBytes(32).toString("hex");
}
