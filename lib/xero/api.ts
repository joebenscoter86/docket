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
} from "./types";
import type { VendorOption, AccountOption } from "@/lib/accounting/types";

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

  constructor(params: {
    message: string;
    statusCode: number;
    errorCode: string;
    detail: string;
  }) {
    super(params.message);
    this.name = "XeroApiError";
    this.statusCode = params.statusCode;
    this.errorCode = params.errorCode;
    this.detail = params.detail;
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
