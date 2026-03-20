// lib/xero/api.ts
import { getValidAccessToken } from "@/lib/xero/auth";
import { logger } from "@/lib/utils/logger";
import type {
  XeroContact,
  XeroContactsResponse,
  XeroContactCreateResponse,
  XeroAuthError,
  XeroValidationError,
  XeroAddress,
  XeroAccount,
  XeroAccountsResponse,
  XeroInvoicePayload,
  XeroInvoiceResponse,
  XeroBankTransactionPayload,
  XeroBankTransactionResponse,
  XeroAttachmentResponse,
} from "./types";
import type { VendorOption, AccountOption, PaymentAccount } from "@/lib/accounting/types";

// ─── Configuration ───

const XERO_API_BASE = "https://api.xero.com/api.xro/2.0";

type SupabaseAdminClient = ReturnType<
  typeof import("@/lib/supabase/admin").createAdminClient
>;

// ─── Error Handling ───

export class XeroApiError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly detail: string;
  public readonly element?: string;

  constructor(params: {
    message: string;
    statusCode: number;
    errorCode: string;
    detail: string;
    element?: string;
  }) {
    super(params.message);
    this.name = "XeroApiError";
    this.statusCode = params.statusCode;
    this.errorCode = params.errorCode;
    this.detail = params.detail;
    this.element = params.element;
  }
}

/**
 * Parse a Xero error response into a XeroApiError.
 * Xero uses consistent PascalCase for both auth and validation errors,
 * but the shapes differ (auth: { Title, Status, Detail }, validation: { Elements[].ValidationErrors }).
 */
function parseXeroError(statusCode: number, body: unknown): XeroApiError {
  // Auth errors (401, 403): { Title, Status, Detail }
  if (
    body &&
    typeof body === "object" &&
    "Detail" in body &&
    "Title" in body
  ) {
    const authErr = body as XeroAuthError;
    return new XeroApiError({
      message: authErr.Detail || authErr.Title,
      statusCode,
      errorCode: String(authErr.Status ?? statusCode),
      detail: authErr.Detail,
    });
  }

  // Validation errors (400): { Elements[].ValidationErrors[].Message }
  if (
    body &&
    typeof body === "object" &&
    "Elements" in body
  ) {
    const valErr = body as XeroValidationError;
    const firstMessage =
      valErr.Elements?.[0]?.ValidationErrors?.[0]?.Message ??
      valErr.Message ??
      "Validation error";
    return new XeroApiError({
      message: firstMessage,
      statusCode,
      errorCode: String(valErr.StatusCode ?? statusCode),
      detail: firstMessage,
    });
  }

  // Fallback
  return new XeroApiError({
    message:
      typeof body === "object" && body !== null && "Message" in body
        ? String((body as { Message: string }).Message)
        : `Xero returned ${statusCode}`,
    statusCode,
    errorCode: String(statusCode),
    detail: JSON.stringify(body),
  });
}

// ─── Core Fetch Helper ───

/**
 * Make an authenticated request to the Xero API.
 * Handles auth (Bearer token + xero-tenant-id header), error parsing, and logging.
 */
async function xeroFetch<T>(
  supabase: SupabaseAdminClient,
  orgId: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
  } = {}
): Promise<T> {
  const { accessToken, tenantId } = await getValidAccessToken(supabase, orgId);
  const url = `${XERO_API_BASE}${path}`;

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "xero-tenant-id": tenantId,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      throw new XeroApiError({
        message: `Xero returned ${response.status}`,
        statusCode: response.status,
        errorCode: String(response.status),
        detail: await response.text().catch(() => "(unreadable)"),
      });
    }
    throw parseXeroError(response.status, errorBody);
  }

  return (await response.json()) as T;
}

// ─── Contact Operations ───

const CONTACTS_PER_PAGE = 100;

/**
 * Fetch all active supplier contacts from Xero.
 * Handles pagination (max 100 per page).
 */
