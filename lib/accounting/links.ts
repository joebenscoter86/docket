import type { TransactionType } from "@/lib/types/invoice";
import type { AccountingProviderType } from "./types";
import { getQuickBooksTransactionUrl } from "@/lib/quickbooks/links";

const XERO_BASE_URL = "https://go.xero.com";

function getXeroTransactionUrl(
  transactionType: TransactionType,
  entityId: string
): string {
  if (transactionType === "bill") {
    return `${XERO_BASE_URL}/AccountsPayable/View.aspx?InvoiceID=${encodeURIComponent(entityId)}`;
  }
  // Check, Cash, Credit Card → Bank Transaction
  return `${XERO_BASE_URL}/Bank/ViewTransaction.aspx?bankTransactionID=${encodeURIComponent(entityId)}`;
}

/**
 * Returns a URL to view the transaction in the connected accounting provider.
 * Routes to the correct deep link based on provider and transaction type.
 */
export function getTransactionUrl(
  provider: AccountingProviderType,
  transactionType: TransactionType,
  entityId: string
): string {
  if (provider === "quickbooks") {
    return getQuickBooksTransactionUrl(transactionType, entityId);
  }
  return getXeroTransactionUrl(transactionType, entityId);
}

/**
 * Returns the display label for a provider.
 */
export function getProviderLabel(provider: AccountingProviderType): string {
  return provider === "quickbooks" ? "QuickBooks" : "Xero";
}
