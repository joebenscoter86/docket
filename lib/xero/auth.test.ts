// lib/xero/auth.test.ts
import { describe, it, expect, vi } from "vitest";
import { generatePKCE, generateState } from "./auth";

// All vi.mock() calls are hoisted to file top by Vitest — place them here
vi.mock("@/lib/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/utils/encryption", () => ({
  encrypt: (v: string) => `enc_${v}`,
  decrypt: (v: string) => v.replace(/^enc_/, ""),
}));

describe("generatePKCE", () => {
  it("returns a code_verifier of exactly 43 characters", () => {
    const { codeVerifier } = generatePKCE();
    expect(codeVerifier).toHaveLength(43);
  });

  it("returns a base64url-encoded code_verifier (no +, /, =)", () => {
    const { codeVerifier } = generatePKCE();
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns a base64url-encoded code_challenge", () => {
    const { codeChallenge } = generatePKCE();
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates unique verifiers on each call", () => {
    const a = generatePKCE();
    const b = generatePKCE();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });

  it("challenge is SHA256 of verifier in base64url", async () => {
    const { codeVerifier, codeChallenge } = generatePKCE();
    const { createHash } = await import("crypto");
    const expected = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    expect(codeChallenge).toBe(expected);
  });
});

describe("generateState", () => {
  it("returns a 64-character hex string", () => {
    const state = generateState();
    expect(state).toHaveLength(64);
    expect(state).toMatch(/^[0-9a-f]+$/);
  });

  it("generates unique state on each call", () => {
    const a = generateState();
    const b = generateState();
    expect(a).not.toBe(b);
  });
});
