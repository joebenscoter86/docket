# Bill-to-Check Toggle — Design Spec

**Date:** 2026-03-19
**Project:** Bill-to-Check Toggle
**Linear Project:** [Bill-to-Check Toggle](https://linear.app/jkbtech/project/bill-to-check-toggle-5972427a4589)
**Status:** Reviewed (spec review + CEO review passed)
**Review mode:** Selective Expansion

---

## Problem

Docket currently only creates Bills when syncing invoices to QuickBooks Online. Cash-basis small businesses (plumbers, electricians, landscapers) don't use Accounts Payable — they write checks, record cash expenses, or pay by credit card directly. Forcing them through a Bill workflow clutters their books and doesn't match how they operate.

## Solution

Add an "Output Type" dropdown to the invoice review page. Users choose their QBO transaction type before syncing:

- **Create Bill** (default) — accrual/AP workflow, existing behavior
- **Write Check** — cash-basis direct payment from a bank account
- **Record Expense** — cash payment recorded against a bank account
- **Credit Card** — payment recorded against a credit card account

The selection is per-invoice with an org-wide default configurable in Settings. Same extraction pipeline, same review UI, different QBO transaction type on sync. All non-Bill types use the same QBO Purchase endpoint with different `PaymentType` values.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Default output type | Bill, with org-wide default override in Settings | Cash-basis users set it once; accrual users never think about it |
| Payment account selector | Inline on review page when non-Bill type selected | Self-contained workflow — no forcing users into Settings mid-review |
| Payment account default | First selection becomes org default, changeable inline | Zero-config for repeat use |
| Per-invoice persistence | `output_type` + `payment_account_id/name` on `invoices` table | Server-side, survives page refresh, sync route reads from DB not request body |
| Org-wide default storage | `default_output_type` + `default_payment_account_id/name` on `organizations` table | Simple, no new tables |
| PDF attachment | Generalize `attachPdfToBill` → `attachPdfToEntity` with entity type param | Purchase attachments use same Attachable API but different `EntityRef.type` |
| Domain types location | `OutputType`, `TransactionType` in `lib/types/invoice.ts` | Domain concepts, not QBO-specific — avoids coupling UI to QBO module |
| UI control | Dropdown select, not segmented control | 4 options in a row is crowded; dropdown is compact and matches set-and-forget nature |
| Account type mismatch | Clear `payment_account_id` when `output_type` changes | Prevents stale credit card account being used for a Check |
| Single component | `PaymentAccountSelect` adapts to output_type | Fetches Bank or CreditCard accounts based on type — one component, one endpoint with `?type=` param |

---

## Architecture

### Data Flow

```
User selects output type from dropdown on review page
  → output_type saved to invoices table via PATCH /api/invoices/[id]
  → If non-Bill type: PaymentAccountSelect appears inline
  → PaymentAccountSelect fetches accounts from GET /api/quickbooks/payment-accounts?type=Bank|CreditCard
  → User picks account → saved to invoices table (payment_account_id, payment_account_name)
  → First selection also saved as org default via PATCH /api/settings/organization
  → User clicks Sync
  → Sync route reads output_type + payment_account_id from invoice record (DB is source of truth)
  → If "bill": calls createBill() (existing flow, unchanged)
  → If "check"/"cash"/"credit_card": calls createPurchase(paymentType) (QBO Purchase endpoint)
  → PDF attached via attachPdfToEntity() with correct entity type ("Bill" or "Purchase")
  → sync_log records transaction_type + provider_entity_type
  → Invoice list shows transaction type indicator on synced invoices
```

### QBO Purchase Endpoint (Check, Expense, Credit Card)

All three non-Bill types use the same QBO endpoint with different `PaymentType`:

```
POST /v3/company/{companyId}/purchase

{
  "PaymentType": "Check" | "Cash" | "CreditCard",
  "AccountRef": { "value": "<bank_or_cc_account_id>" },
  "EntityRef": { "value": "<vendor_id>", "type": "Vendor" },
  "TxnDate": "2026-04-15",
  "DocNumber": "INV-001",
  "Line": [
    {
      "Amount": 150.00,
      "DetailType": "AccountBasedExpenseLineDetail",
      "AccountBasedExpenseLineDetail": {
        "AccountRef": { "value": "<expense_account_id>" },
        "Description": "Consulting services"
      }
    }
  ]
}
```

**Key differences from Bill creation:**
- Endpoint: `/purchase` not `/bill`
- Requires `PaymentType`: `"Check"`, `"Cash"`, or `"CreditCard"`
- Requires `AccountRef` — the payment source account:
  - Check/Cash: Bank-type account (checking, savings)
  - CreditCard: CreditCard-type account
- Uses `EntityRef` with `type: "Vendor"` instead of `VendorRef`
- Line items use the same `AccountBasedExpenseLineDetail` structure
- PDF attachment uses same Attachable endpoint but `EntityRef.type` must be `"Purchase"` (not `"Bill"`). Existing `attachPdfToBill` must be generalized to `attachPdfToEntity(connection, entityId, entityType, file)`.

### Schema Changes

**`invoices` table — new columns:**
```sql
ALTER TABLE invoices
  ADD COLUMN output_type TEXT NOT NULL DEFAULT 'bill'
  CHECK (output_type IN ('bill', 'check', 'cash', 'credit_card'));

ALTER TABLE invoices
  ADD COLUMN payment_account_id TEXT;   -- QBO internal account ID (bank or CC)

ALTER TABLE invoices
  ADD COLUMN payment_account_name TEXT; -- display name for UI
```

**`organizations` table — new columns:**
```sql
ALTER TABLE organizations
  ADD COLUMN default_output_type TEXT NOT NULL DEFAULT 'bill'
  CHECK (default_output_type IN ('bill', 'check', 'cash', 'credit_card'));

ALTER TABLE organizations
  ADD COLUMN default_payment_account_id TEXT;   -- QBO account ID

ALTER TABLE organizations
  ADD COLUMN default_payment_account_name TEXT; -- display name
```

**`sync_log` table — new columns:**
```sql
ALTER TABLE sync_log
  ADD COLUMN transaction_type TEXT NOT NULL DEFAULT 'bill'
  CHECK (transaction_type IN ('bill', 'check', 'cash', 'credit_card'));

ALTER TABLE sync_log
  ADD COLUMN provider_entity_type TEXT NOT NULL DEFAULT 'Bill';
  -- 'Bill' or 'Purchase' — matches QBO entity name
```

Backfill: all existing rows get `transaction_type = 'bill'`, `provider_entity_type = 'Bill'`.

### Idempotency Guard Update

Current guard in sync route:
```sql
SELECT provider_bill_id FROM sync_log
WHERE invoice_id = ? AND provider = 'quickbooks' AND status = 'success'
LIMIT 1
```

Updated guard adds transaction_type filter (future-proofing):
```sql
SELECT provider_bill_id FROM sync_log
WHERE invoice_id = ? AND provider = 'quickbooks' AND status = 'success'
  AND transaction_type = ?
LIMIT 1
```

**Note:** The UI locks the output_type selector once an invoice is `synced`, so dual-sync (Bill + Check for same invoice) cannot happen today. The transaction-type-aware guard is future-proofing only — if we ever allow re-syncing as a different type, it's already correct. Add a code comment explaining this.

**Column naming:** `provider_bill_id` is a legacy name — for checks/expenses, it holds the Purchase ID. Accept this naming debt; add a code comment. Renaming would require updating all existing queries and is not worth the churn.

---

## Component Design

### Output Type Selector

**Location:** Review page, between line items editor and ActionBar.
**Component:** `components/invoices/OutputTypeSelector.tsx`
**Control type:** Dropdown select (not segmented control — 4 options is too crowded for a toggle).

**Display:**
```
Output Type: [Create Bill ▾]
             ├─ Create Bill
             ├─ Write Check
             ├─ Record Expense
             └─ Credit Card
```

**Behavior:**
- On mount: reads `invoice.output_type` from server data. If not yet set (new invoice), reads org default from `organization.default_output_type`.
- On change: PATCH `/api/invoices/[id]` to update `output_type` column. **Clear `payment_account_id` and `payment_account_name`** when type changes (prevents stale account mismatch).
- When non-Bill type selected: shows helper text and renders PaymentAccountSelect below.
  - Check: "Records as a direct check payment from your bank account."
  - Cash/Expense: "Records as a cash expense from your bank account."
  - Credit Card: "Records as a credit card charge."
- Disabled when invoice status is `synced` (read-only display of what was used).

### Payment Account Selector

**Location:** Inline below output type dropdown, visible only when non-Bill type is selected.
**Component:** `components/invoices/PaymentAccountSelect.tsx`

**Behavior:**
- On mount: fetch accounts from `GET /api/quickbooks/payment-accounts?type={accountType}`.
  - Check/Cash → `?type=Bank`
  - CreditCard → `?type=CreditCard`
- If org has a `default_payment_account_id` matching the account type: pre-select it. Show "(org default)" label.
- If no default set: show "Select an account" placeholder. This becomes a sync blocker.
- On selection:
  - Save to invoice via `PATCH /api/invoices/[id]` (payment_account_id + payment_account_name)
  - Save as org default via `PATCH /api/settings/organization` (default_payment_account_id + default_payment_account_name)
- Subsequent invoices auto-select the default. User can change per-invoice — changing it also updates the org default.
- If QBO connection missing: don't render. OutputTypeSelector shows "Connect QuickBooks to use this option" for non-Bill types.
- If QBO returns zero accounts of the needed type: show "No [bank/credit card] accounts found in QuickBooks. Add one in QBO first."

### ActionBar Updates

**Sync blockers for non-Bill types:**
- All existing blockers still apply (vendor_ref, line items with GL accounts, etc.)
- New blocker when `output_type != 'bill'` and no payment account selected: "Select a payment account for [output type]"

**Sync confirmation message (replaces current "Invoice synced to QuickBooks"):**
- Bill: "Bill created in QuickBooks"
- Check: "Check created in QuickBooks"
- Cash: "Expense recorded in QuickBooks"
- Credit Card: "Credit card expense recorded in QuickBooks"

### Invoice List — Transaction Type Indicator

**Location:** On synced invoices in the invoice list, near the status badge.
**Display:** Small text label — "Bill", "Check", "Expense", or "CC" — only shown for `synced` status invoices. Uses muted styling (`text-gray-500 text-xs`) so it doesn't compete with the status badge.

**Filter:** Add a transaction type filter chip to the existing filter bar. Options: All | Bill | Check | Expense | Credit Card. Only appears when there are synced invoices with mixed types. (Accepted expansion from CEO review.)

### SyncStatusPanel Updates

- Show transaction type in sync history: "Bill #1234 created" vs "Check #1234 created" vs "Expense #1234 recorded" vs "CC charge #1234 recorded"
- Error messages reference correct type: "Check creation failed" not "Bill creation failed"

### Settings Page — Output Type Default

**Location:** Settings page, new section or within existing QBO connection card.
**Display:** Dropdown: "Default output type: [Create Bill ▾]" with 4 options.
- Changing this updates `organizations.default_output_type` via existing PATCH endpoint.
- If non-Bill type is selected and no default payment account is set, show PaymentAccountSelect here too.
- This is a convenience — users can set it once and forget. The review page dropdown is always available for per-invoice overrides.

---

## API Changes

### New: `GET /api/quickbooks/payment-accounts`

Fetches accounts from QBO chart of accounts, filtered by type.

```typescript
// Request: GET /api/quickbooks/payment-accounts?type=Bank
// Request: GET /api/quickbooks/payment-accounts?type=CreditCard
// Response:
{
  data: {
    accounts: Array<{
      id: string;        // QBO internal ID
      name: string;      // Display name (e.g., "Business Checking")
      accountType: string; // "Bank" or "Credit Card"
      currentBalance?: number;
    }>
  }
}
```

**Implementation:** Query QBO: `SELECT * FROM Account WHERE AccountType = '{type}' AND Active = true`. Uses existing `makeQBORequest()` from `lib/quickbooks/api.ts`.

**Structured logging:** Entry log `{ action: 'fetch_payment_accounts', accountType, userId, orgId }`, exit log with `{ durationMs, status, count }`.

### Modified: `POST /api/invoices/[id]/sync`

**No new request body fields.** The sync route reads `output_type` and `payment_account_id` from the invoice record in the database. The review page is responsible for persisting these via `PATCH /api/invoices/[id]` before the user can sync.

**Branching logic:**
```
read output_type + payment_account_id from invoice record
if output_type === 'bill':
  existing createBill() flow (unchanged)
  attach PDF via attachPdfToEntity(connection, billId, 'Bill', file)
  log with transaction_type='bill', provider_entity_type='Bill'
else:
  map output_type to PaymentType: check→'Check', cash→'Cash', credit_card→'CreditCard'
  validate payment_account_id is present on invoice (if null → validation error)
  build QBOPurchasePayload (using invoice.payment_account_id)
  call createPurchase(connection, payload)
  attach PDF via attachPdfToEntity(connection, purchaseId, 'Purchase', file)
  log with transaction_type=output_type, provider_entity_type='Purchase'
```

**Retry route:** Same logic — reads `output_type` and `payment_account_id` from the invoice record. No request body changes needed since all state is in the DB.

**Structured logging:** Add `outputType` and `transactionType` to existing sync log entries.

### New: `PATCH /api/invoices/[id]` (create new file)

**This route does not exist yet — create `app/api/invoices/[id]/route.ts`.**

Accept `output_type`, `payment_account_id`, and `payment_account_name` fields in the request body. Validation:
- `output_type`: must be one of `'bill' | 'check' | 'cash' | 'credit_card'`
- `payment_account_id` / `payment_account_name`: optional strings, only meaningful when `output_type != 'bill'`
- When `output_type` changes: clear `payment_account_id` and `payment_account_name` (prevent stale account mismatch)
- Invoice status must be `pending_review` or `approved` (reject if `synced`, `extracting`, `uploading`)
- Standard auth + org ownership verification
- Structured logging at entry/exit per CLAUDE.md mandate

### Modified: `PATCH /api/settings/organization`

**Note:** The current endpoint at `app/api/settings/organization/route.ts` only accepts `{ name?: string }` with hardcoded validation. CHK-4 must expand it to also handle:
- `default_output_type`: validate against enum
- `default_payment_account_id`: optional string
- `default_payment_account_name`: optional string

Each field should be independently optional — changing output type default shouldn't require also sending name.

### New QBO API functions in `lib/quickbooks/api.ts`

```typescript
// Fetch payment accounts (bank or credit card) from QBO
export async function fetchPaymentAccounts(
  connection: DecryptedConnection,
  accountType: 'Bank' | 'CreditCard'
): Promise<QBOPaymentAccount[]>

// Create a Purchase (Check/Cash/CreditCard) in QBO
export async function createPurchase(
  connection: DecryptedConnection,
  payload: QBOPurchasePayload
): Promise<QBOPurchaseResponse>

// Replaces attachPdfToBill — accepts entity type parameter
export async function attachPdfToEntity(
  connection: DecryptedConnection,
  entityId: string,
  entityType: 'Bill' | 'Purchase',
  fileBuffer: Buffer,
  fileName: string
): Promise<void>
```

The existing `attachPdfToBill` callers in the sync route must be updated to use `attachPdfToEntity(connection, billId, 'Bill', ...)`. This is a rename + parameter addition, not new logic.

### New types

**Domain types in `lib/types/invoice.ts`** (not QBO-specific):
```typescript
export type OutputType = 'bill' | 'check' | 'cash' | 'credit_card';
export type TransactionType = 'bill' | 'check' | 'cash' | 'credit_card';
export type ProviderEntityType = 'Bill' | 'Purchase';

// Map output_type → QBO PaymentType
export const OUTPUT_TYPE_TO_PAYMENT_TYPE: Record<Exclude<OutputType, 'bill'>, string> = {
  check: 'Check',
  cash: 'Cash',
  credit_card: 'CreditCard',
};

// Map output_type → required QBO account type
export const OUTPUT_TYPE_TO_ACCOUNT_TYPE: Record<Exclude<OutputType, 'bill'>, 'Bank' | 'CreditCard'> = {
  check: 'Bank',
  cash: 'Bank',
  credit_card: 'CreditCard',
};

// Display labels
export const OUTPUT_TYPE_LABELS: Record<OutputType, string> = {
  bill: 'Create Bill',
  check: 'Write Check',
  cash: 'Record Expense',
  credit_card: 'Credit Card',
};
```

**QBO types in `lib/quickbooks/types.ts`:**
```typescript
export interface QBOPurchasePayload {
  PaymentType: 'Check' | 'Cash' | 'CreditCard';
  AccountRef: { value: string };
  EntityRef: { value: string; type: 'Vendor' };
  TxnDate?: string;
  DocNumber?: string;
  Line: QBOPurchaseLine[];
}

export interface QBOPurchaseLine {
  Amount: number;
  DetailType: 'AccountBasedExpenseLineDetail';
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
  };
}

export interface QBOPaymentAccount {
  id: string;
  name: string;
  accountType: string;
  currentBalance?: number;
}
```

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| QBO has zero accounts of needed type | Show "No [bank/credit card] accounts found in QuickBooks. Add one in QBO first." Disable sync. |
| Selected account no longer exists in QBO | QBO returns 400 with element "AccountRef". Show "The selected account was not found in QuickBooks. Please select a different account." Clear the default. |
| QBO Purchase creation returns 400 | Parse error same as Bill errors (inconsistent casing handling already exists). Surface specific message. |
| QBO Purchase creation returns 500 | Log full request/response. Show "[type] creation failed. Please retry." |
| QBO returns malformed JSON | Catch JSON.parse error (pre-existing gap). Log raw response. Show "Unexpected response from QuickBooks. Please retry." |
| User changes output_type after a failed sync | Allowed. Idempotency guard is transaction-type-aware. |
| Invoice already synced | output_type selector is read-only (disabled dropdown). |
| No QBO connection + non-Bill selected | "Connect QuickBooks in Settings first" — same as existing Bill flow. |
| PDF attachment fails on Purchase | Same partial-success pattern as Bills: "[Type] created but PDF attachment failed." |
| Output type changed → stale payment account | Clear payment_account_id automatically on output_type change. |

---

## Testing Requirements

### CHK-1 (Schema migrations)
- Migration applies cleanly on fresh DB
- Migration applies cleanly on DB with existing data (backfill verified)
- New columns have correct defaults and constraints
- `output_type` CHECK constraint includes all 4 values
- `payment_account_id` and `payment_account_name` are nullable

### CHK-2 (QBO API + Purchase creation + attachment generalization)
- `fetchPaymentAccounts(type='Bank')`: happy path, empty result, QBO error
- `fetchPaymentAccounts(type='CreditCard')`: happy path, empty result, QBO error
- `createPurchase()`: happy path for each PaymentType (Check, Cash, CreditCard), QBO 400/500 errors
- `attachPdfToEntity()`: works with 'Bill' entity type, works with 'Purchase' entity type
- `GET /api/quickbooks/payment-accounts`: auth check, org verification, QBO connection required, type parameter required, returns formatted accounts, structured logging present
- Malformed QBO JSON response handled gracefully (pre-existing gap fix)

### CHK-3 (Sync route update)
- Sync with `output_type='bill'`: unchanged behavior (regression test)
- Sync with `output_type='check'`: creates Purchase with PaymentType='Check'
- Sync with `output_type='cash'`: creates Purchase with PaymentType='Cash'
- Sync with `output_type='credit_card'`: creates Purchase with PaymentType='CreditCard'
- Missing `payment_account_id` on invoice when non-Bill → validation error
- Idempotency: prior successful Bill doesn't block Check sync (with code comment)
- Idempotency: prior successful Check blocks duplicate Check sync
- sync_log rows have correct `transaction_type` and `provider_entity_type`
- Retry route reads from invoice record for all output types
- PDF attachment uses `attachPdfToEntity()` with correct entity type

### CHK-4 (Review UI + API endpoints)
- Dropdown renders between line items editor and ActionBar
- Default follows org preference (not hardcoded to Bill)
- Selection persists via PATCH to invoice
- PaymentAccountSelect appears/hides based on output type
- PaymentAccountSelect fetches correct account type (Bank vs CreditCard)
- PaymentAccountSelect pre-selects org default
- Changing output type clears payment_account_id
- Sync blocker appears when non-Bill selected but no account
- Dropdown disabled when invoice is synced
- Helper text varies by output type
- PATCH /api/invoices/[id]: validates output_type enum, rejects if synced, clears account on type change
- PATCH /api/settings/organization: expanded to accept all new fields
- Settings page shows output type default dropdown

### CHK-5 (List + status display)
- Synced invoices show transaction type indicator (Bill/Check/Expense/CC)
- SyncStatusPanel shows correct transaction type in messages
- Transaction type filter chip appears in invoice list
- Filter works correctly for all 4 types
- Sync log API response includes `transaction_type` and `provider_entity_type`

---

## Build Sequence

```
CHK-1 (Schema)
  ↓
CHK-2 (QBO API + attachment refactor)
  ↓
CHK-3 (Sync route)
  ↓
 ┌─────┴─────┐
CHK-4       CHK-5
(Review UI) (List display)
 └─────┬─────┘
       ↓
    Complete
```

CHK-4 and CHK-5 are independent and can be built in parallel after CHK-3 lands.

---

## Issue Breakdown

### CHK-1: Schema migrations for check support
**Scope:** Pure SQL migration. No app code.
**Delivers:**
- Migration file adding `output_type`, `payment_account_id`, `payment_account_name` to `invoices`
- Migration file adding `default_output_type`, `default_payment_account_id`, `default_payment_account_name` to `organizations`
- Migration file adding `transaction_type`, `provider_entity_type` to `sync_log` with backfill
- All constraints and defaults as specified in Schema Changes section
**Acceptance criteria:**
- [ ] Migration applies on fresh DB without errors
- [ ] Migration applies on DB with existing data (backfill works)
- [ ] `output_type` defaults to `'bill'` on new invoices, CHECK includes all 4 values
- [ ] `payment_account_id` and `payment_account_name` are nullable
- [ ] `default_output_type` defaults to `'bill'` on organizations, CHECK includes all 4 values
- [ ] `transaction_type` defaults to `'bill'` on new sync_log rows, CHECK includes all 4 values
- [ ] Existing sync_log rows backfilled with `transaction_type='bill'`, `provider_entity_type='Bill'`
- [ ] RLS policies unaffected (new columns don't change access patterns)
**Depends on:** Nothing
**Files touched:** `supabase/migrations/` only

### CHK-2: QBO payment accounts API + Purchase creation + attachment generalization
**Scope:** QBO API layer + one new API route + attachment refactor. No UI.
**Delivers:**
- `fetchPaymentAccounts(type)` in `lib/quickbooks/api.ts`
- `createPurchase()` in `lib/quickbooks/api.ts` (handles Check, Cash, CreditCard via PaymentType param)
- Rename `attachPdfToBill()` → `attachPdfToEntity()` with `entityType` parameter (update all existing callers)
- Fix pre-existing gap: catch malformed JSON responses from QBO
- QBO types in `lib/quickbooks/types.ts` (`QBOPurchasePayload`, `QBOPurchaseResponse`, `QBOPaymentAccount`)
- Domain types in `lib/types/invoice.ts` (`OutputType`, `TransactionType`, `ProviderEntityType`, lookup maps, labels)
- `GET /api/quickbooks/payment-accounts` route with `?type=` parameter and structured logging
- Tests for all of the above
**Acceptance criteria:**
- [ ] `fetchPaymentAccounts('Bank')` queries QBO for active Bank-type accounts
- [ ] `fetchPaymentAccounts('CreditCard')` queries QBO for active CreditCard-type accounts
- [ ] Both return empty array (not error) when no accounts exist
- [ ] `createPurchase()` sends correct payload for each PaymentType
- [ ] `createPurchase()` handles QBO error responses (400, 500)
- [ ] `attachPdfToEntity()` works with both `'Bill'` and `'Purchase'` entity types
- [ ] Existing sync route callers updated from `attachPdfToBill()` to `attachPdfToEntity()`
- [ ] Malformed QBO JSON responses caught and logged gracefully
- [ ] API route requires auth + QBO connection
- [ ] API route has structured logging (entry/exit per CLAUDE.md)
- [ ] API route validates `type` parameter (Bank or CreditCard)
- [ ] Tests: happy path per type, empty result, QBO errors, auth failure, missing connection, attachment both entity types
**Depends on:** CHK-1
**Files touched:** `lib/quickbooks/api.ts`, `lib/quickbooks/types.ts`, `lib/types/invoice.ts`, `app/api/quickbooks/payment-accounts/route.ts` (new), `app/api/invoices/[id]/sync/route.ts` (update attachment callers), test files

### CHK-3: Update sync route to support bill or purchase
**Scope:** Sync route branching + sync_log updates. No UI.
**Delivers:**
- Sync route reads `output_type` + `payment_account_id` from invoice record (DB), branches to `createBill()` or `createPurchase()`
- No new request body fields — all state persisted on invoice by the review UI (CHK-4)
- Updated idempotency guard (transaction-type-aware, with code comment explaining UI also prevents dual-sync)
- sync_log writes include `transaction_type` and `provider_entity_type`
- Retry route updated for all output types (also reads from invoice record)
- Structured logging includes `outputType` and `transactionType`
- Tests for all paths
**Acceptance criteria:**
- [ ] `output_type='bill'` follows existing Bill creation flow (regression)
- [ ] `output_type='check'` calls `createPurchase()` with PaymentType='Check'
- [ ] `output_type='cash'` calls `createPurchase()` with PaymentType='Cash'
- [ ] `output_type='credit_card'` calls `createPurchase()` with PaymentType='CreditCard'
- [ ] Missing `payment_account_id` on invoice when non-Bill → returns validation error
- [ ] Idempotency: prior successful Bill doesn't block Purchase sync (with code comment)
- [ ] Idempotency: prior successful Check blocks duplicate Check sync
- [ ] sync_log rows have correct `transaction_type` and `provider_entity_type`
- [ ] Retry route reads `output_type` + `payment_account_id` from invoice record
- [ ] PDF attachment uses `attachPdfToEntity()` with correct entity type
- [ ] Tests: bill happy path, check/cash/credit_card happy paths, missing payment_account_id, idempotency, retry
**Depends on:** CHK-2
**Files touched:** `app/api/invoices/[id]/sync/route.ts`, `app/api/invoices/[id]/sync/retry/route.ts`, test files

### CHK-4: Output type selector + payment account picker in review UI
**Scope:** Review page UI components + new/expanded API endpoints.
**Delivers:**
- `OutputTypeSelector.tsx` component (dropdown with 4 options)
- `PaymentAccountSelect.tsx` component (adapts to output type, fetches correct account type)
- **Create** `app/api/invoices/[id]/route.ts` with PATCH handler accepting `output_type`, `payment_account_id`, `payment_account_name`
- **Expand** existing `PATCH /api/settings/organization` to also accept `default_output_type`, `default_payment_account_id`, `default_payment_account_name`
- ActionBar updated with non-Bill sync blocker
- Sync confirmation message updated per output type
- Settings page shows output type default dropdown
- Integration into review page layout
**Acceptance criteria:**
- [ ] Dropdown appears between line items editor and ActionBar with 4 options
- [ ] Default follows org's `default_output_type` for new invoices
- [ ] Selecting output type PATCHes invoice record
- [ ] Changing output type clears `payment_account_id` and `payment_account_name`
- [ ] Non-Bill type shows helper text and PaymentAccountSelect
- [ ] PaymentAccountSelect loads correct account type (Bank for check/cash, CreditCard for credit_card)
- [ ] First account selection saves as org default
- [ ] Subsequent invoices pre-select org default payment account
- [ ] No account selected = sync blocker message
- [ ] Dropdown read-only when invoice is `synced`
- [ ] No QBO connection = "Connect QuickBooks" message for non-Bill types
- [ ] Zero accounts of needed type = clear error message
- [ ] PATCH /api/invoices/[id]: validates enum, rejects if synced, has structured logging
- [ ] PATCH /api/settings/organization: handles all new fields independently
- [ ] Settings page shows output type default dropdown
**Depends on:** CHK-3
**Files touched:** `components/invoices/OutputTypeSelector.tsx` (new), `components/invoices/PaymentAccountSelect.tsx` (new), `components/invoices/ActionBar.tsx`, `components/invoices/ExtractionForm.tsx`, `app/api/invoices/[id]/route.ts` (new file), `app/api/settings/organization/route.ts` (expand existing), `app/(dashboard)/invoices/[id]/review/page.tsx`, `app/(dashboard)/settings/page.tsx`

### CHK-5: Transaction type display in invoice list + sync status
**Scope:** Display UI + filter + sync log API update.
**Delivers:**
- Transaction type indicator on synced invoices in list view
- Transaction type filter chip on invoice list filter bar
- Updated SyncStatusPanel showing type-specific messages
- Sync log API response includes `transaction_type` and `provider_entity_type`
**Acceptance criteria:**
- [ ] Synced invoices in list show type label (Bill/Check/Expense/CC)
- [ ] Label only appears for `synced` status
- [ ] Label styling is muted (doesn't compete with status badge)
- [ ] Transaction type filter chip appears in filter bar
- [ ] Filter correctly filters by all 4 types
- [ ] SyncStatusPanel shows transaction type in success/error messages
- [ ] Sync log API response includes `transaction_type` and `provider_entity_type`
**Depends on:** CHK-3
**Files touched:** `components/invoices/InvoiceList.tsx`, `components/invoices/SyncStatusPanel.tsx`, `app/api/invoices/[id]/sync/log/route.ts`, `app/(dashboard)/invoices/page.tsx` (filter params)

---

## Out of Scope

- Xero check/expense support (Phase 2 — different API, different entity names)
- Batch output type selection (selecting type for multiple invoices at once)
- Output type in extraction AI prompt (AI doesn't need to know — user choice)
- Check numbering / check printing (QBO handles internally)
- Per-vendor output type memory (deferred — needs vendor auto-matching from Phase 3)
- Bank account caching (deferred — not needed at MVP scale <10 users)
- QBO Expense type (separate from Purchase — rarely used, can add if requested)

---

## CEO Review Scope Decisions

| # | Proposal | Effort | Decision | Reasoning |
|---|----------|--------|----------|-----------|
| 1 | Cash + CreditCard payment types | S | ACCEPTED | Same QBO endpoint, ~30 extra lines, covers all cash-basis workflows |
| 2 | Bank account caching | S | DEFERRED | Not needed at <10 users, adds complexity for no user benefit yet |
| 3 | Transaction type filter on invoice list | S | ACCEPTED | Natural extension of CHK-5, users need to filter mixed types |
| 4 | Per-vendor output type memory | M | DEFERRED | Needs vendor auto-matching (Phase 3) to work reliably |
