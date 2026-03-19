// ─── QBO API Response Types ───

export interface QBOVendor {
  Id: string;
  DisplayName: string;
  CompanyName?: string;
  PrintOnCheckName?: string;
  Active: boolean;
  Balance: number;
  BillAddr?: {
    Id: string;
    Line1?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
  };
  PrimaryPhone?: { FreeFormNumber: string };
  PrimaryEmailAddr?: { Address: string };
  CurrencyRef?: { value: string; name: string };
  SyncToken: string;
  MetaData?: { CreateTime: string; LastUpdatedTime: string };
}

export interface QBOAccount {
  Id: string;
  Name: string;
  FullyQualifiedName: string;
  Active: boolean;
  Classification: string;
  AccountType: string;
  AccountSubType?: string;
  SubAccount: boolean;
  ParentRef?: { value: string };
  CurrentBalance: number;
  CurrencyRef?: { value: string; name: string };
}

// ─── Bill Creation Types ───

export interface QBOBillLineDetail {
  AccountRef: { value: string };
}

export interface QBOBillLine {
  DetailType: "AccountBasedExpenseLineDetail";
  Amount: number;
  AccountBasedExpenseLineDetail: QBOBillLineDetail;
  Description?: string;
}

export interface QBOBillPayload {
  VendorRef: { value: string };
  Line: QBOBillLine[];
  TxnDate?: string;
  DueDate?: string;
  DocNumber?: string;
  PrivateNote?: string;
}

export interface QBOBillResponse {
  Bill: {
    Id: string;
    SyncToken: string;
    VendorRef: { value: string; name: string };
    TotalAmt: number;
    Balance: number;
    APAccountRef: { value: string; name: string };
    CurrencyRef: { value: string; name: string };
    TxnDate: string;
    DueDate: string;
    DocNumber?: string;
    Line: Array<{
      Id: string;
      LineNum: number;
      Amount: number;
      DetailType: string;
      Description?: string;
      AccountBasedExpenseLineDetail?: {
        AccountRef: { value: string; name: string };
      };
    }>;
    MetaData: { CreateTime: string; LastUpdatedTime: string };
  };
  time: string;
}

// ─── Attachment Types ───

export interface QBOAttachmentMetadata {
  AttachableRef: Array<{
    EntityRef: {
      type: string;
      value: string;
    };
  }>;
  FileName: string;
  ContentType: string;
}

export interface QBOAttachableResponse {
  AttachableResponse: Array<{
    Attachable: {
      Id: string;
      FileName: string;
      FileAccessUri: string;
      TempDownloadUri: string;
      Size: number;
      ContentType: string;
      AttachableRef: Array<{
        EntityRef: { type: string; value: string };
      }>;
    };
  }>;
  time: string;
}

// ─── Error Types ───

export interface QBOErrorDetail {
  Message: string;
  Detail: string;
  code: string;
  element?: string;
}

export interface QBOFault {
  Error: QBOErrorDetail[];
  type: string;
}

// QBO returns inconsistent casing on error responses:
// Auth errors (401): { fault: { error: [...] } }
// Validation errors (400): { Fault: { Error: [...] } }
export interface QBOErrorResponse {
  Fault?: QBOFault;
  fault?: {
    error: QBOErrorDetail[];
    type: string;
  };
}

// ─── Purchase Creation Types (Check/Cash/CreditCard) ───

export interface QBOPurchaseLine {
  Amount: number;
  DetailType: "AccountBasedExpenseLineDetail";
  AccountBasedExpenseLineDetail: {
    AccountRef: { value: string };
    Description?: string;
  };
}

export interface QBOPurchasePayload {
  PaymentType: "Check" | "Cash" | "CreditCard";
  AccountRef: { value: string };
  EntityRef: { value: string; type: "Vendor" };
  TxnDate?: string;
  DocNumber?: string;
  Line: QBOPurchaseLine[];
}

export interface QBOPurchaseResponse {
  Purchase: {
    Id: string;
    PaymentType: string;
    TotalAmt: number;
  };
  time: string;
}

// ─── Payment Account Types ───

export interface QBOPaymentAccount {
  id: string;
  name: string;
  accountType: string;
  currentBalance?: number;
}

// ─── Token / Connection Types ───

export interface QBOTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  companyId: string;
}

export interface QBOTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  x_refresh_token_expires_in: number;
}

export interface AccountingConnectionRow {
  id: string;
  org_id: string;
  provider: "quickbooks" | "xero";
  access_token: string; // encrypted
  refresh_token: string; // encrypted
  token_expires_at: string;
  company_id: string;
  connected_at: string;
  company_name?: string;
}

// ─── Dropdown Types (for UI) ───

export interface VendorOption {
  value: string;
  label: string;
}

export interface AccountOption {
  value: string;
  label: string;
  accountType: string;
}
