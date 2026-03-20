# DOC-52: Provider-Agnostic Accounting Abstraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the QBO-specific sync pipeline into a provider-agnostic abstraction layer so adding Xero (or any future provider) requires only implementing an interface and registering it in a factory — no changes to sync routes, data routes, or UI hooks.

**Architecture:** Create `lib/accounting/` with a provider interface, shared types, and a factory. Move QBO-specific logic into `lib/accounting/quickbooks/adapter.ts` that implements the interface. Update all sync routes, vendor/account API routes, and the `useQboOptions` hook to use the abstraction. OAuth routes stay provider-specific (different flows per provider). Mirrors the existing `lib/extraction/provider.ts` pattern.

**Tech Stack:** TypeScript, Next.js 14 App Router, Supabase (existing stack — no new dependencies)

**Key constraint:** This is a pure refactor. All existing QBO functionality must work identically before and after. No Xero implementation yet.

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `lib/accounting/types.ts` | Shared types: `AccountingProvider`, `AccountingConnection`, `Vendor`, `Account`, `PaymentAccount`, `BillResult`, `AttachmentResult`, `AccountingApiError` |
| `lib/accounting/provider.ts` | Provider interface definition with JSDoc |
| `lib/accounting/index.ts` | Provider factory: `getAccountingProvider(provider)` |
| `lib/accounting/quickbooks/adapter.ts` | QBO implementation of the provider interface — wraps existing `lib/quickbooks/api.ts` functions |
| `app/api/accounting/vendors/route.ts` | Provider-agnostic vendor list + create endpoint |
| `app/api/accounting/accounts/route.ts` | Provider-agnostic account list endpoint |
| `app/api/accounting/payment-accounts/route.ts` | Provider-agnostic payment account list endpoint |
| `lib/accounting/connection.ts` | Provider-agnostic connection helpers: `getOrgConnection()`, `isOrgConnected()` |

### Modified files

| File | What changes |
|------|-------------|
| `app/api/invoices/[id]/sync/route.ts` | Replace `lib/quickbooks/api` imports with `lib/accounting/` — use provider interface for createBill, createPurchase, attachDocument |
| `app/api/invoices/[id]/sync/retry/route.ts` | Same as sync route |
| `app/api/invoices/batch/sync/route.ts` | Replace `isConnected` import with `lib/accounting/connection` |
| `lib/quickbooks/batch-sync.ts` | Replace QBO API imports with provider interface |
| `components/invoices/hooks/useQboOptions.ts` | Point at new `/api/accounting/` endpoints |
| `components/invoices/PaymentAccountSelect.tsx` | Replace `QBOPaymentAccount` import with shared type |
| `app/(dashboard)/settings/page.tsx` | Replace `loadConnection` import with `lib/accounting/connection` |
| `app/(dashboard)/invoices/page.tsx` | Replace `isConnected` import with `lib/accounting/connection` |
| `lib/extraction/run.ts` | Replace `queryAccounts` import with provider abstraction |
| `lib/types/invoice.ts` | Keep as-is — `OutputType` and related constants are app-level, not provider-specific |

### Untouched files (stay provider-specific)

| File | Why untouched |
|------|-------------|
| `app/api/quickbooks/connect/route.ts` | OAuth is provider-specific |
| `app/api/auth/callback/quickbooks/route.ts` | OAuth callback is provider-specific |
| `app/api/quickbooks/disconnect/route.ts` | Disconnect has provider-specific token revocation |
| `lib/quickbooks/auth.ts` | Token refresh, storage, OAuth — stays QBO-specific |
| `lib/quickbooks/api.ts` | Stays as the raw QBO API layer — adapter wraps it |
| `lib/quickbooks/types.ts` | QBO-specific API types — stays as-is |

---

## Task 1: Shared types (`lib/accounting/types.ts`)

**Files:**
- Create: `lib/accounting/types.ts`

- [ ] **Step 1: Create the shared types file**

```typescript
// lib/accounting/types.ts

/** Supported accounting providers */
export type AccountingProviderType = "quickbooks" | "xero";

/** Provider-agnostic connection shape (read from DB) */
export interface AccountingConnectionInfo {
  id: string;
  orgId: string;
  provider: AccountingProviderType;
  companyId: string;
  companyName: string | null;
  connectedAt: string;
}

/** Normalized vendor for dropdowns */
export interface Vendor {
  id: string;
  name: string;
  isActive: boolean;
}

/** Vendor formatted for dropdown UI (matches existing VendorOption shape) */
export interface VendorOption {
  value: string;
  label: string;
}

/** Normalized account for dropdowns */
export interface Account {
  id: string;
  name: string;
  accountType: string;
  fullyQualifiedName: string;
  isSubAccount: boolean;
}

/** Account formatted for dropdown UI (matches existing AccountOption shape) */
export interface AccountOption {
  value: string;
  label: string;
  accountType: string;
}

/** Normalized payment account */
export interface PaymentAccount {
  id: string;
  name: string;
  accountType: string;
  currentBalance?: number;
}

/** Line item for bill/purchase creation */
export interface SyncLineItem {
  amount: number;
  glAccountId: string;
  description: string | null;
}

/** Data needed to create a bill in any provider */
export interface CreateBillInput {
  vendorRef: string;
  lineItems: SyncLineItem[];
  invoiceDate: string | null;
  dueDate: string | null;
  invoiceNumber: string | null;
}

/** Data needed to create a purchase (check/cash/credit card) in any provider */
export interface CreatePurchaseInput {
  vendorRef: string;
  paymentAccountRef: string;
  paymentType: "Check" | "Cash" | "CreditCard";
  lineItems: SyncLineItem[];
  invoiceDate: string | null;
  invoiceNumber: string | null;
}

/** Result of creating a bill or purchase */
export interface TransactionResult {
  entityId: string;
  entityType: "Bill" | "Purchase";
  providerResponse: Record<string, unknown>;
}

/** Result of attaching a document */
export interface AttachmentResult {
  attachmentId: string | null;
  success: boolean;
}

/** Provider-agnostic API error */
export class AccountingApiError extends Error {
  public statusCode: number;
  public errorCode: string;
  public detail: string;
  public element?: string;

  constructor(
    statusCode: number,
    message: string,
    opts: { errorCode?: string; detail?: string; element?: string } = {}
  ) {
    super(message);
    this.name = "AccountingApiError";
    this.statusCode = statusCode;
    this.errorCode = opts.errorCode ?? "unknown";
    this.detail = opts.detail ?? message;
    this.element = opts.element;
  }
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: PASS (new file, no imports from it yet)

- [ ] **Step 3: Commit**

```bash
git add lib/accounting/types.ts
git commit -m "feat(accounting): add shared provider-agnostic types (DOC-52)"
```

---

## Task 2: Provider interface (`lib/accounting/provider.ts`)

**Files:**
- Create: `lib/accounting/provider.ts`
- Reference: `lib/extraction/provider.ts` (pattern to follow), `lib/accounting/types.ts`

- [ ] **Step 1: Create the provider interface**

```typescript
// lib/accounting/provider.ts

