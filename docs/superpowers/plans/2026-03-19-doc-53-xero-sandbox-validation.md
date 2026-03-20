# DOC-53: Xero Sandbox Validation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate Xero's API behavior with throwaway scripts and document all findings for downstream Xero integration issues.

**Architecture:** Two scripts — `xero-auth.ts` handles one-time OAuth2+PKCE authentication, `test-xero.ts` exercises all API operations we need. Findings documented in `sandbox-notes.md`. No production code changes.

**Tech Stack:** TypeScript (tsx), Node.js crypto (PKCE), Node.js http (temp server), fetch API (Xero REST calls)

**Spec:** `docs/superpowers/specs/2026-03-19-doc-53-xero-sandbox-validation-design.md`

**Reference files:**
- `scripts/sandbox/test-qbo.ts` — the QBO equivalent to mirror
- `scripts/sandbox/sandbox-notes.md` — where findings get appended

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/sandbox/xero-auth.ts` | Create | OAuth2 PKCE flow: generate verifier, open browser, catch callback, exchange code, fetch tenant ID, test refresh, print credentials |
| `scripts/sandbox/test-xero.ts` | Create | API validation: query contacts, create contact, query accounts, create bill, attach PDF, trigger errors. Logs everything. |
| `scripts/sandbox/sandbox-notes.md` | Modify | Append full Xero findings section (auth, response shapes, errors, gotchas) |
| `.env.example` | Modify | Add `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_TENANT_ID` |

---

## Task 1: Update `.env.example` with Xero vars

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add Xero env vars to `.env.example`**

Append after the Sentry Build section:

```
# Xero
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=
# Xero tenant ID (retrieved via /connections endpoint after OAuth)
# Each Xero organization has a unique tenant ID (UUID format)
XERO_TENANT_ID=
# Xero access/refresh tokens (populated by scripts/sandbox/xero-auth.ts — not committed)
# XERO_ACCESS_TOKEN=
# XERO_REFRESH_TOKEN=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: add Xero env vars to .env.example (DOC-53)"
```

---

## Task 2: Build the OAuth2 PKCE auth script

**Files:**
- Create: `scripts/sandbox/xero-auth.ts`

**Reference:** Read `scripts/sandbox/test-qbo.ts` lines 1-33 for the config/env pattern to follow.

- [ ] **Step 1: Write the PKCE helper functions**

At the top of `xero-auth.ts`, implement:

```typescript
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

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const CLIENT_ID = process.env.XERO_CLIENT_ID!;
const CLIENT_SECRET = process.env.XERO_CLIENT_SECRET!;
const REDIRECT_URI = "http://localhost:3456/callback";
const SCOPES = "openid profile email accounting.transactions accounting.contacts accounting.settings";

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
```

- [ ] **Step 2: Implement the OAuth flow with temporary HTTP server**

Add the main function that:
1. Generates PKCE verifier + challenge
2. Builds the Xero authorization URL: `https://login.xero.com/identity/connect/authorize`
3. Starts an HTTP server on port 3456
4. Opens the browser to the auth URL (use `child_process.exec` with platform-appropriate `open` command)
5. Listens for the callback at `/callback`
6. Extracts the `code` query parameter
7. Exchanges code for tokens via `POST https://identity.xero.com/connect/token` with:
   - `grant_type=authorization_code`
   - `code={code}`
   - `redirect_uri={REDIRECT_URI}`
   - `code_verifier={verifier}`
   - Authorization header: `Basic base64(client_id:client_secret)`
8. Logs the full token response (access_token truncated, refresh_token truncated, expires_in, token_type, scope)

```typescript
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
```

- [ ] **Step 3: Add tenant ID retrieval**

After token exchange, call `GET https://api.xero.com/connections` with the access token to get the tenant ID:

```typescript
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
```

Log the full response — the tenant ID is in `data[0].tenantId`. Also log `tenantName`, `tenantType`, and any other fields for documentation.

- [ ] **Step 4: Add token refresh test**

