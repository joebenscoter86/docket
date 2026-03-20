// lib/xero/auth.ts
import { randomBytes, createHash } from "crypto";
import { encrypt, decrypt } from "@/lib/utils/encryption";
import { logger } from "@/lib/utils/logger";
import type {
  XeroTokenResponse,
  XeroTokens,
  XeroTenant,
  AccountingConnectionRow,
} from "./types";

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

// ─── Token Storage & Retrieval ───

/**
 * Per-org token refresh lock. When multiple concurrent callers need to refresh
 * the same expired token, only the first caller actually calls Xero.
 * The rest await the same promise. Critical for Xero because refresh tokens ROTATE
 * on use — a second concurrent refresh would use an already-invalidated token.
 */
const refreshLocks = new Map<
  string,
  Promise<{ accessToken: string; tenantId: string }>
>();

/**
 * Store an encrypted Xero connection for an org.
 * Upserts on (org_id, provider): if a connection already exists, tokens are replaced.
 */
export async function storeConnection(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string,
  tokens: XeroTokens,
  tenantId: string,
  tenantName?: string
): Promise<void> {
  const encryptedAccess = encrypt(tokens.accessToken);
  const encryptedRefresh = encrypt(tokens.refreshToken);
  const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

  const { error } = await supabase.from("accounting_connections").upsert(
    {
      org_id: orgId,
      provider: "xero",
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      token_expires_at: expiresAt.toISOString(),
      company_id: tenantId,
      company_name: tenantName ?? null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "org_id,provider" }
  );

  if (error) {
    logger.error("xero.store_connection_failed", { orgId, error: error.message });
    throw new Error(`Failed to store Xero connection: ${error.message}`);
  }

  logger.info("xero.connection_stored", { orgId, tenantId });
}

/**
 * Load the raw connection row for an org (returns null if not connected).
 */
export async function loadConnection(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string
): Promise<AccountingConnectionRow | null> {
  const { data, error } = await supabase
    .from("accounting_connections")
    .select("*")
    .eq("org_id", orgId)
    .eq("provider", "xero")
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return data as AccountingConnectionRow;
}

/**
 * Check if an org has an active Xero connection.
 */
export async function isConnected(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string
): Promise<boolean> {
  const connection = await loadConnection(supabase, orgId);
  return connection !== null;
}

/**
 * Refresh an expired access token using the refresh token.
 * NOTE: Xero refresh tokens ROTATE on use — the new refresh token must be stored.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<XeroTokenResponse> {
  const { clientId, clientSecret } = getXeroConfig();

  const response = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error("xero.refresh_token_failed", {
      status: String(response.status),
      error: errorBody,
    });
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  return (await response.json()) as XeroTokenResponse;
}

/**
 * Get a valid (non-expired) access token for an org.
 * Auto-refreshes if the current token is expired or about to expire.
 * Returns `{ accessToken, tenantId }` ready for API calls.
 * Throws if no connection exists or refresh fails.
 *
 * Concurrent callers for the same org coalesce into a single refresh call
 * because Xero rotates refresh tokens on use — parallel refreshes with the
 * same token would fail after the first use invalidates it.
 */
export async function getValidAccessToken(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string
): Promise<{ accessToken: string; tenantId: string }> {
  const connection = await loadConnection(supabase, orgId);

  if (!connection) {
    throw new Error(
      "No Xero connection found. Connect Xero in Settings first."
    );
  }

  const expiresAt = new Date(connection.token_expires_at);
  const now = new Date();

  // If token is still valid (with buffer), decrypt and return
  if (expiresAt.getTime() - now.getTime() > TOKEN_EXPIRY_BUFFER_MS) {
    return {
      accessToken: decrypt(connection.access_token),
      tenantId: connection.company_id,
    };
  }

  // Token expired or about to expire — coalesce concurrent refresh calls
  const existing = refreshLocks.get(orgId);
  if (existing) {
    logger.info("xero.token_refresh_coalesced", { orgId });
    return existing;
  }

  const refreshPromise = (async () => {
    logger.info("xero.token_refresh_needed", {
      orgId,
      expiresAt: expiresAt.toISOString(),
    });

    const decryptedRefresh = decrypt(connection.refresh_token);

    let tokenResponse: XeroTokenResponse;
    try {
      tokenResponse = await refreshAccessToken(decryptedRefresh);
    } catch {
      logger.error("xero.token_refresh_failed_disconnect", { orgId });
      throw new Error(
        "Xero connection expired. Please reconnect in Settings."
      );
    }

    // Store rotated tokens — critical: Xero refresh tokens are single-use
    const newTokens: XeroTokens = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresIn: tokenResponse.expires_in,
    };

    await storeConnection(
      supabase,
      orgId,
      newTokens,
      connection.company_id,
      connection.company_name ?? undefined
    );

    logger.info("xero.token_refreshed", { orgId });

    return {
      accessToken: newTokens.accessToken,
      tenantId: connection.company_id,
    };
  })();

  refreshLocks.set(orgId, refreshPromise);

  try {
    return await refreshPromise;
  } finally {
    refreshLocks.delete(orgId);
  }
}

/**
 * Disconnect Xero — revoke tokens and delete the connection row.
 * Revocation is best-effort (fire-and-forget on failure).
 */
export async function disconnect(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string
): Promise<void> {
  const connection = await loadConnection(supabase, orgId);

  if (connection) {
    // Best-effort revoke at Xero (fire-and-forget)
    try {
      const { clientId, clientSecret } = getXeroConfig();
      const decryptedRefresh = decrypt(connection.refresh_token);

      await fetch(XERO_REVOKE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({ token: decryptedRefresh }),
      });
    } catch {
      // Revocation failure is non-critical — token will expire anyway
      logger.warn("xero.revoke_failed", { orgId });
    }

    // Delete the connection row
    await supabase
      .from("accounting_connections")
      .delete()
      .eq("org_id", orgId)
      .eq("provider", "xero");
  }

  logger.info("xero.disconnected", { orgId });
}
