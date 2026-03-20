# DOC-57: Xero Chart of Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the GL account dropdown to work with Xero connections by implementing `fetchAccounts()` in a Xero adapter and wiring it into the existing provider abstraction.

**Architecture:** The provider-agnostic pattern is already established. The `AccountingProvider` interface defines `fetchAccounts()`, the API route (`/api/accounting/accounts`) calls it through the factory, and the frontend (`GlAccountSelect.tsx`) already fetches from the provider-agnostic endpoint. The only gap is:
1. No `lib/xero/api.ts` (core HTTP helper + account-fetching logic)
2. No Xero adapter implementing `AccountingProvider`
3. Factory throws "not implemented" for Xero

**Tech Stack:** TypeScript, Xero REST API, Vitest + MSW for tests

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/xero/api.ts` | **Create** | Core Xero HTTP fetch helper (`xeroFetch`), error parsing, `XeroApiError` class, `fetchAccounts()` |
| `lib/xero/types.ts` | **Modify** | Add `XeroAccount`, `XeroErrorResponse`, `XeroErrorDetail` types |
| `lib/accounting/xero/adapter.ts` | **Create** | Implements `AccountingProvider` for Xero — delegates to `lib/xero/api.ts`, wraps errors |
| `lib/accounting/index.ts` | **Modify** | Wire Xero case in factory (replace throw with `new XeroAccountingAdapter()`) |
| `lib/xero/api.test.ts` | **Create** | Tests for `xeroFetch`, error parsing, `fetchAccounts` mapping |
| `lib/accounting/xero/adapter.test.ts` | **Create** | Tests for adapter error wrapping and delegation |

**Files that need NO changes:**
- `app/api/accounting/accounts/route.ts` — already provider-agnostic
- `components/invoices/GlAccountSelect.tsx` — already provider-agnostic
- `components/invoices/hooks/useQboOptions.ts` — already fetches from `/api/accounting/accounts`

---

## Key Design Decisions

1. **`AccountOption.value` = `AccountCode` (not `AccountID`)** — Xero line items reference `AccountCode` (string like "500"), not `AccountID` (UUID). This is different from QBO where `value` = the QBO `Id`. The dropdown value must be whatever the bill/purchase creation endpoint needs.

2. **Filter by `Class=="EXPENSE"` server-side** — catches both `EXPENSE` and `DIRECTCOSTS` account types. Also filter out `Status == "ARCHIVED"` in the response mapping (not in the OData where clause, to keep the filter simple).

3. **`xeroFetch` follows the `qboFetch` pattern** — authenticated fetch helper that auto-refreshes tokens via `getValidAccessToken()`, sets the `xero-tenant-id` header, and parses error responses.

4. **`XeroApiError` mirrors `QBOApiError`** — same shape (statusCode, errorCode, detail, element) so the adapter's error wrapping is identical.

---

## Reference: Xero Accounts API

From sandbox validation (DOC-53):

```
GET /api.xro/2.0/Accounts?where=Class=="EXPENSE"

Headers:
  Authorization: Bearer {accessToken}
  xero-tenant-id: {tenantId}
  Accept: application/json

Response shape:
{
  "Accounts": [
    {
      "AccountID": "uuid-string",
      "Code": "500",           // ← this goes into AccountOption.value
      "Name": "Advertising",   // ← this goes into AccountOption.label
      "Status": "ACTIVE",
      "Type": "EXPENSE",       // or "DIRECTCOSTS" or "OVERHEADS"
      "Class": "EXPENSE",
      "Description": "...",
      "TaxType": "NONE"
    }
  ]
}
```

Error shape (consistent PascalCase):
```
Auth errors: { Title, Status, Detail }
Validation errors: { Elements[].ValidationErrors[].Message }
```

---

## Task 1: Add Xero API Types

**Files:**
- Modify: `lib/xero/types.ts`

- [ ] **Step 1: Add Xero account types to `lib/xero/types.ts`**

Append these types after the existing `XeroValidationError` interface (at end of file).
Note: `XeroAuthError` and `XeroValidationError` already exist from DOC-56 — do NOT redeclare them.

```typescript
// ─── Xero Account Types ───

