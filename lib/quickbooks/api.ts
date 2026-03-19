import { getValidAccessToken, getCompanyBaseUrl } from "./auth";
import { logger } from "@/lib/utils/logger";
import type {
  QBOVendor,
  QBOAccount,
  QBOBillPayload,
  QBOBillResponse,
  QBOAttachableResponse,
  QBOAttachmentMetadata,
  QBOErrorResponse,
  QBOErrorDetail,
  QBOPurchasePayload,
  QBOPurchaseResponse,
  QBOPaymentAccount,
  VendorOption,
  AccountOption,
} from "./types";

// ─── Error Handling ───

export class QBOApiError extends Error {
  public statusCode: number;
  public qboErrors: QBOErrorDetail[];
  public faultType: string;

  constructor(statusCode: number, errors: QBOErrorDetail[], faultType: string) {
    const message = errors[0]?.Message ?? "Unknown QBO error";
    super(message);
    this.name = "QBOApiError";
    this.statusCode = statusCode;
    this.qboErrors = errors;
    this.faultType = faultType;
  }

  /** Get the QBO error code (string like "2020", "2500", "3200") */
  get errorCode(): string {
    return this.qboErrors[0]?.code ?? "unknown";
  }

  /** Get the offending field name (if validation error) */
  get element(): string | undefined {
    return this.qboErrors[0]?.element;
  }

  /** Get the detail message */
  get detail(): string {
    return this.qboErrors[0]?.Detail ?? this.message;
  }
}

/**
 * Parse QBO error response, handling inconsistent casing between
 * auth errors (lowercase: fault.error) and validation errors (uppercase: Fault.Error).
 */
function parseQBOError(
  statusCode: number,
  body: QBOErrorResponse
): QBOApiError {
  // Try uppercase first (validation errors)
  if (body.Fault?.Error) {
    return new QBOApiError(statusCode, body.Fault.Error, body.Fault.type);
  }

  // Try lowercase (auth errors)
  if (body.fault?.error) {
    // Normalize to uppercase shape
    const normalizedErrors: QBOErrorDetail[] = body.fault.error.map((e) => ({
      Message: e.Message,
      Detail: e.Detail,
      code: e.code,
      element: e.element,
    }));
    return new QBOApiError(statusCode, normalizedErrors, body.fault.type);
  }

  // Fallback
  return new QBOApiError(
    statusCode,
    [{ Message: "Unknown error", Detail: JSON.stringify(body), code: "unknown" }],
    "unknown"
  );
}

// ─── Core Fetch Helper ───

/**
 * Make an authenticated request to the QBO API.
 * Handles auth, error parsing, and logging.
 */
async function qboFetch<T>(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  const { accessToken, companyId } = await getValidAccessToken(supabase, orgId);
  const url = `${getCompanyBaseUrl(companyId)}${path}`;

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let errorBody: QBOErrorResponse;
    try {
      errorBody = (await response.json()) as QBOErrorResponse;
    } catch {
      throw new QBOApiError(
        response.status,
        [{ Message: `QBO returned ${response.status}`, Detail: await response.text(), code: "unknown" }],
        "unknown"
      );
    }
    throw parseQBOError(response.status, errorBody);
  }

  // Catch malformed JSON responses from QBO (pre-existing gap fix)
  let responseBody: T;
  try {
    responseBody = (await response.json()) as T;
  } catch {
    const rawText = await response.text().catch(() => "(unreadable)");
    logger.error("qbo.malformed_json_response", {
      path,
      status: String(response.status),
      rawResponse: rawText.slice(0, 500),
    });
    throw new QBOApiError(
      response.status,
      [{ Message: "Unexpected response from QuickBooks", Detail: "Malformed JSON in response body", code: "malformed_response" }],
      "unknown"
    );
  }
  return responseBody;
}

// ─── Vendor Operations ───

interface QBOQueryResponse<T> {
  QueryResponse: {
    [key: string]: T[] | undefined;
    startPosition?: never;
    maxResults?: never;
    totalCount?: never;
  };
  time: string;
}

/**
 * Fetch all active vendors from QBO.
 * Returns raw QBO vendor objects.
 */
