# Create Vendor from Review Page — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create a new QBO vendor inline from the invoice review page when no existing vendor matches.

**Architecture:** Add a `createVendor` function to the QBO API wrapper, a POST route at `/api/quickbooks/vendors`, and update VendorSelect to show a "Create vendor" button when search returns no matches. ExtractionForm passes vendor address and an `onVendorCreated` callback so the parent vendor list updates without a full refetch.

**Tech Stack:** Next.js API routes, QBO REST API, React (existing component patterns), Vitest + MSW for tests.

**Spec:** `docs/superpowers/specs/2026-03-17-create-vendor-from-review-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/quickbooks/api.ts` | Modify | Add `createVendor()` + `parseAddress()` helper |
| `lib/quickbooks/api.test.ts` | Create | Tests for `createVendor` and `parseAddress` |
| `app/api/quickbooks/vendors/route.ts` | Modify | Add POST handler |
| `app/api/quickbooks/vendors/route.test.ts` | Create | Tests for POST endpoint |
| `components/invoices/VendorSelect.tsx` | Modify | Add create button, new props, fix zero-vendors disabled |
| `components/invoices/ExtractionForm.tsx` | Modify | Pass `vendorAddress` and `onVendorCreated` to VendorSelect |
| `components/invoices/hooks/useQboOptions.ts` | Modify | Add `addVendor` method to update vendor list |

---

### Task 1: Add `parseAddress` and `createVendor` to QBO API wrapper

**Files:**
- Modify: `lib/quickbooks/api.ts`
- Create: `lib/quickbooks/api.test.ts`

- [ ] **Step 1: Write tests for `parseAddress`**

In `lib/quickbooks/api.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseAddress } from "@/lib/quickbooks/api";

describe("parseAddress", () => {
  it("parses comma-separated US address into BillAddr fields", () => {
    const result = parseAddress("123 Main St, Austin, TX 78701");
    expect(result).toEqual({
      Line1: "123 Main St",
      City: "Austin",
      CountrySubDivisionCode: "TX",
      PostalCode: "78701",
    });
  });

  it("returns Line1 only when fewer than 3 comma-separated parts", () => {
    const result = parseAddress("123 Main St, Austin");
    expect(result).toEqual({ Line1: "123 Main St, Austin" });
  });

  it("returns Line1 only for a single-line address", () => {
    const result = parseAddress("PO Box 456");
    expect(result).toEqual({ Line1: "PO Box 456" });
  });

  it("returns undefined for null input", () => {
    expect(parseAddress(null)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(parseAddress("")).toBeUndefined();
  });

  it("returns undefined for whitespace-only string", () => {
    expect(parseAddress("   ")).toBeUndefined();
  });

  it("handles state zip with extra spaces", () => {
    const result = parseAddress("123 Main St,  Austin ,  TX  78701 ");
    expect(result).toEqual({
      Line1: "123 Main St",
      City: "Austin",
      CountrySubDivisionCode: "TX",
      PostalCode: "78701",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/quickbooks/api.test.ts`
Expected: FAIL — `parseAddress` is not exported

- [ ] **Step 3: Implement `parseAddress`**

Add to `lib/quickbooks/api.ts` after the vendor operations section:

```typescript
/**
 * Parse an address string into QBO BillAddr fields.
 * Expects "street, city, state zip" format.
 * Falls back to Line1-only if unparseable.
 */
export function parseAddress(
  address: string | null | undefined
): { Line1: string; City?: string; CountrySubDivisionCode?: string; PostalCode?: string } | undefined {
  if (!address || !address.trim()) return undefined;

  const parts = address.split(",").map((p) => p.trim());

  if (parts.length < 3) {
    return { Line1: address.trim() };
  }

  const line1 = parts[0];
  const city = parts[1];
  // Last part should be "ST 12345" or just state
  const stateZipPart = parts.slice(2).join(",").trim();
  const stateZipMatch = stateZipPart.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);

  if (stateZipMatch) {
    return {
      Line1: line1,
      City: city,
      CountrySubDivisionCode: stateZipMatch[1].toUpperCase(),
      PostalCode: stateZipMatch[2],
    };
  }

  // Couldn't parse state/zip — fall back to Line1 only
  return { Line1: address.trim() };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/quickbooks/api.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Implement `createVendor`**

Add to `lib/quickbooks/api.ts` after `getVendorOptions`:

```typescript
interface QBOVendorCreateResponse {
  Vendor: QBOVendor;
  time: string;
}