import type {
  VendorOption,
  AccountOption,
  PaymentAccount,
  CreateBillInput,
  CreatePurchaseInput,
  TransactionResult,
  AttachmentResult,
} from "./types";

type SupabaseAdminClient = ReturnType<
  typeof import("@/lib/supabase/admin").createAdminClient
>;

/**
 * Provider-agnostic accounting integration interface.
 *
 * Each accounting provider (QuickBooks, Xero, etc.) implements this interface.
 * The sync pipeline, vendor/account routes, and UI hooks call through this
 * interface — they never import provider-specific modules directly.
 *
 * Mirrors the extraction provider pattern in `lib/extraction/provider.ts`.
 */
export interface AccountingProvider {
  /** Provider identifier */
  readonly providerType: "quickbooks" | "xero";

  /**
   * Fetch active vendors formatted for dropdown UI.
   * Returns sorted by name.
   */
  fetchVendors(
    supabase: SupabaseAdminClient,
    orgId: string
  ): Promise<VendorOption[]>;

  /**
   * Create a new vendor in the accounting system.
   * Returns the new vendor formatted for dropdown UI.
   */
  createVendor(
    supabase: SupabaseAdminClient,
    orgId: string,
    displayName: string,
    address?: string | null
  ): Promise<VendorOption>;

  /**
   * Fetch active expense accounts formatted for dropdown UI.
   * Returns sorted by name, using fully qualified name for sub-accounts.
   */
  fetchAccounts(
    supabase: SupabaseAdminClient,
    orgId: string
  ): Promise<AccountOption[]>;

  /**
   * Fetch payment accounts (bank or credit card) for non-bill transaction types.
   */
  fetchPaymentAccounts(
    supabase: SupabaseAdminClient,
    orgId: string,
    accountType: "Bank" | "CreditCard"
  ): Promise<PaymentAccount[]>;

  /**
   * Create a bill in the accounting system.
   * Maps to QBO Bill or Xero ACCPAY Invoice.
   */
  createBill(
    supabase: SupabaseAdminClient,
    orgId: string,
    input: CreateBillInput
  ): Promise<TransactionResult>;

  /**
   * Create a purchase (check, cash expense, or credit card charge).
   * Maps to QBO Purchase. Xero may not support all payment types.
   */
  createPurchase(
    supabase: SupabaseAdminClient,
    orgId: string,
    input: CreatePurchaseInput
  ): Promise<TransactionResult>;

  /**
   * Attach a document (PDF) to an existing bill or purchase.
   * Best-effort — callers handle attachment failure as partial success.
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
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add lib/accounting/provider.ts
git commit -m "feat(accounting): define provider interface (DOC-52)"
```

---

## Task 3: QBO adapter (`lib/accounting/quickbooks/adapter.ts`)

**Files:**
- Create: `lib/accounting/quickbooks/adapter.ts`
- Reference: `lib/quickbooks/api.ts` (wraps these functions), `lib/quickbooks/types.ts`

This adapter wraps existing `lib/quickbooks/api.ts` functions behind the provider interface. It does NOT duplicate or move the raw QBO API code — it delegates to it and normalizes the results.

- [ ] **Step 1: Create the QBO adapter**

```typescript
// lib/accounting/quickbooks/adapter.ts

import type { AccountingProvider } from "../provider";
import type {
  VendorOption,
  AccountOption,
  PaymentAccount,
  CreateBillInput,
  CreatePurchaseInput,
  TransactionResult,
  AttachmentResult,
  AccountingApiError,
} from "../types";
import {
  getVendorOptions,
  createVendor as qboCreateVendor,
  getAccountOptions,
  fetchPaymentAccounts as qboFetchPaymentAccounts,
  createBill as qboCreateBill,
  createPurchase as qboCreatePurchase,
  attachPdfToEntity,
  QBOApiError,
} from "@/lib/quickbooks/api";
import type {
  QBOBillPayload,
  QBOBillLine,
  QBOPurchasePayload,
  QBOPurchaseLine,
} from "@/lib/quickbooks/types";
import { AccountingApiError as AccountingApiErr } from "../types";

type SupabaseAdminClient = ReturnType<
  typeof import("@/lib/supabase/admin").createAdminClient
>;

/**
 * Wrap a QBOApiError into a provider-agnostic AccountingApiError.
 */
function wrapQBOError(error: QBOApiError): AccountingApiErr {
  return new AccountingApiErr(error.statusCode, error.message, {
    errorCode: error.errorCode,
    detail: error.detail,
    element: error.element,
  });
}

export class QuickBooksAdapter implements AccountingProvider {
  readonly providerType = "quickbooks" as const;

