import { describe, it, expect } from "vitest";
import { formatCurrency, parseCurrencyInput, getCurrencySymbol } from "./currency";

describe("getCurrencySymbol", () => {
  it("returns $ for USD", () => {
    expect(getCurrencySymbol("USD")).toBe("$");
  });
  it("returns $ for CAD", () => {
    expect(getCurrencySymbol("CAD")).toBe("$");
  });
  it("returns $ for AUD", () => {
    expect(getCurrencySymbol("AUD")).toBe("$");
  });
  it("returns € for EUR", () => {
    expect(getCurrencySymbol("EUR")).toBe("€");
  });
  it("returns £ for GBP", () => {
    expect(getCurrencySymbol("GBP")).toBe("£");
  });
  it("returns ISO code for unknown currencies", () => {
    expect(getCurrencySymbol("JPY")).toBe("JPY ");
  });
  it("returns $ for null currency (defaults to USD)", () => {
    expect(getCurrencySymbol(null)).toBe("$");
  });
});

describe("formatCurrency", () => {
  it("formats a number with $ and two decimals", () => {
    expect(formatCurrency(1234.5, "USD")).toBe("$1,234.50");
  });
  it("formats zero", () => {
    expect(formatCurrency(0, "USD")).toBe("$0.00");
  });
  it("formats EUR with € symbol", () => {
    expect(formatCurrency(99.9, "EUR")).toBe("€99.90");
  });
  it("returns empty string for null", () => {
    expect(formatCurrency(null, "USD")).toBe("");
  });
});

describe("parseCurrencyInput", () => {
  it("parses a plain number string", () => {
    expect(parseCurrencyInput("1234.56")).toBe(1234.56);
  });
  it("strips commas before parsing", () => {
    expect(parseCurrencyInput("1,234.56")).toBe(1234.56);
  });
  it("strips currency symbols before parsing", () => {
    expect(parseCurrencyInput("$1,234.56")).toBe(1234.56);
  });
  it("returns null for empty string", () => {
    expect(parseCurrencyInput("")).toBeNull();
  });
  it("returns null for non-numeric input", () => {
    expect(parseCurrencyInput("abc")).toBeNull();
  });
  it("returns null for negative numbers", () => {
    expect(parseCurrencyInput("-50")).toBeNull();
  });
});
