# DOC-134: Default Tax Code Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an org-level default tax code that auto-populates on newly extracted line items, configured via the Settings page.

**Architecture:** New column `default_tax_code_id` on `accounting_connections`. The extraction pipeline reads this after inserting line items and backfills any null `tax_code_id` values. A new Settings UI card lets users pick from their provider's tax codes.

**Tech Stack:** Next.js API routes, Supabase Postgres migration, React client component, existing `useAccountingOptions` hook pattern.

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260331100000_add_default_tax_code_to_connections.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add org-level default tax code to accounting connections.
-- Stores the provider tax code ID (QBO TaxCode Id or Xero TaxType string).
-- Null = no default (current behavior).

ALTER TABLE accounting_connections
  ADD COLUMN default_tax_code_id TEXT;

COMMENT ON COLUMN accounting_connections.default_tax_code_id IS 'Default tax code applied to new line items during extraction. QBO: TaxCode Id. Xero: TaxType string. Null = no default.';
```

- [ ] **Step 2: Update database types**

Run: `npx supabase gen types typescript --local > lib/supabase/database.types.ts`

If local Supabase is not running, manually add `default_tax_code_id` to the `accounting_connections` type in `lib/supabase/database.types.ts`:

In the `Row` type, add:
```typescript
default_tax_code_id: string | null
```

In the `Insert` type, add:
```typescript
default_tax_code_id?: string | null
```

In the `Update` type, add:
```typescript
default_tax_code_id?: string | null
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260331100000_add_default_tax_code_to_connections.sql lib/supabase/database.types.ts
git commit -m "feat(db): add default_tax_code_id to accounting_connections (DOC-134)"
```

---

### Task 2: API Route for Reading/Updating Default Tax Code

**Files:**
- Create: `app/api/settings/defaults/route.ts`
- Create: `app/api/settings/defaults/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/api/settings/defaults/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase before importing the route
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: mockAdminFrom,
  }),
}));

vi.mock("@/lib/supabase/helpers", () => ({
  getActiveOrgId: vi.fn().mockResolvedValue("org-123"),
}));

vi.mock("@/lib/utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { GET, PATCH } from "./route";

describe("GET /api/settings/defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns default_tax_code_id from accounting_connections", async () => {
    mockAdminFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { default_tax_code_id: "TAX" },
            error: null,
          }),
        }),
      }),
    });

    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.default_tax_code_id).toBe("TAX");
  });

  it("returns null when no connection exists", async () => {
    mockAdminFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
      }),
    });

    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.default_tax_code_id).toBeNull();
  });
});

