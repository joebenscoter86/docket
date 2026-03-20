import { randomBytes } from "crypto";
import { encrypt, decrypt } from "@/lib/utils/encryption";
import { logger } from "@/lib/utils/logger";
import type { QBOTokenResponse, QBOTokens, AccountingConnectionRow } from "./types";

// ─── Configuration ───

const INTUIT_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const INTUIT_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const INTUIT_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const SCOPES = "com.intuit.quickbooks.accounting";

// Buffer before actual expiry to avoid edge-case failures (5 minutes)
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/**
 * Per-org token refresh lock. When multiple concurrent callers (e.g. batch
 * extractions) need to refresh the same expired token, only the first caller
 * actually calls Intuit. The rest await the same promise. This prevents the
 * race condition where Intuit rotates the refresh token on first use and
 * subsequent concurrent refreshes fail with an invalidated token.
 */
const refreshLocks = new Map<string, Promise<{ accessToken: string; companyId: string }>>();

function getConfig() {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const redirectUri = process.env.QBO_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing QBO_CLIENT_ID, QBO_CLIENT_SECRET, or QBO_REDIRECT_URI"
    );
  }

  return { clientId, clientSecret, redirectUri };
}

function getBaseUrl(): string {
  const env = process.env.QBO_ENVIRONMENT || "sandbox";
  return env === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

// ─── OAuth2 Flow ───

/**
 * Generate a cryptographic random state parameter for CSRF protection.
 */
export function generateState(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Build the Intuit authorization URL that the user's browser is redirected to.
 */
export function getAuthorizationUrl(state: string): string {
  const { clientId, redirectUri } = getConfig();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    state,
  });

  return `${INTUIT_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(
  code: string
): Promise<QBOTokens> {
  const { clientId, clientSecret, redirectUri } = getConfig();

  const response = await fetch(INTUIT_TOKEN_URL, {
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
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error("qbo.exchange_code_failed", {
      status: String(response.status),
      error: errorBody,
    });
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as QBOTokenResponse;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    companyId: "", // Set by the caller from the realmId query param
  };
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<QBOTokenResponse> {
  const { clientId, clientSecret } = getConfig();

  const response = await fetch(INTUIT_TOKEN_URL, {
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
    logger.error("qbo.refresh_token_failed", {
      status: String(response.status),
      error: errorBody,
    });
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  return (await response.json()) as QBOTokenResponse;
}

// ─── Token Storage & Retrieval ───

/**
 * Store an encrypted QBO connection for an org.
 * Upserts on (org_id, provider): if a connection already exists, tokens are replaced.
 */
export async function storeConnection(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string,
  tokens: QBOTokens,
  companyName?: string
): Promise<void> {
  const encryptedAccess = encrypt(tokens.accessToken);
  const encryptedRefresh = encrypt(tokens.refreshToken);

  const { error } = await supabase.from("accounting_connections").upsert(
    {
      org_id: orgId,
      provider: "quickbooks",
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      token_expires_at: tokens.expiresAt.toISOString(),
      company_id: tokens.companyId,
      company_name: companyName ?? null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "org_id,provider" }
  );

  if (error) {
    logger.error("qbo.store_connection_failed", { orgId, error: error.message });
    throw new Error(`Failed to store QBO connection: ${error.message}`);
  }

  logger.info("qbo.connection_stored", { orgId, companyId: tokens.companyId });
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
    .eq("provider", "quickbooks")
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return data as AccountingConnectionRow;
}

/**
 * Get a valid (non-expired) access token for an org.
 * Auto-refreshes if the current token is expired or about to expire.
 * Returns the access token string ready for Authorization header.
 * Throws if no connection exists or refresh fails.
 *
 * Concurrent callers for the same org coalesce into a single refresh call
 * to prevent race conditions where Intuit rotates the refresh token on
 * first use and subsequent concurrent refreshes fail.
 */
export async function getValidAccessToken(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string
): Promise<{ accessToken: string; companyId: string }> {
  const connection = await loadConnection(supabase, orgId);

  if (!connection) {
    throw new Error("No QuickBooks connection found. Connect QuickBooks in Settings first.");
  }

  const expiresAt = new Date(connection.token_expires_at);
  const now = new Date();

  // If token is still valid (with buffer), decrypt and return
  if (expiresAt.getTime() - now.getTime() > TOKEN_EXPIRY_BUFFER_MS) {
    return {
      accessToken: decrypt(connection.access_token),
      companyId: connection.company_id,
    };
  }

  // Token expired or about to expire — coalesce concurrent refresh calls
  const existing = refreshLocks.get(orgId);
  if (existing) {
    logger.info("qbo.token_refresh_coalesced", { orgId });
    return existing;
  }

  const refreshPromise = (async () => {
    logger.info("qbo.token_refresh_needed", { orgId, expiresAt: expiresAt.toISOString() });

    const decryptedRefresh = decrypt(connection.refresh_token);

    let tokenResponse: QBOTokenResponse;
    try {
      tokenResponse = await refreshAccessToken(decryptedRefresh);
    } catch {
      // Refresh failed — connection is effectively broken
      logger.error("qbo.token_refresh_failed_disconnect", { orgId });
      throw new Error(
        "QuickBooks connection expired. Please reconnect in Settings."
      );
    }

    // Store the new tokens
    const newTokens: QBOTokens = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
      companyId: connection.company_id,
    };

    await storeConnection(supabase, orgId, newTokens, connection.company_name);

    logger.info("qbo.token_refreshed", { orgId });

    return {
      accessToken: newTokens.accessToken,
      companyId: newTokens.companyId,
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
 * Check if an org has an active QBO connection.
 */
export async function isConnected(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string
): Promise<boolean> {
  const connection = await loadConnection(supabase, orgId);
  return connection !== null;
}

/**
 * Disconnect QBO — revoke tokens and delete the connection row.
 */
export async function disconnect(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string
): Promise<void> {
  const connection = await loadConnection(supabase, orgId);

  if (connection) {
    // Best-effort revoke at Intuit (fire-and-forget)
    try {
      const { clientId, clientSecret } = getConfig();
      const decryptedRefresh = decrypt(connection.refresh_token);

      await fetch(INTUIT_REVOKE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
        body: JSON.stringify({ token: decryptedRefresh }),
      });
    } catch {
      // Revocation failure is non-critical — token will expire anyway
      logger.warn("qbo.revoke_failed", { orgId });
    }

    // Delete the connection row
    await supabase
      .from("accounting_connections")
      .delete()
      .eq("org_id", orgId)
      .eq("provider", "quickbooks");
  }

  logger.info("qbo.disconnected", { orgId });
}

/**
 * Get the QBO API base URL for a company.
 */
export function getCompanyBaseUrl(companyId: string): string {
  return `${getBaseUrl()}/v3/company/${companyId}`;
}
