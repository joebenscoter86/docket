export interface VendorOption {
  value: string;    // QBO Vendor ID
  label: string;    // DisplayName
}

export interface AccountOption {
  value: string;       // QBO Account ID
  label: string;       // Name or FullyQualifiedName
  accountType: string; // e.g., "Expense"
}
