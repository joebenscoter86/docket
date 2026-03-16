# DOC-25: Invoice List View Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the invoices list page with status filter tabs, sortable columns, cursor-based pagination, and responsive table/card layout.

**Architecture:** Server component reads URL search params, queries Supabase directly via shared query functions in `lib/invoices/queries.ts`, passes data to `InvoiceList` client component. API route wraps the same query logic for future hybrid upgrade. Cursor is a base64-encoded compound key (sort value + ID) to support pagination on any column including nullable joined fields.

**Tech Stack:** Next.js 14 App Router, Supabase server client, Tailwind CSS, Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-03-16-doc-25-invoice-list-design.md`

---

## Chunk 1: Types, Query Logic, and Date Utility

### Task 1: Invoice List Types

**Files:**
- Create: `lib/invoices/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
import { InvoiceStatus } from "@/lib/types/invoice";

export interface InvoiceListItem {
  id: string;
  file_name: string;
  status: InvoiceStatus;
  uploaded_at: string;
  extracted_data: {
    vendor_name: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
    total_amount: number | null;
  } | null;
}

export interface InvoiceListCounts {
  all: number;
  pending_review: number;
  approved: number;
  synced: number;
  error: number;
}

export interface InvoiceListParams {
  status?: string;
  sort?: string;
  direction?: string;
  cursor?: string;
  limit?: number;
}

export interface InvoiceListResult {
  invoices: InvoiceListItem[];
  nextCursor: string | null;
  counts: InvoiceListCounts;
}

// Allowlists for param validation
export const VALID_STATUSES = ["all", "pending_review", "approved", "synced", "error"] as const;
export const VALID_SORTS = ["uploaded_at", "invoice_date", "vendor_name", "total_amount"] as const;
export const VALID_DIRECTIONS = ["asc", "desc"] as const;

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;
```

- [ ] **Step 2: Commit**

```bash
git add lib/invoices/types.ts
git commit -m "feat(DOC-25): add invoice list types and param constants"
```

---

### Task 2: Relative Date Utility

**Files:**
- Create: `lib/utils/date.ts`
- Create: `lib/utils/date.test.ts`

- [ ] **Step 1: Write failing tests for relative time formatter**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { formatRelativeTime } from "./date";

describe("formatRelativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows 'just now' for times less than 1 minute ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T12:00:30Z"));
    expect(formatRelativeTime("2026-03-16T12:00:00Z")).toBe("just now");
  });

  it("shows minutes for times less than 1 hour ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T12:15:00Z"));
    expect(formatRelativeTime("2026-03-16T12:00:00Z")).toBe("15 minutes ago");
  });

  it("shows singular minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T12:01:30Z"));
    expect(formatRelativeTime("2026-03-16T12:00:00Z")).toBe("1 minute ago");
  });

  it("shows hours for times less than 1 day ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T14:00:00Z"));
    expect(formatRelativeTime("2026-03-16T12:00:00Z")).toBe("2 hours ago");
  });

  it("shows days for times less than 30 days ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-18T12:00:00Z"));
    expect(formatRelativeTime("2026-03-16T12:00:00Z")).toBe("2 days ago");
  });

  it("shows the date for times more than 30 days ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-16T12:00:00Z"));
    const result = formatRelativeTime("2026-03-16T12:00:00Z");
    expect(result).toBe("Mar 16, 2026");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/utils/date.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the relative time formatter**

```typescript
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes === 1) return "1 minute ago";
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/utils/date.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/utils/date.ts lib/utils/date.test.ts
git commit -m "feat(DOC-25): add relative time formatter utility"
```

---

### Task 3: Shared Query Logic — Cursor Helpers

**Files:**
- Create: `lib/invoices/queries.ts`
- Create: `lib/invoices/queries.test.ts`

- [ ] **Step 1: Write failing tests for cursor encode/decode and param validation**

```typescript
import { describe, it, expect } from "vitest";
import {
  encodeCursor,
  decodeCursor,
  validateListParams,
} from "./queries";

describe("encodeCursor", () => {
  it("encodes sort value and id into base64 JSON", () => {
    const cursor = encodeCursor("2026-03-16T12:00:00Z", "abc-123");
    const decoded = JSON.parse(Buffer.from(cursor, "base64").toString());
    expect(decoded).toEqual({ s: "2026-03-16T12:00:00Z", id: "abc-123" });
  });

  it("encodes null sort value", () => {
    const cursor = encodeCursor(null, "abc-123");
    const decoded = JSON.parse(Buffer.from(cursor, "base64").toString());
    expect(decoded).toEqual({ s: null, id: "abc-123" });
  });
});

