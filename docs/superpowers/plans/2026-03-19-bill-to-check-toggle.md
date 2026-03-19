# Bill-to-Check Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users sync invoices to QBO as Bills, Checks, Cash Expenses, or Credit Card payments — per-invoice selection with org-wide default.

**Architecture:** Adds `output_type` + `payment_account_id` to invoices, `default_output_type` + `default_payment_account_id` to organizations, `transaction_type` + `provider_entity_type` to sync_log. Sync route branches to `createBill()` or `createPurchase()` based on output type. Review UI gets a dropdown selector and inline payment account picker. Invoice list gets transaction type indicators and filter.

**Tech Stack:** Next.js 14 (App Router), Supabase Postgres, QBO REST API, Tailwind CSS, Vitest + MSW

**Spec:** `docs/superpowers/specs/2026-03-19-bill-to-check-toggle-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260319000000_add_output_type_columns.sql` | Schema: output_type on invoices, default prefs on organizations, transaction tracking on sync_log |
| `app/api/quickbooks/payment-accounts/route.ts` | GET: fetch Bank or CreditCard accounts from QBO |
| `app/api/quickbooks/payment-accounts/route.test.ts` | Tests for payment accounts route |
| `app/api/invoices/[id]/route.ts` | PATCH: update output_type + payment_account on invoice |
| `app/api/invoices/[id]/route.test.ts` | Tests for invoice PATCH route |
| `components/invoices/OutputTypeSelector.tsx` | Dropdown: Bill / Check / Expense / Credit Card |
| `components/invoices/PaymentAccountSelect.tsx` | Account picker that adapts to output type |

### Modified Files
| File | Changes |
|------|---------|
| `lib/types/invoice.ts` | Add `OutputType`, `TransactionType`, `ProviderEntityType`, lookup maps, labels |
| `lib/quickbooks/types.ts` | Add `QBOPurchasePayload`, `QBOPurchaseResponse`, `QBOPaymentAccount` |
| `lib/quickbooks/api.ts` | Add `fetchPaymentAccounts()`, `createPurchase()`, rename `attachPdfToBill` → `attachPdfToEntity` |
| `app/api/invoices/[id]/sync/route.ts` | Branch on output_type, use `createPurchase()` for non-Bill, update sync_log writes, update idempotency guard |
| `app/api/invoices/[id]/sync/retry/route.ts` | Same branching as sync route |
| `app/api/invoices/[id]/sync/log/route.ts` | Include `transaction_type` + `provider_entity_type` in response |
| `app/api/settings/organization/route.ts` | Accept `default_output_type`, `default_payment_account_id`, `default_payment_account_name` |
| `components/invoices/ExtractionForm.tsx` | Insert OutputTypeSelector + PaymentAccountSelect between line items and ActionBar |
| `components/invoices/ActionBar.tsx` | Add payment account sync blocker, update confirmation messages |
| `components/invoices/SyncStatusPanel.tsx` | Show transaction type in messages |
| `components/invoices/InvoiceList.tsx` | Add transaction type label + filter chip |
| `app/(dashboard)/invoices/page.tsx` | Pass transaction_type filter param |
| `app/(dashboard)/settings/page.tsx` | Add output type default dropdown |

---

## Task 1: Schema Migration (CHK-1)

**Files:**
- Create: `supabase/migrations/20260319000000_add_output_type_columns.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Add output_type and payment account columns to invoices
ALTER TABLE invoices
  ADD COLUMN output_type TEXT NOT NULL DEFAULT 'bill',
  ADD COLUMN payment_account_id TEXT,
  ADD COLUMN payment_account_name TEXT;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_output_type_check
  CHECK (output_type IN ('bill', 'check', 'cash', 'credit_card'));

-- Add default output type and payment account to organizations
ALTER TABLE organizations
  ADD COLUMN default_output_type TEXT NOT NULL DEFAULT 'bill',
  ADD COLUMN default_payment_account_id TEXT,
  ADD COLUMN default_payment_account_name TEXT;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_default_output_type_check
  CHECK (default_output_type IN ('bill', 'check', 'cash', 'credit_card'));

-- Add transaction tracking to sync_log
ALTER TABLE sync_log
  ADD COLUMN transaction_type TEXT NOT NULL DEFAULT 'bill',
  ADD COLUMN provider_entity_type TEXT NOT NULL DEFAULT 'Bill';

ALTER TABLE sync_log
  ADD CONSTRAINT sync_log_transaction_type_check
  CHECK (transaction_type IN ('bill', 'check', 'cash', 'credit_card'));

-- Backfill: existing rows are all bills (the default handles this since DEFAULT is 'bill')
-- Explicit backfill for safety on provider_entity_type which defaults to 'Bill'
UPDATE sync_log SET provider_entity_type = 'Bill' WHERE provider_entity_type IS NULL;
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase db push` (or apply via Supabase Dashboard SQL Editor)
Expected: Migration applies without errors.

- [ ] **Step 3: Verify columns exist**

Run the following query in SQL Editor:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name IN ('invoices', 'organizations', 'sync_log')
  AND column_name IN ('output_type', 'payment_account_id', 'payment_account_name',
    'default_output_type', 'default_payment_account_id', 'default_payment_account_name',
    'transaction_type', 'provider_entity_type');
```
Expected: 8 rows returned with correct defaults.

- [ ] **Step 4: Regenerate Supabase TypeScript types**

Run: `npx supabase gen types typescript --project-id <your-project-id> > lib/supabase/database.types.ts`
(Or however the project generates types — check existing generated types file path.)
This ensures typed Supabase queries know about the new columns.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260319000000_add_output_type_columns.sql
git commit -m "feat(CHK-1): add output_type, payment_account, and transaction_type schema columns"
```

---

## Task 2: Domain Types (CHK-2 prerequisite)

**Files:**
- Modify: `lib/types/invoice.ts`

- [ ] **Step 1: Add output type domain types to `lib/types/invoice.ts`**

Add after the existing `InvoiceStatus` type (line 7):

