import { describe, it, expect } from "vitest";
import { validatePrefix, buildAddress, RESERVED_PREFIXES } from "./prefix-validation";

describe("validatePrefix", () => {
  it("accepts a valid lowercase alphanumeric prefix", () => {
    expect(validatePrefix("jdr")).toEqual({ valid: true });
  });

  it("accepts hyphens in the middle", () => {
    expect(validatePrefix("my-invoices")).toEqual({ valid: true });
  });

  it("accepts exactly 3 characters (minimum)", () => {
    expect(validatePrefix("abc")).toEqual({ valid: true });
  });

  it("accepts exactly 20 characters (maximum)", () => {
    expect(validatePrefix("a".repeat(20))).toEqual({ valid: true });
  });

  it("rejects fewer than 3 characters", () => {
    const result = validatePrefix("ab");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("at least 3");
  });

  it("rejects more than 20 characters", () => {
    const result = validatePrefix("a".repeat(21));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("20 characters");
  });

  it("rejects uppercase letters by normalizing to lowercase", () => {
    expect(validatePrefix("JDR")).toEqual({ valid: true });
  });

  it("rejects spaces", () => {
    const result = validatePrefix("my prefix");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("letters, numbers, and hyphens");
  });

  it("rejects dots", () => {
    const result = validatePrefix("my.prefix");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("letters, numbers, and hyphens");
  });

  it("rejects underscores", () => {
    const result = validatePrefix("my_prefix");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("letters, numbers, and hyphens");
  });

  it("rejects leading hyphen", () => {
    const result = validatePrefix("-abc");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("start or end with a hyphen");
  });

  it("rejects trailing hyphen", () => {
    const result = validatePrefix("abc-");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("start or end with a hyphen");
  });

  it("rejects reserved prefix 'admin'", () => {
    const result = validatePrefix("admin");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("reserved");
  });

  it("rejects reserved prefix 'support' (case-insensitive)", () => {
    const result = validatePrefix("Support");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("reserved");
  });

  it("rejects empty string", () => {
    const result = validatePrefix("");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("at least 3");
  });

  it("rejects all reserved prefixes", () => {
    for (const reserved of RESERVED_PREFIXES) {
      const result = validatePrefix(reserved);
      expect(result.valid).toBe(false);
    }
  });
});

describe("buildAddress", () => {
  it("builds a full address from a prefix", () => {
    expect(buildAddress("jdr")).toBe("jdr@ingest.dockett.app");
  });

  it("lowercases the prefix", () => {
    expect(buildAddress("JDR")).toBe("jdr@ingest.dockett.app");
  });
});