export async function queryVendors(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string
): Promise<QBOVendor[]> {
  const startTime = Date.now();

  const response = await qboFetch<QBOQueryResponse<QBOVendor>>(
    supabase,
    orgId,
    `/query?query=${encodeURIComponent("SELECT * FROM Vendor WHERE Active = true MAXRESULTS 1000")}`
  );

  const vendors = response.QueryResponse.Vendor ?? [];

  logger.info("qbo.query_vendors", {
    orgId,
    count: String(vendors.length),
    durationMs: Date.now() - startTime,
  });

  return vendors;
}

/**
 * Fetch vendors formatted for dropdown UI.
 */
export async function getVendorOptions(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string
): Promise<VendorOption[]> {
  const vendors = await queryVendors(supabase, orgId);
  return vendors
    .map((v) => ({
      value: v.Id,
      label: v.DisplayName,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Parse an address string into QBO BillAddr fields.
 * Expects "street, city, state zip" format.
 * Falls back to Line1-only if unparseable.
 */
export function parseAddress(
  address: string | null | undefined
): { Line1: string; City?: string; CountrySubDivisionCode?: string; PostalCode?: string } | undefined {
  if (!address || !address.trim()) return undefined;

  const parts = address.split(",").map((p) => p.trim());

  if (parts.length < 3) {
    return { Line1: address.trim() };
  }

  const line1 = parts[0];
  const city = parts[1];
  // Last part should be "ST 12345" or just state
  const stateZipPart = parts.slice(2).join(",").trim();
  const stateZipMatch = stateZipPart.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);

  if (stateZipMatch) {
    return {
      Line1: line1,
      City: city,
      CountrySubDivisionCode: stateZipMatch[1].toUpperCase(),
      PostalCode: stateZipMatch[2],
    };
  }

  // Couldn't parse state/zip — fall back to Line1 only
  return { Line1: address.trim() };
}

interface QBOVendorCreateResponse {
  Vendor: QBOVendor;
  time: string;
}

/**
 * Create a new vendor in QBO.
 * Returns the new vendor formatted as a VendorOption.
 */
export async function createVendor(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string,
  displayName: string,
  address?: string | null
): Promise<VendorOption> {
  const startTime = Date.now();

  const body: Record<string, unknown> = {
    DisplayName: displayName,
  };

  const billAddr = parseAddress(address);
  if (billAddr) {
    body.BillAddr = billAddr;
  }

  const response = await qboFetch<QBOVendorCreateResponse>(
    supabase,
    orgId,
    "/vendor",
    {
      method: "POST",
      body,
    }
  );

  logger.info("qbo.vendor_created", {
    orgId,
    vendorId: response.Vendor.Id,
    displayName: response.Vendor.DisplayName,
    durationMs: Date.now() - startTime,
  });

  return {
    value: response.Vendor.Id,
    label: response.Vendor.DisplayName,
  };
}

// ─── Account Operations ───

/**
 * Fetch all active expense accounts from QBO.
 * Returns raw QBO account objects.
 */
export async function queryAccounts(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string
): Promise<QBOAccount[]> {
  const startTime = Date.now();

  const response = await qboFetch<QBOQueryResponse<QBOAccount>>(
    supabase,
    orgId,
    `/query?query=${encodeURIComponent("SELECT * FROM Account WHERE AccountType = 'Expense' AND Active = true MAXRESULTS 1000")}`
  );

  const accounts = response.QueryResponse.Account ?? [];

  logger.info("qbo.query_accounts", {
    orgId,
    count: String(accounts.length),
    durationMs: Date.now() - startTime,
  });

  return accounts;
}

/**
 * Fetch accounts formatted for dropdown UI.
 * Uses FullyQualifiedName for sub-accounts to show hierarchy.
 */
export async function getAccountOptions(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string
): Promise<AccountOption[]> {
  const accounts = await queryAccounts(supabase, orgId);
  return accounts
    .map((a) => ({
      value: a.Id,
      label: a.SubAccount ? a.FullyQualifiedName : a.Name,
      accountType: a.AccountType,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ─── Bill Operations ───

/**
 * Create a bill in QBO.
 * Returns the full bill response (includes QBO-assigned Id, SyncToken, etc.).
 */
export async function createBill(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string,
  bill: QBOBillPayload
): Promise<QBOBillResponse> {
  const startTime = Date.now();

  const response = await qboFetch<QBOBillResponse>(
    supabase,
    orgId,
    "/bill",
    {
      method: "POST",
      body: bill,
    }
  );

  logger.info("qbo.bill_created", {
    orgId,
    billId: response.Bill.Id,
    totalAmt: String(response.Bill.TotalAmt),
    durationMs: Date.now() - startTime,
  });

  return response;
}

// ─── Payment Account Operations ───

/**
 * Fetch active payment accounts from QBO (Bank or CreditCard type).
 * Used for the payment account selector when output_type is non-Bill.
 */
export async function fetchPaymentAccounts(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string,
  accountType: "Bank" | "CreditCard"
): Promise<QBOPaymentAccount[]> {
  const startTime = Date.now();

  const query = `SELECT * FROM Account WHERE AccountType = '${accountType === "CreditCard" ? "Credit Card" : "Bank"}' AND Active = true MAXRESULTS 1000`;

  const response = await qboFetch<QBOQueryResponse<QBOAccount>>(
    supabase,
    orgId,
    `/query?query=${encodeURIComponent(query)}`
  );

  const accounts = response.QueryResponse.Account ?? [];

  logger.info("qbo.query_payment_accounts", {
    orgId,
    accountType,
    count: String(accounts.length),
    durationMs: Date.now() - startTime,
  });

  return accounts.map((a) => ({
    id: a.Id,
    name: a.Name,
    accountType: a.AccountType,
    currentBalance: a.CurrentBalance,
  }));
}

// ─── Purchase Operations (Check/Cash/CreditCard) ───

/**
 * Create a Purchase in QBO (Check, Cash Expense, or Credit Card).
 * All three non-Bill types use the same endpoint with different PaymentType values.
 */
export async function createPurchase(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string,
  purchase: QBOPurchasePayload
): Promise<QBOPurchaseResponse> {
  const startTime = Date.now();

  const response = await qboFetch<QBOPurchaseResponse>(
    supabase,
    orgId,
    "/purchase",
    {
      method: "POST",
      body: purchase,
    }
  );

  logger.info("qbo.purchase_created", {
    orgId,
    purchaseId: response.Purchase.Id,
    paymentType: response.Purchase.PaymentType,
    totalAmt: String(response.Purchase.TotalAmt),
    durationMs: Date.now() - startTime,
  });

  return response;
}

// ─── Attachment Operations ───

/**
 * Attach a PDF to a Bill or Purchase via QBO's Attachable upload endpoint.
 * Uses multipart form-data with file_metadata_0 + file_content_0.
 *
 * Replaces the former `attachPdfToBill` — now accepts entityType parameter
 * to support both Bill and Purchase attachments.
 */
export async function attachPdfToEntity(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string,
  entityId: string,
  entityType: "Bill" | "Purchase",
  fileBuffer: Buffer,
  fileName: string
): Promise<QBOAttachableResponse> {
  const startTime = Date.now();
  const { accessToken, companyId } = await getValidAccessToken(supabase, orgId);
  const url = `${getCompanyBaseUrl(companyId)}/upload`;

  const boundary = `----QBOBoundary${Date.now()}`;

  const metadata: QBOAttachmentMetadata = {
    AttachableRef: [
      {
        EntityRef: {
          type: entityType,
          value: entityId,
        },
      },
    ],
    FileName: fileName,
    ContentType: "application/pdf",
  };

  // Build multipart body manually (QBO requires specific part names)
  const metadataPart = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file_metadata_0"',
    "Content-Type: application/json",
    "",
    JSON.stringify(metadata),
  ].join("\r\n");

  const fileHeader = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file_content_0"; filename="${fileName}"`,
    "Content-Type: application/pdf",
    "Content-Transfer-Encoding: base64",
    "",
  ].join("\r\n");

  const ending = `\r\n--${boundary}--`;

  // Combine parts into a single buffer
  const bodyParts = Buffer.concat([
    Buffer.from(metadataPart + "\r\n"),
    Buffer.from(fileHeader),
    fileBuffer,
    Buffer.from(ending),
  ]);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: bodyParts,
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("qbo.attach_pdf_failed", {
      orgId,
      entityId,
      entityType,
      status: String(response.status),
      error: errorText,
    });
    throw new QBOApiError(
      response.status,
      [{ Message: "PDF attachment failed", Detail: errorText, code: "attachment_error" }],
      "attachment"
    );
  }

  const result = (await response.json()) as QBOAttachableResponse;

  logger.info("qbo.pdf_attached", {
    orgId,
    entityId,
    entityType,
    attachmentId: result.AttachableResponse?.[0]?.Attachable?.Id,
    durationMs: Date.now() - startTime,
  });

  return result;
}