After getting the initial tokens, immediately test refreshing:

```typescript
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
```

Key things to log and document:
- Does the response include a NEW refresh token? (i.e., does the refresh token rotate?)
- Is the old refresh token still valid after refresh?
- What's the `expires_in` value on the new access token?

- [ ] **Step 5: Wire up the main function and server**

```typescript
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
```

The `startServerAndWaitForCallback` function:

```typescript
function startServerAndWaitForCallback(authUrl: string, expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:3456`);

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
      const { exec } = require("child_process");
      exec(`open "${authUrl}"`);
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Authorization timed out (2 minutes)"));
    }, 120_000);
  });
}

main().catch((err) => {
  console.error("\n❌ SCRIPT FAILED:", err);
  process.exit(1);
});
```

- [ ] **Step 6: Run the auth script**

```bash
npx tsx scripts/sandbox/xero-auth.ts
```

Expected:
1. Browser opens to Xero login page
2. User (Joe) clicks "Allow"
3. Script catches callback, exchanges code, fetches tenant ID, tests refresh
4. Prints credentials to console

**ACTION REQUIRED:** Joe needs to click "Allow" in the browser.

Copy the output credentials into `.env.local`.

- [ ] **Step 7: Commit**

```bash
git add scripts/sandbox/xero-auth.ts
git commit -m "feat: add Xero OAuth2 PKCE auth script (DOC-53)"
```

---

## Task 3: Build the API validation script

**Files:**
- Create: `scripts/sandbox/test-xero.ts`

**Reference:** Read `scripts/sandbox/test-qbo.ts` for the exact structure to mirror (helpers, section pattern, logging format).

- [ ] **Step 1: Write the config and helper scaffolding**

Mirror the QBO script pattern exactly — dotenv config, env var check, `headers()` helper, `xeroFetch()` wrapper, `log()` and `logSection()` formatters:

```typescript
/**
 * Xero Sandbox Validation Script (DOC-53)
 *
 * Throwaway exploration script — NOT production code.
 * Tests Xero API endpoints we'll need for the Docket integration:
 *   1. Query contacts (vendors)
 *   1b. Create a contact
 *   2. Query accounts (chart of accounts)
 *   3. Create a bill (Invoice ACCPAY)
 *   4. Attach a PDF to the bill
 *   5. Error cases (bad token, missing fields, invalid ContactID)
 *
 * Usage:
 *   npx tsx scripts/sandbox/test-xero.ts
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

// ── Config ──────────────────────────────────────────────────────────────────

const ACCESS_TOKEN = process.env.XERO_ACCESS_TOKEN!;
const TENANT_ID = process.env.XERO_TENANT_ID!;
const BASE_URL = "https://api.xero.com/api.xro/2.0";

if (!ACCESS_TOKEN || !TENANT_ID) {
  console.error("❌ Missing XERO_ACCESS_TOKEN or XERO_TENANT_ID in .env.local");
  console.error("   Run xero-auth.ts first to get credentials.");
  process.exit(1);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function headers(contentType = "application/json") {
  return {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    Accept: "application/json",
    "Content-Type": contentType,
    "xero-tenant-id": TENANT_ID,
  };
}

async function xeroFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ status: number; data: unknown; responseHeaders: Record<string, string> }> {
  const url = endpoint.startsWith("http") ? endpoint : `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: headers(),
    ...options,
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  // Capture response headers for rate-limit / versioning documentation
  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  return { status: res.status, data, responseHeaders };
}

function log(label: string, obj: unknown) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${label}`);
  console.log(`${"═".repeat(70)}`);
  console.log(JSON.stringify(obj, null, 2));
}

function logSection(title: string) {
  console.log(`\n\n${"█".repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${"█".repeat(70)}`);
}
```

- [ ] **Step 2: Implement Section 1 — Query Contacts**

```typescript
async function testQueryContacts() {
  logSection("1. QUERY CONTACTS (VENDORS)");

  const { status, data, responseHeaders } = await xeroFetch("/Contacts");

  log("Contacts Response (first 3)", {
    status,
    responseHeaders,
    contacts: (data as { Contacts?: unknown[] })?.Contacts?.slice(0, 3),
    totalCount: (data as { Contacts?: unknown[] })?.Contacts?.length,
  });

  const contacts = (data as { Contacts?: Array<Record<string, unknown>> })?.Contacts;
  if (contacts && contacts.length > 0) {
    log("First Contact Shape (keys)", Object.keys(contacts[0]));
    log("First Contact Detail", contacts[0]);
    return contacts[0];
  }
  return null;
}
```

- [ ] **Step 3: Implement Section 1b — Create Contact**

```typescript
async function testCreateContact() {
  logSection("1b. CREATE A CONTACT");

  const contactPayload = {
    Name: "Docket Test Vendor (DOC-53)",
    EmailAddress: "test@docket-sandbox.example",
    IsSupplier: true,
  };

  log("Create Contact Request", contactPayload);

  const { status, data } = await xeroFetch("/Contacts", {
    method: "POST",
    body: JSON.stringify(contactPayload),
  });

  log("Create Contact Response", { status, data });

  const contacts = (data as { Contacts?: Array<Record<string, unknown>> })?.Contacts;
  if (contacts && contacts.length > 0) {
    log("Created Contact ID", (contacts[0] as { ContactID?: string }).ContactID);
    return contacts[0];
  }
  return null;
}
```

- [ ] **Step 4: Implement Section 2 — Query Accounts**

```typescript
async function testQueryAccounts() {
  logSection("2. QUERY ACCOUNTS (CHART OF ACCOUNTS)");

  // Fetch all accounts, we'll filter for expense types
  const { status, data } = await xeroFetch('/Accounts?where=Class=="EXPENSE"');

  log("Expense Accounts Response (first 5)", {
    status,
    accounts: (data as { Accounts?: unknown[] })?.Accounts?.slice(0, 5),
    totalCount: (data as { Accounts?: unknown[] })?.Accounts?.length,
  });

  const accounts = (data as { Accounts?: Array<Record<string, unknown>> })?.Accounts;
  if (accounts && accounts.length > 0) {
    log("First Account Shape (keys)", Object.keys(accounts[0]));
    log("First Account Detail", accounts[0]);
    return accounts[0];
  }
  return null;
}
```

- [ ] **Step 5: Implement Section 3 — Create Bill**

```typescript
async function testCreateBill(
  contact: Record<string, unknown> | null,
  account: Record<string, unknown> | null
) {
  logSection("3. CREATE A BILL (INVOICE ACCPAY)");

  if (!contact || !account) {
    console.log("⚠️  Skipping bill creation — no contact or account found.");
    return null;
  }

  const contactId = (contact as { ContactID?: string }).ContactID;
  const accountCode = (account as { Code?: string }).Code;

  const billPayload = {
    Type: "ACCPAY",
    Contact: {
      ContactID: contactId,
    },
    Date: "2026-03-19",
    DueDate: "2026-04-19",
    LineItems: [
      {
        Description: "Docket test line item 1 — office supplies",
        Quantity: 1,
        UnitAmount: 150.0,
        AccountCode: accountCode,
      },
      {
        Description: "Docket test line item 2 — shipping",
        Quantity: 1,
        UnitAmount: 75.5,
        AccountCode: accountCode,
      },
    ],
    Reference: "DOC-53-TEST",
  };

  log("Bill Request Payload", billPayload);

  const { status, data } = await xeroFetch("/Invoices", {
    method: "PUT",
    body: JSON.stringify(billPayload),
  });

  log("Create Bill Response", { status, data });

  const invoices = (data as { Invoices?: Array<Record<string, unknown>> })?.Invoices;
  if (invoices && invoices.length > 0) {
    const invoiceId = (invoices[0] as { InvoiceID?: string }).InvoiceID;
    log("Created Bill (Invoice) ID", invoiceId);
    return invoices[0];
  }
  return null;
}
```

- [ ] **Step 6: Implement Section 4 — Attach PDF**

```typescript
async function testAttachPdf(invoiceId: string | undefined) {
  logSection("4. ATTACH PDF TO BILL");

  if (!invoiceId) {
    console.log("⚠️  Skipping attachment — no invoice ID.");
    return;
  }

  // Create a minimal test PDF if one doesn't exist
  const testPdfPath = path.resolve(__dirname, "test-invoice.pdf");
  if (!fs.existsSync(testPdfPath)) {
    const minimalPdf = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF"
    );
    fs.writeFileSync(testPdfPath, minimalPdf);
    console.log("Created minimal test PDF at", testPdfPath);
  }

  const fileBuffer = fs.readFileSync(testPdfPath);
  const fileName = "test-invoice.pdf";

  // Xero attachment: raw binary body, Content-Type is the file MIME type
  // Test POST first (spec says POST), then document if PUT also works
  const url = `${BASE_URL}/Invoices/${invoiceId}/Attachments/${fileName}`;

  // Try POST (create only — spec says this method)
  console.log("\n--- Trying POST attachment ---");
  const postRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "xero-tenant-id": TENANT_ID,
      "Content-Type": "application/pdf",
    },
    body: fileBuffer,
  });
  const postText = await postRes.text();
  let postData: unknown;
  try { postData = JSON.parse(postText); } catch { postData = postText; }
  log("Attach PDF via POST Response", { status: postRes.status, data: postData });

  // Try PUT (create/replace — Xero also supports this)
  console.log("\n--- Trying PUT attachment (same file, test overwrite behavior) ---");
  const putRes = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "xero-tenant-id": TENANT_ID,
      "Content-Type": "application/pdf",
    },
    body: fileBuffer,
  });
  const putText = await putRes.text();
  let putData: unknown;
  try { putData = JSON.parse(putText); } catch { putData = putText; }
  log("Attach PDF via PUT Response (overwrite test)", { status: putRes.status, data: putData });
}
```

- [ ] **Step 7: Implement Section 5 — Error Cases**

```typescript
async function testErrorCases(validContactId: string | undefined) {
  logSection("5. ERROR CASES");

  // 5a. Bad token
  console.log("\n--- 5a. Bad Access Token ---");
  const badTokenRes = await fetch(`${BASE_URL}/Contacts`, {
    headers: {
      Authorization: "Bearer bad_token_12345",
      Accept: "application/json",
      "xero-tenant-id": TENANT_ID,
    },
  });
  const badTokenText = await badTokenRes.text();
  let badTokenData: unknown;
  try {
    badTokenData = JSON.parse(badTokenText);
  } catch {
    badTokenData = badTokenText;
  }
  log("Bad Token Response", {
    status: badTokenRes.status,
    headers: Object.fromEntries(badTokenRes.headers.entries()),
    body: badTokenData,
  });

  // 5b. Missing required fields (no Contact)
  console.log("\n--- 5b. Missing Contact on Bill ---");
  const { status: noContactStatus, data: noContactData } = await xeroFetch("/Invoices", {
    method: "PUT",
    body: JSON.stringify({
      Type: "ACCPAY",
      LineItems: [
        {
          Description: "Test",
          Quantity: 1,
          UnitAmount: 100,
          AccountCode: "200",
        },
      ],
    }),
  });
  log("Missing Contact Response", { status: noContactStatus, data: noContactData });

  // 5c. Invalid ContactID
  console.log("\n--- 5c. Invalid ContactID ---");
  const { status: badContactStatus, data: badContactData } = await xeroFetch("/Invoices", {
    method: "PUT",
    body: JSON.stringify({
      Type: "ACCPAY",
      Contact: { ContactID: "00000000-0000-0000-0000-000000000000" },
      LineItems: [
        {
          Description: "Test",
          Quantity: 1,
          UnitAmount: 100,
          AccountCode: "200",
        },
      ],
    }),
  });
  log("Invalid ContactID Response", { status: badContactStatus, data: badContactData });

  // 5d. Duplicate invoice number (requires a valid contact)
  console.log("\n--- 5d. Duplicate Invoice Number ---");
  if (!validContactId) {
    console.log("⚠️  Skipping duplicate test — no valid contact ID available.");
    return;
  }
  const duplicatePayload = {
    Type: "ACCPAY",
    Contact: { ContactID: validContactId },
    InvoiceNumber: "DOCKET-DUP-TEST-001",
    LineItems: [
      {
        Description: "Duplicate test",
        Quantity: 1,
        UnitAmount: 50,
        AccountCode: "200",
      },
    ],
  };
  // Create first
  await xeroFetch("/Invoices", { method: "PUT", body: JSON.stringify(duplicatePayload) });
  // Try duplicate
  const { status: dupStatus, data: dupData } = await xeroFetch("/Invoices", {
    method: "PUT",
    body: JSON.stringify(duplicatePayload),
  });
  log("Duplicate Invoice Number Response", { status: dupStatus, data: dupData });
}
```

- [ ] **Step 8: Wire up the main function**

```typescript
async function main() {
  console.log("🚀 Xero Sandbox Validation — DOC-53");
  console.log(`   Tenant ID:  ${TENANT_ID}`);
  console.log(`   Base URL:   ${BASE_URL}`);
  console.log(`   Token:      ${ACCESS_TOKEN.slice(0, 20)}...`);
  console.log(`   Time:       ${new Date().toISOString()}`);

  try {
    const contact = await testQueryContacts();
    const createdContact = await testCreateContact();
    const account = await testQueryAccounts();

    // Use the created contact for bill creation (we know it exists)
    const billContact = createdContact || contact;
    const bill = await testCreateBill(billContact, account);
    const invoiceId = (bill as { InvoiceID?: string } | null)?.InvoiceID;
    await testAttachPdf(invoiceId);
    const validContactId = (billContact as { ContactID?: string } | null)?.ContactID;
    await testErrorCases(validContactId);

    logSection("✅ ALL TESTS COMPLETE");
    console.log("\nCopy relevant output into scripts/sandbox/sandbox-notes.md");
  } catch (err) {
    console.error("\n❌ SCRIPT FAILED:", err);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 9: Commit**

```bash
git add scripts/sandbox/test-xero.ts
git commit -m "feat: add Xero API validation script (DOC-53)"
```

---

## Task 4: Run the scripts and collect findings

This task requires Joe's involvement for the OAuth browser step.

**Files:**
- Read: `scripts/sandbox/xero-auth.ts` (run it)
- Read: `scripts/sandbox/test-xero.ts` (run it)

- [ ] **Step 1: Ensure Xero credentials are in `.env.local`**

Verify `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET` are set in `.env.local`.

Also verify that `http://localhost:3456/callback` is registered as a redirect URI in the Xero Developer Portal.

- [ ] **Step 2: Run the auth script**

```bash
npx tsx scripts/sandbox/xero-auth.ts
```

**ACTION REQUIRED:** Joe clicks "Allow" in the browser window that opens.

Expected output: access token, refresh token, tenant ID, and refresh rotation test results.

Copy the output into `.env.local`:
```
XERO_ACCESS_TOKEN=...
XERO_REFRESH_TOKEN=...
XERO_TENANT_ID=...
```

- [ ] **Step 3: Run the API validation script**

```bash
npx tsx scripts/sandbox/test-xero.ts
```

Expected: all 6 sections run (query contacts, create contact, query accounts, create bill, attach PDF, error cases). Save the full output — it's the raw material for sandbox-notes.md.

- [ ] **Step 4: If any section fails, debug and re-run**

Common issues:
- 401 on all requests: access token expired (30 min lifetime). Re-run `xero-auth.ts`.
- 403: scopes insufficient. Check Xero app configuration.
- 400 on bill creation: payload format wrong. Adjust and re-run.

Each failure IS a finding — document it even if you fix it.

---

## Task 5: Document findings in sandbox-notes.md

**Files:**
- Modify: `scripts/sandbox/sandbox-notes.md` (append after the existing Xero placeholder at line ~210)

- [ ] **Step 1: Replace the placeholder Xero section**

Remove the existing placeholder:
```
## Xero Sandbox (FND-10)

Deferred to Phase 2. Xero requires a paid org or free trial for API testing. Key differences from QBO documented in CLAUDE.md from docs review (PUT vs POST, ContactID vs VendorRef, ACCPAY type).
```

Replace with a full findings section using the template from the spec. Fill in every subsection from the actual script output:

1. **Setup** — Developer portal URL, app type, scopes, redirect URIs, demo company info
2. **Auth (OAuth2 + PKCE)** — Token endpoint URLs, app type, token lifetimes (confirmed), PKCE details, refresh behavior (rotation?), tenant ID retrieval, required vs optional scopes
3. **Contact (Vendor) Response Shape** — Key fields with types, ID format (UUID?), naming conventions, comparison to QBO vendor shape
4. **Contact Creation** — Endpoint, method, minimum payload, response shape
5. **Account Response Shape** — Key fields, expense filtering approach, hierarchy representation
6. **Bill (Invoice ACCPAY) Creation** — Endpoint, method (PUT), minimum payload, optional fields, response enrichment, status codes
7. **PDF Attachment** — Endpoint, method, request format, response shape
8. **Error Response Shapes** — Auth errors vs validation errors, consistency comparison with QBO's inconsistent casing
9. **Rate Limits** — Documented limits, observed headers, comparison to QBO
10. **Surprises / Gotchas** — Numbered list of everything unexpected, with QBO comparison where relevant

- [ ] **Step 2: Review the documented findings for completeness**

Check against the spec's success criteria:
- All response shapes documented? ✅/❌
- Error shapes documented with QBO comparison? ✅/❌
- Token lifetimes confirmed empirically? ✅/❌
- All unexpected behaviors captured in gotchas? ✅/❌

- [ ] **Step 3: Commit**

```bash
git add scripts/sandbox/sandbox-notes.md
git commit -m "docs: add Xero sandbox findings to sandbox-notes.md (DOC-53)"
```

---

## Task 6: Final review and PR

- [ ] **Step 1: Update CLAUDE.md Xero gotchas section**

Update the existing "Xero (Phase 2, document findings from FND-10 here)" section in CLAUDE.md with the key findings — the 3-5 most important gotchas that every subsequent session needs to know without reading sandbox-notes.md.

- [ ] **Step 2: Run completion self-check**

```bash
npm run lint
npm run build
npx tsc --noEmit
```

All should pass — we only added scripts and docs, no production code.

- [ ] **Step 3: Commit CLAUDE.md updates**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with Xero sandbox findings (DOC-53)"
```

- [ ] **Step 4: Push branch and create PR**

```bash
git push -u origin feature/DOC-53-xero-sandbox-validation
gh pr create --title "DOC-53: Xero sandbox validation (XRO-2)" --body "$(cat <<'EOF'
## Summary
- Added Xero OAuth2 PKCE auth script (`scripts/sandbox/xero-auth.ts`)
- Added Xero API validation script (`scripts/sandbox/test-xero.ts`)
- Documented all API findings in `scripts/sandbox/sandbox-notes.md`
- Updated `.env.example` with Xero env vars
- Updated CLAUDE.md with key Xero gotchas

## Test plan
- [ ] `xero-auth.ts` completes PKCE flow and outputs valid tokens
- [ ] `test-xero.ts` runs all 6 sections successfully
- [ ] All response shapes documented in sandbox-notes.md
- [ ] Error shapes documented with QBO comparison
- [ ] Token lifetimes confirmed empirically

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Deliver status report**

```
STATUS REPORT - DOC-53: Xero Sandbox Validation (XRO-2)

1. FILES CHANGED
   ...

2. DEPENDENCIES
   None added.

3. ACCEPTANCE CRITERIA CHECK
   ...

4. SELF-REVIEW
   ...

5. NEXT STEPS
   ...
```