  async fetchVendors(
    supabase: SupabaseAdminClient,
    orgId: string
  ): Promise<VendorOption[]> {
    try {
      return await getVendorOptions(supabase, orgId);
    } catch (error) {
      if (error instanceof QBOApiError) throw wrapQBOError(error);
      throw error;
    }
  }

  async createVendor(
    supabase: SupabaseAdminClient,
    orgId: string,
    displayName: string,
    address?: string | null
  ): Promise<VendorOption> {
    try {
      return await qboCreateVendor(supabase, orgId, displayName, address);
    } catch (error) {
      if (error instanceof QBOApiError) throw wrapQBOError(error);
      throw error;
    }
  }

  async fetchAccounts(
    supabase: SupabaseAdminClient,
    orgId: string
  ): Promise<AccountOption[]> {
    try {
      return await getAccountOptions(supabase, orgId);
    } catch (error) {
      if (error instanceof QBOApiError) throw wrapQBOError(error);
      throw error;
    }
  }

  async fetchPaymentAccounts(
    supabase: SupabaseAdminClient,
    orgId: string,
    accountType: "Bank" | "CreditCard"
  ): Promise<PaymentAccount[]> {
    try {
      return await qboFetchPaymentAccounts(supabase, orgId, accountType);
    } catch (error) {
      if (error instanceof QBOApiError) throw wrapQBOError(error);
      throw error;
    }
  }

  async createBill(
    supabase: SupabaseAdminClient,
    orgId: string,
    input: CreateBillInput
  ): Promise<TransactionResult> {
    const billLines: QBOBillLine[] = input.lineItems.map((li) => ({
      DetailType: "AccountBasedExpenseLineDetail" as const,
      Amount: Number(li.amount),
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: li.glAccountId },
      },
      ...(li.description ? { Description: li.description } : {}),
    }));

    const payload: QBOBillPayload = {
      VendorRef: { value: input.vendorRef },
      Line: billLines,
      ...(input.invoiceDate ? { TxnDate: input.invoiceDate } : {}),
      ...(input.dueDate ? { DueDate: input.dueDate } : {}),
      ...(input.invoiceNumber ? { DocNumber: input.invoiceNumber } : {}),
    };

    try {
      const response = await qboCreateBill(supabase, orgId, payload);
      return {
        entityId: response.Bill.Id,
        entityType: "Bill",
        providerResponse: response as unknown as Record<string, unknown>,
      };
    } catch (error) {
      if (error instanceof QBOApiError) throw wrapQBOError(error);
      throw error;
    }
  }

  async createPurchase(
    supabase: SupabaseAdminClient,
    orgId: string,
    input: CreatePurchaseInput
  ): Promise<TransactionResult> {
    const purchaseLines: QBOPurchaseLine[] = input.lineItems.map((li) => ({
      Amount: Number(li.amount),
      DetailType: "AccountBasedExpenseLineDetail" as const,
      Description: li.description ?? undefined,
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: li.glAccountId },
      },
    }));

    const payload: QBOPurchasePayload = {
      PaymentType: input.paymentType,
      AccountRef: { value: input.paymentAccountRef },
      EntityRef: { value: input.vendorRef, type: "Vendor" },
      Line: purchaseLines,
      ...(input.invoiceDate ? { TxnDate: input.invoiceDate } : {}),
      ...(input.invoiceNumber ? { DocNumber: input.invoiceNumber } : {}),
    };

    try {
      const response = await qboCreatePurchase(supabase, orgId, payload);
      return {
        entityId: response.Purchase.Id,
        entityType: "Purchase",
        providerResponse: response as unknown as Record<string, unknown>,
      };
    } catch (error) {
      if (error instanceof QBOApiError) throw wrapQBOError(error);
      throw error;
    }
  }

  async attachDocument(
    supabase: SupabaseAdminClient,
    orgId: string,
    entityId: string,
    entityType: "Bill" | "Purchase",
    fileBuffer: Buffer,
    fileName: string
  ): Promise<AttachmentResult> {
    try {
      const response = await attachPdfToEntity(
        supabase,
        orgId,
        entityId,
        entityType,
        fileBuffer,
        fileName
      );
      return {
        attachmentId: response.AttachableResponse?.[0]?.Attachable?.Id ?? null,
        success: true,
      };
    } catch (error) {
      if (error instanceof QBOApiError) throw wrapQBOError(error);
      throw error;
    }
  }
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add lib/accounting/quickbooks/adapter.ts
git commit -m "feat(accounting): QBO adapter implementing provider interface (DOC-52)"
```

---

## Task 4: Connection helpers + provider factory (`lib/accounting/connection.ts` + `lib/accounting/index.ts`)

**Files:**
- Create: `lib/accounting/connection.ts`
- Create: `lib/accounting/index.ts`
- Reference: `lib/quickbooks/auth.ts` (for `loadConnection`, `isConnected`)

- [ ] **Step 1: Create provider-agnostic connection helpers**

```typescript
// lib/accounting/connection.ts

import type { AccountingProviderType, AccountingConnectionInfo } from "./types";

type SupabaseAdminClient = ReturnType<
  typeof import("@/lib/supabase/admin").createAdminClient
>;

/**
 * Get the active accounting connection for an org (any provider).
 * Returns null if no connection exists.
 */
export async function getOrgConnection(
  supabase: SupabaseAdminClient,
  orgId: string
): Promise<AccountingConnectionInfo | null> {
  const { data, error } = await supabase
    .from("accounting_connections")
    .select("id, org_id, provider, company_id, company_name, connected_at")
    .eq("org_id", orgId)
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    orgId: data.org_id,
    provider: data.provider as AccountingProviderType,
    companyId: data.company_id,
    companyName: data.company_name ?? null,
    connectedAt: data.connected_at,
  };
}

/**
 * Check if an org has any active accounting connection.
 */
