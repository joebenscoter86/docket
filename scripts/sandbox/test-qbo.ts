/**
 * QBO Sandbox Validation Script (DOC-9 / FND-9)
 *
 * Throwaway exploration script — NOT production code.
 * Tests QBO API endpoints we'll need for the Docket integration:
 *   1. Query vendors
 *   2. Query chart of accounts
 *   3. Create a bill
 *   4. Attach a PDF to the bill
 *   5. Error cases (bad token, missing fields, bad VendorRef)
 *
 * Usage:
 *   npx tsx scripts/sandbox/test-qbo.ts
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

// ── Config ────────────────────────────────────────────────────────────────────

const ACCESS_TOKEN = process.env.QBO_SANDBOX_ACCESS_TOKEN!;
const COMPANY_ID = process.env.QBO_SANDBOX_COMPANY_ID!;
const BASE_URL = `https://sandbox-quickbooks.api.intuit.com/v3/company/${COMPANY_ID}`;

if (!ACCESS_TOKEN || !COMPANY_ID) {
  console.error(
    "❌ Missing QBO_SANDBOX_ACCESS_TOKEN or QBO_SANDBOX_COMPANY_ID in .env.local"
  );
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function headers(accept = "application/json") {
  return {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    Accept: accept,
    "Content-Type": "application/json",
  };
}

async function qboFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ status: number; data: unknown }> {
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
  return { status: res.status, data };
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

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testQueryVendors() {
  logSection("1. QUERY VENDORS");

  const query = encodeURIComponent("SELECT * FROM Vendor MAXRESULTS 10");
  const { status, data } = await qboFetch(`/query?query=${query}`);

  log("Vendors Response", { status, data });

  // Extract vendor structure for documentation
  const qr = data as { QueryResponse?: { Vendor?: Array<Record<string, unknown>> } };
  const vendors = qr?.QueryResponse?.Vendor;
  if (vendors && vendors.length > 0) {
    log("First Vendor Shape (keys)", Object.keys(vendors[0]));
    log("First Vendor Detail", vendors[0]);
    return vendors[0]; // Return for use in bill creation
  }
  return null;
}

async function testQueryAccounts() {
  logSection("2. QUERY CHART OF ACCOUNTS");

  // Get expense accounts (Type = Expense) — these are what we map line items to
  const query = encodeURIComponent(
    "SELECT * FROM Account WHERE AccountType = 'Expense' MAXRESULTS 10"
  );
  const { status, data } = await qboFetch(`/query?query=${query}`);

  log("Expense Accounts Response", { status, data });

  const qr = data as { QueryResponse?: { Account?: Array<Record<string, unknown>> } };
  const accounts = qr?.QueryResponse?.Account;
  if (accounts && accounts.length > 0) {
    log("First Account Shape (keys)", Object.keys(accounts[0]));
    log("First Account Detail", accounts[0]);
    return accounts[0];
  }
  return null;
}

async function testCreateBill(
  vendor: Record<string, unknown> | null,
  account: Record<string, unknown> | null
) {
  logSection("3. CREATE A TEST BILL");

  if (!vendor || !account) {
    console.log("⚠️  Skipping bill creation — no vendor or account found.");
    return null;
  }

  const vendorId = (vendor as { Id?: string }).Id;
  const accountId = (account as { Id?: string }).Id;

  const billPayload = {
    VendorRef: {
      value: vendorId,
    },
    Line: [
      {
        DetailType: "AccountBasedExpenseLineDetail",
        Amount: 150.0,
        AccountBasedExpenseLineDetail: {
          AccountRef: {
            value: accountId,
          },
        },
        Description: "Docket test line item 1 — office supplies",
      },
      {
        DetailType: "AccountBasedExpenseLineDetail",
        Amount: 75.5,
        AccountBasedExpenseLineDetail: {
          AccountRef: {
            value: accountId,
          },
        },
        Description: "Docket test line item 2 — shipping",
      },
    ],
    TxnDate: "2026-03-15",
    DueDate: "2026-04-15",
    PrivateNote: "Created by Docket sandbox test script",
  };

  log("Bill Request Payload", billPayload);

  const { status, data } = await qboFetch("/bill", {
    method: "POST",
    body: JSON.stringify(billPayload),
  });

  log("Create Bill Response", { status, data });

  const bill = data as { Bill?: { Id?: string } };
  if (bill?.Bill?.Id) {
    log("Created Bill ID", bill.Bill.Id);
    return bill.Bill;
  }
  return null;
}

async function testAttachPdf(billId: string | undefined) {
  logSection("4. ATTACH PDF TO BILL");

  if (!billId) {
    console.log("⚠️  Skipping attachment — no bill ID.");
    return;
  }

  // Create a minimal test PDF in memory
  const testPdfPath = path.resolve(__dirname, "test-invoice.pdf");

  // If no test PDF exists, create a minimal one
  if (!fs.existsSync(testPdfPath)) {
    // Minimal valid PDF
    const minimalPdf = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF"
    );
    fs.writeFileSync(testPdfPath, minimalPdf);
    console.log("Created minimal test PDF at", testPdfPath);
  }

  // QBO uses multipart/form-data for attachments
  // The metadata must be sent as a JSON part, the file as a binary part
  const fileBuffer = fs.readFileSync(testPdfPath);
  const boundary = "----DocketTestBoundary" + Date.now();

  const metadataJson = JSON.stringify({
    AttachableRef: [
      {
        EntityRef: {
          type: "Bill",
          value: billId,
        },
      },
    ],
    FileName: "test-invoice.pdf",
    ContentType: "application/pdf",
  });

  // Build multipart body manually
  const parts: Buffer[] = [];
  // JSON metadata part
  parts.push(
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file_metadata_0"\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        metadataJson +
        `\r\n`
    )
  );
  // File part
  parts.push(
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file_content_0"; filename="test-invoice.pdf"\r\n` +
        `Content-Type: application/pdf\r\n\r\n`
    )
  );
  parts.push(fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  const url = `${BASE_URL}/upload`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      Accept: "application/json",
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  log("Attach PDF Response", { status: res.status, data });
}

async function testErrorCases() {
  logSection("5. ERROR CASES");

  // 5a. Bad token
  console.log("\n--- 5a. Bad Access Token ---");
  const badTokenRes = await fetch(
    `${BASE_URL}/query?query=${encodeURIComponent("SELECT * FROM Vendor MAXRESULTS 1")}`,
    {
      headers: {
        Authorization: "Bearer bad_token_12345",
        Accept: "application/json",
      },
    }
  );
  const badTokenData = await badTokenRes.text();
  log("Bad Token Response", {
    status: badTokenRes.status,
    headers: Object.fromEntries(badTokenRes.headers.entries()),
    body: badTokenData,
  });

  // 5b. Missing required fields on bill
  console.log("\n--- 5b. Missing VendorRef on Bill ---");
  const { status: missingVendorStatus, data: missingVendorData } = await qboFetch(
    "/bill",
    {
      method: "POST",
      body: JSON.stringify({
        Line: [
          {
            DetailType: "AccountBasedExpenseLineDetail",
            Amount: 100,
            AccountBasedExpenseLineDetail: {
              AccountRef: { value: "1" },
            },
          },
        ],
      }),
    }
  );
  log("Missing VendorRef Response", {
    status: missingVendorStatus,
    data: missingVendorData,
  });

  // 5c. Invalid VendorRef
  console.log("\n--- 5c. Invalid VendorRef ---");
  const { status: badVendorStatus, data: badVendorData } = await qboFetch("/bill", {
    method: "POST",
    body: JSON.stringify({
      VendorRef: { value: "999999" },
      Line: [
        {
          DetailType: "AccountBasedExpenseLineDetail",
          Amount: 100,
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: "1" },
          },
        },
      ],
    }),
  });
  log("Invalid VendorRef Response", {
    status: badVendorStatus,
    data: badVendorData,
  });

  // 5d. Missing Line items
  console.log("\n--- 5d. Bill with empty Line array ---");
  const { status: noLinesStatus, data: noLinesData } = await qboFetch("/bill", {
    method: "POST",
    body: JSON.stringify({
      VendorRef: { value: "1" },
      Line: [],
    }),
  });
  log("Empty Lines Response", { status: noLinesStatus, data: noLinesData });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 QBO Sandbox Validation — DOC-9");
  console.log(`   Company ID: ${COMPANY_ID}`);
  console.log(`   Base URL:   ${BASE_URL}`);
  console.log(`   Token:      ${ACCESS_TOKEN.slice(0, 20)}...`);
  console.log(`   Time:       ${new Date().toISOString()}`);

  try {
    const vendor = await testQueryVendors();
    const account = await testQueryAccounts();
    const bill = await testCreateBill(vendor, account);
    const billId = (bill as { Id?: string } | null)?.Id;
    await testAttachPdf(billId);
    await testErrorCases();

    logSection("✅ ALL TESTS COMPLETE");
    console.log("\nCopy relevant output into scripts/sandbox/sandbox-notes.md");
  } catch (err) {
    console.error("\n❌ SCRIPT FAILED:", err);
    process.exit(1);
  }
}

main();