/**
 * Create a new vendor in QBO.
 * Returns the new vendor formatted as a VendorOption.
 */
export async function createVendor(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  orgId: string,
  displayName: string,
  address?: string | null
): Promise<VendorOption> {
  const startTime = Date.now();

  const body: Record<string, unknown> = {
    DisplayName: displayName,
  };

  const billAddr = parseAddress(address);
  if (billAddr) {
    body.BillAddr = billAddr;
  }

  const response = await qboFetch<QBOVendorCreateResponse>(
    supabase,
    orgId,
    "/vendor",
    {
      method: "POST",
      body,
    }
  );

  logger.info("qbo.vendor_created", {
    orgId,
    vendorId: response.Vendor.Id,
    displayName: response.Vendor.DisplayName,
    durationMs: Date.now() - startTime,
  });

  return {
    value: response.Vendor.Id,
    label: response.Vendor.DisplayName,
  };
}
```

- [ ] **Step 6: Run lint and type check**

Run: `npm run lint && npx tsc --noEmit`
Expected: Clean pass

- [ ] **Step 7: Commit**

```bash
git add lib/quickbooks/api.ts lib/quickbooks/api.test.ts
git commit -m "feat: add createVendor and parseAddress to QBO API wrapper"
```

---

### Task 2: Add POST handler to vendors route

**Files:**
- Modify: `app/api/quickbooks/vendors/route.ts`
- Create: `app/api/quickbooks/vendors/route.test.ts`

- [ ] **Step 1: Write tests for POST /api/quickbooks/vendors**

Create `app/api/quickbooks/vendors/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the route
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/quickbooks/api", () => ({
  createVendor: vi.fn(),
  QBOApiError: class QBOApiError extends Error {
    statusCode: number;
    qboErrors: Array<{ Message: string; Detail: string; code: string; element?: string }>;
    faultType: string;
    constructor(statusCode: number, errors: Array<{ Message: string; Detail: string; code: string; element?: string }>, faultType: string) {
      super(errors[0]?.Message ?? "Unknown");
      this.statusCode = statusCode;
      this.qboErrors = errors;
      this.faultType = faultType;
    }
    get errorCode() { return this.qboErrors[0]?.code ?? "unknown"; }
    get element() { return this.qboErrors[0]?.element; }
  },
  getVendorOptions: vi.fn(),
}));

import { POST } from "./route";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createVendor, QBOApiError } from "@/lib/quickbooks/api";