export async function isOrgConnected(
  supabase: SupabaseAdminClient,
  orgId: string
): Promise<boolean> {
  const connection = await getOrgConnection(supabase, orgId);
  return connection !== null;
}

/**
 * Get the provider type for an org's active connection.
 * Returns null if no connection exists.
 */
export async function getOrgProvider(
  supabase: SupabaseAdminClient,
  orgId: string
): Promise<AccountingProviderType | null> {
  const connection = await getOrgConnection(supabase, orgId);
  return connection?.provider ?? null;
}
```

- [ ] **Step 2: Create provider factory**

```typescript
// lib/accounting/index.ts

import type { AccountingProvider } from "./provider";
import type { AccountingProviderType } from "./types";
import { QuickBooksAdapter } from "./quickbooks/adapter";

// Re-export shared types and connection helpers for convenience
export type { AccountingProvider } from "./provider";
export type {
  AccountingProviderType,
  AccountingConnectionInfo,
  VendorOption,
  AccountOption,
  PaymentAccount,
  CreateBillInput,
  CreatePurchaseInput,
  TransactionResult,
  AttachmentResult,
  SyncLineItem,
} from "./types";
export { AccountingApiError } from "./types";
export {
  getOrgConnection,
  isOrgConnected,
  getOrgProvider,
} from "./connection";

/**
 * Get the accounting provider implementation for a given provider type.
 *
 * Adding a new provider requires:
 * 1. Implementing the AccountingProvider interface
 * 2. Adding a case here
 *
 * No other files need changes.
 */
