/**
 * Xero OAuth2 + PKCE Auth Script (DOC-53)
 *
 * Throwaway script — NOT production code.
 * Authenticates with Xero, fetches tenant ID, tests token refresh.
 *
 * Prerequisites:
 *   1. Set XERO_CLIENT_ID and XERO_CLIENT_SECRET in .env.local
 *   2. Register http://localhost:3456/callback as a redirect URI in Xero Developer Portal
 *
 * Usage:
 *   npx tsx scripts/sandbox/xero-auth.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as crypto from "crypto";
import * as http from "http";
import { exec } from "child_process";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const CLIENT_ID = process.env.XERO_CLIENT_ID!;
const CLIENT_SECRET = process.env.XERO_CLIENT_SECRET!;
const REDIRECT_URI = "http://localhost:3456/callback";
// Xero scopes — apps created after 2 March 2026 must use new granular scopes
// Old: accounting.transactions → New: accounting.invoices (covers bills/ACCPAY)
// Unchanged: accounting.contacts, accounting.settings, accounting.attachments
const SCOPES = "openid offline_access accounting.invoices accounting.contacts accounting.settings accounting.attachments";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌ Missing XERO_CLIENT_ID or XERO_CLIENT_SECRET in .env.local");
  process.exit(1);
}

// PKCE helpers (RFC 7636)
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

async function exchangeCodeForTokens(code: string, codeVerifier: string) {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  const res = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }).toString(),
  });

  const data = await res.json();
  return { status: res.status, data };
}

async function fetchTenantId(accessToken: string) {
  const res = await fetch("https://api.xero.com/connections", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();
  return { status: res.status, data };
}

async function refreshAccessToken(refreshToken: string) {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  const res = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });

  const data = await res.json();
  return { status: res.status, data };
}

function startServerAndWaitForCallback(authUrl: string, expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:3456`);
      console.log(`   📥 Request: ${req.method} ${req.url}`);

      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");
        const returnedState = url.searchParams.get("state");

        // CSRF validation (Architecture Rule 9)
        if (returnedState !== expectedState) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<h1>State mismatch (CSRF protection)</h1>`);
          server.close();
          reject(new Error(`State mismatch: expected ${expectedState}, got ${returnedState}`));
          return;
        }

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<h1>Authorization failed</h1><p>${error}</p>`);
          server.close();
          reject(new Error(`Xero auth error: ${error}`));
          return;
        }

        if (code) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<h1>Authorization successful!</h1><p>You can close this tab.</p>");
          server.close();
          resolve(code);
          return;
        }

        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>No code received</h1>");
        server.close();
        reject(new Error("No authorization code in callback"));
      }
    });

    server.listen(3456, () => {
      console.log("\n🌐 Waiting for Xero authorization...");
      console.log("   Opening browser...\n");

      // Open browser (macOS)
      exec(`open "${authUrl}"`);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Authorization timed out (5 minutes)"));
    }, 300_000);
  });
}

async function main() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  console.log("🚀 Xero OAuth2 + PKCE Auth — DOC-53");
  console.log(`   Client ID:     ${CLIENT_ID.slice(0, 8)}...`);
  console.log(`   Redirect URI:  ${REDIRECT_URI}`);
  console.log(`   Scopes:        ${SCOPES}`);
  console.log(`   PKCE Verifier: ${codeVerifier.slice(0, 10)}... (${codeVerifier.length} chars)`);

  // Generate CSRF state token (Architecture Rule 9)
  const state = crypto.randomBytes(16).toString("hex");

  const authUrl = new URL("https://login.xero.com/identity/connect/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  // Start temporary server and wait for callback
  const code = await startServerAndWaitForCallback(authUrl.toString(), state);

  // Exchange code for tokens
  console.log("\n📦 Exchanging code for tokens...");
  const tokenResult = await exchangeCodeForTokens(code, codeVerifier);
  console.log("Token Response:", JSON.stringify(tokenResult, null, 2));

  if (tokenResult.status !== 200) {
    console.error("❌ Token exchange failed");
    process.exit(1);
  }

  const { access_token, refresh_token, expires_in } = tokenResult.data;

  // Fetch tenant ID
  console.log("\n🏢 Fetching tenant ID...");
  const tenantResult = await fetchTenantId(access_token);
  console.log("Connections Response:", JSON.stringify(tenantResult, null, 2));

  const tenantId = tenantResult.data[0]?.tenantId;

  // Test token refresh
  console.log("\n🔄 Testing token refresh...");
  const refreshResult = await refreshAccessToken(refresh_token);
  console.log("Refresh Response:", JSON.stringify(refreshResult, null, 2));

  const newRefreshToken = refreshResult.data?.refresh_token;
  console.log(`\n🔑 Refresh token rotated: ${newRefreshToken !== refresh_token}`);

  // Print credentials for .env.local
  const finalAccessToken = refreshResult.status === 200 ? refreshResult.data.access_token : access_token;
  const finalRefreshToken = newRefreshToken || refresh_token;

  console.log("\n" + "═".repeat(70));
  console.log("  Add these to .env.local:");
  console.log("═".repeat(70));
  console.log(`XERO_ACCESS_TOKEN=${finalAccessToken}`);
  console.log(`XERO_REFRESH_TOKEN=${finalRefreshToken}`);
  console.log(`XERO_TENANT_ID=${tenantId}`);
  console.log(`\n  Access token expires in: ${expires_in} seconds`);
}

main().catch((err) => {
  console.error("\n❌ SCRIPT FAILED:", err);
  process.exit(1);
});