/** A single account from Xero's Chart of Accounts API. */
export interface XeroAccount {
  AccountID: string;     // UUID
  Code: string;          // e.g., "500" — line items reference this
  Name: string;          // display name
  Status: "ACTIVE" | "ARCHIVED";
  Type: string;          // "EXPENSE" | "DIRECTCOSTS" | "OVERHEADS" | etc.
  Class: string;         // "EXPENSE" | "REVENUE" | "ASSET" | etc.
  Description?: string;
  TaxType?: string;
}

/** Wrapper for Xero Accounts API list response. */
export interface XeroAccountsResponse {
  Accounts: XeroAccount[];
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/xero/types.ts
git commit -m "feat(xero): add account and error response types (DOC-57)"
```

---

## Task 2: Create Xero API Helper (`lib/xero/api.ts`)

**Files:**
- Create: `lib/xero/api.ts`
- Test: `lib/xero/api.test.ts`

- [ ] **Step 1: Write failing tests for `XeroApiError`, `xeroFetch`, and `fetchAccounts`**

Create `lib/xero/api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing module under test
vi.mock("@/lib/xero/auth", () => ({
  getValidAccessToken: vi.fn(),
}));

vi.mock("@/lib/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { XeroApiError, fetchAccounts } from "./api";
import { getValidAccessToken } from "./auth";
import type { XeroAccount } from "./types";

const mockGetValidAccessToken = vi.mocked(getValidAccessToken);

// ─── XeroApiError ───

describe("XeroApiError", () => {
  it("stores statusCode, errorCode, detail, and element", () => {
    const err = new XeroApiError(400, "ValidationError", "Name is required", "Name");
    expect(err.statusCode).toBe(400);
    expect(err.errorCode).toBe("ValidationError");
    expect(err.detail).toBe("Name is required");
    expect(err.element).toBe("Name");
    expect(err.name).toBe("XeroApiError");
    expect(err.message).toBe("Name is required");
  });
});

// ─── fetchAccounts ───

describe("fetchAccounts", () => {
  const mockSupabase = {} as any;
  const orgId = "org-123";

  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetValidAccessToken.mockResolvedValue({
      accessToken: "xero-access-token",
      tenantId: "tenant-123",
    });
  });

  it("returns AccountOption[] mapped from Xero accounts", async () => {
    const mockAccounts: XeroAccount[] = [
      {
        AccountID: "uuid-1",
        Code: "500",
        Name: "Cost of Goods Sold",
        Status: "ACTIVE",
        Type: "DIRECTCOSTS",
        Class: "EXPENSE",
      },
      {
        AccountID: "uuid-2",
        Code: "600",
        Name: "Advertising",
        Status: "ACTIVE",
        Type: "EXPENSE",
        Class: "EXPENSE",
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ Accounts: mockAccounts }),
    });

    const result = await fetchAccounts(mockSupabase, orgId);

    expect(result).toEqual([
      { value: "600", label: "Advertising", accountType: "EXPENSE" },
      { value: "500", label: "Cost of Goods Sold", accountType: "DIRECTCOSTS" },
    ]);
    // Note: sorted alphabetically by label
  });

  it("filters out archived accounts", async () => {
    const mockAccounts: XeroAccount[] = [
      {
        AccountID: "uuid-1",
        Code: "500",
        Name: "Active Account",
        Status: "ACTIVE",
        Type: "EXPENSE",
        Class: "EXPENSE",
      },
      {
        AccountID: "uuid-2",
        Code: "501",
        Name: "Archived Account",
        Status: "ARCHIVED",
        Type: "EXPENSE",
        Class: "EXPENSE",
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ Accounts: mockAccounts }),
    });

    const result = await fetchAccounts(mockSupabase, orgId);

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Active Account");
  });

  it("sets xero-tenant-id header on the request", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ Accounts: [] }),
    });

    await fetchAccounts(mockSupabase, orgId);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api.xro/2.0/Accounts"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "xero-tenant-id": "tenant-123",
        }),
      })
    );
  });

  it("uses OData where filter for expense class", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ Accounts: [] }),
    });

    await fetchAccounts(mockSupabase, orgId);

    const url = (global.fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('where=Class%3D%3D%22EXPENSE%22');
  });

  it("throws XeroApiError on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          Title: "Unauthorized",
          Status: 401,
          Detail: "AuthenticationUnsuccessful",
        }),
    });

    await expect(fetchAccounts(mockSupabase, orgId)).rejects.toThrow(XeroApiError);
  });

  it("returns empty array when Accounts is empty", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ Accounts: [] }),
    });

    const result = await fetchAccounts(mockSupabase, orgId);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/xero/api.test.ts`
Expected: FAIL — `./api` module not found

- [ ] **Step 3: Implement `lib/xero/api.ts`**

```typescript
// lib/xero/api.ts
import { getValidAccessToken } from "./auth";
import { logger } from "@/lib/utils/logger";
import type {
  XeroAccount,
  XeroAccountsResponse,
  XeroAuthError,
  XeroValidationError,
} from "./types";
import type { AccountOption } from "@/lib/accounting/types";

