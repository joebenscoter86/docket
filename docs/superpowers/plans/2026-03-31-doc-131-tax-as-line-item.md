# DOC-131: Tax as Line Item with GL Auto-Inference — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix tax handling so tax becomes a regular line item with auto-inferred GL account, removing broken `TotalTax`/`taxAmount` passthrough.

**Architecture:** Tax from extracted invoices is added as a "Sales Tax" line item at sync time (already exists). The GL account is auto-inferred from the org's chart of accounts instead of copying the first line item's account. `TotalTax` and `taxAmount` fields are removed from provider payloads since they don't work. A confirmation dialog warns users when enabling tax treatment that the Sales Tax line will be removed.

**Tech Stack:** TypeScript, Vitest, Next.js API routes, React (ExtractionForm component)

---

### Task 1: Create GL Auto-Inference Utility

**Files:**
- Create: `lib/accounting/tax-account-inference.ts`
- Create: `lib/accounting/tax-account-inference.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/accounting/tax-account-inference.test.ts
import { describe, it, expect } from "vitest";
import { inferTaxExpenseAccount } from "./tax-account-inference";
import type { AccountOption } from "./types";

const makeAccount = (value: string, label: string, classification = "Expense"): AccountOption => ({
  value,
  label,
  accountType: "Expense",
  classification,
});

describe("inferTaxExpenseAccount", () => {
  it("returns Xero default 'Taxes - Other' when present", () => {
    const accounts: AccountOption[] = [
      makeAccount("100", "Office Supplies"),
      makeAccount("6380", "Taxes - Other"),
      makeAccount("200", "Rent"),
    ];
    expect(inferTaxExpenseAccount(accounts)).toBe("6380");
  });

  it("returns QBO default 'Taxes & Licenses' when present", () => {
    const accounts: AccountOption[] = [
      makeAccount("100", "Office Supplies"),
      makeAccount("42", "Taxes & Licenses"),
      makeAccount("200", "Rent"),
    ];
    expect(inferTaxExpenseAccount(accounts)).toBe("42");
  });

  it("prefers 'Taxes - Other' over 'Taxes & Licenses' when both present", () => {
    const accounts: AccountOption[] = [
      makeAccount("6380", "Taxes - Other"),
      makeAccount("42", "Taxes & Licenses"),
    ];
    expect(inferTaxExpenseAccount(accounts)).toBe("6380");
  });

  it("falls back to any expense account containing 'tax' in the name", () => {
    const accounts: AccountOption[] = [
      makeAccount("100", "Office Supplies"),
      makeAccount("500", "Business Tax Expense"),
    ];
    expect(inferTaxExpenseAccount(accounts)).toBe("500");
  });

  it("excludes liability accounts like 'Sales Tax'", () => {
    const accounts: AccountOption[] = [
      makeAccount("2230", "Sales Tax", "Liability"),
      makeAccount("100", "Office Supplies"),
    ];
    expect(inferTaxExpenseAccount(accounts)).toBeNull();
  });

  it("excludes payroll tax accounts", () => {
    const accounts: AccountOption[] = [
      makeAccount("6360", "Taxes - Payroll"),
      makeAccount("100", "Office Supplies"),
    ];
    expect(inferTaxExpenseAccount(accounts)).toBeNull();
  });

  it("excludes property tax accounts", () => {
    const accounts: AccountOption[] = [
      makeAccount("6370", "Taxes - Property"),
      makeAccount("100", "Office Supplies"),
    ];
    expect(inferTaxExpenseAccount(accounts)).toBeNull();
  });

  it("returns null when no tax expense account is found", () => {
    const accounts: AccountOption[] = [
      makeAccount("100", "Office Supplies"),
      makeAccount("200", "Rent"),
    ];
    expect(inferTaxExpenseAccount(accounts)).toBeNull();
  });

  it("returns null for empty accounts list", () => {
    expect(inferTaxExpenseAccount([])).toBeNull();
  });

  it("matching is case-insensitive", () => {
    const accounts: AccountOption[] = [
      makeAccount("99", "taxes - other"),
    ];
    expect(inferTaxExpenseAccount(accounts)).toBe("99");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/accounting/tax-account-inference.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the utility**

```typescript
// lib/accounting/tax-account-inference.ts
import type { AccountOption } from "./types";

