import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createCipheriv, randomBytes } from "crypto";
import { encrypt, decrypt } from "./encryption";

const KEY_A =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const KEY_B =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

describe("encryption", () => {
  let originalKey: string | undefined;
  let originalPreviousKey: string | undefined;

  beforeAll(() => {
    originalKey = process.env.ENCRYPTION_KEY;
    originalPreviousKey = process.env.ENCRYPTION_KEY_PREVIOUS;
    process.env.ENCRYPTION_KEY = KEY_A;
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
  });

  afterEach(() => {
    process.env.ENCRYPTION_KEY = KEY_A;
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
  });

  afterAll(() => {
    if (originalKey !== undefined) {
      process.env.ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
    if (originalPreviousKey !== undefined) {
      process.env.ENCRYPTION_KEY_PREVIOUS = originalPreviousKey;
    } else {
      delete process.env.ENCRYPTION_KEY_PREVIOUS;
    }
  });

  // --- Basic round-trip tests ---

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

  // --- Error handling ---

  it("throws on tampered ciphertext", () => {
    const encrypted = encrypt("sensitive data");
    const buf = Buffer.from(encrypted, "base64");
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
    expect(() => encrypt("test")).toThrow(
      "ENCRYPTION_KEY environment variable is not set"
    );
    process.env.ENCRYPTION_KEY = key;
  });

  it("throws when ENCRYPTION_KEY is wrong length", () => {
    const key = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "abcd";
    expect(() => encrypt("test")).toThrow("must be exactly 32 bytes");
    process.env.ENCRYPTION_KEY = key;
  });

  // --- Version tag ---

  it("encrypted data starts with version tag 0x01", () => {
    const encrypted = encrypt("test");
    const buf = Buffer.from(encrypted, "base64");
    expect(buf[0]).toBe(0x01);
  });

  // --- Legacy data (no version tag) ---

  it("decrypts legacy data without version tag", () => {
    // Encrypt manually without version tag (legacy format)
    const key = Buffer.from(KEY_A, "hex");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update("legacy-token", "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    // Legacy format: IV + authTag + ciphertext (no version byte)
    const combined = Buffer.concat([iv, authTag, encrypted]);
    const encoded = combined.toString("base64");

    expect(decrypt(encoded)).toBe("legacy-token");
  });

  // --- Key rotation ---

  it("decrypt with current key succeeds", () => {
    const encrypted = encrypt("current-key-data");
    expect(decrypt(encrypted)).toBe("current-key-data");
  });

  it("decrypt with previous key fallback succeeds", () => {
    // Encrypt with KEY_A
    process.env.ENCRYPTION_KEY = KEY_A;
    const encrypted = encrypt("old-key-data");

    // Rotate: KEY_B is now current, KEY_A is previous
    process.env.ENCRYPTION_KEY = KEY_B;
    process.env.ENCRYPTION_KEY_PREVIOUS = KEY_A;

    expect(decrypt(encrypted)).toBe("old-key-data");
  });

  it("encrypt always uses current key", () => {
    process.env.ENCRYPTION_KEY = KEY_B;
    process.env.ENCRYPTION_KEY_PREVIOUS = KEY_A;

    const encrypted = encrypt("new-data");

    // Should decrypt with KEY_B alone (no fallback needed)
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
    expect(decrypt(encrypted)).toBe("new-data");
  });

  it("throws when neither key can decrypt", () => {
    // Encrypt with KEY_A
    process.env.ENCRYPTION_KEY = KEY_A;
    const encrypted = encrypt("test");

    // Set both keys to something else entirely
    process.env.ENCRYPTION_KEY = KEY_B;
    process.env.ENCRYPTION_KEY_PREVIOUS =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    expect(() => decrypt(encrypted)).toThrow(
      "neither current nor previous encryption key"
    );
  });

  it("works without ENCRYPTION_KEY_PREVIOUS (optional)", () => {
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
    const encrypted = encrypt("no-previous-key");
    expect(decrypt(encrypted)).toBe("no-previous-key");
  });

  it("throws clear error when only current key set and it cannot decrypt", () => {
    process.env.ENCRYPTION_KEY = KEY_A;
    const encrypted = encrypt("test");

    process.env.ENCRYPTION_KEY = KEY_B;
    delete process.env.ENCRYPTION_KEY_PREVIOUS;

    // Without previous key, re-throws the GCM auth failure from current key
    expect(() => decrypt(encrypted)).toThrow();
  });
});