const XERO_API_BASE = "https://api.xero.com";

// ─── Error Handling ───

export class XeroApiError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly detail: string;
  public readonly element?: string;

  constructor(
    statusCode: number,
    errorCode: string,
    detail: string,
    element?: string
  ) {
    super(detail);
    this.name = "XeroApiError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.detail = detail;
    this.element = element;
  }
}

/**
 * Parse a Xero error response into a XeroApiError.
 * Xero uses consistent PascalCase for both auth and validation errors.
 */
function parseXeroError(status: number, body: unknown): XeroApiError {
  // Auth errors: { Title, Status, Detail }
  if (
    body &&
    typeof body === "object" &&
    "Detail" in body
  ) {
    const authErr = body as XeroAuthError;
    return new XeroApiError(
      status,
      authErr.Title ?? "AuthError",
      authErr.Detail ?? `Xero returned ${status}`
    );
  }

  // Validation errors: { Message, Elements[].ValidationErrors[].Message }
  if (
    body &&
    typeof body === "object" &&
    "Elements" in body
  ) {
    const valErr = body as XeroValidationError;
    const firstMessage =
      valErr.Elements?.[0]?.ValidationErrors?.[0]?.Message ??
      valErr.Message ??
      `Xero returned ${status}`;
    return new XeroApiError(
      status,
      "ValidationError",
      firstMessage
    );
  }

  // Fallback
  return new XeroApiError(status, "unknown", `Xero returned ${status}`);
}

// ─── Core Fetch Helper ───

type SupabaseAdminClient = ReturnType<
  typeof import("@/lib/supabase/admin").createAdminClient
>;

/**
 * Authenticated fetch to the Xero API.
 * Auto-refreshes tokens via getValidAccessToken().
 * Sets the required xero-tenant-id header.
 * Parses error responses into XeroApiError.
 */
async function xeroFetch<T>(
  supabase: SupabaseAdminClient,
  orgId: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  const { accessToken, tenantId } = await getValidAccessToken(supabase, orgId);
  const url = `${XERO_API_BASE}${path}`;

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "xero-tenant-id": tenantId,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = null;
    }
    throw parseXeroError(response.status, errorBody);
  }

  return (await response.json()) as T;
}

// ─── Account Operations ───

/**
 * Fetch expense-type accounts from Xero.
 * Filters by Class=="EXPENSE" (catches EXPENSE, DIRECTCOSTS, OVERHEADS).
 * Excludes archived accounts.
 * Returns AccountOption[] sorted alphabetically for dropdown display.
 *
 * AccountOption.value = AccountCode (what line items reference, e.g., "500").
 */