describe("PATCH /api/settings/defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const req = new Request("http://localhost/api/settings/defaults", {
      method: "PATCH",
      body: JSON.stringify({ default_tax_code_id: "TAX" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("updates default_tax_code_id on accounting_connections", async () => {
    const mockUpdateReturn = {
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    mockAdminFrom.mockReturnValue({
      update: vi.fn().mockReturnValue(mockUpdateReturn),
    });

    const req = new Request("http://localhost/api/settings/defaults", {
      method: "PATCH",
      body: JSON.stringify({ default_tax_code_id: "TAX" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
  });

  it("accepts null to clear the default", async () => {
    const mockUpdateReturn = {
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    mockAdminFrom.mockReturnValue({
      update: vi.fn().mockReturnValue(mockUpdateReturn),
    });

    const req = new Request("http://localhost/api/settings/defaults", {
      method: "PATCH",
      body: JSON.stringify({ default_tax_code_id: null }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/settings/defaults/route.test.ts`
Expected: FAIL — module `./route` not found.

- [ ] **Step 3: Write the route**

Create `app/api/settings/defaults/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/supabase/helpers";
import { logger } from "@/lib/utils/logger";
import { authError, apiSuccess, internalError, validationError } from "@/lib/utils/errors";

/**
 * GET /api/settings/defaults
 * Returns the org's default settings from accounting_connections.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return authError();
  }

  const orgId = await getActiveOrgId(supabase, user.id);
  if (!orgId) {
    return authError("No organization found.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("accounting_connections")
    .select("default_tax_code_id")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    logger.error("settings.defaults_fetch_failed", {
      userId: user.id,
      orgId,
      error: error.message,
    });
    return internalError("Failed to fetch defaults.");
  }

  return apiSuccess({
    default_tax_code_id: data?.default_tax_code_id ?? null,
  });
}

/**
 * PATCH /api/settings/defaults
 * Updates the org's default settings on accounting_connections.
 */
export async function PATCH(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return authError();
  }

  const orgId = await getActiveOrgId(supabase, user.id);
  if (!orgId) {
    return authError("No organization found.");
  }

  const body = await request.json();

  // Validate: default_tax_code_id must be string or null
  if (
    body.default_tax_code_id !== null &&
    body.default_tax_code_id !== undefined &&
    typeof body.default_tax_code_id !== "string"
  ) {
    return validationError("default_tax_code_id must be a string or null.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("accounting_connections")
    .update({
      default_tax_code_id: body.default_tax_code_id ?? null,
    })
    .eq("org_id", orgId);

  if (error) {
    logger.error("settings.defaults_update_failed", {
      userId: user.id,
      orgId,
      error: error.message,
    });
    return internalError("Failed to update defaults.");
  }

  logger.info("settings.defaults_updated", {
    userId: user.id,
    orgId,
    default_tax_code_id: body.default_tax_code_id ?? null,
  });

  return apiSuccess({ default_tax_code_id: body.default_tax_code_id ?? null });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/settings/defaults/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/settings/defaults/route.ts app/api/settings/defaults/route.test.ts
git commit -m "feat: add GET/PATCH /api/settings/defaults for default tax code (DOC-134)"
```

---

### Task 3: Apply Default Tax Code During Extraction

**Files:**
- Modify: `lib/extraction/run.ts` (after line item insert, ~line 327)

- [ ] **Step 1: Write the failing test**

Create or append to an extraction test file. The key behavior: after line items are inserted, if the org has a `default_tax_code_id`, all line items with null `tax_code_id` get updated.

Since `runExtraction` is heavily integrated, we test via the existing pattern. Add to the existing test or create a focused unit:

The simplest approach: add the default tax code lookup as a helper function in `run.ts` and test the integration. The logic is a single DB query + update, so inline is fine.

In `lib/extraction/run.ts`, after the line item insert block (after line 327, before "8. Update invoice status"):

```typescript
    // 7.5. Apply org default tax code to line items without one
    try {
      const { data: connection } = await admin
        .from("accounting_connections")
        .select("default_tax_code_id")
        .eq("org_id", orgId)
        .maybeSingle();

      if (connection?.default_tax_code_id) {
        await admin
          .from("extracted_line_items")
          .update({ tax_code_id: connection.default_tax_code_id })
          .eq("extracted_data_id", extractedRow.id)
          .is("tax_code_id", null);

        logger.info("extraction_default_tax_code_applied", {
          action: "run_extraction",
          invoiceId,
          orgId,
          defaultTaxCodeId: connection.default_tax_code_id,
        });
      }
    } catch (err) {
      // Non-fatal: extraction succeeds even if default tax code fails
      logger.warn("extraction_default_tax_code_failed", {
        action: "run_extraction",
        invoiceId,
        orgId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
```

- [ ] **Step 2: Insert the code into run.ts**

In `lib/extraction/run.ts`, add the block above between the line item insert (ending at line 327) and the "8. Update invoice status" comment (line 329).

- [ ] **Step 3: Run build to verify no type errors**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/extraction/run.ts
git commit -m "feat: apply org default tax code to extracted line items (DOC-134)"
```

---

### Task 4: Settings UI -- DefaultsCard Component

**Files:**
- Create: `components/settings/DefaultsCard.tsx`
- Modify: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Create the DefaultsCard component**

Create `components/settings/DefaultsCard.tsx`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import type { TaxCodeOption } from "@/lib/accounting";

interface DefaultsCardProps {
  /** Initial default_tax_code_id from server (avoids loading flash). */
  initialDefaultTaxCodeId: string | null;
}

export function DefaultsCard({ initialDefaultTaxCodeId }: DefaultsCardProps) {
  const [taxCodes, setTaxCodes] = useState<TaxCodeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultTaxCodeId, setDefaultTaxCodeId] = useState<string | null>(
    initialDefaultTaxCodeId
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchTaxCodes() {
      try {
        const res = await fetch("/api/accounting/tax-codes");
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const body = await res.json();
        if (!cancelled) {
          setTaxCodes(body.data ?? []);
        }
      } catch {
        // Non-fatal
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchTaxCodes();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = useCallback(
    async (value: string) => {
      const newValue = value === "" ? null : value;
      setDefaultTaxCodeId(newValue);
      setSaving(true);
      setSaved(false);

      try {
        const res = await fetch("/api/settings/defaults", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ default_tax_code_id: newValue }),
        });

        if (res.ok) {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        }
      } catch {
        // Revert on failure
        setDefaultTaxCodeId(initialDefaultTaxCodeId);
      } finally {
        setSaving(false);
      }
    },
    [initialDefaultTaxCodeId]
  );

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="animate-pulse h-4 w-32 bg-border/40 rounded" />
      </div>
    );
  }

  if (taxCodes.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <div>
          <label
            htmlFor="default-tax-code"
            className="block text-sm font-medium text-text"
          >
            Default Tax Code
          </label>
          <p className="text-xs text-muted mt-0.5">
            Applied automatically to new invoice line items. You can override per
            line item during review.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            id="default-tax-code"
            value={defaultTaxCodeId ?? ""}
            onChange={(e) => handleChange(e.target.value)}
            disabled={saving}
            className="text-sm border border-border rounded-md px-3 py-1.5 bg-white text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 min-w-[180px]"
          >
            <option value="">None</option>
            {taxCodes.map((tc) => (
              <option key={tc.value} value={tc.value}>
                {tc.label}
                {tc.rate != null ? ` (${tc.rate}%)` : ""}
              </option>
            ))}
          </select>
          {saving && (
            <span className="text-xs text-muted">Saving...</span>
          )}
          {saved && (
            <span className="text-xs text-accent">Saved</span>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire DefaultsCard into the Settings page**

In `app/(dashboard)/settings/page.tsx`:

Add the import at the top with the other settings card imports:
```typescript
import { DefaultsCard } from "@/components/settings/DefaultsCard";
```

In the server component body, after the `connectionData` block (~line 88), fetch the default tax code:
```typescript
  // Fetch org defaults from accounting connection
  let defaultTaxCodeId: string | null = null;
  if (connectionData.connected && orgId) {
    const adminSupabase = createAdminClient();
    const { data: connDefaults } = await adminSupabase
      .from("accounting_connections")
      .select("default_tax_code_id")
      .eq("org_id", orgId)
      .maybeSingle();
    defaultTaxCodeId = connDefaults?.default_tax_code_id ?? null;
  }
```

In the JSX, add the Defaults section between the Connections section and the Email Forwarding section (after line 195):
```tsx
      {/* Defaults Section — only when accounting is connected */}
      {connectionData.connected && (
        <div>
          <p className="text-[13px] font-bold uppercase tracking-wider text-muted mb-3">
            Defaults
          </p>
          <DefaultsCard initialDefaultTaxCodeId={defaultTaxCodeId} />
        </div>
      )}
```

- [ ] **Step 3: Run build to verify no errors**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add components/settings/DefaultsCard.tsx app/(dashboard)/settings/page.tsx
git commit -m "feat: add default tax code setting to Settings page (DOC-134)"
```

---

### Task 5: Lint, Build, and Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: 0 warnings, 0 errors

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All tests pass, including the new `route.test.ts`

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit any lint/type fixes if needed**

If any earlier tasks introduced lint or type issues, fix and commit:
```bash
git add -A
git commit -m "fix: address lint/type issues from DOC-134"
```
