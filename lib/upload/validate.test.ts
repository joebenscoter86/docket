import { describe, it, expect } from "vitest";
import { validateFileMagicBytes, validateFileSize } from "./validate";

// Helper to create a Buffer with specific leading bytes
function makeBuffer(hexBytes: string, totalSize = 64): Buffer {
  const header = Buffer.from(hexBytes, "hex");
  const padding = Buffer.alloc(totalSize - header.length);
  return Buffer.concat([header, padding]);
}

describe("validateFileMagicBytes", () => {
  it("accepts valid PDF (starts with %PDF / 25504446)", () => {
    const buf = makeBuffer("255044462d312e34"); // %PDF-1.4
    expect(validateFileMagicBytes(buf, "application/pdf")).toEqual({
      valid: true,
      detectedType: "application/pdf",
    });
  });

  it("accepts valid JPEG (starts with FF D8 FF)", () => {
    const buf = makeBuffer("ffd8ffe0");
    expect(validateFileMagicBytes(buf, "image/jpeg")).toEqual({
      valid: true,
      detectedType: "image/jpeg",
    });
  });

  it("accepts valid PNG (starts with 89504E47)", () => {
    const buf = makeBuffer("89504e470d0a1a0a");
    expect(validateFileMagicBytes(buf, "image/png")).toEqual({
      valid: true,
      detectedType: "image/png",
    });
  });

  it("rejects PDF with wrong magic bytes", () => {
    const buf = makeBuffer("ffd8ffe0"); // JPEG bytes
    const result = validateFileMagicBytes(buf, "application/pdf");
    expect(result.valid).toBe(false);
  });

  it("rejects completely unknown magic bytes", () => {
    const buf = makeBuffer("0000000000");
    const result = validateFileMagicBytes(buf, "application/pdf");
    expect(result.valid).toBe(false);
  });

  it("rejects empty buffer", () => {
    const buf = Buffer.alloc(0);
    const result = validateFileMagicBytes(buf, "application/pdf");
    expect(result.valid).toBe(false);
  });

  it("rejects unsupported claimed type", () => {
    const buf = makeBuffer("255044462d312e34");
    const result = validateFileMagicBytes(buf, "application/zip");
    expect(result.valid).toBe(false);
  });
});

describe("validateFileSize", () => {
  it("accepts file under 10MB", () => {
    expect(validateFileSize(5 * 1024 * 1024)).toBe(true);
  });

  it("accepts file exactly 10MB", () => {
    expect(validateFileSize(10 * 1024 * 1024)).toBe(true);
  });

  it("rejects file over 10MB", () => {
    expect(validateFileSize(10 * 1024 * 1024 + 1)).toBe(false);
  });
});