```typescript
// ─── Output Type Types ───

export type OutputType = "bill" | "check" | "cash" | "credit_card";
export type TransactionType = "bill" | "check" | "cash" | "credit_card";
export type ProviderEntityType = "Bill" | "Purchase";

/** Map output_type → QBO PaymentType string */
export const OUTPUT_TYPE_TO_PAYMENT_TYPE: Record<
  Exclude<OutputType, "bill">,
  "Check" | "Cash" | "CreditCard"
> = {
  check: "Check",
  cash: "Cash",
  credit_card: "CreditCard",
};

/** Map output_type → required QBO account type for PaymentAccountSelect */
export const OUTPUT_TYPE_TO_ACCOUNT_TYPE: Record<
  Exclude<OutputType, "bill">,
  "Bank" | "CreditCard"
> = {
  check: "Bank",
  cash: "Bank",
  credit_card: "CreditCard",
};

/** User-facing labels for each output type */
export const OUTPUT_TYPE_LABELS: Record<OutputType, string> = {
  bill: "Create Bill",
  check: "Write Check",
  cash: "Record Expense",
  credit_card: "Credit Card",
};

/** Helper text shown below selector for each non-bill type */
export const OUTPUT_TYPE_HELPER_TEXT: Record<Exclude<OutputType, "bill">, string> = {
  check: "Records as a direct check payment from your bank account.",
  cash: "Records as a cash expense from your bank account.",
  credit_card: "Records as a credit card charge.",
};

/** Sync confirmation messages per output type */
export const SYNC_SUCCESS_MESSAGES: Record<OutputType, string> = {
  bill: "Bill created in QuickBooks",
  check: "Check created in QuickBooks",
  cash: "Expense recorded in QuickBooks",
  credit_card: "Credit card expense recorded in QuickBooks",
};

/** Short labels for invoice list display */
export const TRANSACTION_TYPE_SHORT_LABELS: Record<TransactionType, string> = {
  bill: "Bill",
  check: "Check",
  cash: "Expense",
  credit_card: "CC",
};

export const VALID_OUTPUT_TYPES: OutputType[] = ["bill", "check", "cash", "credit_card"];
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types/invoice.ts
git commit -m "feat(CHK-2): add OutputType, TransactionType, and lookup maps to domain types"
```

---

## Task 3: QBO Purchase Types (CHK-2)

**Files:**
- Modify: `lib/quickbooks/types.ts`

- [ ] **Step 1: Add Purchase and PaymentAccount types to `lib/quickbooks/types.ts`**

Add before the `// ─── Error Types ───` section (after line 115):

```typescript
// ─── Purchase (Check/Cash/CreditCard) Types ───

export interface QBOPurchasePayload {
  PaymentType: "Check" | "Cash" | "CreditCard";
  AccountRef: { value: string };
  EntityRef: { value: string; type: "Vendor" };
  TxnDate?: string;
  DocNumber?: string;
  Line: QBOPurchaseLine[];
}

export interface QBOPurchaseLine {
  Amount: number;
  DetailType: "AccountBasedExpenseLineDetail";
  AccountBasedExpenseLineDetail: {
    AccountRef: { value: string };
    Description?: string;
  };
}

export interface QBOPurchaseResponse {
  Purchase: {
    Id: string;
    PaymentType: string;
    TotalAmt: number;
    EntityRef: { value: string; type: string };
    AccountRef: { value: string; name: string };
    DocNumber?: string;
    TxnDate?: string;
    Line: Array<{
      Id: string;
      Amount: number;
      DetailType: string;
      AccountBasedExpenseLineDetail?: {
        AccountRef: { value: string; name: string };
      };
    }>;
    MetaData: { CreateTime: string; LastUpdatedTime: string };
  };
  time: string;
}

export interface QBOPaymentAccount {
  id: string;
  name: string;
  accountType: string;
  currentBalance?: number;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/quickbooks/types.ts
git commit -m "feat(CHK-2): add QBOPurchasePayload, QBOPurchaseResponse, QBOPaymentAccount types"
```

---

## Task 4: QBO API Functions — fetchPaymentAccounts + createPurchase + attachPdfToEntity (CHK-2)

**Files:**
- Modify: `lib/quickbooks/api.ts`
- Create: `lib/quickbooks/api.test.ts` (if not existing, extend it)

- [ ] **Step 1: Write tests for fetchPaymentAccounts**

