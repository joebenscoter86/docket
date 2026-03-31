// lib/xero/types.ts

/**
 * Token response shape from Xero's token endpoint.
 * Confirmed in DOC-53 sandbox validation.
 */
export interface XeroTokenResponse {
  id_token: string;
  access_token: string;
  expires_in: number; // 1800 (30 min)
  token_type: "Bearer";
  refresh_token: string;
  scope: string;
}

/**
 * Internal representation after token exchange.
 * Mirrors QBOTokens in lib/quickbooks/types.ts.
 */
export interface XeroTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Tenant object from GET https://api.xero.com/connections.
 * After OAuth, this endpoint returns the list of orgs the user authorized.
 * We take the first tenant.
 */
export interface XeroTenant {
  id: string; // UUID
  authEventId: string;
  tenantId: string; // UUID — stored as company_id in accounting_connections
  tenantType: string; // "ORGANISATION"
  tenantName: string; // stored as company_name
  createdDateUtc: string;
  updatedDateUtc: string;
}

/**
 * Database row shape for accounting_connections table.
 * Re-declared here to avoid cross-provider import from lib/quickbooks/types.
 * Keeps parallel module structure clean (Xero auth doesn't depend on QBO types).
 */
export interface AccountingConnectionRow {
  id: string;
  org_id: string;
  provider: "quickbooks" | "xero";
  access_token: string; // encrypted
  refresh_token: string; // encrypted
  token_expires_at: string;
  company_id: string;
  connected_at: string;
  company_name?: string | null;
  status?: string;
  refresh_token_expires_at?: string | null;
}

// ─── Xero API Response Types ───

/** A single Xero Contact as returned by GET /api.xro/2.0/Contacts */
export interface XeroContact {
  ContactID: string; // UUID
  Name: string;
  ContactStatus: "ACTIVE" | "ARCHIVED" | "GDPRREQUEST";
  IsSupplier: boolean;
  IsCustomer: boolean;
  EmailAddress?: string;
  AccountNumber?: string;
  Addresses?: XeroAddress[];
}

export interface XeroAddress {
  AddressType: "POBOX" | "STREET";
  AddressLine1?: string;
  City?: string;
  Region?: string;
  PostalCode?: string;
  Country?: string;
}

/** Response shape from GET /api.xro/2.0/Contacts */
export interface XeroContactsResponse {
  Contacts: XeroContact[];
}

/** Response shape from POST /api.xro/2.0/Contacts (single contact) */
export interface XeroContactCreateResponse {
  Contacts: XeroContact[];
}

// ─── Xero Error Types ───

/** Xero auth error shape (401/403). PascalCase — consistent unlike QBO. */
export interface XeroAuthError {
  Title: string;
  Status: number;
  Detail: string;
}

/** Xero validation error shape (400). */
export interface XeroValidationError {
  StatusCode: number;
  Message: string;
  Elements?: Array<{
    ValidationErrors?: Array<{
      Message: string;
    }>;
  }>;
}

// ─── Xero Account Types ───

/** A single account from Xero's Chart of Accounts API. */
export interface XeroAccount {
  AccountID: string;     // UUID
  Code: string;          // e.g., "500" — line items reference this
  Name: string;          // display name
  Status: "ACTIVE" | "ARCHIVED";
  Type: string;          // "EXPENSE" | "DIRECTCOSTS" | "OVERHEADS" | "BANK" | etc.
  Class: string;         // "EXPENSE" | "REVENUE" | "ASSET" | etc.
  BankAccountType?: "BANK" | "CREDITCARD" | "";  // Only set on Type="BANK" accounts
  Description?: string;
  TaxType?: string;
  CurrencyCode?: string;
}

/** Wrapper for Xero Accounts API list response. */
export interface XeroAccountsResponse {
  Accounts: XeroAccount[];
}

// ─── Xero Tax Rate Types ───

/** A single tax rate from GET /api.xro/2.0/TaxRates. */
export interface XeroTaxRate {
  Name: string;
  TaxType: string;              // e.g., "INPUT", "NONE", "TAX001"
  EffectiveRate: string;        // e.g., "10.0000" — string, not number
  Status: "ACTIVE" | "DELETED" | "ARCHIVED";
  CanApplyToAssets: boolean;
  CanApplyToEquity: boolean;
  CanApplyToExpenses: boolean;
  CanApplyToLiabilities: boolean;
  CanApplyToRevenue: boolean;
  DisplayTaxRate: number;       // effective rate as number
  ReportTaxType?: string;
}