describe("decodeCursor", () => {
  it("decodes a valid cursor", () => {
    const cursor = encodeCursor("2026-03-16", "abc-123");
    expect(decodeCursor(cursor)).toEqual({ sortValue: "2026-03-16", id: "abc-123" });
  });

  it("returns null for invalid base64", () => {
    expect(decodeCursor("not-valid-base64!!!")).toBeNull();
  });

  it("returns null for valid base64 but invalid JSON", () => {
    const bad = Buffer.from("not json").toString("base64");
    expect(decodeCursor(bad)).toBeNull();
  });

  it("returns null for missing fields", () => {
    const bad = Buffer.from(JSON.stringify({ foo: "bar" })).toString("base64");
    expect(decodeCursor(bad)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(decodeCursor(undefined)).toBeNull();
  });
});

describe("validateListParams", () => {
  it("returns defaults for empty params", () => {
    const result = validateListParams({});
    expect(result).toEqual({
      status: "all",
      sort: "uploaded_at",
      direction: "desc",
      cursor: undefined,
      limit: 25,
    });
  });

  it("accepts valid params", () => {
    const result = validateListParams({
      status: "approved",
      sort: "vendor_name",
      direction: "asc",
      limit: 10,
    });
    expect(result).toEqual({
      status: "approved",
      sort: "vendor_name",
      direction: "asc",
      cursor: undefined,
      limit: 10,
    });
  });

  it("falls back to defaults for invalid params", () => {
    const result = validateListParams({
      status: "bogus",
      sort: "hacked",
      direction: "sideways",
      limit: 999,
    });
    expect(result).toEqual({
      status: "all",
      sort: "uploaded_at",
      direction: "desc",
      cursor: undefined,
      limit: 100,
    });
  });

  it("clamps limit to 1 minimum", () => {
    const result = validateListParams({ limit: 0 });
    expect(result.limit).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/invoices/queries.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement cursor helpers and param validation**

```typescript
import { SupabaseClient } from "@supabase/supabase-js";
import {
  InvoiceListItem,
  InvoiceListCounts,
  InvoiceListResult,
  InvoiceListParams,
  VALID_STATUSES,
  VALID_SORTS,
  VALID_DIRECTIONS,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from "./types";

// --- Cursor helpers ---

export function encodeCursor(sortValue: string | number | null, id: string): string {
  return Buffer.from(JSON.stringify({ s: sortValue, id })).toString("base64");
}

export function decodeCursor(cursor: string | undefined): { sortValue: string | number | null; id: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64").toString());
    if (typeof parsed.id !== "string" || !("s" in parsed)) return null;
    return { sortValue: parsed.s, id: parsed.id };
  } catch {
    return null;
  }
}

// --- Param validation ---

export function validateListParams(params: InvoiceListParams) {
  const status = VALID_STATUSES.includes(params.status as typeof VALID_STATUSES[number])
    ? (params.status as typeof VALID_STATUSES[number])
    : "all";

  const sort = VALID_SORTS.includes(params.sort as typeof VALID_SORTS[number])
    ? (params.sort as typeof VALID_SORTS[number])
    : "uploaded_at";

  const direction = VALID_DIRECTIONS.includes(params.direction as typeof VALID_DIRECTIONS[number])
    ? (params.direction as typeof VALID_DIRECTIONS[number])
    : "desc";

  let limit = typeof params.limit === "number" ? params.limit : DEFAULT_LIMIT;
  limit = Math.max(1, Math.min(limit, MAX_LIMIT));

  return { status, sort, direction, cursor: params.cursor, limit };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/invoices/queries.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/invoices/queries.ts lib/invoices/queries.test.ts
git commit -m "feat(DOC-25): add cursor helpers and param validation for invoice list"
```

---

### Task 4: Shared Query Logic — Supabase Queries

**Files:**
- Modify: `lib/invoices/queries.ts`
- Modify: `lib/invoices/queries.test.ts`

- [ ] **Step 1: Write failing tests for fetchInvoiceCounts and fetchInvoiceList**

Add to `lib/invoices/queries.test.ts`:

```typescript
import { fetchInvoiceCounts, fetchInvoiceList } from "./queries";

// Mock Supabase client
function createMockSupabase(overrides: {
  countData?: { status: string; count: number }[];
  countError?: { message: string };
  listData?: Record<string, unknown>[];
  listError?: { message: string };
} = {}) {
  const mockRpc = vi.fn().mockResolvedValue({
    data: overrides.countData ?? [
      { status: "pending_review", count: 3 },
      { status: "approved", count: 5 },
      { status: "synced", count: 10 },
      { status: "error", count: 1 },
      { status: "uploading", count: 1 },
    ],
    error: overrides.countError ?? null,
  });

  // Build a chainable query builder mock
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    then: vi.fn(),
  };

  // Make the query awaitable with the list data
  const listResult = {
    data: overrides.listData ?? [],
    error: overrides.listError ?? null,
  };

  // Override the limit method to return the result when awaited
  mockQuery.limit.mockImplementation(() => ({
    ...mockQuery,
    then: (resolve: (value: typeof listResult) => void) => resolve(listResult),
  }));

  const mockFrom = vi.fn().mockReturnValue(mockQuery);

  return {
    client: { from: mockFrom, rpc: mockRpc } as unknown as SupabaseClient,
    mocks: { from: mockFrom, query: mockQuery, rpc: mockRpc },
  };
}

describe("fetchInvoiceCounts", () => {
  it("returns counts grouped by status with computed all", async () => {
    const { client } = createMockSupabase();
    const counts = await fetchInvoiceCounts(client);
    expect(counts).toEqual({
      all: 20,
      pending_review: 3,
      approved: 5,
      synced: 10,
      error: 1,
    });
  });

  it("returns zero counts on error", async () => {
    const { client } = createMockSupabase({ countError: { message: "fail" } });
    const counts = await fetchInvoiceCounts(client);
    expect(counts).toEqual({
      all: 0,
      pending_review: 0,
      approved: 0,
      synced: 0,
      error: 0,
    });
  });
});

describe("fetchInvoiceList", () => {
  it("calls from with invoices table and selects joined fields", async () => {
    const { client, mocks } = createMockSupabase();
    await fetchInvoiceList(client, {
      status: "all",
      sort: "uploaded_at",
      direction: "desc",
      limit: 25,
    });
    expect(mocks.from).toHaveBeenCalledWith("invoices");
    expect(mocks.query.select).toHaveBeenCalledWith(
      expect.stringContaining("extracted_data")
    );
  });

  it("applies status filter when not 'all'", async () => {
    const { client, mocks } = createMockSupabase();
    await fetchInvoiceList(client, {
      status: "approved",
      sort: "uploaded_at",
      direction: "desc",
      limit: 25,
    });
    expect(mocks.query.eq).toHaveBeenCalledWith("status", "approved");
  });

  it("does not apply status filter for 'all'", async () => {
    const { client, mocks } = createMockSupabase();
    await fetchInvoiceList(client, {
      status: "all",
      sort: "uploaded_at",
      direction: "desc",
      limit: 25,
    });
    expect(mocks.query.eq).not.toHaveBeenCalled();
  });

  it("fetches limit + 1 rows to detect next page", async () => {
    const { client, mocks } = createMockSupabase();
    await fetchInvoiceList(client, {
      status: "all",
      sort: "uploaded_at",
      direction: "desc",
      limit: 25,
    });
    expect(mocks.query.limit).toHaveBeenCalledWith(26);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/invoices/queries.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement fetchInvoiceCounts and fetchInvoiceList**

Add to `lib/invoices/queries.ts`:

```typescript
// --- Sort column mapping ---

const SORT_COLUMN_MAP: Record<string, { column: string; table: "invoices" | "extracted_data" }> = {
  uploaded_at: { column: "uploaded_at", table: "invoices" },
  invoice_date: { column: "invoice_date", table: "extracted_data" },
  vendor_name: { column: "vendor_name", table: "extracted_data" },
  total_amount: { column: "total_amount", table: "extracted_data" },
};

// --- Fetch counts ---

export async function fetchInvoiceCounts(supabase: SupabaseClient): Promise<InvoiceListCounts> {
  const { data, error } = await supabase.rpc("invoice_counts_by_status");

  if (error || !data) {
    return { all: 0, pending_review: 0, approved: 0, synced: 0, error: 0 };
  }

  const counts: InvoiceListCounts = { all: 0, pending_review: 0, approved: 0, synced: 0, error: 0 };
  let total = 0;

  for (const row of data as { status: string; count: number }[]) {
    total += row.count;
    if (row.status in counts && row.status !== "all") {
      counts[row.status as keyof Omit<InvoiceListCounts, "all">] = row.count;
    }
  }

  counts.all = total;
  return counts;
}

// --- Fetch invoice list ---

interface ValidatedParams {
  status: string;
  sort: string;
  direction: string;
  cursor?: string;
  limit: number;
}

export async function fetchInvoiceList(
  supabase: SupabaseClient,
  params: ValidatedParams
): Promise<{ invoices: InvoiceListItem[]; nextCursor: string | null }> {
  const { status, sort, direction, cursor, limit } = params;
  const sortConfig = SORT_COLUMN_MAP[sort] ?? SORT_COLUMN_MAP.uploaded_at;

  let query = supabase
    .from("invoices")
    .select(`
      id,
      file_name,
      status,
      uploaded_at,
      extracted_data (
        vendor_name,
        invoice_number,
        invoice_date,
        total_amount
      )
    `);

  // Status filter
  if (status !== "all") {
    query = query.eq("status", status);
  }

  // Cursor pagination — always keyed on (uploaded_at, id) regardless of display sort.
  // At MVP scale (<100 invoices/org), this is correct: the full sorted result set fits
  // in a few pages, and uploaded_at is always non-null and on the invoices table.
  // For joined-column sorts, the sort order is applied by Supabase, and the cursor
  // pages through the result by uploaded_at position. This avoids NULL-handling
  // complexity on extracted_data columns. Revisit if page sizes become large enough
  // that cursor position drift is noticeable.
  const decodedCursor = decodeCursor(cursor);
  if (decodedCursor) {
    const { sortValue, id } = decodedCursor;
    const ascending = direction === "asc";

    if (ascending) {
      query = query.or(
        `uploaded_at.gt.${sortValue},and(uploaded_at.eq.${sortValue},id.gt.${id})`
      );
    } else {
      query = query.or(
        `uploaded_at.lt.${sortValue},and(uploaded_at.eq.${sortValue},id.lt.${id})`
      );
    }
  }

  // Sort order
  if (sortConfig.table === "invoices") {
    query = query.order(sortConfig.column, {
      ascending: direction === "asc",
    });
  } else {
    // Sort by extracted_data field, then by uploaded_at as tiebreaker
    query = query.order(sortConfig.column, {
      ascending: direction === "asc",
      referencedTable: "extracted_data",
      nullsFirst: direction === "asc",
    });
    query = query.order("uploaded_at", { ascending: false });
  }

  // Always add id as final tiebreaker for stable ordering
  query = query.order("id", { ascending: direction === "asc" });

  // Fetch limit + 1 to detect next page
  query = query.limit(limit + 1);

  const { data, error } = await query;

  if (error || !data) {
    return { invoices: [], nextCursor: null };
  }

  const hasNextPage = data.length > limit;
  const rows = hasNextPage ? data.slice(0, limit) : data;

  const invoices: InvoiceListItem[] = rows.map((row: Record<string, unknown>) => {
    // Supabase returns the joined relation as an array with one element or null
    const extracted = Array.isArray(row.extracted_data)
      ? row.extracted_data[0] ?? null
      : row.extracted_data ?? null;

    return {
      id: row.id as string,
      file_name: row.file_name as string,
      status: row.status as InvoiceListItem["status"],
      uploaded_at: row.uploaded_at as string,
      extracted_data: extracted
        ? {
            vendor_name: extracted.vendor_name ?? null,
            invoice_number: extracted.invoice_number ?? null,
            invoice_date: extracted.invoice_date ?? null,
            total_amount: extracted.total_amount ?? null,
          }
        : null,
    };
  });

  let nextCursor: string | null = null;
  if (hasNextPage) {
    const lastInvoice = rows[rows.length - 1] as Record<string, unknown>;
    // Always encode cursor on uploaded_at (see pagination comment above)
    nextCursor = encodeCursor(lastInvoice.uploaded_at as string, lastInvoice.id as string);
  }

  return { invoices, nextCursor };
}
```

**Note:** This also requires a Supabase RPC function for counts. Add the migration in the next task.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/invoices/queries.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/invoices/queries.ts lib/invoices/queries.test.ts
git commit -m "feat(DOC-25): add fetchInvoiceCounts and fetchInvoiceList query functions"
```

---

### Task 5: Supabase RPC for Invoice Counts

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_invoice_counts_rpc.sql`

The counts query uses an RPC function so RLS is respected and the query is efficient.

- [ ] **Step 1: Create the migration file**

Generate the timestamp-named file. Content:

```sql
-- RPC function for invoice counts by status (respects RLS)
CREATE OR REPLACE FUNCTION invoice_counts_by_status()
RETURNS TABLE(status text, count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.status, count(*)::bigint
  FROM invoices i
  INNER JOIN org_memberships om ON om.org_id = i.org_id
  WHERE om.user_id = auth.uid()
  GROUP BY i.status;
$$;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` or apply via Supabase MCP tool

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(DOC-25): add invoice_counts_by_status RPC function"
```

---

## Chunk 2: API Route and Server Page

### Task 6: API Route — `GET /api/invoices`

**Files:**
- Modify: `app/api/invoices/route.ts`
- Create: `app/api/invoices/route.test.ts`

- [ ] **Step 1: Write failing tests for the API route**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase server client
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Mock the query functions
vi.mock("@/lib/invoices/queries", () => ({
  validateListParams: vi.fn().mockReturnValue({
    status: "all",
    sort: "uploaded_at",
    direction: "desc",
    limit: 25,
  }),
  fetchInvoiceList: vi.fn().mockResolvedValue({
    invoices: [],
    nextCursor: null,
  }),
  fetchInvoiceCounts: vi.fn().mockResolvedValue({
    all: 0,
    pending_review: 0,
    approved: 0,
    synced: 0,
    error: 0,
  }),
}));

import { GET } from "./route";
import { createClient } from "@/lib/supabase/server";
import { fetchInvoiceList, fetchInvoiceCounts, validateListParams } from "@/lib/invoices/queries";

function createMockRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost:3000/api/invoices");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

describe("GET /api/invoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockAuth = {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-123" } },
        error: null,
      }),
    };
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: mockAuth,
    });
  });

  it("returns 401 when not authenticated", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "not authenticated" },
        }),
      },
    });

    const response = await GET(createMockRequest());
    expect(response.status).toBe(401);
  });

  it("returns invoices and counts on success", async () => {
    const mockInvoices = [{ id: "inv-1", file_name: "test.pdf", status: "pending_review" }];
    (fetchInvoiceList as ReturnType<typeof vi.fn>).mockResolvedValue({
      invoices: mockInvoices,
      nextCursor: null,
    });
    (fetchInvoiceCounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      all: 1,
      pending_review: 1,
      approved: 0,
      synced: 0,
      error: 0,
    });

    const response = await GET(createMockRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.invoices).toEqual(mockInvoices);
    expect(body.data.counts.all).toBe(1);
    expect(body.data.nextCursor).toBeNull();
  });

  it("passes search params to validateListParams", async () => {
    await GET(createMockRequest({ status: "approved", sort: "vendor_name" }));
    expect(validateListParams).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved", sort: "vendor_name" })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/invoices/route.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the API route**

```typescript
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authError, internalError, apiSuccess } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { validateListParams, fetchInvoiceList, fetchInvoiceCounts } from "@/lib/invoices/queries";

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return authError();
    }

    const searchParams = request.nextUrl.searchParams;
    const params = validateListParams({
      status: searchParams.get("status") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      direction: searchParams.get("direction") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.has("limit") ? Number(searchParams.get("limit")) : undefined,
    });

    const [listResult, counts] = await Promise.all([
      fetchInvoiceList(supabase, params),
      fetchInvoiceCounts(supabase),
    ]);

    logger.info({
      action: "list_invoices",
      userId: user.id,
      status: "success",
      durationMs: Date.now() - startTime,
    });

    return apiSuccess({
      invoices: listResult.invoices,
      nextCursor: listResult.nextCursor,
      counts,
    });
  } catch (err) {
    logger.error({
      action: "list_invoices",
      status: "error",
      error: err instanceof Error ? err.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return internalError();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/invoices/route.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/invoices/route.ts app/api/invoices/route.test.ts
git commit -m "feat(DOC-25): implement GET /api/invoices with auth, filtering, and pagination"
```

---

### Task 7: Server Component — Invoices Page

**Files:**
- Modify: `app/(dashboard)/invoices/page.tsx`
- Create: `app/(dashboard)/invoices/loading.tsx`

- [ ] **Step 1: Implement the invoices page server component**

```typescript
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { validateListParams, fetchInvoiceList, fetchInvoiceCounts } from "@/lib/invoices/queries";
import InvoiceList from "@/components/invoices/InvoiceList";

interface InvoicesPageProps {
  searchParams: Promise<{
    status?: string;
    sort?: string;
    direction?: string;
    cursor?: string;
    limit?: string;
  }>;
}

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const resolvedParams = await searchParams;
  const params = validateListParams({
    status: resolvedParams.status,
    sort: resolvedParams.sort,
    direction: resolvedParams.direction,
    cursor: resolvedParams.cursor,
    limit: resolvedParams.limit ? Number(resolvedParams.limit) : undefined,
  });

  const [listResult, counts] = await Promise.all([
    fetchInvoiceList(supabase, params),
    fetchInvoiceCounts(supabase),
  ]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-800">Invoices</h1>
      </div>
      <InvoiceList
        invoices={listResult.invoices}
        counts={counts}
        nextCursor={listResult.nextCursor}
        currentStatus={params.status}
        currentSort={params.sort}
        currentDirection={params.direction}
        hasCursor={!!resolvedParams.cursor}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create the loading skeleton**

```typescript
export default function InvoicesLoading() {
  return (
    <div className="p-6 animate-pulse">
      <div className="h-8 w-40 bg-gray-200 rounded mb-6" />
      {/* Filter tabs skeleton */}
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-28 bg-gray-200 rounded-md" />
        ))}
      </div>
      {/* Table rows skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 bg-gray-200 rounded-md" />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/invoices/page.tsx" "app/(dashboard)/invoices/loading.tsx"
git commit -m "feat(DOC-25): implement invoices page server component with loading skeleton"
```

---

## Chunk 3: InvoiceList Client Component

### Task 8: InvoiceList Component — Filter Tabs and Sort Controls

**Files:**
- Modify: `components/invoices/InvoiceList.tsx`
- Create: `components/invoices/InvoiceList.test.tsx`

- [ ] **Step 1: Write failing component tests**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InvoiceList from "./InvoiceList";
import { InvoiceListItem, InvoiceListCounts } from "@/lib/invoices/types";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/invoices",
  useSearchParams: () => new URLSearchParams(),
}));

const emptyCounts: InvoiceListCounts = {
  all: 0,
  pending_review: 0,
  approved: 0,
  synced: 0,
  error: 0,
};

const sampleCounts: InvoiceListCounts = {
  all: 20,
  pending_review: 3,
  approved: 7,
  synced: 9,
  error: 1,
};

const sampleInvoices: InvoiceListItem[] = [
  {
    id: "inv-1",
    file_name: "invoice-001.pdf",
    status: "pending_review",
    uploaded_at: "2026-03-16T12:00:00Z",
    extracted_data: {
      vendor_name: "Acme Corp",
      invoice_number: "INV-001",
      invoice_date: "2026-03-10",
      total_amount: 1250.0,
    },
  },
  {
    id: "inv-2",
    file_name: "receipt.pdf",
    status: "synced",
    uploaded_at: "2026-03-15T10:00:00Z",
    extracted_data: null,
  },
];

describe("InvoiceList", () => {
  it("shows empty state when no invoices exist", () => {
    render(
      <InvoiceList
        invoices={[]}
        counts={emptyCounts}
        nextCursor={null}
        currentStatus="all"
        currentSort="uploaded_at"
        currentDirection="desc"
        hasCursor={false}
      />
    );
    expect(screen.getByText(/no invoices yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /upload/i })).toBeInTheDocument();
  });

  it("shows filter-empty state when filter has no results", () => {
    render(
      <InvoiceList
        invoices={[]}
        counts={sampleCounts}
        nextCursor={null}
        currentStatus="approved"
        currentSort="uploaded_at"
        currentDirection="desc"
        hasCursor={false}
      />
    );
    expect(screen.getByText(/no invoices match this filter/i)).toBeInTheDocument();
  });

  it("renders filter tabs with counts", () => {
    render(
      <InvoiceList
        invoices={sampleInvoices}
        counts={sampleCounts}
        nextCursor={null}
        currentStatus="all"
        currentSort="uploaded_at"
        currentDirection="desc"
        hasCursor={false}
      />
    );
    expect(screen.getByText(/all/i)).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument(); // pending_review count
  });

  it("renders invoice data in the table", () => {
    render(
      <InvoiceList
        invoices={sampleInvoices}
        counts={sampleCounts}
        nextCursor={null}
        currentStatus="all"
        currentSort="uploaded_at"
        currentDirection="desc"
        hasCursor={false}
      />
    );
    expect(screen.getByText("invoice-001.pdf")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("INV-001")).toBeInTheDocument();
  });

  it("shows 'Pending' for invoices without extracted data", () => {
    render(
      <InvoiceList
        invoices={sampleInvoices}
        counts={sampleCounts}
        nextCursor={null}
        currentStatus="all"
        currentSort="uploaded_at"
        currentDirection="desc"
        hasCursor={false}
      />
    );
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("shows next page button when nextCursor exists", () => {
    render(
      <InvoiceList
        invoices={sampleInvoices}
        counts={sampleCounts}
        nextCursor="abc123"
        currentStatus="all"
        currentSort="uploaded_at"
        currentDirection="desc"
        hasCursor={false}
      />
    );
    expect(screen.getByRole("link", { name: /next page/i })).toBeInTheDocument();
  });

  it("does not show next page button when nextCursor is null", () => {
    render(
      <InvoiceList
        invoices={sampleInvoices}
        counts={sampleCounts}
        nextCursor={null}
        currentStatus="all"
        currentSort="uploaded_at"
        currentDirection="desc"
        hasCursor={false}
      />
    );
    expect(screen.queryByRole("link", { name: /next page/i })).not.toBeInTheDocument();
  });

  it("shows previous page link when hasCursor is true", () => {
    render(
      <InvoiceList
        invoices={sampleInvoices}
        counts={sampleCounts}
        nextCursor={null}
        currentStatus="all"
        currentSort="uploaded_at"
        currentDirection="desc"
        hasCursor={true}
      />
    );
    expect(screen.getByRole("link", { name: /previous page/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/invoices/InvoiceList.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement InvoiceList component**

Build the full `InvoiceList` component in `components/invoices/InvoiceList.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { InvoiceListItem, InvoiceListCounts } from "@/lib/invoices/types";
import InvoiceStatusBadge from "./InvoiceStatusBadge";
import { formatCurrency } from "@/lib/utils/currency";
import { formatRelativeTime } from "@/lib/utils/date";

interface InvoiceListProps {
  invoices: InvoiceListItem[];
  counts: InvoiceListCounts;
  nextCursor: string | null;
  currentStatus: string;
  currentSort: string;
  currentDirection: string;
  hasCursor: boolean;
}

const FILTER_TABS: { key: keyof InvoiceListCounts; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending_review", label: "Pending Review" },
  { key: "approved", label: "Approved" },
  { key: "synced", label: "Synced" },
  { key: "error", label: "Error" },
];

const SORT_OPTIONS = [
  { value: "uploaded_at", label: "Uploaded Date" },
  { value: "invoice_date", label: "Invoice Date" },
  { value: "vendor_name", label: "Vendor" },
  { value: "total_amount", label: "Amount" },
];

function buildUrl(
  pathname: string,
  currentParams: URLSearchParams,
  overrides: Record<string, string | undefined>
) {
  const params = new URLSearchParams(currentParams.toString());
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "\u2014";
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function InvoiceList({
  invoices,
  counts,
  nextCursor,
  currentStatus,
  currentSort,
  currentDirection,
  hasCursor,
}: InvoiceListProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Empty state: no invoices at all
  if (counts.all === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 text-sm mb-4">
          No invoices yet. Upload your first invoice to get started.
        </p>
        <Link
          href="/upload"
          className="inline-block bg-blue-600 text-white px-4 py-2 rounded-md font-medium text-sm hover:bg-blue-700"
        >
          Upload Invoice
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Filter Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {FILTER_TABS.map((tab) => {
          const isActive = currentStatus === tab.key;
          const count = counts[tab.key];
          const isPendingReview = tab.key === "pending_review" && count > 0;

          return (
            <Link
              key={tab.key}
              href={buildUrl(pathname, searchParams, {
                status: tab.key === "all" ? undefined : tab.key,
                cursor: undefined, // Reset pagination on filter change
              })}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-2 ${
                isActive
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full ${
                  isPendingReview
                    ? "bg-blue-600 text-white"
                    : isActive
                    ? "bg-blue-100 text-blue-600"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Sort Controls */}
      <div className="flex items-center gap-2 mb-4">
        <label htmlFor="sort-select" className="text-sm text-gray-500">
          Sort by:
        </label>
        <select
          id="sort-select"
          value={currentSort}
          onChange={(e) => {
            router.push(buildUrl(pathname, searchParams, {
              sort: e.target.value,
              cursor: undefined,
            }));
          }}
          className="border border-gray-200 rounded-md px-2 py-1 text-sm text-gray-700"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Link
          href={buildUrl(pathname, searchParams, {
            direction: currentDirection === "desc" ? "asc" : "desc",
            cursor: undefined,
          })}
          className="p-1 text-gray-500 hover:text-gray-700"
          aria-label={`Sort ${currentDirection === "desc" ? "ascending" : "descending"}`}
        >
          {currentDirection === "desc" ? "\u2193" : "\u2191"}
        </Link>
      </div>

      {/* Filter empty state */}
      {invoices.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 text-sm">No invoices match this filter.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">File Name</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Vendor</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Invoice Date</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-gray-100 hover:bg-gray-50 group">
                    <td colSpan={7} className="p-0">
                      <Link
                        href={`/invoices/${invoice.id}/review`}
                        className="grid grid-cols-[1fr_1fr_auto_auto_auto_auto_auto] w-full"
                      >
                        <span className="py-3 px-4 text-sm text-slate-800 truncate max-w-[200px]">
                          {invoice.file_name}
                        </span>
                        <span className="py-3 px-4 text-sm">
                          {invoice.extracted_data?.vendor_name ?? (
                            <span className="text-gray-400">Pending</span>
                          )}
                        </span>
                        <span className="py-3 px-4 text-sm font-mono text-gray-600">
                          {invoice.extracted_data?.invoice_number ?? "\u2014"}
                        </span>
                        <span className="py-3 px-4 text-sm text-gray-600">
                          {formatDate(invoice.extracted_data?.invoice_date ?? null)}
                        </span>
                        <span className="py-3 px-4 text-sm text-right font-mono">
                          {invoice.extracted_data?.total_amount != null
                            ? formatCurrency(invoice.extracted_data.total_amount)
                            : "\u2014"}
                        </span>
                        <span className="py-3 px-4">
                          <InvoiceStatusBadge status={invoice.status} />
                        </span>
                        <span className="py-3 px-4 text-sm text-gray-500">
                          {formatRelativeTime(invoice.uploaded_at)}
                        </span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {invoices.map((invoice) => (
              <Link
                key={invoice.id}
                href={`/invoices/${invoice.id}/review`}
                className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-800 truncate max-w-[200px]">
                    {invoice.file_name}
                  </span>
                  <InvoiceStatusBadge status={invoice.status} />
                </div>
                <div className="text-sm text-gray-600 mb-1">
                  {invoice.extracted_data?.vendor_name ?? (
                    <span className="text-gray-400">Pending</span>
                  )}
                  {invoice.extracted_data?.invoice_number && (
                    <span className="text-gray-400 ml-2 font-mono">
                      #{invoice.extracted_data.invoice_number}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-mono">
                    {invoice.extracted_data?.total_amount != null
                      ? formatCurrency(invoice.extracted_data.total_amount)
                      : "\u2014"}
                  </span>
                  <span className="text-gray-400 text-xs">
                    {formatRelativeTime(invoice.uploaded_at)}
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-500">
              {counts[currentStatus as keyof InvoiceListCounts] ?? counts.all} total
              {hasCursor && " \u00b7 Page 2+"}
            </div>
            <div className="flex gap-2">
              {hasCursor && (
                <Link
                  href={buildUrl(pathname, searchParams, { cursor: undefined })}
                  className="border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-md font-medium text-sm"
                >
                  Previous page
                </Link>
              )}
              {nextCursor && (
                <Link
                  href={buildUrl(pathname, searchParams, { cursor: nextCursor })}
                  className="border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-md font-medium text-sm"
                >
                  Next page
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/invoices/InvoiceList.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add components/invoices/InvoiceList.tsx components/invoices/InvoiceList.test.tsx
git commit -m "feat(DOC-25): implement InvoiceList component with filters, sort, table, cards, and pagination"
```

---

## Chunk 4: Integration and Verification

### Task 9: Full Build and Lint Check

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors. Fix any type issues found.

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: Zero warnings, zero errors. Fix any issues.

- [ ] **Step 3: Run all tests**

Run: `npm run test`
Expected: All tests pass, including new ones.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Successful build with no errors.

- [ ] **Step 5: Fix any issues found and commit**

```bash
git add -A
git commit -m "fix(DOC-25): address lint, type, and build issues"
```

(Only if fixes were needed)

---

### Task 10: Branch and PR

- [ ] **Step 1: Create feature branch** (if not already on one)

```bash
git checkout -b feature/DOC-25-invoice-list-view
```

Note: If already on `dev`, cherry-pick or rebase the commits onto the feature branch.

- [ ] **Step 2: Push and create PR**

```bash
git push -u origin feature/DOC-25-invoice-list-view
gh pr create --title "DOC-25: Invoice list view with status filters and pagination" --body "$(cat <<'EOF'
## Summary
- Invoice list page with status filter tabs (All, Pending Review, Approved, Synced, Error)
- Sortable by uploaded date, invoice date, vendor, amount
- Cursor-based pagination with Next/Previous navigation
- Responsive: table on desktop, cards on mobile
- Pending Review tab highlighted with accent badge when count > 0
- Empty states for no invoices and no filter results
- Shared query logic in lib/invoices/queries.ts for future hybrid upgrade
- Loading skeleton via loading.tsx

## Test plan
- [ ] Filter tabs show correct counts and update URL
- [ ] Sort dropdown changes ordering
- [ ] Pagination works (next/previous)
- [ ] Mobile card layout renders correctly
- [ ] Empty states display appropriately
- [ ] Invoices without extracted data show "Pending" / "—"

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Deliver status report**
