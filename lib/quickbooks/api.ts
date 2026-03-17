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

  return (await response.json()) as T;
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

// ─── Attachment Operations ───

/**
 * Attach a PDF to a bill via QBO's Attachable upload endpoint.
 * Uses multipart form-data with file_metadata_0 + file_content_0.
 */
export async function attachPdfToBill(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string,
  billId: string,
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
          type: "Bill",
          value: billId,
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
      billId,
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
    billId,
    attachmentId: result.AttachableResponse?.[0]?.Attachable?.Id,
    durationMs: Date.now() - startTime,
  });

  return result;
}
