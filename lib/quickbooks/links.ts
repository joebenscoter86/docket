import type { TransactionType } from "@/lib/types/invoice";

const QBO_BASE_URL = "https://app.qbo.intuit.com";

/**
 * Maps transaction types to QBO web app URL paths.
 * Bills use /app/bill, all Purchase-based types use /app/expense.
 */
const TRANSACTION_TYPE_PATHS: Record<TransactionType, string> = {
  bill: "/app/bill",
  check: "/app/check",
  cash: "/app/expense",
  credit_card: "/app/expense",
};

/**
 * Returns a deep link URL to view a transaction in QuickBooks Online.
 *
 * @param transactionType - The type of transaction (bill, check, cash, credit_card)
 * @param entityId - The QBO entity ID (provider_bill_id from sync_log)
 * @returns Full URL to the transaction in QBO's web app
 */
export function getQuickBooksTransactionUrl(
  transactionType: TransactionType,
  entityId: string
): string {
  const path = TRANSACTION_TYPE_PATHS[transactionType];
  return `${QBO_BASE_URL}${path}?txnId=${encodeURIComponent(entityId)}`;
}