/**
 * Infer the best GL account for a "Sales Tax" line item from the org's
 * chart of accounts. Returns the account `value` (ID/code) or null if
 * no suitable account is found.
 *
 * Priority:
 * 1. "Taxes - Other" (Xero default)
 * 2. "Taxes & Licenses" (QBO default)
 * 3. Any expense account with "tax" in name (excluding payroll/property/liability)
 */
export function inferTaxExpenseAccount(accounts: AccountOption[]): string | null {
  const expenseAccounts = accounts.filter(
    (a) => a.classification === "Expense"
  );

  // Priority 1: Xero default
  const taxesOther = expenseAccounts.find(
    (a) => a.label.toLowerCase() === "taxes - other"
  );
  if (taxesOther) return taxesOther.value;

  // Priority 2: QBO default
  const taxesLicenses = expenseAccounts.find(
    (a) => a.label.toLowerCase() === "taxes & licenses"
  );
  if (taxesLicenses) return taxesLicenses.value;

  // Priority 3: Any expense account with "tax" in the name,
  // excluding payroll and property tax accounts
  const EXCLUDED_PATTERNS = ["payroll", "property"];
  const genericTax = expenseAccounts.find((a) => {
    const lower = a.label.toLowerCase();
    if (!lower.includes("tax")) return false;
    return !EXCLUDED_PATTERNS.some((p) => lower.includes(p));
  });
  if (genericTax) return genericTax.value;

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/accounting/tax-account-inference.test.ts`
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/accounting/tax-account-inference.ts lib/accounting/tax-account-inference.test.ts
git commit -m "feat: add GL auto-inference utility for tax line items (DOC-131)"
```

---

### Task 2: Wire GL Auto-Inference into Single Sync Route

**Files:**
- Modify: `app/api/invoices/[id]/sync/route.ts:286-311` (tax line item section)

The sync route already adds a "Sales Tax" line item at lines 304-311. We need to:
1. Fetch accounts from the provider
2. Run `inferTaxExpenseAccount` to find the right GL
3. Use that instead of `syncLineItems[0].glAccountId`
4. Fall back to the first line item's GL if inference returns null

- [ ] **Step 1: Update the sync route**

In `app/api/invoices/[id]/sync/route.ts`, add the import at the top:

```typescript
import { inferTaxExpenseAccount } from "@/lib/accounting/tax-account-inference";
```

Then replace lines 301-311 (the tax line item block):

```typescript
    // When the tax toggle is OFF and the invoice has tax, add it as a
    // separate "Sales Tax" line item with auto-inferred GL account.
    const taxAmount = Number(extractedData.tax_amount) || 0;
    if (!taxTreatment && taxAmount > 0 && syncLineItems.length > 0) {
      let taxGlAccountId = syncLineItems[0].glAccountId;
      try {
        const accounts = await provider.fetchAccounts(adminSupabase, orgId);
        const inferred = inferTaxExpenseAccount(accounts);
        if (inferred) {
          taxGlAccountId = inferred;
        }
      } catch {
        // If account fetch fails, fall back to first line item's GL
      }
      syncLineItems.push({
        amount: taxAmount,
        glAccountId: taxGlAccountId,
        description: "Sales Tax",
      });
    }
```

- [ ] **Step 2: Verify build passes**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add app/api/invoices/[id]/sync/route.ts
git commit -m "feat: use GL auto-inference for Sales Tax line item in sync route (DOC-131)"
```

---

### Task 3: Wire GL Auto-Inference into Batch Sync

**Files:**
- Modify: `lib/quickbooks/batch-sync.ts:143-150` (tax line item section)

Same change as Task 2 but in the batch sync path.

- [ ] **Step 1: Update batch sync**

In `lib/quickbooks/batch-sync.ts`, add the import at the top:

```typescript
import { inferTaxExpenseAccount } from "@/lib/accounting/tax-account-inference";
```

Replace lines 143-150 (the tax line item block). Note: the batch sync processes multiple invoices in a loop, so fetch accounts once before the loop and reuse. Find where the provider is instantiated and add an accounts fetch before the invoice loop. Then in the tax block:

```typescript
      const batchTaxAmount = Number(extractedData.tax_amount) || 0;
      if (!taxTreatment && batchTaxAmount > 0 && syncLineItems.length > 0) {
        const inferred = inferTaxExpenseAccount(batchAccounts);
        syncLineItems.push({
          amount: batchTaxAmount,
          glAccountId: inferred ?? syncLineItems[0].glAccountId,
          description: "Sales Tax",
        });
      }
```

The `batchAccounts` variable should be fetched once before the invoice loop:

```typescript
  // Fetch accounts once for tax GL inference (used across all invoices in batch)
  let batchAccounts: AccountOption[] = [];
  try {
    batchAccounts = await provider.fetchAccounts(adminSupabase, orgId);
  } catch {
    // If account fetch fails, tax line items will fall back to first line item's GL
  }
```

Add the `AccountOption` import from `@/lib/accounting/types`.

- [ ] **Step 2: Verify build passes**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add lib/quickbooks/batch-sync.ts
git commit -m "feat: use GL auto-inference for Sales Tax line item in batch sync (DOC-131)"
```

---

### Task 4: Remove `taxAmount` from Provider Types and Adapters

**Files:**
- Modify: `lib/accounting/types.ts:104,122` (remove `taxAmount` from `CreateBillInput` and `CreatePurchaseInput`)
- Modify: `lib/accounting/xero/adapter.ts:171-172,219-220` (remove `TotalTax` from payloads)
- Modify: `lib/accounting/quickbooks/adapter.ts` (remove any `taxAmount` usage if present)

- [ ] **Step 1: Remove `taxAmount` from types**

In `lib/accounting/types.ts`, remove these two lines:

From `CreateBillInput` (line 104):
```typescript
  /** Tax amount from the invoice. Sent to the provider so the bill total includes tax. */
  taxAmount?: number;
```

From `CreatePurchaseInput` (line 122):
```typescript
  /** Tax amount from the invoice. Sent to the provider so the bill total includes tax. */
  taxAmount?: number;
```

- [ ] **Step 2: Remove `TotalTax` from Xero adapter**

In `lib/accounting/xero/adapter.ts`, remove the `TotalTax` spread from the ACCPAY invoice payload (line 172):
```typescript
      ...(input.taxAmount != null && input.taxAmount > 0 ? { TotalTax: input.taxAmount } : {}),
```

And remove the same from the bank transaction payload (line 220):
```typescript
      ...(input.taxAmount != null && input.taxAmount > 0 ? { TotalTax: input.taxAmount } : {}),
```

- [ ] **Step 3: Check QBO adapter for any taxAmount usage**

In `lib/accounting/quickbooks/adapter.ts`, verify there's no `taxAmount` or `TxnTaxDetail` usage. Based on the current code, there is none — the QBO adapter only uses `GlobalTaxCalculation` from `taxTreatment`. No changes needed.

- [ ] **Step 4: Verify build passes**

Run: `npx tsc --noEmit`
Expected: No type errors. If there are references to `taxAmount` elsewhere (e.g., in the sync route where it was being passed to `CreateBillInput`), those also need to be removed.

- [ ] **Step 5: Commit**

```bash
git add lib/accounting/types.ts lib/accounting/xero/adapter.ts
git commit -m "fix: remove TotalTax and taxAmount from provider payloads (DOC-131)"
```

---

### Task 5: Confirmation Dialog on Tax Treatment Change

**Files:**
- Modify: `components/invoices/ExtractionForm.tsx:756-784` (tax toggle and treatment buttons)

When the user enables the tax treatment toggle (or switches from null to exclusive/inclusive), check if a "Sales Tax" line item exists. If so, show a confirmation dialog before proceeding.

- [ ] **Step 1: Add dialog state**

In `ExtractionForm.tsx`, add state for the confirmation dialog near the other tax state (around line 123):

```typescript
  const [pendingTaxTreatment, setPendingTaxTreatment] = useState<"exclusive" | "inclusive" | "no_tax" | null>(null);
  const [showTaxConfirmDialog, setShowTaxConfirmDialog] = useState(false);
```

- [ ] **Step 2: Add helper to check for Sales Tax line item**

This needs access to the line items. Check what prop/ref gives access to the current line items. The `LineItemEditor` component manages line items internally. We need a ref or callback to check if a "Sales Tax" line item exists.

Look at how `ExtractionForm` communicates with `LineItemEditor`. There's likely a `lineItems` state or a ref. Add a ref to track current line items if not already available:

```typescript
  const lineItemsRef = useRef<Array<{ description: string | null }>>([]);
```

Wire this ref to be updated by `LineItemEditor` via a callback prop (if one exists), or check the extracted data's `tax_amount` field instead — if `tax_amount > 0` and tax treatment is currently null, a Sales Tax line will be added at sync time, so the dialog should show.

Simpler approach: check if `state.tax_amount` (from the extracted data form state) is a positive number. If so, enabling tax treatment means the Sales Tax line item won't be added at sync time, which the user should confirm.

```typescript
  const hasTaxAmount = Number(state.tax_amount) > 0;
```

- [ ] **Step 3: Modify the toggle click handler**

Replace the toggle's `onClick` at line 760:

```typescript
onClick={() => {
  if (!taxEnabled && hasTaxAmount) {
    setPendingTaxTreatment("exclusive");
    setShowTaxConfirmDialog(true);
  } else {
    handleTaxTreatmentChange(taxEnabled ? null : "exclusive");
  }
}}
```

- [ ] **Step 4: Modify the treatment button click handlers**

For the Exclusive/Inclusive/NoTax buttons (line 776), wrap with the same check:

```typescript
onClick={() => {
  if (option !== "no_tax" && !taxEnabled && hasTaxAmount) {
    setPendingTaxTreatment(option);
    setShowTaxConfirmDialog(true);
  } else {
    handleTaxTreatmentChange(option);
  }
}}
```

Note: these buttons only render when `taxEnabled` is true (they're inside the `{taxEnabled && ...}` block at line 767). So switching between Exclusive and Inclusive doesn't need the dialog — the Sales Tax line was already removed when the toggle was first enabled. No change needed here.

- [ ] **Step 5: Add the confirmation dialog**

Add the dialog JSX at the end of the component's return, before the closing fragment/div:

```tsx
{showTaxConfirmDialog && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="bg-white rounded-brand-md shadow-lg p-6 max-w-sm mx-4">
      <h3 className="text-base font-semibold text-text">Change tax treatment?</h3>
      <p className="text-sm text-muted mt-2">
        This will remove the Sales Tax line item. Tax will be calculated from the tax codes on each line item instead.
      </p>
      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={() => {
            setShowTaxConfirmDialog(false);
            setPendingTaxTreatment(null);
          }}
          className="px-4 py-2 text-sm font-medium text-text border border-border rounded-md hover:bg-background"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            setShowTaxConfirmDialog(false);
            if (pendingTaxTreatment) {
              handleTaxTreatmentChange(pendingTaxTreatment);
            }
            setPendingTaxTreatment(null);
          }}
          className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90"
        >
          Change
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 6: Verify build passes**

Run: `npx tsc --noEmit && npm run build`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add components/invoices/ExtractionForm.tsx
git commit -m "feat: add confirmation dialog when tax treatment removes Sales Tax line (DOC-131)"
```

---

### Task 6: Update Tests

**Files:**
- Modify: `app/api/invoices/[id]/sync/route.test.ts`
- Modify: `lib/accounting/xero/adapter.test.ts`
- Modify: `lib/accounting/quickbooks/adapter.test.ts`
- Modify: `lib/quickbooks/batch-sync.test.ts`

- [ ] **Step 1: Update Xero adapter tests**

In `lib/accounting/xero/adapter.test.ts`, find any tests that assert `TotalTax` is present in the payload and update them to assert it is NOT present.

- [ ] **Step 2: Update QBO adapter tests**

In `lib/accounting/quickbooks/adapter.test.ts`, remove any `taxAmount` from test inputs if present.

- [ ] **Step 3: Update sync route tests**

In `app/api/invoices/[id]/sync/route.test.ts`, update any tests that verify the Sales Tax line item GL account. The mock should now return accounts from `provider.fetchAccounts` and the test should verify the inferred GL account is used.

- [ ] **Step 4: Update batch sync tests**

In `lib/quickbooks/batch-sync.test.ts`, same changes as sync route tests.

- [ ] **Step 5: Run full test suite**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: update tests for tax line item GL inference and TotalTax removal (DOC-131)"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: Zero warnings, zero errors

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 5: Commit any remaining fixes**

If any lint/type/test fixes were needed, commit them:

```bash
git add -A
git commit -m "fix: address lint and type issues from DOC-131 changes"
```
