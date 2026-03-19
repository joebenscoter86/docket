import { describe, it, expect } from "vitest";
import { normalizeForMatching } from "./normalize";

describe("normalizeForMatching", () => {
  it("lowercases text", () => {
    expect(normalizeForMatching("Office Supplies")).toBe("office supplies");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeForMatching("  office supplies  ")).toBe("office supplies");
  });

  it("collapses multiple spaces to single space", () => {
    expect(normalizeForMatching("office   supplies")).toBe("office supplies");
  });

  it("handles all three normalizations together", () => {
    expect(normalizeForMatching("  Office   Supplies  ")).toBe("office supplies");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeForMatching("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeForMatching("   ")).toBe("");
  });

  it("handles single word", () => {
    expect(normalizeForMatching("Consulting")).toBe("consulting");
  });

  it("preserves special characters", () => {
    expect(normalizeForMatching("Software & Subscriptions")).toBe("software & subscriptions");
  });

  it("handles tabs and newlines as whitespace", () => {
    expect(normalizeForMatching("office\t\nsupplies")).toBe("office supplies");
  });
});
