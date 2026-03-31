# DOC-130: GL Account Dropdown - All Account Types

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the GL account dropdown to show all active account types (not just Expense), grouped by classification, while keeping AI extraction inference scoped to Expense accounts only.

**Architecture:** Backend removes the Expense-only filter from QBO and Xero account fetching. A new `classification` field on `AccountOption` enables frontend grouping. The extraction orchestration (`run.ts`) filters to Expense-only before passing accounts to the AI prompt. The `GlAccountSelect` component renders `<optgroup>` sections by classification.

**Tech Stack:** Next.js API routes, QBO REST API, Xero API, React, Vitest

---

### Task 1: Add `classification` field to `AccountOption` type

**Files:**
- Modify: `lib/accounting/types.ts:28-32`

- [ ] **Step 1: Update the AccountOption interface**

In `lib/accounting/types.ts`, add a `classification` field to `AccountOption`:

```typescript
/** An account formatted for dropdown display. */
export interface AccountOption {
  value: string;
  label: string;
  accountType: string;
  /** Top-level grouping: Expense, Liability, Asset, Equity, Revenue */
  classification: string;
}
```

- [ ] **Step 2: Run type check to see what breaks**

Run: `npx tsc --noEmit 2>&1 | head -40`

Expected: Type errors in QBO api.ts, Xero api.ts, and test files where `AccountOption` objects are constructed without `classification`. Note each location for fixing in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add lib/accounting/types.ts
git commit -m "feat(types): add classification field to AccountOption (DOC-130)"
```

---

### Task 2: QBO - fetch all active accounts, populate classification

**Files:**
- Modify: `lib/quickbooks/api.ts:291-334`
- Modify: `lib/accounting/quickbooks/adapter.test.ts:147-161`

- [ ] **Step 1: Update the QBO query to fetch all active accounts**

In `lib/quickbooks/api.ts`, change the `queryAccounts` function's SQL query from:

```typescript
`/query?query=${encodeURIComponent("SELECT * FROM Account WHERE AccountType = 'Expense' AND Active = true MAXRESULTS 1000")}`
```

to:

```typescript
`/query?query=${encodeURIComponent("SELECT * FROM Account WHERE Active = true MAXRESULTS 1000")}`
```

Also update the JSDoc on `queryAccounts` from "Fetch all active expense accounts" to "Fetch all active accounts".

- [ ] **Step 2: Update `getAccountOptions` to include classification**

In `lib/quickbooks/api.ts`, update `getAccountOptions` to map the `Classification` field:

```typescript
export async function getAccountOptions(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string
): Promise<AccountOption[]> {
  const accounts = await queryAccounts(supabase, orgId);
  return accounts
    .map((a) => ({
      value: a.Id,
      label: a.SubAccount ? a.FullyQualifiedName : a.Name,
      accountType: a.AccountType,
      classification: a.Classification,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
```

- [ ] **Step 3: Update QBO adapter test**

In `lib/accounting/quickbooks/adapter.test.ts`, update the `fetchAccounts` test to include `classification`:

```typescript
it("delegates to getAccountOptions and returns AccountOption[]", async () => {
  mockGetAccountOptions.mockResolvedValue([
    { value: "80", label: "Advertising", accountType: "Expense", classification: "Expense" },
  ]);

  const adapter = await getAdapter();
  const result = await adapter.fetchAccounts(mockSupabase, "org-1");

  expect(mockGetAccountOptions).toHaveBeenCalledWith(mockSupabase, "org-1");
  expect(result).toEqual([
    { value: "80", label: "Advertising", accountType: "Expense", classification: "Expense" },
  ]);
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/accounting/quickbooks/adapter.test.ts --reporter=verbose 2>&1 | tail -20`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/quickbooks/api.ts lib/accounting/quickbooks/adapter.test.ts
git commit -m "feat(qbo): fetch all active accounts with classification (DOC-130)"
```

---

### Task 3: Xero - fetch all active accounts, populate classification

**Files:**
- Modify: `lib/xero/api.ts:304-342`
- Modify: `lib/xero/api.test.ts:264-357`

- [ ] **Step 1: Update Xero fetchAccounts to remove Class filter**

In `lib/xero/api.ts`, update `fetchAccounts`:

```typescript
/**
 * Fetch all active accounts from Xero.
 * Excludes archived accounts and bank-type accounts (those are payment accounts).
 * Returns AccountOption[] sorted alphabetically for dropdown display.
 *
 * AccountOption.value = AccountCode (e.g., "500"), NOT AccountID.
 * Xero line items reference Code, not the UUID AccountID.
 */
export async function fetchAccounts(
  supabase: SupabaseAdminClient,
  orgId: string
): Promise<AccountOption[]> {
  const startTime = Date.now();

  const response = await xeroFetch<XeroAccountsResponse>(
    supabase,
    orgId,
    `/Accounts`
  );

  const accounts = (response.Accounts ?? [])
    .filter((a: XeroAccount) => a.Status !== "ARCHIVED" && a.Type !== "BANK")
    .map((a: XeroAccount) => ({
      value: a.Code,
      label: a.Name,
      accountType: a.Type,
      classification: mapXeroClass(a.Class),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  logger.info("xero.accounts_fetched", {
    orgId,
    count: String(accounts.length),
    durationMs: Date.now() - startTime,
  });

  return accounts;
}
```

Note: We filter out `Type === "BANK"` because bank/credit card accounts are fetched separately via `fetchPaymentAccounts`. Without the `Class=="EXPENSE"` server-side filter, bank accounts would appear in the GL dropdown otherwise.

- [ ] **Step 2: Add the `mapXeroClass` helper**

Add this helper function above `fetchAccounts` in `lib/xero/api.ts`:

```typescript
/** Map Xero's uppercase Class values to title-case classification labels. */
function mapXeroClass(xeroClass: string): string {
  const map: Record<string, string> = {
    EXPENSE: "Expense",
    LIABILITY: "Liability",
    ASSET: "Asset",
    EQUITY: "Equity",
    REVENUE: "Revenue",
  };
  return map[xeroClass] ?? xeroClass;
}
```

- [ ] **Step 3: Update Xero test fixtures to include non-expense accounts**

In `lib/xero/api.test.ts`, add new test account fixtures after the existing ones:

```typescript
const ACCOUNT_LIABILITY: XeroAccount = {
  AccountID: "uuid-4",
  Code: "800",
  Name: "Officers Loans",
  Status: "ACTIVE",
  Type: "CURRLIAB",
  Class: "LIABILITY",
};

const ACCOUNT_ASSET: XeroAccount = {
  AccountID: "uuid-5",
  Code: "150",
  Name: "Prepaid Expenses",
  Status: "ACTIVE",
  Type: "PREPAYMENT",
  Class: "ASSET",
};

const ACCOUNT_BANK: XeroAccount = {
  AccountID: "uuid-6",
  Code: "090",
  Name: "Business Checking",
  Status: "ACTIVE",
  Type: "BANK",
  Class: "ASSET",
  BankAccountType: "BANK",
};
```

- [ ] **Step 4: Update existing fetchAccounts tests**

Update the "returns AccountOption[] sorted alphabetically" test to include `classification`:

```typescript
it("returns AccountOption[] sorted alphabetically by label", async () => {
  server.use(
    http.get(`${XERO_BASE}/Accounts`, () => {
      return HttpResponse.json({ Accounts: [ACCOUNT_1, ACCOUNT_2, ACCOUNT_LIABILITY] });
    })
  );

  const { fetchAccounts } = await import("@/lib/xero/api");
  const mockSupabase = {} as Parameters<typeof fetchAccounts>[0];
  const result = await fetchAccounts(mockSupabase, "org-1");

  expect(result).toEqual([
    { value: "600", label: "Advertising", accountType: "EXPENSE", classification: "Expense" },
    { value: "500", label: "Cost of Goods Sold", accountType: "DIRECTCOSTS", classification: "Expense" },
    { value: "800", label: "Officers Loans", accountType: "CURRLIAB", classification: "Liability" },
  ]);
});
```

Update the "filters out archived accounts" test to include `classification` in assertions.

Replace the "uses OData where filter for expense class" test with a test that verifies no class filter and excludes bank accounts:

```typescript
it("excludes bank-type accounts from GL dropdown", async () => {
  server.use(
    http.get(`${XERO_BASE}/Accounts`, () => {
      return HttpResponse.json({ Accounts: [ACCOUNT_1, ACCOUNT_BANK] });
    })
  );

  const { fetchAccounts } = await import("@/lib/xero/api");
  const mockSupabase = {} as Parameters<typeof fetchAccounts>[0];
  const result = await fetchAccounts(mockSupabase, "org-1");

  expect(result).toHaveLength(1);
  expect(result[0].label).toBe("Cost of Goods Sold");
});

it("fetches all accounts without class filter", async () => {
  let capturedUrl = "";
  server.use(
    http.get(`${XERO_BASE}/Accounts`, ({ request }) => {
      capturedUrl = request.url;
      return HttpResponse.json({ Accounts: [] });
    })
  );

  const { fetchAccounts } = await import("@/lib/xero/api");
  const mockSupabase = {} as Parameters<typeof fetchAccounts>[0];
  await fetchAccounts(mockSupabase, "org-1");

  expect(capturedUrl).not.toContain("where=");
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run lib/xero/api.test.ts --reporter=verbose 2>&1 | tail -30`

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/xero/api.ts lib/xero/api.test.ts
git commit -m "feat(xero): fetch all active accounts with classification (DOC-130)"
```

---

### Task 4: Filter extraction context to Expense-only accounts

**Files:**
- Modify: `lib/extraction/run.ts:154-180`
- Modify: `lib/extraction/run.test.ts:612-635`

- [ ] **Step 1: Update run.ts to filter accounts for AI context**

In `lib/extraction/run.ts`, update step 3 (around line 160-170). Change:

```typescript
if (providerType) {
  const provider = getAccountingProvider(providerType);
  const accountOptions = await provider.fetchAccounts(admin, orgId);
  accounts = accountOptions.map((a) => ({ id: a.value, name: a.label }));
}
if (accounts.length > 0) {
  accountContext = { accounts };
  validAccountIds = new Set(accounts.map((a) => a.id));
}
```

to:

```typescript
if (providerType) {
  const provider = getAccountingProvider(providerType);
  const accountOptions = await provider.fetchAccounts(admin, orgId);
  // AI inference is scoped to Expense accounts only.
  // Full account list is available in the dropdown for manual override.
  const expenseAccounts = accountOptions.filter((a) => a.classification === "Expense");
  accounts = expenseAccounts.map((a) => ({ id: a.value, name: a.label }));
}
if (accounts.length > 0) {
  accountContext = { accounts };
  validAccountIds = new Set(accounts.map((a) => a.id));
}
```

- [ ] **Step 2: Write a test that verifies only Expense accounts go to AI**

In `lib/extraction/run.test.ts`, add a new test in the "GL account suggestions in extraction" describe block:

```typescript
it("only passes Expense-classification accounts to AI context", async () => {
  setupHappyPath();

  mockGetOrgProvider.mockResolvedValue("quickbooks");
  const mockAccounts = [
    { value: "84", label: "Office Supplies", accountType: "Expense", classification: "Expense" },
    { value: "92", label: "Travel:Airfare", accountType: "Expense", classification: "Expense" },
    { value: "200", label: "Officers Loans", accountType: "Other Current Liability", classification: "Liability" },
    { value: "150", label: "Prepaid Insurance", accountType: "Other Current Asset", classification: "Asset" },
  ];
  mockFetchAccounts.mockResolvedValue(mockAccounts);

  const { runExtraction } = await import("./run");
  await runExtraction(BASE_PARAMS);

  // Only Expense accounts should be passed to the AI
  expect(mockExtractInvoiceData).toHaveBeenCalledWith(
    expect.any(Buffer),
    BASE_PARAMS.fileType,
    {
      accounts: [
        { id: "84", name: "Office Supplies" },
        { id: "92", name: "Travel:Airfare" },
      ],
    }
  );
});
```

- [ ] **Step 3: Update the existing "fetches accounts and passes them as context" test**

Add `classification` to the mock accounts in the existing test:

```typescript
it("fetches accounts and passes them as context to provider", async () => {
  setupHappyPath();

  mockGetOrgProvider.mockResolvedValue("quickbooks");
  const mockAccounts = [
    { value: "84", label: "Office Supplies", accountType: "Expense", classification: "Expense" },
    { value: "92", label: "Travel:Airfare", accountType: "Expense", classification: "Expense" },
  ];
  mockFetchAccounts.mockResolvedValue(mockAccounts);

  const { runExtraction } = await import("./run");
  await runExtraction(BASE_PARAMS);

  expect(mockExtractInvoiceData).toHaveBeenCalledWith(
    expect.any(Buffer),
    BASE_PARAMS.fileType,
    {
      accounts: [
        { id: "84", name: "Office Supplies" },
        { id: "92", name: "Travel:Airfare" },
      ],
    }
  );
});
```

Also update all other tests in that describe block that construct mock `AccountOption` arrays to include `classification: "Expense"`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/extraction/run.test.ts --reporter=verbose 2>&1 | tail -30`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/extraction/run.ts lib/extraction/run.test.ts
git commit -m "feat(extraction): filter AI context to Expense-only accounts (DOC-130)"
```

---

### Task 5: Group accounts by classification in GlAccountSelect

**Files:**
- Modify: `components/invoices/GlAccountSelect.tsx`
- Modify: `components/invoices/GlAccountSelect.test.tsx`

- [ ] **Step 1: Write the failing test for grouped rendering**

In `components/invoices/GlAccountSelect.test.tsx`, update `MOCK_ACCOUNTS` and add a grouping test:

```typescript
const MOCK_ACCOUNTS: AccountOption[] = [
  { value: "acc-1", label: "Office Supplies", accountType: "Expense", classification: "Expense" },
  { value: "acc-2", label: "Software & Subscriptions", accountType: "Expense", classification: "Expense" },
  { value: "acc-3", label: "Professional Services", accountType: "Expense", classification: "Expense" },
  { value: "acc-4", label: "Officers Loans", accountType: "Other Current Liability", classification: "Liability" },
  { value: "acc-5", label: "Prepaid Expenses", accountType: "Other Current Asset", classification: "Asset" },
];
```

Add this test:

```typescript
it("renders accounts grouped by classification with optgroup labels", () => {
  render(<GlAccountSelect {...defaultProps} />);

  const select = screen.getByRole("combobox") as HTMLSelectElement;
  const optgroups = select.querySelectorAll("optgroup");

  expect(optgroups.length).toBeGreaterThanOrEqual(2);

  const groupLabels = Array.from(optgroups).map((g) => g.label);
  expect(groupLabels).toContain("Expense");
  expect(groupLabels).toContain("Liability");

  // Expense group should appear before Liability
  expect(groupLabels.indexOf("Expense")).toBeLessThan(groupLabels.indexOf("Liability"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/invoices/GlAccountSelect.test.tsx --reporter=verbose 2>&1 | tail -20`

Expected: FAIL - no optgroups rendered yet.

- [ ] **Step 3: Implement grouped rendering in GlAccountSelect**

In `components/invoices/GlAccountSelect.tsx`, replace the flat `orderedAccounts.map` rendering with grouped rendering. Update the component:

```typescript
const CLASSIFICATION_ORDER = ["Expense", "Liability", "Asset", "Equity", "Revenue"];

function groupByClassification(accounts: AccountOption[]): Array<{ classification: string; accounts: AccountOption[] }> {
  const groups = new Map<string, AccountOption[]>();
  for (const account of accounts) {
    const cls = account.classification || "Other";
    if (!groups.has(cls)) groups.set(cls, []);
    groups.get(cls)!.push(account);
  }
  return CLASSIFICATION_ORDER
    .filter((cls) => groups.has(cls))
    .map((cls) => ({ classification: cls, accounts: groups.get(cls)! }))
    .concat(
      Array.from(groups.entries())
        .filter(([cls]) => !CLASSIFICATION_ORDER.includes(cls))
        .map(([cls, accts]) => ({ classification: cls, accounts: accts }))
    );
}
```

Then update the `<select>` body. Replace:

```tsx
{orderedAccounts.map((a) => (
  <option key={a.value} value={a.value}>
    {a.value === suggestedAccountId && showSuggestion
      ? `AI · ${a.label}`
      : a.value === suggestedAccountId && showHistoryBadge
        ? `Learned · ${a.label}`
        : a.label}
  </option>
))}
```

with:

```tsx
{suggestedAccount && showSuggestion && (
  <option key={`suggested-${suggestedAccount.value}`} value={suggestedAccount.value}>
    AI · {suggestedAccount.label}
  </option>
)}
{historyAccount && showHistoryBadge && (
  <option key={`history-${historyAccount.value}`} value={historyAccount.value}>
    Learned · {historyAccount.label}
  </option>
)}
{groupByClassification(accounts).map((group) => (
  <optgroup key={group.classification} label={group.classification}>
    {group.accounts
      .filter((a) =>
        !(suggestedAccount && showSuggestion && a.value === suggestedAccountId) &&
        !(historyAccount && showHistoryBadge && a.value === suggestedAccountId)
      )
      .map((a) => (
        <option key={a.value} value={a.value}>
          {a.label}
        </option>
      ))}
  </optgroup>
))}
```

Also remove the `orderedAccounts` variable since grouping replaces it. Keep `suggestedAccount` and `historyAccount` logic intact.

- [ ] **Step 4: Update the title attribute for empty state**

Change:

```tsx
title={accounts.length === 0 ? "No expense accounts found" : undefined}
```

to:

```tsx
title={accounts.length === 0 ? "No accounts found" : undefined}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run components/invoices/GlAccountSelect.test.tsx --reporter=verbose 2>&1 | tail -20`

Expected: All tests pass including the new grouping test. Some existing tests may need minor updates if they rely on option ordering -- fix any that fail by updating their assertions to account for the optgroup structure.

- [ ] **Step 6: Commit**

```bash
git add components/invoices/GlAccountSelect.tsx components/invoices/GlAccountSelect.test.tsx
git commit -m "feat(ui): group GL accounts by classification in dropdown (DOC-130)"
```

---

### Task 6: Fix remaining type errors and test references

**Files:**
- Modify: Any files with `AccountOption` construction that are missing `classification`

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit 2>&1 | head -60`

Expected: Type errors in test files and possibly other places that construct `AccountOption` without `classification`. Common locations:
- `lib/extraction/run.test.ts` (already fixed in Task 4)
- `lib/accounting/xero/adapter.test.ts`
- `components/invoices/GlAccountSelect.test.tsx` (already fixed in Task 5)

- [ ] **Step 2: Fix each type error**

Add `classification: "Expense"` (or appropriate value) to every `AccountOption` literal that's missing it. Most test mock data uses Expense accounts, so `classification: "Expense"` is the right default.

- [ ] **Step 3: Run full test suite**

Run: `npm run test 2>&1 | tail -30`

Expected: All tests pass.

- [ ] **Step 4: Run lint and build**

Run: `npm run lint && npm run build 2>&1 | tail -20`

Expected: Clean lint, successful build.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: add classification field to all AccountOption references (DOC-130)"
```

---

### Task 7: Create feature branch and PR

- [ ] **Step 1: Create branch and push all commits**

All work should be on a feature branch:

```bash
git checkout -b feature/DOC-130-gl-all-account-types
```

If commits were made on main, cherry-pick or rebase them onto the feature branch.

- [ ] **Step 2: Push and create PR**

```bash
git push -u origin feature/DOC-130-gl-all-account-types
gh pr create --title "feat: show all account types in GL dropdown, grouped by classification (DOC-130)" --body "$(cat <<'EOF'
## Summary
- Expands GL account dropdown to show all active account types (Expense, Liability, Asset, Equity, Revenue), not just Expense
- Accounts grouped by classification with `<optgroup>` headers, Expense first
- AI extraction inference remains scoped to Expense accounts only -- bookkeeper overrides manually when needed
- Fixes Rick Smith feedback: "Officers Loans" (liability) now appears in dropdown

## Test plan
- [ ] QBO: verify dropdown shows accounts from multiple classifications
- [ ] Xero: verify dropdown shows non-expense accounts
- [ ] Verify AI suggestions still only suggest Expense accounts
- [ ] Verify bank/credit card accounts don't appear in GL dropdown (they're in payment account selector)
- [ ] All tests pass (`npm run test`)
- [ ] Type check clean (`npx tsc --noEmit`)
- [ ] Lint clean (`npm run lint`)

Closes DOC-130
EOF
)"
```

- [ ] **Step 3: Deliver status report**

```
STATUS REPORT - DOC-130: GL Account Dropdown - All Account Types

1. FILES CHANGED
   lib/accounting/types.ts - added classification field to AccountOption
   lib/quickbooks/api.ts - removed Expense-only WHERE filter, mapped Classification
   lib/xero/api.ts - removed Class=="EXPENSE" filter, added mapXeroClass helper, excluded bank accounts
   lib/extraction/run.ts - filter to Expense-only before passing to AI context
   components/invoices/GlAccountSelect.tsx - grouped rendering with optgroup by classification
   (plus test file updates for all of the above)

2. DEPENDENCIES
   None added.

3. ACCEPTANCE CRITERIA CHECK
   [check against DOC-130 description]

4. SELF-REVIEW
   a) No shortcuts
   b) No TypeScript errors suppressed
   c) Edge: accounts with no classification mapped to "Other" group
   d) No files outside scope
   e) Confidence: High

5. NEXT STEPS
   - DOC-133 (typeahead search) builds directly on this grouped dropdown
```
