import { describe, it, expect } from "vitest";
import { ConnectionExpiredError } from "./types";

describe("ConnectionExpiredError", () => {
  it("sets name, provider, and orgId", () => {
    const err = new ConnectionExpiredError("xero", "org-123");
    expect(err.name).toBe("ConnectionExpiredError");
    expect(err.provider).toBe("xero");
    expect(err.orgId).toBe("org-123");
    expect(err.message).toContain("xero");
    expect(err.message).toContain("org-123");
  });

  it("accepts a custom message", () => {
    const err = new ConnectionExpiredError("quickbooks", "org-1", "custom msg");
    expect(err.message).toBe("custom msg");
  });

  it("is an instance of Error", () => {
    const err = new ConnectionExpiredError("xero", "org-1");
    expect(err).toBeInstanceOf(Error);
  });
});
