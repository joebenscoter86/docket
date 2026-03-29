import { describe, it, expect } from "vitest";
import { validatePrefix, buildAddress, RESERVED_PREFIXES, type ValidationResult } from "./prefix-validation";

/** Narrow a ValidationResult to its error branch for test assertions. */
function expectInvalid(result: ValidationResult): { valid: false; error: string } {
  expect(result.valid).toBe(false);
  return result as { valid: false; error: string };
}

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
    const result = expectInvalid(validatePrefix("ab"));
    expect(result.error).toContain("at least 3");
  });

  it("rejects more than 20 characters", () => {
    const result = expectInvalid(validatePrefix("a".repeat(21)));
    expect(result.error).toContain("20 characters");
  });

  it("rejects uppercase letters by normalizing to lowercase", () => {
    expect(validatePrefix("JDR")).toEqual({ valid: true });
  });

  it("rejects spaces", () => {
    const result = expectInvalid(validatePrefix("my prefix"));
    expect(result.error).toContain("letters, numbers, and hyphens");
  });

  it("rejects dots", () => {
    const result = expectInvalid(validatePrefix("my.prefix"));
    expect(result.error).toContain("letters, numbers, and hyphens");
  });

  it("rejects underscores", () => {
    const result = expectInvalid(validatePrefix("my_prefix"));
    expect(result.error).toContain("letters, numbers, and hyphens");
  });

  it("rejects leading hyphen", () => {
    const result = expectInvalid(validatePrefix("-abc"));
    expect(result.error).toContain("start or end with a hyphen");
  });

  it("rejects trailing hyphen", () => {
    const result = expectInvalid(validatePrefix("abc-"));
    expect(result.error).toContain("start or end with a hyphen");
  });

  it("rejects reserved prefix 'admin'", () => {
    const result = expectInvalid(validatePrefix("admin"));
    expect(result.error).toContain("reserved");
  });

  it("rejects reserved prefix 'support' (case-insensitive)", () => {
    const result = expectInvalid(validatePrefix("Support"));
    expect(result.error).toContain("reserved");
  });

  it("rejects empty string", () => {
    const result = expectInvalid(validatePrefix(""));
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
