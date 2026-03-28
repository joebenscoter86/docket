// ─── Provider Identity ───

export type AccountingProviderType = "quickbooks" | "xero";

// ─── Connection Info ───

/** Provider-agnostic shape of an accounting connection (no encrypted tokens). */
export interface AccountingConnectionInfo {
  id: string;
  orgId: string;
  provider: AccountingProviderType;
  companyId: string;
  companyName?: string;
  connectedAt: string;
  status?: 'active' | 'expired' | 'error';
  refreshTokenExpiresAt?: string | null;
}

// ─── Dropdown Option Types ───

/** A vendor formatted for dropdown display. Matches the existing QBO VendorOption shape. */
export interface VendorOption {
  value: string;
  label: string;
}

/** An expense account formatted for dropdown display. Matches the existing QBO AccountOption shape. */
export interface AccountOption {
  value: string;
  label: string;
  accountType: string;
}

/** A payment account (Bank or CreditCard) formatted for the payment selector. */
export interface PaymentAccount {
  id: string;
  name: string;
  accountType: string;
  currentBalance?: number;
}

// ─── Tracking Types ───

/** A tracking dimension (e.g., "Region", "Project"). Provider-agnostic. */
export interface TrackingCategory {
  id: string;
  name: string;
  options: TrackingOption[];
}

/** A single option within a tracking dimension. */
export interface TrackingOption {
  id: string;
  name: string;
}

/** A tracking assignment saved per line item (up to 2 entries). */
export interface TrackingAssignment {
  categoryId: string;
  categoryName: string;
  optionId: string;
  optionName: string;
}

// ─── Transaction Input Types ───

/** A single line item on a bill or purchase. */
export interface SyncLineItem {
  amount: number;
  glAccountId: string;
  description: string | null;
  tracking?: TrackingAssignment[];
}

/** Provider-agnostic input for creating a Bill (accounts payable). */
export interface CreateBillInput {
  /** QBO vendor ID or Xero contact ID */
  vendorRef: string;
  lineItems: SyncLineItem[];
  invoiceDate: string | null;
  dueDate: string | null;
  invoiceNumber: string | null;
}

/** Provider-agnostic input for creating a Purchase (Check / Cash / CreditCard). */
export interface CreatePurchaseInput {
  /** QBO vendor ID or Xero contact ID */
  vendorRef: string;
  /** The payment account ID (Bank account for Check/Cash, credit card account for CreditCard) */
  paymentAccountRef: string;
  paymentType: "Check" | "Cash" | "CreditCard";
  lineItems: SyncLineItem[];
  invoiceDate: string | null;
  invoiceNumber: string | null;
}

// ─── Transaction Result Types ───

/** The result returned after successfully creating a transaction in the accounting provider. */
export interface TransactionResult {
  /** Provider-assigned entity ID (e.g., QBO Bill Id or Xero Invoice ID) */
  entityId: string;
  /** Which entity type was created */
  entityType: "Bill" | "Purchase";
  /** Full raw response from the provider, stored in sync_log.provider_response */
  providerResponse: Record<string, unknown>;
}

/** The result returned after attempting to attach a document to a transaction. */
export interface AttachmentResult {
  /** Provider-assigned attachment ID, or null if the provider doesn't return one */
  attachmentId: string | null;
  success: boolean;
}

// ─── Error Type ───

/**
 * Normalised error thrown by accounting provider adapters.
 * Wraps provider-specific errors (e.g., QBOApiError) into a consistent shape
 * so the sync pipeline never needs to import provider-specific error classes.
 */
export class AccountingApiError extends Error {
  /** HTTP status code returned by the provider */
  public readonly statusCode: number;
  /** Provider error code (e.g., "2020", "3200" for QBO) */
  public readonly errorCode: string;
  /** Human-readable detail message from the provider */
  public readonly detail: string;
  /** Offending field name, if the provider identifies one (validation errors) */
  public readonly element?: string;

  constructor(params: {
    message: string;
    statusCode: number;
    errorCode: string;
    detail: string;
    element?: string;
  }) {
    super(params.message);
    this.name = "AccountingApiError";
    this.statusCode = params.statusCode;
    this.errorCode = params.errorCode;
    this.detail = params.detail;
    this.element = params.element;
  }
}

// ─── Connection Error ───

/**
 * Thrown when an accounting connection's refresh token is expired, revoked,
 * or otherwise unusable. Signals that the user must re-authorize.
 * Shared across QBO and Xero.
 */
export class ConnectionExpiredError extends Error {
  public readonly provider: AccountingProviderType;
  public readonly orgId: string;

  constructor(provider: AccountingProviderType, orgId: string, message?: string) {
    super(message ?? `${provider} connection expired for org ${orgId}`);
    this.name = "ConnectionExpiredError";
    this.provider = provider;
    this.orgId = orgId;
  }
}