Create or extend `lib/quickbooks/api.test.ts` with tests:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Tests for fetchPaymentAccounts
describe("fetchPaymentAccounts", () => {
  it("returns bank accounts when type=Bank", async () => {
    // Mock qboFetch to return bank accounts
    // Verify query includes "AccountType = 'Bank'"
    // Verify returned accounts have correct shape
  });

  it("returns credit card accounts when type=CreditCard", async () => {
    // Mock qboFetch to return credit card accounts
    // Verify query includes "AccountType = 'CreditCard'"
  });

  it("returns empty array when no accounts exist", async () => {
    // Mock qboFetch to return empty QueryResponse
    // Verify returns []
  });

  it("throws on QBO API error", async () => {
    // Mock qboFetch to throw QBOApiError
    // Verify error propagates
  });
});
```

Note: The exact mocking pattern should follow the existing test files in the codebase. Check `app/api/invoices/[id]/sync/route.test.ts` and `app/api/settings/organization/route.test.ts` for the project's testing patterns (MSW or direct mocking).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- lib/quickbooks/api.test.ts`
Expected: Tests fail (functions don't exist yet).

- [ ] **Step 3: Add `fetchPaymentAccounts` to `lib/quickbooks/api.ts`**

Add after the `getAccountOptions` function (after line 312):

```typescript
/**
 * Fetch active payment accounts from QBO (Bank or CreditCard).
 * Used by PaymentAccountSelect to populate the dropdown.
 */
export async function fetchPaymentAccounts(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string,
  accountType: "Bank" | "CreditCard"
): Promise<QBOPaymentAccount[]> {
  const startTime = Date.now();

  const response = await qboFetch<QBOQueryResponse<QBOAccount>>(
    supabase,
    orgId,
    `/query?query=${encodeURIComponent(`SELECT * FROM Account WHERE AccountType = '${accountType}' AND Active = true MAXRESULTS 1000`)}`
  );

  const accounts = response.QueryResponse.Account ?? [];

  logger.info("qbo.query_payment_accounts", {
    orgId,
    accountType,
    count: String(accounts.length),
    durationMs: Date.now() - startTime,
  });

  return accounts.map((a) => ({
    id: a.Id,
    name: a.SubAccount ? a.FullyQualifiedName : a.Name,
    accountType: a.AccountType,
    currentBalance: a.CurrentBalance,
  }));
}
```

Add the import at the top of the file for the new types:
```typescript
import type {
  QBOPurchasePayload,
  QBOPurchaseResponse,
  QBOPaymentAccount,
} from "./types";
```

- [ ] **Step 4: Add `createPurchase` to `lib/quickbooks/api.ts`**

Add after the `createBill` function (after line 345):

```typescript
// ─── Purchase (Check/Cash/CreditCard) Operations ───

/**
 * Create a Purchase (Check, Cash Expense, or Credit Card) in QBO.
 * All three non-Bill types use the same /purchase endpoint with different PaymentType.
 */
export async function createPurchase(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string,
  purchase: QBOPurchasePayload
): Promise<QBOPurchaseResponse> {
  const startTime = Date.now();

  const response = await qboFetch<QBOPurchaseResponse>(
    supabase,
    orgId,
    "/purchase",
    {
      method: "POST",
      body: purchase,
    }
  );

  logger.info("qbo.purchase_created", {
    orgId,
    purchaseId: response.Purchase.Id,
    paymentType: response.Purchase.PaymentType,
    totalAmt: String(response.Purchase.TotalAmt),
    durationMs: Date.now() - startTime,
  });

  return response;
}
```

- [ ] **Step 5: Rename `attachPdfToBill` → `attachPdfToEntity`**

In `lib/quickbooks/api.ts`, rename the function and add the `entityType` parameter. Change the function signature (line 353):

From:
```typescript
export async function attachPdfToBill(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string,
  billId: string,
  fileBuffer: Buffer,
  fileName: string
): Promise<QBOAttachableResponse> {
```

To:
```typescript
/**
 * Attach a PDF to a QBO entity (Bill or Purchase) via the Attachable upload endpoint.
 * Uses multipart form-data with file_metadata_0 + file_content_0.
 */
export async function attachPdfToEntity(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string,
  entityId: string,
  entityType: "Bill" | "Purchase",
  fileBuffer: Buffer,
  fileName: string
): Promise<QBOAttachableResponse> {
```

Update the metadata inside the function (line 366-377):

From:
```typescript
  const metadata: QBOAttachmentMetadata = {
    AttachableRef: [
      {
        EntityRef: {
          type: "Bill",
          value: billId,
        },
      },
    ],
```

To:
```typescript
  const metadata: QBOAttachmentMetadata = {
    AttachableRef: [
      {
        EntityRef: {
          type: entityType,
          value: entityId,
        },
      },
    ],
```

Update all logger calls inside this function to use `entityId` instead of `billId` and add `entityType`.

- [ ] **Step 6: Update `attachPdfToBill` caller in sync route**

In `app/api/invoices/[id]/sync/route.ts`, update the import (line 6):

From:
```typescript
import { createBill, attachPdfToBill, QBOApiError } from "@/lib/quickbooks/api";
```

To:
```typescript
import { createBill, attachPdfToEntity, QBOApiError } from "@/lib/quickbooks/api";
```

Update the call (line 266-272):

From:
```typescript
      await attachPdfToBill(
        adminSupabase,
        orgId,
        billId,
        fileBuffer,
        invoice.file_name
      );
```

To:
```typescript
      await attachPdfToEntity(
        adminSupabase,
        orgId,
        billId,
        "Bill",
        fileBuffer,
        invoice.file_name
      );
```

Also update the retry route (`app/api/invoices/[id]/sync/retry/route.ts`) with the same import and caller change.

- [ ] **Step 7: Run tests**

Run: `npm run test`
Expected: All tests pass (existing sync tests still pass, new API tests pass).

- [ ] **Step 8: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add lib/quickbooks/api.ts lib/quickbooks/api.test.ts app/api/invoices/[id]/sync/route.ts app/api/invoices/[id]/sync/retry/route.ts
git commit -m "feat(CHK-2): add fetchPaymentAccounts, createPurchase, rename attachPdfToBill to attachPdfToEntity"
```

---

## Task 5: Payment Accounts API Route (CHK-2)

**Files:**
- Create: `app/api/quickbooks/payment-accounts/route.ts`
- Create: `app/api/quickbooks/payment-accounts/route.test.ts`

- [ ] **Step 1: Write tests for the route**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("GET /api/quickbooks/payment-accounts", () => {
  it("returns 401 if not authenticated", async () => { /* ... */ });
  it("returns 400 if type parameter is missing", async () => { /* ... */ });
  it("returns 400 if type parameter is invalid", async () => { /* ... */ });
  it("returns 400 if no QBO connection exists", async () => { /* ... */ });
  it("returns bank accounts when type=Bank", async () => { /* ... */ });
  it("returns credit card accounts when type=CreditCard", async () => { /* ... */ });
  it("returns empty array when no accounts of type exist", async () => { /* ... */ });
});
```

Follow the existing test patterns in `app/api/settings/organization/route.test.ts` for mocking Supabase auth and admin client.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- app/api/quickbooks/payment-accounts/route.test.ts`
Expected: Fail (route doesn't exist).

- [ ] **Step 3: Implement the route**

```typescript
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isConnected } from "@/lib/quickbooks/auth";
import { fetchPaymentAccounts } from "@/lib/quickbooks/api";
import { logger } from "@/lib/utils/logger";
import { authError, validationError, apiSuccess, internalError } from "@/lib/utils/errors";

