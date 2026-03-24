import { describe, it, expect } from "vitest";
import { generateInboundAddress } from "./address";

describe("generateInboundAddress", () => {
  it("returns an address matching the expected format", () => {
    const address = generateInboundAddress();
    expect(address).toMatch(/^invoices-[a-z2-9]{10}@ingest\.dockett\.app$/);
  });

  it("generates unique addresses on successive calls", () => {
    const a = generateInboundAddress();
    const b = generateInboundAddress();
    expect(a).not.toBe(b);
  });

  it("uses only unambiguous characters (no 0, 1, l, o, i)", () => {
    for (let i = 0; i < 100; i++) {
      const address = generateInboundAddress();
      const id = address.split("-")[1].split("@")[0];
      expect(id).not.toMatch(/[01loi]/);
    }
  });

  it("generates 10-character IDs", () => {
    const address = generateInboundAddress();
    const id = address.split("-")[1].split("@")[0];
    expect(id).toHaveLength(10);
  });
});
