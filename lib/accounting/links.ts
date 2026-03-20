import type { TransactionType } from "@/lib/types/invoice";
import type { AccountingProviderType } from "./types";
import { getQuickBooksTransactionUrl } from "@/lib/quickbooks/links";

const XERO_BASE_URL = "https://go.xero.com";

function getXeroTransactionUrl(): string {
  // Xero doesn't support deep links to individual bills.
  // Link to the bills awaiting payment list instead.
  return `${XERO_BASE_URL}/AccountsPayable/`;
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
  return getXeroTransactionUrl();
}

/**
 * Returns the display label for a provider.
 */
export function getProviderLabel(provider: AccountingProviderType): string {
  return provider === "quickbooks" ? "QuickBooks" : "Xero";
}
