import { describe, it, expect } from "vitest";
import { validateFileMagicBytes, validateFileSize, isZipFile } from "./validate";

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
    const result = validateFileMagicBytes(buf, "application/octet-stream");
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

describe("isZipFile", () => {
  it("returns true for zip magic bytes", () => {
    const zipBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    expect(isZipFile(zipBuffer)).toBe(true);
  });

  it("returns false for PDF magic bytes", () => {
    const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46]);
    expect(isZipFile(pdfBuffer)).toBe(false);
  });

  it("returns false for empty buffer", () => {
    expect(isZipFile(Buffer.alloc(0))).toBe(false);
  });
});

describe("validateFileMagicBytes - zip", () => {
  it("accepts application/zip with zip magic bytes", () => {
    const zipBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    const result = validateFileMagicBytes(zipBuffer, "application/zip");
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe("application/zip");
  });

  it("accepts application/x-zip-compressed with zip magic bytes", () => {
    const zipBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    const result = validateFileMagicBytes(zipBuffer, "application/x-zip-compressed");
    expect(result.valid).toBe(true);
  });

  it("rejects PDF claimed as zip", () => {
    const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46]);
    const result = validateFileMagicBytes(pdfBuffer, "application/zip");
    expect(result.valid).toBe(false);
  });
});