export async function fetchAccounts(
  supabase: SupabaseAdminClient,
  orgId: string
): Promise<AccountOption[]> {
  const startTime = Date.now();

  const where = encodeURIComponent('Class=="EXPENSE"');
  const response = await xeroFetch<XeroAccountsResponse>(
    supabase,
    orgId,
    `/api.xro/2.0/Accounts?where=${where}`
  );

  const accounts = (response.Accounts ?? [])
    .filter((a: XeroAccount) => a.Status !== "ARCHIVED")
    .map((a: XeroAccount) => ({
      value: a.Code,
      label: a.Name,
      accountType: a.Type,
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/xero/api.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/xero/api.ts lib/xero/api.test.ts
git commit -m "feat(xero): add API fetch helper and account fetching (DOC-57)"
```

---

## Task 3: Create Xero Accounting Adapter

**Files:**
- Create: `lib/accounting/xero/adapter.ts`
- Test: `lib/accounting/xero/adapter.test.ts`

- [ ] **Step 1: Write failing tests for the Xero adapter**

Create `lib/accounting/xero/adapter.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/xero/api", () => ({
  fetchAccounts: vi.fn(),
  XeroApiError: class XeroApiError extends Error {
    statusCode: number;
    errorCode: string;
    detail: string;
    element?: string;
    constructor(statusCode: number, errorCode: string, detail: string, element?: string) {
      super(detail);
      this.name = "XeroApiError";
      this.statusCode = statusCode;
      this.errorCode = errorCode;
      this.detail = detail;
      this.element = element;
    }
  },
}));

import { XeroAccountingAdapter } from "./adapter";
import { fetchAccounts } from "@/lib/xero/api";
import { AccountingApiError } from "../types";

const mockFetchAccounts = vi.mocked(fetchAccounts);

describe("XeroAccountingAdapter", () => {
  const adapter = new XeroAccountingAdapter();
  const mockSupabase = {} as any;
  const orgId = "org-123";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("has providerType 'xero'", () => {
    expect(adapter.providerType).toBe("xero");
  });

  describe("fetchAccounts", () => {
    it("delegates to lib/xero/api.fetchAccounts", async () => {
      const mockAccounts = [
        { value: "500", label: "Advertising", accountType: "EXPENSE" },
      ];
      mockFetchAccounts.mockResolvedValue(mockAccounts);

      const result = await adapter.fetchAccounts(mockSupabase, orgId);

      expect(mockFetchAccounts).toHaveBeenCalledWith(mockSupabase, orgId);
      expect(result).toEqual(mockAccounts);
    });

    it("wraps XeroApiError into AccountingApiError", async () => {
      const { XeroApiError } = await import("@/lib/xero/api");
      mockFetchAccounts.mockRejectedValue(
        new XeroApiError(401, "Unauthorized", "Token expired")
      );

      await expect(adapter.fetchAccounts(mockSupabase, orgId)).rejects.toThrow(
        AccountingApiError
      );
    });

    it("re-throws non-XeroApiError errors as-is", async () => {
      mockFetchAccounts.mockRejectedValue(new Error("Network failure"));

      await expect(adapter.fetchAccounts(mockSupabase, orgId)).rejects.toThrow(
        "Network failure"
      );
    });
  });

  describe("unimplemented methods", () => {
    it("fetchVendors throws not implemented", async () => {
      await expect(adapter.fetchVendors(mockSupabase, orgId)).rejects.toThrow(
        "not yet implemented"
      );
    });

    it("createBill throws not implemented", async () => {
      await expect(
        adapter.createBill(mockSupabase, orgId, {} as any)
      ).rejects.toThrow("not yet implemented");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/accounting/xero/adapter.test.ts`
Expected: FAIL — `./adapter` module not found

- [ ] **Step 3: Implement the Xero adapter**

Create `lib/accounting/xero/adapter.ts`:

```typescript
import { fetchAccounts as xeroFetchAccounts, XeroApiError } from "@/lib/xero/api";
import type { AccountingProvider } from "../provider";
import {
  AccountingApiError,
  type VendorOption,
  type AccountOption,
  type PaymentAccount,
  type CreateBillInput,
  type CreatePurchaseInput,
  type TransactionResult,
  type AttachmentResult,
} from "../types";

type SupabaseAdminClient = ReturnType<
  typeof import("@/lib/supabase/admin").createAdminClient
>;

// ─── Error Wrapping ───

/**
 * Convert a XeroApiError into the provider-agnostic AccountingApiError.
 * Re-throws the original error if it is not a XeroApiError.
 */
function wrapXeroError(err: unknown): never {
  if (err instanceof XeroApiError) {
    throw new AccountingApiError({
      message: err.message,
      statusCode: err.statusCode,
      errorCode: err.errorCode,
      detail: err.detail,
      element: err.element,
    });
  }
  throw err;
}

// ─── Xero Adapter ───

/**
 * Implements `AccountingProvider` by delegating to `lib/xero/api.ts` functions.
 * Follows the same pattern as `QuickBooksAccountingAdapter`.
 *
 * Methods not yet needed for DOC-57 throw "not yet implemented" — they will be
 * filled in by DOC-56 (vendors/contacts), DOC-58 (bill creation), etc.
 */
export class XeroAccountingAdapter implements AccountingProvider {
  readonly providerType = "xero" as const;

  async fetchAccounts(
    supabase: SupabaseAdminClient,
    orgId: string
  ): Promise<AccountOption[]> {
    try {
      return await xeroFetchAccounts(supabase, orgId);
    } catch (err) {
      wrapXeroError(err);
    }
  }

  async fetchVendors(
    _supabase: SupabaseAdminClient,
    _orgId: string
  ): Promise<VendorOption[]> {
    throw new Error("Xero fetchVendors not yet implemented (DOC-56)");
  }

  async createVendor(
    _supabase: SupabaseAdminClient,
    _orgId: string,
    _displayName: string,
    _address?: string | null
  ): Promise<VendorOption> {
    throw new Error("Xero createVendor not yet implemented (DOC-56)");
  }

  async fetchPaymentAccounts(
    _supabase: SupabaseAdminClient,
    _orgId: string,
    _accountType: "Bank" | "CreditCard"
  ): Promise<PaymentAccount[]> {
    throw new Error("Xero fetchPaymentAccounts not yet implemented");
  }

  async createBill(
    _supabase: SupabaseAdminClient,
    _orgId: string,
    _input: CreateBillInput
  ): Promise<TransactionResult> {
    throw new Error("Xero createBill not yet implemented (DOC-58)");
  }

  async createPurchase(
    _supabase: SupabaseAdminClient,
    _orgId: string,
    _input: CreatePurchaseInput
  ): Promise<TransactionResult> {
    throw new Error("Xero createPurchase not yet implemented");
  }

  async attachDocument(
    _supabase: SupabaseAdminClient,
    _orgId: string,
    _entityId: string,
    _entityType: "Bill" | "Purchase",
    _fileBuffer: Buffer,
    _fileName: string
  ): Promise<AttachmentResult> {
    throw new Error("Xero attachDocument not yet implemented (DOC-59)");
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/accounting/xero/adapter.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/accounting/xero/adapter.ts lib/accounting/xero/adapter.test.ts
git commit -m "feat(xero): add Xero accounting adapter with fetchAccounts (DOC-57)"
```

---

## Task 4: Wire Xero Adapter into Factory

**Files:**
- Modify: `lib/accounting/index.ts:18-25`

- [ ] **Step 1: Update the factory to return the Xero adapter**

In `lib/accounting/index.ts`, replace the `case "xero"` block:

```typescript
// Before:
    case "xero":
      // Xero adapter deferred to Phase 2 — kept here so the switch is exhaustive
      // and TypeScript enforces it as a compile-time error when the adapter is added.
      throw new Error(
        "Xero accounting adapter is not yet implemented. Phase 2 feature."
      );

// After:
    case "xero":
      return new XeroAccountingAdapter();
```

Add the import at the top:
```typescript
import { XeroAccountingAdapter } from "./xero/adapter";
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS — no type errors

- [ ] **Step 3: Run all accounting tests**

Run: `npx vitest run lib/accounting/ lib/xero/`
Expected: All tests PASS

- [ ] **Step 4: Run full test suite**

Run: `npm run test`
Expected: All tests PASS

- [ ] **Step 5: Run lint and build**

Run: `npm run lint && npm run build`
Expected: PASS — zero warnings, zero errors

- [ ] **Step 6: Commit**

```bash
git add lib/accounting/index.ts
git commit -m "feat(xero): wire Xero adapter into provider factory (DOC-57)"
```

---

## Verification Checklist

After all tasks are complete, verify these acceptance criteria:

- [ ] **Xero expense accounts appear in GL dropdown** — With a Xero connection active, `GET /api/accounting/accounts` returns `AccountOption[]` with Xero accounts
- [ ] **Only expense-type accounts shown** — Response only contains accounts with `Class=="EXPENSE"` (covers EXPENSE, DIRECTCOSTS, OVERHEADS types)
- [ ] **Archived accounts excluded** — Accounts with `Status: "ARCHIVED"` are filtered out
- [ ] **Account data is normalized** — `GlAccountSelect.tsx` receives the same `AccountOption` shape regardless of provider
- [ ] **QBO flow still works** — Existing QBO tests pass unchanged
- [ ] **API route has structured logging** — `xero.accounts_fetched` log entry emitted with count and duration
- [ ] **Auth checks in place** — Route requires authenticated user with org membership (already handled by existing route)
- [ ] **`npm run lint`** — zero warnings, zero errors
- [ ] **`npm run build`** — completes without errors
- [ ] **`npx tsc --noEmit`** — no type errors
- [ ] **`npm run test`** — all tests pass