/** Response from GET /api.xro/2.0/TaxRates. */
export interface XeroTaxRatesResponse {
  TaxRates: XeroTaxRate[];
}

// ─── Xero Invoice (Bill) Types ───

/** A single line item in a Xero Invoice payload. */
export interface XeroLineItem {
  Description: string;
  Quantity: number;
  UnitAmount: number;
  AccountCode: string;
  TaxType?: string;
  Tracking?: Array<{
    TrackingCategoryID: string;
    TrackingOptionID: string;
  }>;
}

/**
 * Payload for creating an ACCPAY invoice (bill) via PUT /api.xro/2.0/Invoices.
 * Xero uses PUT for creation — POST is not supported.
 */
export interface XeroInvoicePayload {
  Type: "ACCPAY";
  Contact: { ContactID: string };
  DateString?: string;       // YYYY-MM-DD
  DueDateString?: string;    // YYYY-MM-DD
  InvoiceNumber?: string;
  Reference?: string;
  LineItems: XeroLineItem[];
  CurrencyCode?: string;
  Status?: "DRAFT" | "SUBMITTED" | "AUTHORISED";
  LineAmountTypes?: "Exclusive" | "Inclusive" | "NoTax";
}

/** A Xero Invoice as returned by the API. */
export interface XeroInvoice {
  InvoiceID: string;         // UUID
  InvoiceNumber: string;
  Type: "ACCPAY" | "ACCREC";
  Status: string;
  Contact: { ContactID: string; Name: string };
  DateString: string;
  DueDateString: string;
  Total: number;
  AmountDue: number;
  CurrencyCode: string;
  LineItems: XeroLineItem[];
  Warnings?: Array<{ Message: string }>;
}

/** Response shape from PUT /api.xro/2.0/Invoices. */
export interface XeroInvoiceResponse {
  Invoices: XeroInvoice[];
}

// ─── Xero Bank Transaction Types ───

/** A single line item in a Xero Bank Transaction payload. Same shape as invoice line items. */
export interface XeroBankTransactionLineItem {
  Description: string;
  Quantity: number;
  UnitAmount: number;
  AccountCode: string;
  TaxType?: string;
  Tracking?: Array<{
    TrackingCategoryID: string;
    TrackingOptionID: string;
  }>;
}

/**
 * Payload for creating a SPEND bank transaction via PUT /api.xro/2.0/BankTransactions.
 * Used for Check, Cash, and Credit Card expense types.
 * Xero uses PUT for creation (same as invoices).
 */
export interface XeroBankTransactionPayload {
  Type: "SPEND";
  Contact: { ContactID: string };
  BankAccount: { AccountID: string };
  LineItems: XeroBankTransactionLineItem[];
  Date?: string;        // YYYY-MM-DD
  Reference?: string;
  Status?: "AUTHORISED" | "DRAFT";
  LineAmountTypes?: "Exclusive" | "Inclusive" | "NoTax";
}

/** A Xero Bank Transaction as returned by the API. */
export interface XeroBankTransaction {
  BankTransactionID: string;   // UUID
  Type: "SPEND" | "RECEIVE";
  Contact: { ContactID: string; Name: string };
  BankAccount: { AccountID: string; Name: string; Code: string };
  DateString: string;
  Reference?: string;
  Total: number;
  Status: string;
  LineItems: XeroBankTransactionLineItem[];
  Warnings?: Array<{ Message: string }>;
}

/** Response shape from PUT /api.xro/2.0/BankTransactions. */
export interface XeroBankTransactionResponse {
  BankTransactions: XeroBankTransaction[];
}

// ─── Xero Attachment Types ───

/** Response shape from POST /api.xro/2.0/Invoices/{id}/Attachments/{filename}. */
export interface XeroAttachmentResponse {
  Attachments: Array<{
    AttachmentID: string;
    FileName: string;
    Url: string;
    MimeType: string;
    ContentLength: number;
  }>;
}

// ─── Xero Tracking Category Types ───

/** A single option within a Xero tracking category. */
export interface XeroTrackingOption {
  TrackingOptionID: string;
  Name: string;
  Status: "ACTIVE" | "ARCHIVED" | "DELETED";
}

/** A tracking category (dimension) from Xero. Max 2 per org. */
export interface XeroTrackingCategory {
  TrackingCategoryID: string;
  Name: string;
  Status: "ACTIVE" | "ARCHIVED" | "DELETED";
  Options: XeroTrackingOption[];
}

/** Response from GET /api.xro/2.0/TrackingCategories. */
export interface XeroTrackingCategoriesResponse {
  TrackingCategories: XeroTrackingCategory[];
}
