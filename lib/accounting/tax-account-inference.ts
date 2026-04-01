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
    (a) => a.classification.toLowerCase() === "expense"
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