function mockAuthUser(userId: string | null, orgId: string | null) {
  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: orgId ? { org_id: orgId } : null,
            }),
          }),
        }),
      }),
    }),
  };
  (createClient as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({});
  return supabase;
}

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/quickbooks/vendors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/quickbooks/vendors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a vendor and returns VendorOption", async () => {
    mockAuthUser("user-1", "org-1");
    (createVendor as ReturnType<typeof vi.fn>).mockResolvedValue({
      value: "99",
      label: "Acme Inc",
    });

    const res = await POST(makeRequest({ displayName: "Acme Inc", address: "123 Main St" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ value: "99", label: "Acme Inc" });
    expect(createVendor).toHaveBeenCalledWith({}, "org-1", "Acme Inc", "123 Main St");
  });

  it("returns 400 when displayName is missing", async () => {
    mockAuthUser("user-1", "org-1");

    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when displayName is empty string", async () => {
    mockAuthUser("user-1", "org-1");

    const res = await POST(makeRequest({ displayName: "  " }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 when not authenticated", async () => {
    mockAuthUser(null, null);

    const res = await POST(makeRequest({ displayName: "Acme" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.code).toBe("AUTH_ERROR");
  });

  it("returns 409 when QBO reports duplicate vendor (error code 6240)", async () => {
    mockAuthUser("user-1", "org-1");
    (createVendor as ReturnType<typeof vi.fn>).mockRejectedValue(
      new QBOApiError(400, [{ Message: "Duplicate", Detail: "Duplicate Name", code: "6240", element: "DisplayName" }], "ValidationFault")
    );

    const res = await POST(makeRequest({ displayName: "Existing Vendor" }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("CONFLICT");
  });

  it("returns 401 when QBO token is expired", async () => {
    mockAuthUser("user-1", "org-1");
    (createVendor as ReturnType<typeof vi.fn>).mockRejectedValue(
      new QBOApiError(401, [{ Message: "Auth failure", Detail: "Token expired", code: "100" }], "AuthenticationFault")
    );

    const res = await POST(makeRequest({ displayName: "New Vendor" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.code).toBe("AUTH_ERROR");
  });

  it("returns 422 when no QBO connection exists", async () => {
    mockAuthUser("user-1", "org-1");
    (createVendor as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("No QuickBooks connection found. Connect QuickBooks in Settings first.")
    );

    const res = await POST(makeRequest({ displayName: "New Vendor" }));
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.code).toBe("UNPROCESSABLE");
  });

  it("returns 500 for other QBO errors", async () => {
    mockAuthUser("user-1", "org-1");
    (createVendor as ReturnType<typeof vi.fn>).mockRejectedValue(
      new QBOApiError(500, [{ Message: "Server error", Detail: "Internal", code: "500" }], "SystemFault")
    );

    const res = await POST(makeRequest({ displayName: "New Vendor" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.code).toBe("INTERNAL_ERROR");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/quickbooks/vendors/route.test.ts`
Expected: FAIL — `POST` is not exported from route

- [ ] **Step 3: Implement POST handler**

Add to `app/api/quickbooks/vendors/route.ts` (after existing imports, add `createVendor` to the import from `@/lib/quickbooks/api`, and add error helpers):

Add to imports:
```typescript
import { createVendor } from "@/lib/quickbooks/api";  // add to existing import
import { validationError, conflict, unprocessableEntity } from "@/lib/utils/errors";  // add to existing import
```

Add the POST handler after the existing GET handler:

```typescript
/**
 * POST /api/quickbooks/vendors
 *
 * Creates a new vendor in QBO.
 * Body: { displayName: string, address?: string | null }
 */
export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    // Verify authentication
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return authError();
    }

    // Get user's org
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership) {
      return authError("No organization found.");
    }

    // Parse and validate body
    const body = await request.json();
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const address = typeof body.address === "string" ? body.address : null;

    if (!displayName) {
      return validationError("Vendor name is required.");
    }

    // Create vendor in QBO
    const adminSupabase = createAdminClient();
    const vendor = await createVendor(adminSupabase, membership.org_id, displayName, address);

    logger.info("qbo.vendor_created_via_api", {
      userId: user.id,
      orgId: membership.org_id,
      vendorId: vendor.value,
      displayName: vendor.label,
      durationMs: Date.now() - startTime,
    });

    return apiSuccess(vendor);
  } catch (error) {
    if (error instanceof QBOApiError) {
      logger.error("qbo.vendor_create_api_error", {
        error: error.message,
        code: error.errorCode,
        element: error.element,
        statusCode: String(error.statusCode),
        durationMs: Date.now() - startTime,
      });

      // Duplicate vendor name
      if (error.errorCode === "6240") {
        return conflict("A vendor with this name already exists in QuickBooks. Try refreshing.");
      }

      // Token expired
      if (error.statusCode === 401) {
        return authError("QuickBooks connection expired. Reconnect in Settings.");
      }
    }

    // No QBO connection
    if (error instanceof Error && error.message.includes("No QuickBooks connection")) {
      return unprocessableEntity("No QuickBooks connection found. Connect in Settings.");
    }

    logger.error("qbo.vendor_create_failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });

    return internalError("Failed to create vendor in QuickBooks. Please try again.");
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/quickbooks/vendors/route.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Run lint and type check**

Run: `npm run lint && npx tsc --noEmit`
Expected: Clean pass

- [ ] **Step 6: Commit**

```bash
git add app/api/quickbooks/vendors/route.ts app/api/quickbooks/vendors/route.test.ts
git commit -m "feat: add POST /api/quickbooks/vendors route for creating vendors"
```

---

### Task 3: Update `useQboOptions` hook to support adding vendors

**Files:**
- Modify: `components/invoices/hooks/useQboOptions.ts`

- [ ] **Step 1: Add `addVendor` method to hook return**

Update the `QboOptionsState` interface and the hook to expose an `addVendor` function:

```typescript
// Add to QboOptionsState interface:
addVendor: (vendor: VendorOption) => void;
```

Add this function inside `useQboOptions`, before the return:

```typescript
const addVendor = useCallback((vendor: VendorOption) => {
  setState((prev) => ({
    ...prev,
    vendors: [...prev.vendors, vendor].sort((a, b) => a.label.localeCompare(b.label)),
  }));
}, []);
```

Update the return to include `addVendor`:

```typescript
return { ...state, addVendor };
```

Update the hook return type from `QboOptionsState` to `QboOptionsState & { addVendor: (vendor: VendorOption) => void }`.

- [ ] **Step 2: Add `useCallback` to the import if not already there**

Check the existing import — it already imports `useState, useEffect`. Add `useCallback`:

```typescript
import { useState, useEffect, useCallback } from "react";
```

- [ ] **Step 3: Run lint and type check**

Run: `npm run lint && npx tsc --noEmit`
Expected: Clean pass

- [ ] **Step 4: Commit**

```bash
git add components/invoices/hooks/useQboOptions.ts
git commit -m "feat: add addVendor method to useQboOptions hook"
```

---

### Task 4: Update VendorSelect with create vendor button

**Files:**
- Modify: `components/invoices/VendorSelect.tsx`

- [ ] **Step 1: Add new props to VendorSelectProps**

Add to the interface:

```typescript
vendorAddress?: string | null;
onVendorCreated?: (vendor: VendorOption) => void;
```

Add to the destructured props with defaults:

```typescript
vendorAddress = null,
onVendorCreated,
```

- [ ] **Step 2: Add create vendor state**

Add after the existing state declarations:

```typescript
const [creating, setCreating] = useState(false);
const [createError, setCreateError] = useState<string | null>(null);
const createErrorTimer = useRef<ReturnType<typeof setTimeout>>();
```

- [ ] **Step 3: Add `handleCreateVendor` function**

Add after `handleClear`:

```typescript
const handleCreateVendor = useCallback(async () => {
  if (!vendorName || creating) return;

  setCreating(true);
  setCreateError(null);

  try {
    const res = await fetch("/api/quickbooks/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: vendorName.trim(),
        address: vendorAddress,
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      setCreateError(json.error ?? "Failed to create vendor.");
      if (createErrorTimer.current) clearTimeout(createErrorTimer.current);
      createErrorTimer.current = setTimeout(() => setCreateError(null), 10000);
      setCreating(false);
      return;
    }

    const newVendor: VendorOption = json.data;

    // Notify parent to add to vendor list
    onVendorCreated?.(newVendor);

    // Auto-select the new vendor
    setCreating(false);
    setIsOpen(false);
    setSearch("");
    await handleSelect(newVendor.value);
  } catch {
    setCreateError("Failed to create vendor. Please try again.");
    if (createErrorTimer.current) clearTimeout(createErrorTimer.current);
    createErrorTimer.current = setTimeout(() => setCreateError(null), 10000);
    setCreating(false);
  }
}, [vendorName, vendorAddress, creating, onVendorCreated, handleSelect]);
```

- [ ] **Step 4: Fix disabled condition for zero-vendors edge case**

Change line 203 from:

```typescript
disabled={disabled || vendors.length === 0}
```

to:

```typescript
disabled={disabled || (vendors.length === 0 && !connected)}
```

Also update the placeholder to be more helpful when connected with zero vendors:

```typescript
placeholder={
  vendors.length === 0 && connected
    ? "Type to search or create a vendor..."
    : vendors.length === 0
      ? "No vendors found in QuickBooks"
      : "Search vendors..."
}
```

- [ ] **Step 5: Update the "no matches" dropdown to include create button**

Replace the existing "no matches" dropdown (the `isOpen && search && filtered.length === 0` block) with:

```typescript
{isOpen && filtered.length === 0 && (
  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg px-3 py-2">
    {search && (
      <p className="text-sm text-gray-400">
        No vendors match &quot;{search}&quot;
      </p>
    )}
    {vendorName && connected && (
      <button
        type="button"
        onClick={handleCreateVendor}
        disabled={creating}
        className="mt-1 w-full text-left text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 py-1"
      >
        {creating ? (
          <>
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Creating...
          </>
        ) : (
          <>+ Create &quot;{vendorName.trim()}&quot; in QuickBooks</>
        )}
      </button>
    )}
    {createError && (
      <p className="mt-1 text-xs text-red-600">{createError}</p>
    )}
  </div>
)}
```

Also update the condition for showing the dropdown with matches — the `isOpen && filtered.length > 0` block should also show the create button when there's a search with matches (in case the user wants to create rather than select). However, per spec the create button only shows when there are **no matches**, so keep the existing dropdown for matches and only show the create button in the no-matches case. The condition for the no-matches block should trigger when the dropdown is open and either there are no vendors at all OR the search filtered everything out:

Change the condition from `isOpen && search && filtered.length === 0` to `isOpen && filtered.length === 0`.

- [ ] **Step 6: Run lint and type check**

Run: `npm run lint && npx tsc --noEmit`
Expected: Clean pass

- [ ] **Step 7: Commit**

```bash
git add components/invoices/VendorSelect.tsx
git commit -m "feat: add inline create vendor button to VendorSelect dropdown"
```

---

### Task 5: Wire up ExtractionForm to pass new props

**Files:**
- Modify: `components/invoices/ExtractionForm.tsx`

- [ ] **Step 1: Update VendorSelect usage in ExtractionForm**

In the JSX where `<VendorSelect>` is rendered (around line 400-409), add the two new props:

```typescript
<VendorSelect
  vendors={qboOptions.vendors}
  loading={qboOptions.loading}
  connected={qboOptions.connected}
  error={qboOptions.error}
  currentVendorRef={vendorRef}
  vendorName={state.values.vendor_name as string | null}
  onSelect={handleVendorSelect}
  disabled={currentStatus === "synced"}
  vendorAddress={state.values.vendor_address as string | null}
  onVendorCreated={qboOptions.addVendor}
/>
```

- [ ] **Step 2: Run lint and type check**

Run: `npm run lint && npx tsc --noEmit`
Expected: Clean pass

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: All tests PASS

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git add components/invoices/ExtractionForm.tsx
git commit -m "feat: wire vendor address and onVendorCreated to VendorSelect"
```

---

### Task 6: Manual QA verification

- [ ] **Step 1: Verify with QBO sandbox**

If QBO sandbox is available, test the full flow:
1. Upload an invoice with a vendor name not in QBO
2. Open review page → vendor dropdown shows no matches
3. Click "+ Create [vendor name] in QuickBooks"
4. Verify vendor is created, auto-selected, and green checkmark appears
5. Verify the vendor appears in the dropdown if you clear and re-search
6. Try creating a duplicate — verify conflict error message appears

- [ ] **Step 2: Verify edge cases**

1. Open dropdown with zero vendors in QBO — input should be enabled, create button should appear
2. Clear vendor name field to empty — create button should not appear
3. Double-click create button rapidly — should only fire once (disabled during loading)
4. Test with address containing special characters
5. Test with no address (null) — should still create vendor with name only
