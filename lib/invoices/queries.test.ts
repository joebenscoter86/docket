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
