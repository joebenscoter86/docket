import type { TransactionType } from "@/lib/types/invoice";
import type { AccountingProviderType } from "./types";
import { getQuickBooksTransactionUrl } from "@/lib/quickbooks/links";

const XERO_BASE_URL = "https://go.xero.com";

function getXeroTransactionUrl(entityId: string): string {
  return `${XERO_BASE_URL}/AccountsPayable/View.aspx?InvoiceID=${encodeURIComponent(entityId)}`;
}

/**
 * Returns a URL to view the transaction in the connected accounting provider.
 * Falls back to the provider's transaction list if deep linking isn't supported.
 */
export function getTransactionUrl(
  provider: AccountingProviderType,
  transactionType: TransactionType,
  entityId: string
): string {
  if (provider === "quickbooks") {
    return getQuickBooksTransactionUrl(transactionType, entityId);
  }
  return getXeroTransactionUrl(entityId);
}

/**
 * Returns the display label for a provider.
 */
export function getProviderLabel(provider: AccountingProviderType): string {
  return provider === "quickbooks" ? "QuickBooks" : "Xero";
}
