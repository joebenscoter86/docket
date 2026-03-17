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
