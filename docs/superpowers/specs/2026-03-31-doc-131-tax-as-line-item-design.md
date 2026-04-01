# DOC-131: Tax as Line Item with GL Auto-Inference

**Date:** 2026-03-31
**Status:** Approved
**Linear:** DOC-131

## Problem

Tax handling during sync is broken. The current approach sends `TotalTax` to Xero, but Xero ignores it when line items are marked "Tax Exempt" -- resulting in bills with $0 tax and incorrect totals. Multiple fix attempts (distributing tax across line items, defaulting to Exclusive, sending TotalTax) have all failed because they fight the provider's tax system.

## Solution

For US small businesses (primary ICP), sales tax on vendor invoices is just a cost -- there's no input tax credit to claim. The correct bookkeeping is to record tax as a regular expense line item.

**Default behavior:** When the AI extracts a `tax_amount > 0`, the sync route adds a "Sales Tax" line item with the GL account auto-inferred to the org's tax expense account (e.g., "Taxes - Other" in Xero, "Taxes & Licenses" in QBO). `LineAmountTypes: "NoTax"`. Total matches the invoice exactly.

**Power user escape hatch:** User deletes the Sales Tax line item in the review UI, sets tax treatment to Exclusive or Inclusive, assigns tax codes per line item, and syncs with proper tax treatment. A confirmation dialog warns when switching tax treatment will remove the Sales Tax line.

## Design

### 1. GL Auto-Inference for Sales Tax Line Item

New utility function that scans the org's cached chart of accounts for a tax expense account. Priority matching order:

1. Expense account named "Taxes - Other" (Xero default, code 6380)
2. Expense account named "Taxes & Licenses" (QBO default)
3. Any expense account with "tax" in the name, excluding:
   - Liability accounts (e.g., "Sales Tax" 2230 is a liability, not an expense)
   - Accounts containing "payroll" (e.g., "Taxes - Payroll")
   - Accounts containing "property" (e.g., "Taxes - Property")
4. Fallback: first line item's GL account (current behavior -- user can fix in review)

This inference runs at sync time in the sync route, not during extraction.

### 2. Sync Route Changes

In `app/api/invoices/[id]/sync/route.ts` and `app/api/invoices/batch/sync/route.ts`:

**Current code (lines 304-311):**
```typescript
const taxAmount = Number(extractedData.tax_amount) || 0;
if (!taxTreatment && taxAmount > 0 && syncLineItems.length > 0) {
  syncLineItems.push({
    amount: taxAmount,
    glAccountId: syncLineItems[0].glAccountId, // BAD: copies first line's GL
    description: "Sales Tax",
  });
}
```

**New behavior:**
- Replace `syncLineItems[0].glAccountId` with the result of the GL auto-inference utility.
- The inference utility needs the org's accounts list. The sync route already fetches the provider -- add an `accounts` fetch (or pass them in).

### 3. Remove `TotalTax` and `taxAmount` from Provider Payloads

**`lib/accounting/types.ts`:**
- Remove `taxAmount` from `CreateBillInput` and `CreatePurchaseInput`.

**`lib/accounting/xero/adapter.ts`:**
- Remove `TotalTax` from the ACCPAY invoice payload (line 172).
- Remove `TotalTax` from the bank transaction payload (line 220).

**`lib/accounting/quickbooks/adapter.ts`:**
- Remove any `TxnTaxDetail` / tax amount passthrough if present.

### 4. Confirmation Dialog on Tax Treatment Change

In the review UI, when the user changes tax treatment from "none" to Exclusive or Inclusive:

- Check if a line item with description "Sales Tax" (case-insensitive) exists.
- If yes, show a confirmation dialog:
  - Title: "Change tax treatment?"
  - Body: "This will remove the Sales Tax line item. Tax will be calculated from the tax codes on each line item instead."
  - Actions: "Change" (primary) / "Cancel" (secondary)
- On confirm: remove the Sales Tax line item, apply the selected tax treatment.
- On cancel: revert the dropdown to its previous value.

### 5. Keep Existing Tax Infrastructure

The following stay intact for power users and future DOC-134:
- `taxTreatment` field on invoices (`exclusive` / `inclusive` / `no_tax`)
- `taxCodeId` per line item in `SyncLineItem`
- `LineAmountTypes` mapping in Xero adapter
- `GlobalTaxCalculation` mapping in QBO adapter
- Tax rate fetching (`fetchTaxRates`)
- Tax code dropdown in review UI

## Files Changed

| File | Change |
|------|--------|
| `app/api/invoices/[id]/sync/route.ts` | Fix Sales Tax line GL via auto-inference |
| `app/api/invoices/batch/sync/route.ts` | Same fix for batch sync |
| `lib/accounting/types.ts` | Remove `taxAmount` from input types |
| `lib/accounting/xero/adapter.ts` | Remove `TotalTax` from payloads |
| `lib/accounting/quickbooks/adapter.ts` | Remove tax amount passthrough |
| `lib/accounting/tax-account-inference.ts` | New: GL auto-inference utility |
| Review UI component (ExtractionForm or similar) | Add confirmation dialog on tax treatment change |
| Tests | Update to match new behavior |

## Relationship to DOC-134

DOC-134 (default tax code per org) builds on this. When an org has a default tax code set:
- Tax treatment auto-defaults to Exclusive.
- Tax codes auto-apply to line items.
- The Sales Tax line item is NOT added.
- See notes on DOC-134 in Linear for full details.
