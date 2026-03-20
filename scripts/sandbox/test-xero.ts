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

// ── Tests ─────────────────────────────────────────────────────────────────────

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

// ── Main ──────────────────────────────────────────────────────────────────────

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