/**
 * GET /api/quickbooks/payment-accounts?type=Bank|CreditCard
 *
 * Fetches payment accounts (bank or credit card) from QBO chart of accounts.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const accountType = request.nextUrl.searchParams.get("type");

  try {
    // 1. Auth
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return authError();

    // 2. Validate type param
    if (!accountType || !["Bank", "CreditCard"].includes(accountType)) {
      return validationError("Query parameter 'type' must be 'Bank' or 'CreditCard'.");
    }

    // 3. Get org
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership) return authError("No organization found.");
    const orgId = membership.org_id;

    logger.info("payment_accounts.fetch", {
      action: "fetch_payment_accounts",
      accountType,
      userId: user.id,
      orgId,
    });

    // 4. Check QBO connection
    const adminSupabase = createAdminClient();
    const connected = await isConnected(adminSupabase, orgId);
    if (!connected) {
      return validationError("Connect QuickBooks in Settings first.");
    }

    // 5. Fetch accounts
    const accounts = await fetchPaymentAccounts(
      adminSupabase,
      orgId,
      accountType as "Bank" | "CreditCard"
    );

    logger.info("payment_accounts.fetch_complete", {
      action: "fetch_payment_accounts",
      accountType,
      userId: user.id,
      orgId,
      count: String(accounts.length),
      durationMs: Date.now() - startTime,
      status: "success",
    });

    return apiSuccess({ accounts });
  } catch (error) {
    logger.error("payment_accounts.fetch_error", {
      action: "fetch_payment_accounts",
      accountType: accountType ?? "unknown",
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return internalError("Failed to fetch payment accounts from QuickBooks.");
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- app/api/quickbooks/payment-accounts/route.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add "app/api/quickbooks/payment-accounts/route.ts" "app/api/quickbooks/payment-accounts/route.test.ts"
git commit -m "feat(CHK-2): add GET /api/quickbooks/payment-accounts route"
```

---

## Task 6: Update Sync Route for Bill or Purchase (CHK-3)

**Files:**
- Modify: `app/api/invoices/[id]/sync/route.ts`
- Modify: `app/api/invoices/[id]/sync/route.test.ts`

- [ ] **Step 1: Write new tests for the Purchase sync path**

Add to existing test file:

```typescript
describe("POST /api/invoices/[id]/sync - Purchase (Check/Cash/CreditCard)", () => {
  it("creates a QBO Purchase when output_type is 'check'", async () => { /* ... */ });
  it("creates a QBO Purchase when output_type is 'cash'", async () => { /* ... */ });
  it("creates a QBO Purchase when output_type is 'credit_card'", async () => { /* ... */ });
  it("returns validation error when output_type is non-bill and payment_account_id is missing", async () => { /* ... */ });
  it("writes transaction_type='check' and provider_entity_type='Purchase' to sync_log", async () => { /* ... */ });
  it("idempotency: successful bill does not block check sync", async () => { /* ... */ });
  it("idempotency: successful check blocks duplicate check sync", async () => { /* ... */ });
  it("attaches PDF with entityType='Purchase' for non-bill syncs", async () => { /* ... */ });
  it("bill sync regression: unchanged behavior when output_type is 'bill'", async () => { /* ... */ });
});
```

- [ ] **Step 2: Run tests to verify new ones fail**

Run: `npm run test -- "app/api/invoices/\\[id\\]/sync/route.test.ts"`
Expected: New tests fail, existing tests still pass.

**Note:** The sync route already uses `.select("*")` on the invoices table (line 79), so `output_type`, `payment_account_id`, and `payment_account_name` are automatically available after the migration. No query changes needed.

- [ ] **Step 3: Update sync route imports**

At the top of `app/api/invoices/[id]/sync/route.ts`, add:

```typescript
import { createBill, createPurchase, attachPdfToEntity, QBOApiError } from "@/lib/quickbooks/api";
import type { QBOBillPayload, QBOBillLine, QBOPurchasePayload, QBOPurchaseLine } from "@/lib/quickbooks/types";
import { OUTPUT_TYPE_TO_PAYMENT_TYPE } from "@/lib/types/invoice";
import type { OutputType } from "@/lib/types/invoice";
```

Remove old imports: `attachPdfToBill`, standalone `QBOBillLine`.

- [ ] **Step 4: Update the idempotency guard (lines 98-119)**

Replace the existing idempotency query with transaction-type-aware version:

```typescript
    // 5. Idempotency guard: check for existing successful sync of the same transaction type
    // Note: UI locks output_type after sync, so dual-sync can't happen today.
    // The transaction_type filter is future-proofing for when we might allow re-syncing as a different type.
    const outputType = (invoice.output_type ?? "bill") as OutputType;
    const { data: existingSync } = await adminSupabase
      .from("sync_log")
      .select("provider_bill_id") // legacy name — holds Purchase ID for non-bill types
      .eq("invoice_id", invoiceId)
      .eq("provider", "quickbooks")
      .eq("status", "success")
      .eq("transaction_type", outputType)
      .limit(1)
      .single();
