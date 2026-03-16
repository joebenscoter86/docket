import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encrypt, decrypt } from "./encryption";

const VALID_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("encryption", () => {
  let originalKey: string | undefined;

  beforeAll(() => {
    originalKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = VALID_KEY;
  });

  afterAll(() => {
    if (originalKey !== undefined) {
      process.env.ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
  });

  it("round-trips a simple string", () => {
    const plaintext = "hello world";
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("round-trips an empty string", () => {
    const encrypted = encrypt("");
    expect(decrypt(encrypted)).toBe("");
  });

  it("round-trips unicode content", () => {
    const plaintext = "日本語テスト 🔐";
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("round-trips a long OAuth-like token", () => {
    const token = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9." + "a".repeat(500);
    const encrypted = encrypt(token);
    expect(decrypt(encrypted)).toBe(token);
  });

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    const plaintext = "same input";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(plaintext);
    expect(decrypt(b)).toBe(plaintext);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encrypt("sensitive data");
    const buf = Buffer.from(encrypted, "base64");
    // Flip a byte in the ciphertext portion
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString("base64");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws on truncated data", () => {
    expect(() => decrypt("dG9vc2hvcnQ=")).toThrow("too short");
  });

  it("throws when ENCRYPTION_KEY is missing", () => {
    const key = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY environment variable is not set");
    process.env.ENCRYPTION_KEY = key;
  });

  it("throws when ENCRYPTION_KEY is wrong length", () => {
    const key = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "abcd";
    expect(() => encrypt("test")).toThrow("must be exactly 32 bytes");
    process.env.ENCRYPTION_KEY = key;
  });
});
