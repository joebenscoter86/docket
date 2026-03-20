import type { AccountingProvider } from "./provider";
import type { AccountingProviderType } from "./types";
import { QuickBooksAccountingAdapter } from "./quickbooks/adapter";

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
      // Xero adapter deferred to Phase 2 — kept here so the switch is exhaustive
      // and TypeScript enforces it as a compile-time error when the adapter is added.
      throw new Error(
        "Xero accounting adapter is not yet implemented. Phase 2 feature."
      );
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
