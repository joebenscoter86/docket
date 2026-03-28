import type { AccountingProvider } from "./provider";
import type { AccountingProviderType } from "./types";
import { QuickBooksAccountingAdapter } from "./quickbooks/adapter";
import { XeroAccountingAdapter } from "./xero/adapter";

// ─── Factory ───

/**
 * Instantiate the correct `AccountingProvider` adapter for a given provider type.
 *
 * Mirrors `getExtractionProvider()` in `lib/extraction/provider.ts`.
 * Adding a new provider means adding a case here and creating its adapter — nothing else changes.
 *
 * @throws If an unrecognised provider type is passed (exhaustive check at compile time).
 */
export function getAccountingProvider(
  provider: AccountingProviderType
): AccountingProvider {
  switch (provider) {
    case "quickbooks":
      return new QuickBooksAccountingAdapter();
    case "xero":
      return new XeroAccountingAdapter();
    default: {
      // Exhaustive check — this line is unreachable at runtime if all cases are handled
      const _unreachable: never = provider;
      throw new Error(`Unknown accounting provider: ${String(_unreachable)}`);
    }
  }
}

// ─── Re-exports ───

// Shared types
export type {
  AccountingProviderType,
  AccountingConnectionInfo,
  VendorOption,
  AccountOption,
  PaymentAccount,
  TrackingCategory,
  TrackingOption,
  TrackingAssignment,
  SyncLineItem,
  CreateBillInput,
  CreatePurchaseInput,
  TransactionResult,
  AttachmentResult,
} from "./types";
export { AccountingApiError } from "./types";

// Provider interface
export type { AccountingProvider } from "./provider";

// Connection helpers
export {
  getOrgConnection,
  isOrgConnected,
  getOrgProvider,
} from "./connection";