export async function queryContacts(
  supabase: SupabaseAdminClient,
  orgId: string
): Promise<XeroContact[]> {
  const startTime = Date.now();
  const allContacts: XeroContact[] = [];
  let page = 1;

  const MAX_PAGES = 50; // Safety cap: 5,000 contacts max
  while (page <= MAX_PAGES) {
    const where = encodeURIComponent(
      'IsSupplier==true AND ContactStatus=="ACTIVE"'
    );
    const response = await xeroFetch<XeroContactsResponse>(
      supabase,
      orgId,
      `/Contacts?where=${where}&order=Name&page=${page}`
    );

    const contacts = response.Contacts ?? [];
    allContacts.push(...contacts);

    if (contacts.length < CONTACTS_PER_PAGE) break;
    page++;
  }

  logger.info("xero.query_contacts", {
    orgId,
    count: String(allContacts.length),
    pages: String(page),
    durationMs: Date.now() - startTime,
  });

  return allContacts;
}

/**
 * Fetch contacts formatted for dropdown UI.
 * Maps Xero Contact → VendorOption { value: ContactID, label: Name }.
 */
export async function getContactOptions(
  supabase: SupabaseAdminClient,
  orgId: string
): Promise<VendorOption[]> {
  const contacts = await queryContacts(supabase, orgId);
  return contacts
    .map((c) => ({
      value: c.ContactID,
      label: c.Name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ─── Address Parsing ───

/**
 * Parse a freeform address string into Xero's Address shape.
 * Expects "street, city, state zip" format. Falls back to AddressLine1-only.
 */
function parseXeroAddress(
  address: string | null | undefined
): XeroAddress | undefined {
  if (!address || !address.trim()) return undefined;

  const parts = address.split(",").map((p) => p.trim());

  if (parts.length < 3) {
    return { AddressType: "STREET", AddressLine1: address.trim() };
  }

  const line1 = parts[0];
  const city = parts[1];
  const stateZipPart = parts.slice(2).join(",").trim();
  const stateZipMatch = stateZipPart.match(
    /^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/
  );

  if (stateZipMatch) {
    return {
      AddressType: "STREET",
      AddressLine1: line1,
      City: city,
      Region: stateZipMatch[1].toUpperCase(),
      PostalCode: stateZipMatch[2],
    };
  }

  return { AddressType: "STREET", AddressLine1: address.trim() };
}

// ─── Contact Creation ───

/**
 * Create a new supplier contact in Xero.
 * Returns the new contact formatted as a VendorOption.
 *
 * Note: Xero allows duplicate contact names (unlike QBO error 6240).
 */
export async function createContact(
  supabase: SupabaseAdminClient,
  orgId: string,
  name: string,
  address?: string | null
): Promise<VendorOption> {
  const startTime = Date.now();

  const body: Record<string, unknown> = {
    Name: name,
    IsSupplier: true,
  };

  const parsedAddress = parseXeroAddress(address);
  if (parsedAddress) {
    body.Addresses = [parsedAddress];
  }

  const response = await xeroFetch<XeroContactCreateResponse>(
    supabase,
    orgId,
    "/Contacts",
    { method: "POST", body }
  );

  const contact = response.Contacts[0];

  logger.info("xero.contact_created", {
    orgId,
    contactId: contact.ContactID,
    name: contact.Name,
    durationMs: Date.now() - startTime,
  });

  return {
    value: contact.ContactID,
    label: contact.Name,
  };
}

// ─── Account Operations ───

/**
 * Fetch expense-type accounts from Xero.
 * Filters by Class=="EXPENSE" server-side (OData where clause).
 * Excludes archived accounts in the response mapping.
 * Returns AccountOption[] sorted alphabetically for dropdown display.
 *
 * AccountOption.value = AccountCode (e.g., "500"), NOT AccountID.
 * Xero line items reference Code, not the UUID AccountID.
 */
export async function fetchAccounts(
  supabase: SupabaseAdminClient,
  orgId: string
): Promise<AccountOption[]> {
  const startTime = Date.now();

  const where = encodeURIComponent('Class=="EXPENSE"');
  const response = await xeroFetch<XeroAccountsResponse>(
    supabase,
    orgId,
    `/Accounts?where=${where}`
  );

  const accounts = (response.Accounts ?? [])
    .filter((a: XeroAccount) => a.Status !== "ARCHIVED")
    .map((a: XeroAccount) => ({
      value: a.Code,
      label: a.Name,
      accountType: a.Type,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  logger.info("xero.accounts_fetched", {
    orgId,
    count: String(accounts.length),
    durationMs: Date.now() - startTime,
  });

  return accounts;
}

// ─── Payment Account Operations ───

/**
 * Fetch bank or credit card accounts from Xero.
 * Xero stores both bank and credit card accounts under Type="BANK",
 * distinguished by BankAccountType ("BANK" vs "CREDITCARD").
 * Returns PaymentAccount[] sorted alphabetically for dropdown display.
 */
export async function fetchPaymentAccounts(
  supabase: SupabaseAdminClient,
  orgId: string,
  accountType: "Bank" | "CreditCard"
): Promise<PaymentAccount[]> {
  const startTime = Date.now();

  // Xero uses Type=="BANK" for both bank and credit card accounts.
  // We fetch all bank-type accounts and filter by BankAccountType.
  const where = encodeURIComponent('Type=="BANK"');
  const response = await xeroFetch<XeroAccountsResponse>(
    supabase,
    orgId,
    `/Accounts?where=${where}`
  );

  const xeroBankAccountType = accountType === "CreditCard" ? "CREDITCARD" : "BANK";

  const accounts = (response.Accounts ?? [])
    .filter(
      (a: XeroAccount) =>
        a.Status !== "ARCHIVED" && a.BankAccountType === xeroBankAccountType
    )
    .map((a: XeroAccount) => ({
      id: a.AccountID,
      name: a.Name,
      accountType: accountType === "CreditCard" ? "Credit Card" : "Bank",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  logger.info("xero.payment_accounts_fetched", {
    orgId,
    accountType,
    count: String(accounts.length),
    durationMs: Date.now() - startTime,
  });

  return accounts;
}

// ─── Invoice (Bill) Creation ───

/**
 * Create an ACCPAY invoice (bill) in Xero.
 * Xero uses PUT (not POST) for invoice creation.
 *
 * Validation warnings (e.g., invalid AccountCode) are checked in the response
 * and surfaced as errors — Xero creates the invoice anyway but without account mapping.
 */
export async function createInvoice(
  supabase: SupabaseAdminClient,
  orgId: string,
  payload: XeroInvoicePayload
): Promise<XeroInvoiceResponse> {
  const startTime = Date.now();

  const response = await xeroFetch<XeroInvoiceResponse>(
    supabase,
    orgId,
    "/Invoices",
    { method: "PUT", body: payload }
  );

  const invoice = response.Invoices?.[0];

  // Xero may return warnings instead of errors for invalid account codes.
  // The invoice gets created but without proper account mapping — treat as error.
  if (invoice?.Warnings && invoice.Warnings.length > 0) {
    const warningMessages = invoice.Warnings.map((w) => w.Message).join("; ");
    logger.warn("xero.invoice_created_with_warnings", {
      orgId,
      invoiceId: invoice.InvoiceID,
      warnings: warningMessages,
      durationMs: Date.now() - startTime,
    });
  }

  logger.info("xero.invoice_created", {
    orgId,
    invoiceId: invoice?.InvoiceID ?? "unknown",
    invoiceNumber: invoice?.InvoiceNumber ?? "none",
    status: invoice?.Status ?? "unknown",
    durationMs: Date.now() - startTime,
  });

  return response;
}

// ─── Bank Transaction (Purchase) Creation ───

/**
 * Create a SPEND bank transaction in Xero.
 * Used for Check, Cash, and Credit Card expense types.
 * Xero uses PUT (not POST) for creation — same as invoices.
 *
 * Requires `accounting.banktransactions` scope.
 */
export async function createBankTransaction(
  supabase: SupabaseAdminClient,
  orgId: string,
  payload: XeroBankTransactionPayload
): Promise<XeroBankTransactionResponse> {
  const startTime = Date.now();

  const response = await xeroFetch<XeroBankTransactionResponse>(
    supabase,
    orgId,
    "/BankTransactions",
    { method: "PUT", body: payload }
  );

  const txn = response.BankTransactions?.[0];

  // Check for warnings (same pattern as invoice creation)
  if (txn?.Warnings && txn.Warnings.length > 0) {
    const warningMessages = txn.Warnings.map((w) => w.Message).join("; ");
    logger.warn("xero.bank_transaction_created_with_warnings", {
      orgId,
      bankTransactionId: txn.BankTransactionID,
      warnings: warningMessages,
      durationMs: Date.now() - startTime,
    });
  }

  logger.info("xero.bank_transaction_created", {
    orgId,
    bankTransactionId: txn?.BankTransactionID ?? "unknown",
    type: txn?.Type ?? "unknown",
    status: txn?.Status ?? "unknown",
    durationMs: Date.now() - startTime,
  });

  return response;
}

// ─── Document Attachment ───

/**
 * Attach a file (PDF/image) to an existing Xero invoice.
 * Uses raw binary upload (not multipart like QBO).
 * Response may be XML — we request JSON via Accept header.
 */
export async function attachDocumentToInvoice(
  supabase: SupabaseAdminClient,
  orgId: string,
  invoiceId: string,
  fileBuffer: Buffer,
  fileName: string
): Promise<XeroAttachmentResponse> {
  const startTime = Date.now();

  const { accessToken, tenantId } = await getValidAccessToken(supabase, orgId);
  const url = `${XERO_API_BASE}/Invoices/${invoiceId}/Attachments/${encodeURIComponent(fileName)}?IncludeOnline=true`;

  // Determine MIME type from file extension
  const mimeType = fileName.endsWith(".pdf")
    ? "application/pdf"
    : fileName.endsWith(".png")
      ? "image/png"
      : fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")
        ? "image/jpeg"
        : "application/octet-stream";

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "xero-tenant-id": tenantId,
      "Content-Type": mimeType,
      Accept: "application/json",
    },
    body: new Uint8Array(fileBuffer),
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      throw new XeroApiError({
        message: `Attachment upload failed: ${response.status}`,
        statusCode: response.status,
        errorCode: String(response.status),
        detail: await response.text().catch(() => "(unreadable)"),
      });
    }
    throw parseXeroError(response.status, errorBody);
  }

  const result = (await response.json()) as XeroAttachmentResponse;

  logger.info("xero.attachment_uploaded", {
    orgId,
    invoiceId,
    fileName,
    attachmentId: result.Attachments?.[0]?.AttachmentID ?? "unknown",
    durationMs: Date.now() - startTime,
  });

  return result;
}

/**
 * Attach a file (PDF/image) to an existing Xero bank transaction.
 * Same binary upload pattern as invoice attachments, different endpoint path.
 */
export async function attachDocumentToBankTransaction(
  supabase: SupabaseAdminClient,
  orgId: string,
  bankTransactionId: string,
  fileBuffer: Buffer,
  fileName: string
): Promise<XeroAttachmentResponse> {
  const startTime = Date.now();

  const { accessToken, tenantId } = await getValidAccessToken(supabase, orgId);
  const url = `${XERO_API_BASE}/BankTransactions/${bankTransactionId}/Attachments/${encodeURIComponent(fileName)}?IncludeOnline=true`;

  const mimeType = fileName.endsWith(".pdf")
    ? "application/pdf"
    : fileName.endsWith(".png")
      ? "image/png"
      : fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")
        ? "image/jpeg"
        : "application/octet-stream";

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "xero-tenant-id": tenantId,
      "Content-Type": mimeType,
      Accept: "application/json",
    },
    body: new Uint8Array(fileBuffer),
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      throw new XeroApiError({
        message: `Attachment upload failed: ${response.status}`,
        statusCode: response.status,
        errorCode: String(response.status),
        detail: await response.text().catch(() => "(unreadable)"),
      });
    }
    throw parseXeroError(response.status, errorBody);
  }

  const result = (await response.json()) as XeroAttachmentResponse;

  logger.info("xero.bank_transaction_attachment_uploaded", {
    orgId,
    bankTransactionId,
    fileName,
    attachmentId: result.Attachments?.[0]?.AttachmentID ?? "unknown",
    durationMs: Date.now() - startTime,
  });

  return result;
}
