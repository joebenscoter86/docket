// lib/xero/auth.ts
import { randomBytes, createHash } from "crypto";
import { logger } from "@/lib/utils/logger";
import type { XeroTokenResponse, XeroTokens, XeroTenant } from "./types";

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

/**
 * Build the Xero authorization URL that the user's browser is redirected to.
 * Includes PKCE code_challenge for added security.
 */
export function getAuthorizationUrl(
  state: string,
  codeChallenge: string
): string {
  const { clientId, redirectUri } = getXeroConfig();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: XERO_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${XERO_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code + PKCE verifier for access + refresh tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<XeroTokens> {
  const { clientId, clientSecret, redirectUri } = getXeroConfig();

  const response = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error("xero.exchange_code_failed", {
      status: String(response.status),
      error: errorBody,
    });
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as XeroTokenResponse;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Fetch the list of authorized Xero tenants and return the first one.
 * After OAuth, the user may have multiple orgs — we take the first tenant.
 * Throws if the user has no authorized tenants.
 */
export async function getXeroTenantId(
  accessToken: string
): Promise<{ tenantId: string; tenantName: string }> {
  const response = await fetch(XERO_CONNECTIONS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error("xero.get_tenants_failed", {
      status: String(response.status),
      error: errorBody,
    });
    throw new Error(`Failed to fetch Xero tenants: ${response.status}`);
  }

  const tenants = (await response.json()) as XeroTenant[];

  if (tenants.length === 0) {
    throw new Error("No Xero tenants found. Please ensure your Xero organization is connected.");
  }

  const first = tenants[0];
  return { tenantId: first.tenantId, tenantName: first.tenantName };
}
