import type {
  VendorOption,
  AccountOption,
  PaymentAccount,
  TrackingCategory,
  CreateBillInput,
  CreatePurchaseInput,
  TransactionResult,
  AttachmentResult,
} from "./types";

type SupabaseAdminClient = ReturnType<
  typeof import("@/lib/supabase/admin").createAdminClient
>;

/**
 * Provider-agnostic interface for accounting integrations.
 *
 * Implement this interface for each accounting provider (QuickBooks, Xero, etc.).
 * The sync pipeline only ever depends on this interface — never on a specific
 * provider's SDK or API client.
 *
 * Follow the same pattern as `ExtractionProvider` in `lib/extraction/types.ts`.
 */
export interface AccountingProvider {
  /** Identifies which accounting system this adapter targets. */
  readonly providerType: "quickbooks" | "xero";

  /**
   * Fetch all active vendors from the accounting system.
   * Returns options formatted for dropdown display.
   *
   * @param supabase - Supabase admin client (needed to read encrypted tokens)
   * @param orgId - The organisation whose connection to use
   */
  fetchVendors(
    supabase: SupabaseAdminClient,
    orgId: string
  ): Promise<VendorOption[]>;

  /**
   * Create a new vendor in the accounting system.
   * Returns the created vendor formatted as a dropdown option.
   *
   * @param supabase - Supabase admin client
   * @param orgId - The organisation whose connection to use
   * @param displayName - The vendor's display name
   * @param address - Optional address string (e.g., "123 Main St, Anytown, CA 90210")
   */
  createVendor(
    supabase: SupabaseAdminClient,
    orgId: string,
    displayName: string,
    address?: string | null
  ): Promise<VendorOption>;

  /**
   * Fetch all active expense accounts from the accounting system.
   * Returns options formatted for dropdown display.
   *
   * @param supabase - Supabase admin client
   * @param orgId - The organisation whose connection to use
   */
  fetchAccounts(
    supabase: SupabaseAdminClient,
    orgId: string
  ): Promise<AccountOption[]>;

  /**
   * Fetch active payment accounts of a given type.
   * Used to populate the payment account selector when creating a Purchase.
   *
   * @param supabase - Supabase admin client
   * @param orgId - The organisation whose connection to use
   * @param accountType - "Bank" for checking accounts; "CreditCard" for credit cards
   */
  fetchPaymentAccounts(
    supabase: SupabaseAdminClient,
    orgId: string,
    accountType: "Bank" | "CreditCard"
  ): Promise<PaymentAccount[]>;

  /**
   * Fetch tracking categories (dimensions) from the accounting system.
   * Xero: up to 2 tracking categories. QBO: classes/locations (future).
   * Returns empty array if provider doesn't support tracking.
   *
   * @param supabase - Supabase admin client
   * @param orgId - The organisation whose connection to use
   */
  fetchTrackingCategories(
    supabase: SupabaseAdminClient,
    orgId: string
  ): Promise<TrackingCategory[]>;

  /**
   * Create a Bill (accounts payable) in the accounting system.
   * Bills represent vendor invoices that will be paid later.
   *
   * Throws `AccountingApiError` on provider-level failures.
   *
   * @param supabase - Supabase admin client
   * @param orgId - The organisation whose connection to use
   * @param input - Provider-agnostic bill data
   */
  createBill(
    supabase: SupabaseAdminClient,
    orgId: string,
    input: CreateBillInput
  ): Promise<TransactionResult>;

  /**
   * Create a Purchase (Check, Cash, or CreditCard expense) in the accounting system.
   * Purchases represent payments already made or charged.
   *
   * Throws `AccountingApiError` on provider-level failures.
   *
   * @param supabase - Supabase admin client
   * @param orgId - The organisation whose connection to use
   * @param input - Provider-agnostic purchase data
   */
  createPurchase(
    supabase: SupabaseAdminClient,
    orgId: string,
    input: CreatePurchaseInput
  ): Promise<TransactionResult>;

  /**
   * Attach a document (PDF) to an existing transaction in the accounting system.
   * Returns an `AttachmentResult` — never throws on attachment failure, so a
   * successful transaction is not rolled back if attachment fails.
   *
   * @param supabase - Supabase admin client
   * @param orgId - The organisation whose connection to use
   * @param entityId - The provider-assigned transaction ID (e.g., QBO Bill Id)
   * @param entityType - The entity type to attach to ("Bill" | "Purchase")
   * @param fileBuffer - Raw file bytes
   * @param fileName - Original file name (used as the attachment display name)
   */
  attachDocument(
    supabase: SupabaseAdminClient,
    orgId: string,
    entityId: string,
    entityType: "Bill" | "Purchase",
    fileBuffer: Buffer,
    fileName: string
  ): Promise<AttachmentResult>;
}
