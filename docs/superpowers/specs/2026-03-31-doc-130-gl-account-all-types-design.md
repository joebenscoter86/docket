# DOC-130: GL Account Dropdown - All Account Types

**Date:** 2026-03-31
**Source:** Rick Smith feedback - can't find "Officers Loans" (Other Current Liability) in the GL account dropdown.

## Problem

The GL account dropdown only shows Expense-type accounts. Bookkeepers need to code invoices to non-expense accounts (loan repayments, prepaid assets, owner draws, etc.).

## Design

### Principle: AI stays focused, dropdown opens up

- **AI GL inference**: unchanged. The extraction prompt continues to receive only Expense accounts. Semantic matching works well for expenses; accounting judgment calls (liability vs asset vs equity) are the bookkeeper's job.
- **Dropdown**: shows all active accounts from the connected provider, grouped by classification.

### Backend Changes

**QBO** (`lib/quickbooks/api.ts` - `getAccountOptions`):
- Change query from `WHERE AccountType = 'Expense' AND Active = true` to `WHERE Active = true`
- The response already includes `AccountType` and `Classification` fields on each account
- No new fields needed; `accountType` on `AccountOption` already carries through

**Xero** (`lib/xero/api.ts` - `fetchAccounts`):
- Remove the `Class=="EXPENSE"` OData where clause, fetch all active accounts
- The response already includes `Class` and `Type` fields
- Map Xero `Class` to the same grouping used for QBO `Classification`

**Shared type** (`lib/accounting/types.ts` - `AccountOption`):
- Add a `classification` field (string): `"Expense" | "Liability" | "Asset" | "Equity" | "Revenue"`
- QBO: map from `Classification` field (already returned by API)
- Xero: map from `Class` field (`"EXPENSE"` -> `"Expense"`, `"LIABILITY"` -> `"Liability"`, etc.)

### Frontend Changes

**GlAccountSelect component** (`components/invoices/GlAccountSelect.tsx`):
- Group accounts by `classification` with section headers
- Display order: Expense (first, most common), Liability, Asset, Equity, Revenue (last, least common for invoices)
- Section headers are non-selectable visual dividers (e.g., gray bold text)
- Accounts within each group sorted alphabetically (existing behavior)

### AI Extraction (NO CHANGES)

- `buildAccountPromptSection` in `lib/extraction/claude.ts`: unchanged
- `run.ts` account fetching for extraction context: filter to Expense-only accounts before passing to the AI prompt
- This is the key design decision: the `fetchAccounts` API returns all types now, so the extraction orchestration must filter before building the prompt

### Extraction orchestration change

**`lib/extraction/run.ts`** (step 3 - fetch accounts for GL suggestions):
- After `provider.fetchAccounts()` returns all account types, filter to `classification === "Expense"` before building `accountContext`
- The full list is never sent to the AI; only Expense accounts go into the prompt
- `validAccountIds` for post-extraction validation also scoped to Expense-only (AI can only suggest Expense accounts, so validation should match)

### GL Mappings (NO CHANGES)

- `gl-mappings.ts` records confirmed vendor+description -> account mappings
- These mappings can point to any account type (user confirmed the override)
- No filtering needed here; the mapping reflects the user's actual choice

## What's NOT changing

- AI extraction prompt wording and account list (Expense-only)
- Payment account selectors (Bank/CreditCard for Check/Cash output types)
- Account fetching for payment accounts (`fetchPaymentAccounts`)
- Any sync/bill creation logic

## Test updates

- QBO adapter test: mock accounts should include non-Expense types
- Xero adapter test: same
- GlAccountSelect test: add accounts with different classifications, verify grouping
- Extraction run test: verify only Expense accounts are passed to AI context
- claude.ts test: no changes (receives pre-filtered list)