```

- [ ] **Step 5: Add Purchase branch after the validation section (replace lines 168-250)**

After validation (line 167), replace the bill-only logic with branching:

```typescript
    // 9. Branch: Bill or Purchase based on output_type
    const transactionType = outputType;
    const providerEntityType = outputType === "bill" ? "Bill" : "Purchase";

    // provider_bill_id is a legacy column name — holds Purchase.Id for non-bill types
    let entityId: string;
    let attachmentEntityType: "Bill" | "Purchase";

    if (outputType === "bill") {
      // ── Bill path (existing behavior) ──
      const billLines: QBOBillLine[] = lineItems.map((li: { amount: number; gl_account_id: string; description: string | null }) => ({
        DetailType: "AccountBasedExpenseLineDetail" as const,
        Amount: Number(li.amount),
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: li.gl_account_id },
        },
        ...(li.description ? { Description: li.description } : {}),
      }));

      const billPayload: QBOBillPayload = {
        VendorRef: { value: extractedData.vendor_ref },
        Line: billLines,
        ...(extractedData.invoice_date ? { TxnDate: extractedData.invoice_date } : {}),
        ...(extractedData.due_date ? { DueDate: extractedData.due_date } : {}),
        ...(extractedData.invoice_number ? { DocNumber: extractedData.invoice_number } : {}),
      };

      try {
        const billResponse = await createBill(adminSupabase, orgId, billPayload);
        entityId = billResponse.Bill.Id;

        await adminSupabase.from("sync_log").insert({
          invoice_id: invoiceId,
          provider: "quickbooks",
          provider_bill_id: entityId,
          request_payload: billPayload as unknown as Record<string, unknown>,
          provider_response: billResponse as unknown as Record<string, unknown>,
          status: "success",
          transaction_type: transactionType,
          provider_entity_type: providerEntityType,
        });
      } catch (error) {
        // [existing error handling — keep as-is but add transaction_type/provider_entity_type to sync_log insert]
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const errorDetail = error instanceof QBOApiError
          ? { code: error.errorCode, element: error.element, detail: error.detail, faultType: error.faultType }
          : {};

        await adminSupabase.from("sync_log").insert({
          invoice_id: invoiceId,
          provider: "quickbooks",
          request_payload: billPayload as unknown as Record<string, unknown>,
          provider_response: errorDetail as Record<string, unknown>,
          status: "failed",
          transaction_type: transactionType,
          provider_entity_type: providerEntityType,
        });

        await adminSupabase
          .from("invoices")
          .update({
            error_message: `Sync failed: ${errorMessage}`,
            retry_count: (invoice.retry_count ?? 0) + 1,
          })
          .eq("id", invoiceId);

        logger.error("qbo.sync_bill_creation_failed", {
          invoiceId, orgId, userId: user.id,
          error: errorMessage, ...errorDetail,
          durationMs: Date.now() - startTime,
        });

        if (error instanceof QBOApiError) {
          if (error.detail?.includes("Duplicate")) {
            return validationError(
              `A bill with this invoice number already exists in QuickBooks. ${error.detail}`
            );
          }
          return validationError(`QuickBooks error: ${error.detail}`);
        }
        return internalError("Failed to create bill in QuickBooks.");
      }

      attachmentEntityType = "Bill";

    } else {
      // ── Purchase path (Check / Cash / CreditCard) ──
      if (!invoice.payment_account_id) {
        return validationError(
          "A payment account is required for this transaction type. Select a bank or credit card account."
        );
      }

      const paymentType = OUTPUT_TYPE_TO_PAYMENT_TYPE[outputType as Exclude<OutputType, "bill">];

      const purchaseLines: QBOPurchaseLine[] = lineItems.map((li: { amount: number; gl_account_id: string; description: string | null }) => ({
        Amount: Number(li.amount),
        DetailType: "AccountBasedExpenseLineDetail" as const,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: li.gl_account_id },
          ...(li.description ? { Description: li.description } : {}),
        },
      }));

      const purchasePayload: QBOPurchasePayload = {
        PaymentType: paymentType,
        AccountRef: { value: invoice.payment_account_id },
        EntityRef: { value: extractedData.vendor_ref, type: "Vendor" },
        Line: purchaseLines,
        ...(extractedData.invoice_date ? { TxnDate: extractedData.invoice_date } : {}),
        ...(extractedData.invoice_number ? { DocNumber: extractedData.invoice_number } : {}),
      };

      try {
        const purchaseResponse = await createPurchase(adminSupabase, orgId, purchasePayload);
        entityId = purchaseResponse.Purchase.Id;

        await adminSupabase.from("sync_log").insert({
          invoice_id: invoiceId,
          provider: "quickbooks",
          provider_bill_id: entityId, // legacy column name
          request_payload: purchasePayload as unknown as Record<string, unknown>,
          provider_response: purchaseResponse as unknown as Record<string, unknown>,
          status: "success",
          transaction_type: transactionType,
          provider_entity_type: providerEntityType,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const errorDetail = error instanceof QBOApiError
          ? { code: error.errorCode, element: error.element, detail: error.detail, faultType: error.faultType }
          : {};

        await adminSupabase.from("sync_log").insert({
          invoice_id: invoiceId,
          provider: "quickbooks",
          request_payload: purchasePayload as unknown as Record<string, unknown>,
          provider_response: errorDetail as Record<string, unknown>,
          status: "failed",
          transaction_type: transactionType,
          provider_entity_type: providerEntityType,
        });

        await adminSupabase
          .from("invoices")
          .update({
            error_message: `Sync failed: ${errorMessage}`,
            retry_count: (invoice.retry_count ?? 0) + 1,
          })
          .eq("id", invoiceId);

        logger.error("qbo.sync_purchase_creation_failed", {
          invoiceId, orgId, userId: user.id,
          outputType, paymentType,
          error: errorMessage, ...errorDetail,
          durationMs: Date.now() - startTime,
        });

        if (error instanceof QBOApiError) {
          return validationError(`QuickBooks error: ${error.detail}`);
        }
        return internalError(`Failed to create ${paymentType.toLowerCase()} in QuickBooks.`);
      }

      attachmentEntityType = "Purchase";
    }

    // 10. Attach PDF (partial success if this fails)
    let attachmentStatus = "attached";
    try {
      const { data: fileData, error: downloadError } = await adminSupabase
        .storage
        .from("invoices")
        .download(invoice.file_path);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download file: ${downloadError?.message}`);
      }

      const fileBuffer = Buffer.from(await fileData.arrayBuffer());
      await attachPdfToEntity(
        adminSupabase,
        orgId,
        entityId,
        attachmentEntityType,
        fileBuffer,
        invoice.file_name
      );
    } catch (error) {
      attachmentStatus = "failed";
      logger.warn("qbo.sync_attachment_failed", {
        invoiceId, orgId, entityId, entityType: attachmentEntityType,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // 11. Update invoice status
    await adminSupabase
      .from("invoices")
      .update({ status: "synced", error_message: null })
      .eq("id", invoiceId);

    logger.info("qbo.sync_complete", {
      invoiceId, orgId, userId: user.id,
      entityId, outputType, transactionType, providerEntityType,
      attachmentStatus,
      durationMs: Date.now() - startTime,
    });

    return apiSuccess({
      billId: entityId, // legacy key name — kept for backward compat
      attachmentStatus,
      ...(attachmentStatus === "failed"
        ? { warning: `${providerEntityType} created but PDF attachment failed. You can attach it manually in QuickBooks.` }
        : {}),
    });
```

- [ ] **Step 6: Apply same changes to retry route**

Update `app/api/invoices/[id]/sync/retry/route.ts` with the same branching pattern. The retry route has the same structure — it needs the same `outputType` reading, `createPurchase` branch, and sync_log column updates.

- [ ] **Step 7: Run all tests**

Run: `npm run test`
Expected: All pass.

- [ ] **Step 8: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add "app/api/invoices/[id]/sync/route.ts" "app/api/invoices/[id]/sync/route.test.ts" "app/api/invoices/[id]/sync/retry/route.ts"
git commit -m "feat(CHK-3): branch sync route for bill vs purchase, update sync_log with transaction_type"
```

---

## Task 7: PATCH /api/invoices/[id] Route (CHK-4)

**Files:**
- Create: `app/api/invoices/[id]/route.ts`
- Create: `app/api/invoices/[id]/route.test.ts`

- [ ] **Step 1: Write tests**

```typescript
describe("PATCH /api/invoices/[id]", () => {
  it("returns 401 if not authenticated", async () => { /* ... */ });
  it("returns 404 if invoice not found or wrong org", async () => { /* ... */ });
  it("updates output_type to 'check'", async () => { /* ... */ });
  it("clears payment_account fields when output_type changes", async () => { /* ... */ });
  it("updates payment_account_id and payment_account_name", async () => { /* ... */ });
  it("returns 400 for invalid output_type", async () => { /* ... */ });
  it("returns 409 if invoice is synced", async () => { /* ... */ });
  it("returns 400 if invoice is extracting or uploading", async () => { /* ... */ });
});
```

- [ ] **Step 2: Implement the route**

```typescript
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";
import { authError, validationError, notFound, conflict, apiSuccess, internalError } from "@/lib/utils/errors";
import { VALID_OUTPUT_TYPES } from "@/lib/types/invoice";
import type { OutputType } from "@/lib/types/invoice";

interface PatchBody {
  output_type?: string;
  payment_account_id?: string | null;
  payment_account_name?: string | null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const { id: invoiceId } = await params;

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

    // Fetch invoice and verify ownership
    const { data: invoice } = await adminSupabase
      .from("invoices")
      .select("id, status, output_type")
      .eq("id", invoiceId)
      .eq("org_id", orgId)
      .single();

    if (!invoice) return notFound("Invoice not found.");

    // Only allow updates on pending_review or approved invoices
    if (invoice.status === "synced") {
      return conflict("Cannot modify a synced invoice.");
    }
    if (!["pending_review", "approved"].includes(invoice.status)) {
      return validationError(`Cannot modify invoice in '${invoice.status}' status.`);
    }

    let body: PatchBody;
    try {
      body = await request.json();
    } catch {
      return validationError("Invalid JSON body.");
    }

    const updates: Record<string, unknown> = {};

    // Handle output_type change
    if (body.output_type !== undefined) {
      if (!VALID_OUTPUT_TYPES.includes(body.output_type as OutputType)) {
        return validationError(
          `Invalid output_type. Must be one of: ${VALID_OUTPUT_TYPES.join(", ")}`
        );
      }

      updates.output_type = body.output_type;

      // Clear payment account when output_type changes to prevent stale account mismatch
      if (body.output_type !== invoice.output_type) {
        updates.payment_account_id = null;
        updates.payment_account_name = null;
      }
    }

    // Handle payment account update (only if explicitly provided)
    if (body.payment_account_id !== undefined) {
      updates.payment_account_id = body.payment_account_id;
    }
    if (body.payment_account_name !== undefined) {
      updates.payment_account_name = body.payment_account_name;
    }

    if (Object.keys(updates).length === 0) {
      return validationError("No fields to update.");
    }

    const { error: updateErr } = await adminSupabase
      .from("invoices")
      .update(updates)
      .eq("id", invoiceId);

    if (updateErr) {
      logger.error("invoice.update_failed", {
        invoiceId, orgId, userId: user.id,
        error: updateErr.message,
      });
      return internalError("Failed to update invoice.");
    }

    logger.info("invoice.updated", {
      action: "update_invoice",
      invoiceId,
      orgId,
      userId: user.id,
      outputType: updates.output_type ?? invoice.output_type,
      durationMs: Date.now() - startTime,
      status: "success",
    });

    return apiSuccess(updates);
  } catch (error) {
    logger.error("invoice.update_error", {
      invoiceId,
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return internalError("An unexpected error occurred.");
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- "app/api/invoices/\\[id\\]/route.test.ts"`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add "app/api/invoices/[id]/route.ts" "app/api/invoices/[id]/route.test.ts"
git commit -m "feat(CHK-4): add PATCH /api/invoices/[id] route for output_type and payment_account"
```

---

## Task 8: Expand PATCH /api/settings/organization (CHK-4)

**Files:**
- Modify: `app/api/settings/organization/route.ts`
- Modify: `app/api/settings/organization/route.test.ts`

- [ ] **Step 1: Add new tests**

```typescript
describe("PATCH /api/settings/organization - output type defaults", () => {
  it("updates default_output_type", async () => { /* ... */ });
  it("returns 400 for invalid default_output_type", async () => { /* ... */ });
  it("updates default_payment_account_id and name", async () => { /* ... */ });
  it("allows updating name and default_output_type together", async () => { /* ... */ });
  it("allows updating just default_output_type without name", async () => { /* ... */ });
});
```

- [ ] **Step 2: Update the route to accept new fields**

The current route only accepts `{ name }` and requires it. Expand to accept all fields independently:

Change the body type (line 17) from:
```typescript
  let body: { name?: string };
```

To:
```typescript
  let body: {
    name?: string;
    default_output_type?: string;
    default_payment_account_id?: string | null;
    default_payment_account_name?: string | null;
  };
```

Replace the name-only validation and update (lines 24-56) with:

```typescript
  const updates: Record<string, unknown> = {};

  // Validate name if provided
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return validationError("Organization name cannot be empty.");
    if (name.length > 100) return validationError("Organization name must be 100 characters or fewer.");
    updates.name = name;
  }

  // Validate default_output_type if provided
  if (body.default_output_type !== undefined) {
    const validTypes = ["bill", "check", "cash", "credit_card"];
    if (!validTypes.includes(body.default_output_type)) {
      return validationError(`Invalid default_output_type. Must be one of: ${validTypes.join(", ")}`);
    }
    updates.default_output_type = body.default_output_type;
  }

  // Payment account fields
  if (body.default_payment_account_id !== undefined) {
    updates.default_payment_account_id = body.default_payment_account_id;
  }
  if (body.default_payment_account_name !== undefined) {
    updates.default_payment_account_name = body.default_payment_account_name;
  }

  if (Object.keys(updates).length === 0) {
    return validationError("No fields to update.");
  }

  // Look up org from membership
  const { data: membership, error: membershipErr } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (membershipErr || !membership) {
    logger.warn("settings.update_org", { userId: user.id, error: "No org membership found" });
    return notFound("Organization not found.");
  }

  const orgId = membership.org_id;

  const admin = createAdminClient();
  const { data: updated, error: updateErr } = await admin
    .from("organizations")
    .update(updates)
    .eq("id", orgId)
    .select("name, default_output_type, default_payment_account_id, default_payment_account_name")
    .single();

  if (updateErr || !updated) {
    logger.error("settings.update_org", { userId: user.id, orgId, error: updateErr?.message });
    return internalError("Failed to update organization.");
  }

  revalidatePath("/settings");

  logger.info("settings.update_org", {
    userId: user.id,
    orgId,
    updatedFields: Object.keys(updates).join(","),
    durationMs: Date.now() - start,
    status: "success",
  });

  return apiSuccess(updated);
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- app/api/settings/organization/route.test.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/settings/organization/route.ts app/api/settings/organization/route.test.ts
git commit -m "feat(CHK-4): expand org settings route to accept output type and payment account defaults"
```

---

## Task 9: OutputTypeSelector Component (CHK-4)

**Files:**
- Create: `components/invoices/OutputTypeSelector.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useState } from "react";
import type { OutputType } from "@/lib/types/invoice";
import {
  OUTPUT_TYPE_LABELS,
  OUTPUT_TYPE_HELPER_TEXT,
  VALID_OUTPUT_TYPES,
} from "@/lib/types/invoice";

interface OutputTypeSelectorProps {
  invoiceId: string;
  initialOutputType: OutputType;
  disabled: boolean; // true when invoice is synced
  onOutputTypeChange: (newType: OutputType) => void;
}

export default function OutputTypeSelector({
  invoiceId,
  initialOutputType,
  disabled,
  onOutputTypeChange,
}: OutputTypeSelectorProps) {
  const [outputType, setOutputType] = useState<OutputType>(initialOutputType);
  const [saving, setSaving] = useState(false);

  const handleChange = async (newType: OutputType) => {
    if (newType === outputType || disabled) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ output_type: newType }),
      });

      if (!res.ok) {
        const data = await res.json();
        // Surface error to user — don't silently swallow
        alert(`Failed to update output type: ${data.error}`);
        return;
      }

      setOutputType(newType);
      onOutputTypeChange(newType);
    } finally {
      setSaving(false);
    }
  };

  const helperText =
    outputType !== "bill"
      ? OUTPUT_TYPE_HELPER_TEXT[outputType as Exclude<OutputType, "bill">]
      : null;

  return (
    <div>
      <label
        htmlFor="output-type"
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        Output Type
      </label>
      <select
        id="output-type"
        value={outputType}
        onChange={(e) => handleChange(e.target.value as OutputType)}
        disabled={disabled || saving}
        className={`border border-gray-200 rounded-md px-3 py-2 text-sm w-full max-w-xs ${
          disabled ? "bg-gray-100 cursor-not-allowed" : ""
        }`}
      >
        {VALID_OUTPUT_TYPES.map((type) => (
          <option key={type} value={type}>
            {OUTPUT_TYPE_LABELS[type]}
          </option>
        ))}
      </select>
      {helperText && (
        <p className="mt-1 text-xs text-gray-500">{helperText}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/invoices/OutputTypeSelector.tsx
git commit -m "feat(CHK-4): add OutputTypeSelector dropdown component"
```

---

## Task 10: PaymentAccountSelect Component (CHK-4)

**Files:**
- Create: `components/invoices/PaymentAccountSelect.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useState, useEffect, useRef } from "react";
import type { OutputType } from "@/lib/types/invoice";
import { OUTPUT_TYPE_TO_ACCOUNT_TYPE } from "@/lib/types/invoice";

interface PaymentAccount {
  id: string;
  name: string;
  accountType: string;
  currentBalance?: number;
}

interface PaymentAccountSelectProps {
  invoiceId: string;
  outputType: Exclude<OutputType, "bill">;
  initialAccountId: string | null;
  defaultOrgAccountId: string | null;
  qboConnected: boolean;
  onAccountChange: (accountId: string | null, accountName: string | null) => void;
}

export default function PaymentAccountSelect({
  invoiceId,
  outputType,
  initialAccountId,
  defaultOrgAccountId,
  qboConnected,
  onAccountChange,
}: PaymentAccountSelectProps) {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialAccountId);

  const accountType = OUTPUT_TYPE_TO_ACCOUNT_TYPE[outputType];

  // Track whether we've already applied the default to avoid duplicate PATCH on remount
  const defaultAppliedRef = useRef(false);

  useEffect(() => {
    if (!qboConnected) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    let cancelled = false;

    fetch(`/api/quickbooks/payment-accounts?type=${accountType}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        const fetched: PaymentAccount[] = data.data?.accounts ?? [];
        setAccounts(fetched);

        // Auto-select org default if no invoice-level selection (only once)
        if (!initialAccountId && defaultOrgAccountId && !defaultAppliedRef.current) {
          const account = fetched.find((a) => a.id === defaultOrgAccountId);
          if (account) {
            defaultAppliedRef.current = true;
            setSelectedId(account.id);
            // Only save to invoice (don't update org default — it's already the default)
            fetch(`/api/invoices/${invoiceId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                payment_account_id: account.id,
                payment_account_name: account.name,
              }),
            });
            onAccountChange(account.id, account.name);
          }
        }
      })
      .catch(() => { if (!cancelled) setError("Failed to load accounts."); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [accountType, qboConnected]);

  const handleSelect = async (accountId: string, accountName: string) => {
    setSelectedId(accountId);

    // Save to invoice
    await fetch(`/api/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payment_account_id: accountId,
        payment_account_name: accountName,
      }),
    });

    // Save as org default
    await fetch("/api/settings/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        default_payment_account_id: accountId,
        default_payment_account_name: accountName,
      }),
    });

    onAccountChange(accountId, accountName);
  };

  if (!qboConnected) {
    return (
      <p className="text-sm text-amber-600">
        Connect QuickBooks in Settings to use this option.
      </p>
    );
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading accounts...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (accounts.length === 0) {
    const label = accountType === "Bank" ? "bank" : "credit card";
    return (
      <p className="text-sm text-amber-600">
        No {label} accounts found in QuickBooks. Add one in QBO first.
      </p>
    );
  }

  return (
    <div>
      <label
        htmlFor="payment-account"
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        {accountType === "Bank" ? "Bank Account" : "Credit Card Account"}
      </label>
      <select
        id="payment-account"
        value={selectedId ?? ""}
        onChange={(e) => {
          const account = accounts.find((a) => a.id === e.target.value);
          if (account) handleSelect(account.id, account.name);
        }}
        className="border border-gray-200 rounded-md px-3 py-2 text-sm w-full max-w-xs"
      >
        <option value="">Select an account</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
            {account.id === defaultOrgAccountId ? " (org default)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/invoices/PaymentAccountSelect.tsx
git commit -m "feat(CHK-4): add PaymentAccountSelect component with auto-default"
```

---

## Task 11: Wire Components into ExtractionForm + ActionBar (CHK-4)

**Files:**
- Modify: `components/invoices/ExtractionForm.tsx` (604 lines — read first)
- Modify: `components/invoices/ActionBar.tsx` (365 lines — read first)
- Modify: `app/(dashboard)/invoices/[id]/review/page.tsx` (92 lines — read first)

**IMPORTANT:** Read all three files in full before making changes. The ExtractionForm has complex state management (useReducer with SET_FIELD_STATUS, auto-save on blur, etc.). The review page server component fetches invoice + extracted data and passes them down. You need to understand the current prop threading to wire in the new components correctly.

**Key additions needed for the review page:**
1. Fetch the org record alongside existing queries: `const { data: org } = await adminSupabase.from("organizations").select("default_output_type, default_payment_account_id, default_payment_account_name").eq("id", orgId).single();`
2. Pass `invoice.output_type`, `invoice.payment_account_id`, `org.default_output_type`, `org.default_payment_account_id` through to ExtractionForm as new props
3. Add these to ExtractionForm's props interface

- [ ] **Step 1: Add OutputTypeSelector + PaymentAccountSelect to ExtractionForm**

In `components/invoices/ExtractionForm.tsx`, add imports at the top:

```typescript
import OutputTypeSelector from "./OutputTypeSelector";
import PaymentAccountSelect from "./PaymentAccountSelect";
import type { OutputType } from "@/lib/types/invoice";
import { OUTPUT_TYPE_TO_ACCOUNT_TYPE } from "@/lib/types/invoice";
```

Add state for output type and payment account. The initial values come from the invoice record (you'll need to pass these as props or fetch them). Add after existing state declarations:

```typescript
const [outputType, setOutputType] = useState<OutputType>(
  (invoiceOutputType ?? orgDefaultOutputType ?? "bill") as OutputType
);
const [paymentAccountId, setPaymentAccountId] = useState<string | null>(
  invoicePaymentAccountId ?? null
);
```

Insert the OutputTypeSelector and PaymentAccountSelect between the Amounts section and the ActionBar (between lines 456 and 458):

```tsx
      {/* Section 4: Output Type */}
      {(currentStatus === "pending_review" || currentStatus === "approved" || currentStatus === "synced") && (
        <>
          <div className="border-t border-border" />
          <div className="space-y-3">
            <OutputTypeSelector
              invoiceId={invoiceId}
              initialOutputType={outputType}
              disabled={currentStatus === "synced"}
              onOutputTypeChange={(newType) => {
                setOutputType(newType);
                setPaymentAccountId(null); // clear on type change
              }}
            />
            {outputType !== "bill" && currentStatus !== "synced" && (
              <PaymentAccountSelect
                invoiceId={invoiceId}
                outputType={outputType as Exclude<OutputType, "bill">}
                initialAccountId={paymentAccountId}
                defaultOrgAccountId={orgDefaultPaymentAccountId ?? null}
                qboConnected={qboOptions.connected}
                onAccountChange={(id) => setPaymentAccountId(id)}
              />
            )}
          </div>
        </>
      )}
```

Update the syncBlockers computation to include payment account check:

```typescript
const syncBlockers = [
  ...(!extractedData.vendor_ref ? ["Select a QuickBooks vendor"] : []),
  ...(lineItemsMissingGl > 0 ? [`${lineItemsMissingGl} line item(s) need GL account mapping`] : []),
  ...(outputType !== "bill" && !paymentAccountId
    ? ["Select a payment account for this transaction type"]
    : []),
];
```

- [ ] **Step 2: Update ActionBar confirmation messages**

In `components/invoices/ActionBar.tsx`, add import:
```typescript
import { SYNC_SUCCESS_MESSAGES } from "@/lib/types/invoice";
import type { OutputType } from "@/lib/types/invoice";
```

Add `outputType` prop to ActionBar and use `SYNC_SUCCESS_MESSAGES[outputType]` for the success message instead of the hardcoded string.

- [ ] **Step 3: Pass output type data from review page**

The review page server component (`app/(dashboard)/invoices/[id]/review/page.tsx`) needs to pass `invoice.output_type`, `invoice.payment_account_id`, and the org's `default_output_type` and `default_payment_account_id` to the components. Fetch the organization data alongside the existing queries.

- [ ] **Step 4: Run lint and build**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add components/invoices/ExtractionForm.tsx components/invoices/ActionBar.tsx "app/(dashboard)/invoices/[id]/review/page.tsx"
git commit -m "feat(CHK-4): wire OutputTypeSelector and PaymentAccountSelect into review page"
```

---

## Task 12: Settings Page — Output Type Default (CHK-4)

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Add output type default dropdown to settings page**

Add an output type section to the settings page (within the QBO connection section or as a new card). Use the same dropdown pattern as OutputTypeSelector but updating the org default via `PATCH /api/settings/organization`.

This should show:
- A "Default Output Type" dropdown with 4 options
- When a non-bill type is selected and no default payment account is set, show a PaymentAccountSelect

- [ ] **Step 2: Run build**

Run: `npm run lint && npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/settings/page.tsx"
git commit -m "feat(CHK-4): add output type default dropdown to settings page"
```

---

## Task 13: Sync Log API + SyncStatusPanel Updates (CHK-5)

**Files:**
- Modify: `app/api/invoices/[id]/sync/log/route.ts`
- Modify: `components/invoices/SyncStatusPanel.tsx`

- [ ] **Step 1: Update sync log route to include transaction type fields**

In `app/api/invoices/[id]/sync/log/route.ts`, update the select query to include `transaction_type` and `provider_entity_type`:

Change the select from `"*"` or the existing fields to explicitly include the new columns.

- [ ] **Step 2: Update SyncStatusPanel to show transaction type**

In `components/invoices/SyncStatusPanel.tsx`:

Import:
```typescript
import { SYNC_SUCCESS_MESSAGES, TRANSACTION_TYPE_SHORT_LABELS } from "@/lib/types/invoice";
import type { TransactionType } from "@/lib/types/invoice";
```

Update the success message display. Where it currently shows "Bill #[id] created", use the `transaction_type` from the sync log entry to show the correct message (e.g., "Check #[id] created", "Expense #[id] recorded").

Update error messages to reference the correct transaction type.

- [ ] **Step 3: Commit**

```bash
git add "app/api/invoices/[id]/sync/log/route.ts" components/invoices/SyncStatusPanel.tsx
git commit -m "feat(CHK-5): show transaction type in sync status panel and log API"
```

---

## Task 14: Invoice List — Transaction Type Indicator + Filter (CHK-5)

**Files:**
- Modify: `components/invoices/InvoiceList.tsx`
- Modify: `app/(dashboard)/invoices/page.tsx`

- [ ] **Step 1: Add transaction type label to synced invoices**

In `components/invoices/InvoiceList.tsx`, in the table row where status badge is rendered for synced invoices, add a small label:

```tsx
{invoice.status === "synced" && invoice.output_type && (
  <span className="ml-1.5 text-xs text-gray-500">
    {TRANSACTION_TYPE_SHORT_LABELS[invoice.output_type as TransactionType]}
  </span>
)}
```

This requires the invoice list data to include `transaction_type`. Update the invoice list API query (in `app/(dashboard)/invoices/page.tsx` or wherever `fetchInvoiceList` is defined) to join with `sync_log` to get the transaction type for synced invoices, or add an `output_type` field to the list query since it's already on the invoices table.

- [ ] **Step 2: Add transaction type filter chip**

Add a new filter section below the existing status filter tabs. Show filter chips for: All | Bill | Check | Expense | Credit Card. These filter synced invoices by `output_type` (which is on the invoices table).

Update URL params to include `output_type` filter. Update the page's server component to pass this filter to the query.

- [ ] **Step 3: Run lint and build**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/invoices/InvoiceList.tsx "app/(dashboard)/invoices/page.tsx"
git commit -m "feat(CHK-5): add transaction type indicator and filter to invoice list"
```

---

## Task 15: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: Zero warnings, zero errors.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: Builds successfully.

- [ ] **Step 5: Manual smoke test**

Start dev server: `npm run dev -- --port 3000`
1. Open an invoice in pending_review status
2. Verify the Output Type dropdown appears below amounts
3. Select "Write Check" — verify bank account selector appears
4. Select "Credit Card" — verify credit card account selector appears (bank account selector should disappear, credit card selector should appear)
5. Select a bank account, approve, sync — verify sync completes
6. Verify synced invoice shows "Check" label in invoice list
7. Verify SyncStatusPanel shows "Check #[id] created"
8. Verify Settings page has the Output Type default dropdown

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address smoke test findings for bill-to-check toggle"
```