export function getAccountingProvider(
  provider: AccountingProviderType
): AccountingProvider {
  switch (provider) {
    case "quickbooks":
      return new QuickBooksAdapter();
    case "xero":
      throw new Error("Xero integration is not yet implemented.");
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown accounting provider: ${_exhaustive}`);
    }
  }
}
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/accounting/connection.ts lib/accounting/index.ts
git commit -m "feat(accounting): connection helpers and provider factory (DOC-52)"
```

---

## Task 5: Provider-agnostic API routes (vendors, accounts, payment-accounts)

**Files:**
- Create: `app/api/accounting/vendors/route.ts`
- Create: `app/api/accounting/accounts/route.ts`
- Create: `app/api/accounting/payment-accounts/route.ts`
- Reference: `app/api/quickbooks/vendors/route.ts`, `app/api/quickbooks/accounts/route.ts`, `app/api/quickbooks/payment-accounts/route.ts`

These new routes replace the QBO-specific ones. The old QBO routes will be kept temporarily (they still work, and removing them can be done in a follow-up).

- [ ] **Step 1: Create provider-agnostic vendors route**

```typescript
// app/api/accounting/vendors/route.ts

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountingProvider, getOrgProvider, AccountingApiError } from "@/lib/accounting";
import { logger } from "@/lib/utils/logger";
import {
  authError,
  apiSuccess,
  internalError,
  validationError,
  conflict,
  unprocessableEntity,
} from "@/lib/utils/errors";

/**
 * GET /api/accounting/vendors
 *
 * Returns active vendors from the org's connected accounting provider.
 */
export async function GET() {
  const startTime = Date.now();

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return authError();

    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();
    if (!membership) return authError("No organization found.");

    const orgId = membership.org_id;
    const adminSupabase = createAdminClient();

    const providerType = await getOrgProvider(adminSupabase, orgId);
    if (!providerType) {
      return apiSuccess([]);
    }

    const provider = getAccountingProvider(providerType);
    const vendors = await provider.fetchVendors(adminSupabase, orgId);

    logger.info("accounting.vendors_fetched", {
      userId: user.id,
      orgId,
      provider: providerType,
      count: String(vendors.length),
      durationMs: Date.now() - startTime,
    });

    return apiSuccess(vendors);
  } catch (error) {
    if (error instanceof AccountingApiError) {
      logger.error("accounting.vendors_api_error", {
        error: error.message,
        code: error.errorCode,
        statusCode: String(error.statusCode),
        durationMs: Date.now() - startTime,
      });
      if (error.statusCode === 401) {
        return authError("Accounting connection expired. Please reconnect in Settings.");
      }
    }

    logger.error("accounting.vendors_fetch_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });

    if (error instanceof Error && error.message.includes("No QuickBooks connection")) {
      return apiSuccess([]);
    }

    return internalError("Failed to fetch vendors.");
  }
}

/**
 * POST /api/accounting/vendors
 *
 * Creates a new vendor in the org's connected accounting provider.
 * Body: { displayName: string, address?: string | null }
 */
export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return authError();

    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();
    if (!membership) return authError("No organization found.");

    const orgId = membership.org_id;
    const adminSupabase = createAdminClient();

    const providerType = await getOrgProvider(adminSupabase, orgId);
    if (!providerType) {
      return unprocessableEntity("No accounting connection found. Connect in Settings.");
    }

    const body = await request.json();
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const address = typeof body.address === "string" ? body.address : null;

    if (!displayName) {
      return validationError("Vendor name is required.");
    }

    const provider = getAccountingProvider(providerType);
    const vendor = await provider.createVendor(adminSupabase, orgId, displayName, address);

    logger.info("accounting.vendor_created", {
      userId: user.id,
      orgId,
      provider: providerType,
      vendorId: vendor.value,
      displayName: vendor.label,
      durationMs: Date.now() - startTime,
    });

    return apiSuccess(vendor);
  } catch (error) {
    if (error instanceof AccountingApiError) {
      logger.error("accounting.vendor_create_api_error", {
        error: error.message,
        code: error.errorCode,
        element: error.element,
        statusCode: String(error.statusCode),
        durationMs: Date.now() - startTime,
      });

      if (error.errorCode === "6240") {
        return conflict("A vendor with this name already exists. Try refreshing.");
      }
      if (error.statusCode === 401) {
        return authError("Accounting connection expired. Reconnect in Settings.");
      }
    }

    if (error instanceof Error && error.message.includes("No QuickBooks connection")) {
      return unprocessableEntity("No accounting connection found. Connect in Settings.");
    }

    logger.error("accounting.vendor_create_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });

    return internalError("Failed to create vendor. Please try again.");
  }
}
```

- [ ] **Step 2: Create provider-agnostic accounts route**

```typescript
// app/api/accounting/accounts/route.ts

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountingProvider, getOrgProvider, AccountingApiError } from "@/lib/accounting";
import { logger } from "@/lib/utils/logger";
import { authError, apiSuccess, internalError } from "@/lib/utils/errors";

/**
 * GET /api/accounting/accounts
 *
 * Returns active expense accounts from the org's connected accounting provider.
 */
export async function GET() {
  const startTime = Date.now();

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return authError();

    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();
    if (!membership) return authError("No organization found.");

    const orgId = membership.org_id;
    const adminSupabase = createAdminClient();

    const providerType = await getOrgProvider(adminSupabase, orgId);
    if (!providerType) {
      return apiSuccess([]);
    }

    const provider = getAccountingProvider(providerType);
    const accounts = await provider.fetchAccounts(adminSupabase, orgId);

    logger.info("accounting.accounts_fetched", {
      userId: user.id,
      orgId,
      provider: providerType,
      count: String(accounts.length),
      durationMs: Date.now() - startTime,
    });

    return apiSuccess(accounts);
  } catch (error) {
    if (error instanceof AccountingApiError) {
      logger.error("accounting.accounts_api_error", {
        error: error.message,
        code: error.errorCode,
        statusCode: String(error.statusCode),
        durationMs: Date.now() - startTime,
      });
      if (error.statusCode === 401) {
        return authError("Accounting connection expired. Please reconnect in Settings.");
      }
    }

    logger.error("accounting.accounts_fetch_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });

    if (error instanceof Error && error.message.includes("No QuickBooks connection")) {
      return apiSuccess([]);
    }

    return internalError("Failed to fetch accounts.");
  }
}
```

- [ ] **Step 3: Create provider-agnostic payment-accounts route**

```typescript
// app/api/accounting/payment-accounts/route.ts

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountingProvider, getOrgProvider, AccountingApiError } from "@/lib/accounting";
import { logger } from "@/lib/utils/logger";
import { authError, validationError, apiSuccess, internalError } from "@/lib/utils/errors";

const VALID_ACCOUNT_TYPES = ["Bank", "CreditCard"] as const;
type AccountType = (typeof VALID_ACCOUNT_TYPES)[number];

/**
 * GET /api/accounting/payment-accounts?type=Bank|CreditCard
 *
 * Returns active payment accounts from the org's connected accounting provider.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const accountType = request.nextUrl.searchParams.get("type") as AccountType | null;
    if (!accountType || !VALID_ACCOUNT_TYPES.includes(accountType)) {
      return validationError('Query parameter "type" is required and must be "Bank" or "CreditCard".');
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return authError();

    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();
    if (!membership) return authError("No organization found.");

    const orgId = membership.org_id;
    const adminSupabase = createAdminClient();

    const providerType = await getOrgProvider(adminSupabase, orgId);
    if (!providerType) {
      return validationError("Connect an accounting provider in Settings first.");
    }

    const provider = getAccountingProvider(providerType);
    const accounts = await provider.fetchPaymentAccounts(adminSupabase, orgId, accountType);

    logger.info("accounting.payment_accounts_fetched", {
      userId: user.id,
      orgId,
      provider: providerType,
      accountType,
      count: String(accounts.length),
      durationMs: Date.now() - startTime,
    });

    return apiSuccess({ accounts });
  } catch (error) {
    if (error instanceof AccountingApiError) {
      logger.error("accounting.payment_accounts_api_error", {
        error: error.message,
        code: error.errorCode,
        statusCode: String(error.statusCode),
        durationMs: Date.now() - startTime,
      });
      if (error.statusCode === 401) {
        return authError("Accounting connection expired. Please reconnect in Settings.");
      }
    }

    logger.error("accounting.payment_accounts_fetch_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });

    return internalError("Failed to fetch payment accounts.");
  }
}
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/accounting/
git commit -m "feat(accounting): provider-agnostic vendor, account, and payment-account routes (DOC-52)"
```

---

## Task 6: Update UI hooks and components to use new API routes

**Files:**
- Modify: `components/invoices/hooks/useQboOptions.ts`
- Modify: `components/invoices/VendorSelect.tsx`
- Modify: `components/invoices/GlAccountSelect.tsx`
- Modify: `components/invoices/LineItemEditor.tsx`

The hook and components currently hit `/api/quickbooks/` endpoints. Switch them to the new `/api/accounting/` routes. The response shapes are identical so only URLs and type imports change.

- [ ] **Step 1: Update the fetch URLs**

In `components/invoices/hooks/useQboOptions.ts`, change lines 28-30:

```typescript
// OLD:
const [vendorRes, accountRes] = await Promise.all([
  fetch("/api/quickbooks/vendors"),
  fetch("/api/quickbooks/accounts"),
]);

// NEW:
const [vendorRes, accountRes] = await Promise.all([
  fetch("/api/accounting/vendors"),
  fetch("/api/accounting/accounts"),
]);
```

- [ ] **Step 2: Update the import path for types**

In `components/invoices/hooks/useQboOptions.ts`, change the VendorOption/AccountOption import:

```typescript
// OLD:
import type { VendorOption, AccountOption } from "@/lib/types/qbo";

// NEW:
import type { VendorOption, AccountOption } from "@/lib/accounting";
```

- [ ] **Step 3: Update VendorSelect.tsx POST URL**

In `components/invoices/VendorSelect.tsx`, change the vendor creation fetch URL (around line 130):

```typescript
// OLD:
const res = await fetch("/api/quickbooks/vendors", {

// NEW:
const res = await fetch("/api/accounting/vendors", {
```

Also update any `VendorOption`/`AccountOption` imports from `@/lib/types/qbo` to `@/lib/accounting`:

```typescript
// OLD:
import type { VendorOption } from "@/lib/types/qbo";

// NEW:
import type { VendorOption } from "@/lib/accounting";
```

- [ ] **Step 4: Update GlAccountSelect.tsx and LineItemEditor.tsx imports**

These files import from `@/lib/types/qbo`. Update them:

```typescript
// OLD:
import type { AccountOption } from "@/lib/types/qbo";

// NEW:
import type { AccountOption } from "@/lib/accounting";
```

- [ ] **Step 5: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/invoices/hooks/useQboOptions.ts components/invoices/VendorSelect.tsx components/invoices/GlAccountSelect.tsx components/invoices/LineItemEditor.tsx
git commit -m "refactor: update UI components to use provider-agnostic routes and types (DOC-52)"
```

---

## Task 7: Update `PaymentAccountSelect` to use shared types

**Files:**
- Modify: `components/invoices/PaymentAccountSelect.tsx`

- [ ] **Step 1: Update import and fetch URL**

In `components/invoices/PaymentAccountSelect.tsx`:

```typescript
// OLD:
import type { QBOPaymentAccount } from "@/lib/quickbooks/types";

// NEW:
import type { PaymentAccount } from "@/lib/accounting";
```

Also update the fetch URL from `/api/quickbooks/payment-accounts` to `/api/accounting/payment-accounts`.

Update the state type from `QBOPaymentAccount[]` to `PaymentAccount[]`.

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/invoices/PaymentAccountSelect.tsx
git commit -m "refactor: update PaymentAccountSelect to use shared types (DOC-52)"
```

---

## Task 8: Update sync route to use provider abstraction

**Files:**
- Modify: `app/api/invoices/[id]/sync/route.ts`

This is the biggest change. The sync route currently imports QBO-specific functions and builds QBO-specific payloads inline. Replace with: look up the org's provider, get the adapter, call `createBill`/`createPurchase`/`attachDocument` through the interface.

- [ ] **Step 1: Update imports**

Replace the QBO-specific imports at the top of `app/api/invoices/[id]/sync/route.ts`:

```typescript
// OLD:
import { isConnected } from "@/lib/quickbooks/auth";
import { createBill, createPurchase, attachPdfToEntity, QBOApiError } from "@/lib/quickbooks/api";
import type { QBOBillPayload, QBOBillLine, QBOPurchasePayload, QBOPurchaseLine } from "@/lib/quickbooks/types";

// NEW:
import {
  getAccountingProvider,
  getOrgProvider,
  isOrgConnected,
  AccountingApiError,
} from "@/lib/accounting";
import type { CreateBillInput, CreatePurchaseInput, SyncLineItem } from "@/lib/accounting";
```

- [ ] **Step 2: Update the `translateQBOError` function**

Rename to `translateAccountingError` and accept `AccountingApiError`:

```typescript
function translateAccountingError(error: AccountingApiError, outputType: OutputType): string {
  const typeLabel = OUTPUT_TYPE_LABELS[outputType].toLowerCase();
  const detail = error.detail ?? "";

  if (detail.includes("Duplicate") || error.errorCode === "6140") {
    return `A ${typeLabel} with this invoice number already exists. Change the invoice number and try again.`;
  }

  if (detail.includes("Invalid Reference Id") && (error.element === "VendorRef" || error.element === "EntityRef")) {
    return "The selected vendor was not found. They may have been deleted. Please select a different vendor.";
  }

  if (detail.includes("Invalid Reference Id") && error.element === "AccountRef") {
    return "One or more GL accounts are no longer valid. Please re-map the line item accounts and try again.";
  }

  if (detail.includes("Invalid Reference Id")) {
    return `A reference in this ${typeLabel} is no longer valid. Please review your vendor and account selections.`;
  }

  if (error.errorCode === "5010") {
    return "This record was modified since you last loaded it. Please refresh and try again.";
  }

  if (error.errorCode === "6000" || error.errorCode === "2050") {
    return `Accounting system rejected this ${typeLabel}: ${detail}`;
  }

  if (error.statusCode === 401) {
    return "Your accounting connection has expired. Please reconnect in Settings and try again.";
  }

  if (error.statusCode === 429) {
    return "Rate limit reached. Please wait a moment and try again.";
  }

  return `Accounting error: ${detail || error.message}`;
}
```

- [ ] **Step 3: Update the POST handler body**

Replace step 6 (verify QBO connection) with provider-agnostic check:

```typescript
// 6. Verify accounting connection and get provider
const providerType = await getOrgProvider(adminSupabase, orgId);
if (!providerType) {
  return validationError("Connect an accounting provider in Settings before syncing.");
}
const provider = getAccountingProvider(providerType);
```

Replace step 9 (create transaction) — remove inline QBO payload building, use the adapter:

```typescript
// 9. Create transaction via provider abstraction
const syncLineItems: SyncLineItem[] = lineItems.map(
  (li: { amount: number; gl_account_id: string; description: string | null }) => ({
    amount: Number(li.amount),
    glAccountId: li.gl_account_id,
    description: li.description,
  })
);

let result: TransactionResult;
let requestInput: unknown;

try {
  if (isBill) {
    const input: CreateBillInput = {
      vendorRef: extractedData.vendor_ref,
      lineItems: syncLineItems,
      invoiceDate: extractedData.invoice_date,
      dueDate: extractedData.due_date,
      invoiceNumber: extractedData.invoice_number,
    };
    requestInput = input;
    result = await provider.createBill(adminSupabase, orgId, input);
  } else {
    const input: CreatePurchaseInput = {
      vendorRef: extractedData.vendor_ref,
      paymentAccountRef: invoice.payment_account_id!,
      paymentType: OUTPUT_TYPE_TO_PAYMENT_TYPE[outputType as Exclude<OutputType, "bill">] as "Check" | "Cash" | "CreditCard",
      lineItems: syncLineItems,
      invoiceDate: extractedData.invoice_date,
      invoiceNumber: extractedData.invoice_number,
    };
    requestInput = input;
    result = await provider.createPurchase(adminSupabase, orgId, input);
  }

  // Log success in sync_log
  await adminSupabase.from("sync_log").insert({
    invoice_id: invoiceId,
    provider: providerType,
    provider_bill_id: result.entityId,
    request_payload: requestInput as Record<string, unknown>,
    provider_response: result.providerResponse,
    status: "success",
    transaction_type: transactionType,
    provider_entity_type: result.entityType,
  });
```

Update the error catch block:
```typescript
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  const errorDetail = error instanceof AccountingApiError
    ? { code: error.errorCode, element: error.element, detail: error.detail }
    : {};

  await adminSupabase.from("sync_log").insert({
    invoice_id: invoiceId,
    provider: providerType,
    request_payload: requestInput as Record<string, unknown>,
    provider_response: errorDetail as Record<string, unknown>,
    status: "failed",
    transaction_type: transactionType,
    provider_entity_type: providerEntityType,
  });

  // ... (update invoice error_message, log, return — same pattern but use AccountingApiError)

  if (error instanceof AccountingApiError) {
    const friendlyMessage = translateAccountingError(error, outputType);
    return validationError(friendlyMessage);
  }
  return internalError(`Failed to create ${OUTPUT_TYPE_LABELS[outputType].toLowerCase()}.`);
}
```

Replace step 10 (attach PDF) with provider abstraction:
```typescript
let attachmentStatus = "attached";
try {
  const { data: fileData, error: downloadError } = await adminSupabase
    .storage.from("invoices").download(invoice.file_path);

  if (downloadError || !fileData) {
    throw new Error(`Failed to download file: ${downloadError?.message}`);
  }

  const fileBuffer = Buffer.from(await fileData.arrayBuffer());
  await provider.attachDocument(
    adminSupabase, orgId, result.entityId, result.entityType, fileBuffer, invoice.file_name
  );
} catch (error) {
  attachmentStatus = "failed";
  // ... log warning
}
```

Also update the idempotency guard (step 5) to use `providerType` instead of hardcoded `"quickbooks"`:
```typescript
.eq("provider", providerType)
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/invoices/[id]/sync/route.ts
git commit -m "refactor: sync route uses provider-agnostic abstraction (DOC-52)"
```

---

## Task 9: Update retry route to use provider abstraction

**Files:**
- Modify: `app/api/invoices/[id]/sync/retry/route.ts`

Same pattern as Task 8. The retry route is structurally almost identical to the sync route.

- [ ] **Step 1: Update imports and transaction creation logic**

Apply the same import changes and transaction creation pattern as Task 8. Replace:
- `isConnected` → `getOrgProvider` + `getAccountingProvider`
- `createBill`/`createPurchase`/`attachPdfToEntity` → `provider.createBill`/`provider.createPurchase`/`provider.attachDocument`
- `QBOApiError` → `AccountingApiError`
- Hardcoded `"quickbooks"` in sync_log → `providerType`

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/api/invoices/[id]/sync/retry/route.ts
git commit -m "refactor: sync retry route uses provider-agnostic abstraction (DOC-52)"
```

---

## Task 10: Update batch sync to use provider abstraction

**Files:**
- Modify: `app/api/invoices/batch/sync/route.ts`
- Modify: `lib/quickbooks/batch-sync.ts`

- [ ] **Step 1: Update batch sync route**

In `app/api/invoices/batch/sync/route.ts`, replace:

```typescript
// OLD:
import { isConnected } from "@/lib/quickbooks/auth";

// NEW:
import { isOrgConnected, getOrgProvider } from "@/lib/accounting";
```

Update the connection check:
```typescript
// OLD:
const connected = await isConnected(admin, orgId);

// NEW:
const connected = await isOrgConnected(admin, orgId);
```

Pass the provider type to `processBatchSync`:
```typescript
const providerType = await getOrgProvider(admin, orgId);
// providerType is guaranteed non-null since isOrgConnected returned true
waitUntil(processBatchSync(admin, orgId, batchId, toSync, providerType!));
```

- [ ] **Step 2: Update `lib/quickbooks/batch-sync.ts`**

Update imports and refactor to use provider abstraction:

```typescript
// OLD:
import { getValidAccessToken } from "@/lib/quickbooks/auth";
import { createBill, createPurchase, attachPdfToEntity, QBOApiError } from "@/lib/quickbooks/api";
import type { QBOBillPayload, QBOBillLine, QBOPurchasePayload, QBOPurchaseLine } from "@/lib/quickbooks/types";

// NEW:
import {
  getAccountingProvider,
  AccountingApiError,
} from "@/lib/accounting";
import type {
  AccountingProviderType,
  CreateBillInput,
  CreatePurchaseInput,
  SyncLineItem,
  TransactionResult,
} from "@/lib/accounting";
```

Add `providerType` parameter to `processBatchSync`:
```typescript
export async function processBatchSync(
  adminSupabase: SupabaseAdminClient,
  orgId: string,
  batchId: string,
  invoices: BatchSyncInvoice[],
  providerType: AccountingProviderType
): Promise<BatchSyncResult> {
  const provider = getAccountingProvider(providerType);
  // ... rest of function using provider.createBill, provider.createPurchase, provider.attachDocument
```

Replace inline QBO payload building with `SyncLineItem[]` → `CreateBillInput`/`CreatePurchaseInput` (same pattern as Task 8).

Replace `QBOApiError` checks with `AccountingApiError`.

Remove the `getValidAccessToken` call (the adapter handles token refresh internally via `lib/quickbooks/auth`). Note: this means the first invoice in a batch is the one that discovers a broken token, rather than pre-checking. This is acceptable — the adapter's internal token refresh handles it, and a broken connection fails fast with a clear error.

Replace hardcoded `"quickbooks"` in sync_log inserts with `providerType`.

- [ ] **Step 3: Update `lib/quickbooks/batch-sync.test.ts`**

The test file mocks `QBOApiError` directly. Since `batch-sync.ts` now catches `AccountingApiError`, update the test mocks:

```typescript
// OLD mock:
QBOApiError: class QBOApiError extends Error { ... }

// NEW: import and throw AccountingApiError instead
import { AccountingApiError } from "@/lib/accounting";
// Update test throws to use AccountingApiError
```

Also update the `processBatchSync` call to pass the `providerType` argument:
```typescript
// OLD:
await processBatchSync(mockSupabase, orgId, batchId, invoices);

// NEW:
await processBatchSync(mockSupabase, orgId, batchId, invoices, "quickbooks");
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Run tests**

Run: `npm run test -- lib/quickbooks/batch-sync.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/invoices/batch/sync/route.ts lib/quickbooks/batch-sync.ts lib/quickbooks/batch-sync.test.ts
git commit -m "refactor: batch sync uses provider-agnostic abstraction (DOC-52)"
```

---

## Task 11: Update settings page and invoices page

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`
- Modify: `app/(dashboard)/invoices/page.tsx`
- Modify: `lib/extraction/run.ts`

- [ ] **Step 1: Update settings page import**

In `app/(dashboard)/settings/page.tsx`:
```typescript
// OLD:
import { loadConnection } from "@/lib/quickbooks/auth";

// NEW:
import { getOrgConnection } from "@/lib/accounting";
```

Update the usage from `loadConnection(supabase, orgId)` to `getOrgConnection(supabase, orgId)`. The return shape changes: `company_id` → `companyId`, `company_name` → `companyName`. Update property accesses accordingly. Since the settings page likely just checks if a connection exists and shows the company name, the changes should be straightforward.

- [ ] **Step 2: Update invoices page import**

In `app/(dashboard)/invoices/page.tsx`:
```typescript
// OLD:
import { isConnected } from "@/lib/quickbooks/auth";

// NEW:
import { isOrgConnected } from "@/lib/accounting";
```

Update the usage from `isConnected(supabase, orgId)` to `isOrgConnected(supabase, orgId)`.

- [ ] **Step 3: Update extraction run import**

In `lib/extraction/run.ts`:
```typescript
// OLD:
import { queryAccounts } from "@/lib/quickbooks/api";

// NEW:
import { getAccountingProvider, getOrgProvider } from "@/lib/accounting";
```

Update the account fetching logic:
```typescript
// OLD:
const accounts = await queryAccounts(adminSupabase, orgId);

// NEW:
const providerType = await getOrgProvider(adminSupabase, orgId);
let accounts: Array<{ id: string; name: string }> = [];
if (providerType) {
  const provider = getAccountingProvider(providerType);
  const accountOptions = await provider.fetchAccounts(adminSupabase, orgId);
  accounts = accountOptions.map((a) => ({ id: a.value, name: a.label }));
}
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/settings/page.tsx" "app/(dashboard)/invoices/page.tsx" lib/extraction/run.ts
git commit -m "refactor: settings, invoices, extraction use provider-agnostic imports (DOC-52)"
```

---

## Task 12: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit`
Expected: PASS with zero errors

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: PASS with zero warnings

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All existing tests pass. Some test files (e.g., `lib/quickbooks/api.test.ts`, `app/api/quickbooks/vendors/route.test.ts`) may still pass because the old QBO routes are not deleted — they still work.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Production build succeeds

- [ ] **Step 5: Verify no direct QBO imports in sync routes**

Run: `grep -r "from.*@/lib/quickbooks" app/api/invoices/`
Expected: No results (all sync routes now use `@/lib/accounting`)

- [ ] **Step 6: Verify provider extensibility**

Confirm that adding a new provider requires only:
1. Creating `lib/accounting/xero/adapter.ts` implementing `AccountingProvider`
2. Adding a `case "xero"` in `lib/accounting/index.ts`

No other files need changes.

- [ ] **Step 7: Commit (if any fixups needed)**

```bash
git add -A
git commit -m "chore: final cleanup for provider-agnostic abstraction (DOC-52)"
```

---

## Summary of what changes vs. what stays

### Changes
- New `lib/accounting/` abstraction layer (5 files)
- New `/api/accounting/` routes (3 files)
- Sync route, retry route, batch sync route, batch-sync helper — all use abstraction
- `useQboOptions` hook → points at `/api/accounting/` routes
- `VendorSelect`, `GlAccountSelect`, `LineItemEditor` → imports from `@/lib/accounting` instead of `@/lib/types/qbo`
- `PaymentAccountSelect` → uses shared `PaymentAccount` type
- `batch-sync.test.ts` → updated to use `AccountingApiError` and pass `providerType`
- Settings page, invoices page, extraction run → use `lib/accounting/connection`

### Stays the same
- `lib/quickbooks/api.ts` — untouched (adapter wraps it)
- `lib/quickbooks/auth.ts` — untouched (OAuth is provider-specific)
- `lib/quickbooks/types.ts` — untouched (QBO-specific API types)
- All OAuth routes (`connect`, `callback`, `disconnect`) — untouched
- Old `/api/quickbooks/` data routes — kept (can deprecate later)
- All existing tests — should still pass

### Not in scope
- Xero implementation (subsequent issues XRO-2 through XRO-10)
- Deleting old `/api/quickbooks/` data routes (can deprecate after Xero ships)
- Renaming `lib/quickbooks/batch-sync.ts` (it moves behind the abstraction but file location is fine)
