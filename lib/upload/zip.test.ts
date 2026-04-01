import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { extractZipFiles } from "./zip";

// Helper: create a test zip buffer with given files
async function createTestZip(
  files: Array<{ name: string; content: Buffer }>
): Promise<Buffer> {
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.name, f.content);
  }
  const arrayBuffer = await zip.generateAsync({ type: "arraybuffer" });
  return Buffer.from(arrayBuffer);
}

// Valid magic bytes for test files
const PDF_HEADER = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

describe("extractZipFiles", () => {
  it("extracts PDF files from a flat zip", async () => {
    const zipBuffer = await createTestZip([
      { name: "invoice1.pdf", content: PDF_HEADER },
      { name: "invoice2.pdf", content: PDF_HEADER },
    ]);

    const result = await extractZipFiles(zipBuffer);
    expect(result.files).toHaveLength(2);
    expect(result.files[0].name).toBe("invoice1.pdf");
    expect(result.files[0].mimeType).toBe("application/pdf");
    expect(result.files[1].name).toBe("invoice2.pdf");
    expect(result.skipped).toHaveLength(0);
  });

  it("extracts files from nested folders (flattened)", async () => {
    const zipBuffer = await createTestZip([
      { name: "orders/march/invoice1.pdf", content: PDF_HEADER },
      { name: "orders/april/invoice2.pdf", content: PDF_HEADER },
    ]);

    const result = await extractZipFiles(zipBuffer);
    expect(result.files).toHaveLength(2);
    expect(result.files[0].name).toBe("invoice1.pdf");
    expect(result.files[1].name).toBe("invoice2.pdf");
  });

  it("skips unsupported file types", async () => {
    const zipBuffer = await createTestZip([
      { name: "invoice.pdf", content: PDF_HEADER },
      { name: "readme.txt", content: Buffer.from("hello") },
      { name: "data.csv", content: Buffer.from("a,b,c") },
    ]);

    const result = await extractZipFiles(zipBuffer);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe("invoice.pdf");
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped[0].name).toBe("readme.txt");
    expect(result.skipped[0].reason).toContain("Unsupported");
  });

  it("skips files exceeding per-file size limit", async () => {
    const bigContent = Buffer.alloc(10 * 1024 * 1024 + 1);
    bigContent.set(PDF_HEADER);

    const zipBuffer = await createTestZip([
      { name: "big.pdf", content: bigContent },
      { name: "small.pdf", content: PDF_HEADER },
    ]);

    const result = await extractZipFiles(zipBuffer);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe("small.pdf");
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("10MB");
  });

  it("rejects empty zip", async () => {
    const zipBuffer = await createTestZip([]);
    await expect(extractZipFiles(zipBuffer)).rejects.toThrow("empty");
  });

  it("rejects zip with no supported files", async () => {
    const zipBuffer = await createTestZip([
      { name: "readme.txt", content: Buffer.from("hello") },
    ]);

    const result = await extractZipFiles(zipBuffer);
    expect(result.files).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });

  it("rejects zip exceeding total uncompressed size limit", async () => {
    const chunk = Buffer.alloc(9 * 1024 * 1024);
    chunk.set(PDF_HEADER);
    const files = Array.from({ length: 6 }, (_, i) => ({
      name: `invoice${i}.pdf`,
      content: Buffer.from(chunk),
    })); // 54MB total

    const zipBuffer = await createTestZip(files);
    await expect(extractZipFiles(zipBuffer)).rejects.toThrow("50MB");
  });

  it("handles duplicate filenames from different folders", async () => {
    const zipBuffer = await createTestZip([
      { name: "march/invoice.pdf", content: PDF_HEADER },
      { name: "april/invoice.pdf", content: PDF_HEADER },
    ]);

    const result = await extractZipFiles(zipBuffer);
    expect(result.files).toHaveLength(2);
    const names = result.files.map((f) => f.name);
    expect(new Set(names).size).toBe(2);
  });

  it("supports JPEG and PNG files", async () => {
    const zipBuffer = await createTestZip([
      { name: "receipt.jpg", content: JPEG_HEADER },
      { name: "scan.png", content: PNG_HEADER },
    ]);

    const result = await extractZipFiles(zipBuffer);
    expect(result.files).toHaveLength(2);
    expect(result.files[0].mimeType).toBe("image/jpeg");
    expect(result.files[1].mimeType).toBe("image/png");
  });
});
