import { describe, it, expect, vi } from "vitest";
import {
  encodeCursor,
  decodeCursor,
  validateListParams,
  fetchInvoiceCounts,
  fetchInvoiceList,
} from "./queries";
import { SupabaseClient } from "@supabase/supabase-js";

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

  it("encodes numeric sort value", () => {
    const cursor = encodeCursor(100, "xyz-789");
    const decoded = JSON.parse(Buffer.from(cursor, "base64").toString());
    expect(decoded).toEqual({ s: 100, id: "xyz-789" });
  });
});

describe("decodeCursor", () => {
  it("decodes a valid cursor", () => {
    const cursor = encodeCursor("2026-03-16", "abc-123");
    expect(decodeCursor(cursor)).toEqual({ sortValue: "2026-03-16", id: "abc-123" });
  });

  it("decodes a numeric sort value", () => {
    const cursor = encodeCursor(100, "xyz-789");
    expect(decodeCursor(cursor)).toEqual({ sortValue: 100, id: "xyz-789" });
  });

  it("decodes a null sort value", () => {
    const cursor = encodeCursor(null, "abc-123");
    expect(decodeCursor(cursor)).toEqual({ sortValue: null, id: "abc-123" });
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

  it("returns null for empty string input", () => {
    expect(decodeCursor("")).toBeNull();
  });
});

describe("validateListParams", () => {
  it("returns defaults for empty params", () => {
    const result = validateListParams({});
    expect(result).toMatchObject({
      status: "all",
      sort: "uploaded_at",
      direction: "desc",
      cursor: undefined,
      limit: 25,
      output_type: "all",
      date_field: "uploaded_at",
      date_preset: undefined,
      date_from: undefined,
      date_to: undefined,
    });
  });

  it("accepts valid params", () => {
    const result = validateListParams({
      status: "approved",
      sort: "vendor_name",
      direction: "asc",
      limit: 10,
    });
    expect(result).toMatchObject({
      status: "approved",
      sort: "vendor_name",
      direction: "asc",
      cursor: undefined,
      limit: 10,
      output_type: "all",
    });
  });

  it("falls back to defaults for invalid params", () => {
    const result = validateListParams({
      status: "bogus",
      sort: "hacked",
      direction: "sideways",
      limit: 999,
    });
    expect(result).toMatchObject({
      status: "all",
      sort: "uploaded_at",
      direction: "desc",
      cursor: undefined,
      limit: 100,
      output_type: "all",
    });
  });

  it("clamps limit to 1 minimum", () => {
    const result = validateListParams({ limit: 0 });
    expect(result.limit).toBe(1);
  });

  it("clamps limit to MAX_LIMIT", () => {
    const result = validateListParams({ limit: 999 });
    expect(result.limit).toBe(100);
  });

  it("preserves valid cursor", () => {
    const cursor = encodeCursor("2026-03-16", "test-id");
    const result = validateListParams({ cursor });
    expect(result.cursor).toBe(cursor);
  });

  it("handles all valid statuses", () => {
    const statuses = ["all", "pending_review", "approved", "synced", "error"];
    statuses.forEach((status) => {
      const result = validateListParams({ status });
      expect(result.status).toBe(status);
    });
  });

  it("handles all valid sorts", () => {
    const sorts = ["uploaded_at", "invoice_date", "vendor_name", "total_amount"];
    sorts.forEach((sort) => {
      const result = validateListParams({ sort });
      expect(result.sort).toBe(sort);
    });
  });

  it("handles all valid directions", () => {
    const directions = ["asc", "desc"];
    directions.forEach((direction) => {
      const result = validateListParams({ direction });
      expect(result.direction).toBe(direction);
    });
  });
});

// Mock Supabase client
function createMockSupabase(
  overrides: {
    countData?: { status: string; count: number }[];
    countError?: { message: string };
    listData?: Record<string, unknown>[];
    listError?: { message: string };
  } = {}
) {
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

  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    then: vi.fn(),
  };

  const listResult = {
    data: overrides.listData ?? [],
    error: overrides.listError ?? null,
  };

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

const defaultListParams = {
  status: "all",
  sort: "uploaded_at",
  direction: "desc",
  limit: 25,
  output_type: "all",
  date_field: "uploaded_at",
};

describe("fetchInvoiceList", () => {
  it("calls from with invoice_list_view", async () => {
    const { client, mocks } = createMockSupabase();
    await fetchInvoiceList(client, defaultListParams);
    expect(mocks.from).toHaveBeenCalledWith("invoice_list_view");
    expect(mocks.query.select).toHaveBeenCalledWith(
      expect.stringContaining("vendor_name")
    );
  });

  it("applies status filter when not 'all'", async () => {
    const { client, mocks } = createMockSupabase();
    await fetchInvoiceList(client, { ...defaultListParams, status: "approved" });
    expect(mocks.query.eq).toHaveBeenCalledWith("status", "approved");
  });

  it("does not apply status filter for 'all'", async () => {
    const { client, mocks } = createMockSupabase();
    await fetchInvoiceList(client, defaultListParams);
    expect(mocks.query.eq).not.toHaveBeenCalled();
  });

  it("fetches limit + 1 rows to detect next page", async () => {
    const { client, mocks } = createMockSupabase();
    await fetchInvoiceList(client, defaultListParams);
    expect(mocks.query.limit).toHaveBeenCalledWith(26);
  });

  it("applies date_from filter on uploaded_at with timestamp", async () => {
    const { client, mocks } = createMockSupabase();
    await fetchInvoiceList(client, {
      ...defaultListParams,
      date_field: "uploaded_at",
      date_from: "2026-03-01",
    });
    expect(mocks.query.gte).toHaveBeenCalledWith("uploaded_at", "2026-03-01T00:00:00.000Z");
  });

  it("applies date_to filter on invoice_date directly", async () => {
    const { client, mocks } = createMockSupabase();
    await fetchInvoiceList(client, {
      ...defaultListParams,
      date_field: "invoice_date",
      date_to: "2026-03-31",
    });
    expect(mocks.query.lte).toHaveBeenCalledWith("invoice_date", "2026-03-31");
  });
});

describe("validateListParams date handling", () => {
  it("resolves today preset to today's date", () => {
    const result = validateListParams({ date_preset: "today" });
    const todayStr = new Date().toISOString().slice(0, 10);
    expect(result.date_from).toBe(todayStr);
    expect(result.date_to).toBe(todayStr);
    expect(result.date_preset).toBe("today");
  });

  it("resolves month preset to first of month", () => {
    const result = validateListParams({ date_preset: "month" });
    const todayStr = new Date().toISOString().slice(0, 10);
    expect(result.date_from).toBe(`${todayStr.slice(0, 7)}-01`);
    expect(result.date_to).toBe(todayStr);
  });

  it("accepts valid explicit date_from and date_to", () => {
    const result = validateListParams({
      date_from: "2026-01-15",
      date_to: "2026-02-15",
    });
    expect(result.date_from).toBe("2026-01-15");
    expect(result.date_to).toBe("2026-02-15");
    expect(result.date_preset).toBeUndefined();
  });

  it("rejects invalid date format", () => {
    const result = validateListParams({
      date_from: "not-a-date",
      date_to: "03/15/2026",
    });
    expect(result.date_from).toBeUndefined();
    expect(result.date_to).toBeUndefined();
  });

  it("validates date_field", () => {
    expect(validateListParams({ date_field: "invoice_date" }).date_field).toBe("invoice_date");
    expect(validateListParams({ date_field: "uploaded_at" }).date_field).toBe("uploaded_at");
    expect(validateListParams({ date_field: "hacked" }).date_field).toBe("uploaded_at");
  });

  it("preset overrides explicit dates", () => {
    const result = validateListParams({
      date_preset: "today",
      date_from: "2026-01-01",
      date_to: "2026-12-31",
    });
    const todayStr = new Date().toISOString().slice(0, 10);
    expect(result.date_from).toBe(todayStr);
    expect(result.date_to).toBe(todayStr);
  });
});
