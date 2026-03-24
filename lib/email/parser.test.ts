import { describe, it, expect } from "vitest";
import { parseInboundEmail, validateAttachments } from "./parser";
import pdfFixture from "./__fixtures__/resend-inbound-pdf.json";
import multiFixture from "./__fixtures__/resend-inbound-multi.json";
import emptyFixture from "./__fixtures__/resend-inbound-empty.json";

describe("parseInboundEmail", () => {
  it("parses sender, recipient, subject, and messageId from Resend payload", () => {
    const result = parseInboundEmail(pdfFixture);
    expect(result.from).toBe("vendor@example.com");
    expect(result.to).toEqual(["invoices-abc1234567@ingest.dockett.app"]);
    expect(result.subject).toBe("Invoice #1234 - March Services");
    expect(result.messageId).toBe("<msg-001@example.com>");
  });

  it("extracts PDF attachment with correct metadata", () => {
    const result = parseInboundEmail(pdfFixture);
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].contentType).toBe("application/pdf");
    expect(result.attachments[0].filename).toBe("invoice-1234.pdf");
    expect(result.attachments[0].content).toBeInstanceOf(Buffer);
    expect(result.attachments[0].sizeBytes).toBeGreaterThan(0);
  });

  it("extracts multiple attachments", () => {
    const result = parseInboundEmail(multiFixture);
    expect(result.attachments).toHaveLength(2);
    expect(result.attachments[0].contentType).toBe("application/pdf");
    expect(result.attachments[1].contentType).toBe("image/png");
  });

  it("returns empty attachments array for emails with no attachments", () => {
    const result = parseInboundEmail(emptyFixture);
    expect(result.attachments).toHaveLength(0);
  });

  it("handles missing fields gracefully", () => {
    const result = parseInboundEmail({});
    expect(result.from).toBe("");
    expect(result.subject).toBe("(no subject)");
    expect(result.messageId).toBe("");
    expect(result.attachments).toHaveLength(0);
  });
});

describe("validateAttachments", () => {
  it("accepts valid PDF by magic bytes", () => {
    // Real PDF magic bytes: %PDF
    const pdfBuffer = Buffer.alloc(200);
    pdfBuffer[0] = 0x25; // %
    pdfBuffer[1] = 0x50; // P
    pdfBuffer[2] = 0x44; // D
    pdfBuffer[3] = 0x46; // F

    const { valid, rejected } = validateAttachments([
      {
        filename: "invoice.pdf",
        contentType: "application/pdf",
        sizeBytes: pdfBuffer.length,
        content: pdfBuffer,
      },
    ]);

    expect(valid).toHaveLength(1);
    expect(valid[0].detectedType).toBe("application/pdf");
    expect(rejected).toHaveLength(0);
  });

  it("rejects unsupported file types", () => {
    const { valid, rejected } = validateAttachments([
      {
        filename: "spreadsheet.xlsx",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 100,
        content: Buffer.alloc(100),
      },
    ]);

    expect(valid).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toContain("Unsupported");
  });

  it("rejects files exceeding 10MB", () => {
    const bigBuffer = Buffer.alloc(11 * 1024 * 1024);
    // Set PDF magic bytes so type check passes
    bigBuffer[0] = 0x25;
    bigBuffer[1] = 0x50;
    bigBuffer[2] = 0x44;
    bigBuffer[3] = 0x46;

    const { valid, rejected } = validateAttachments([
      {
        filename: "huge.pdf",
        contentType: "application/pdf",
        sizeBytes: bigBuffer.length,
        content: bigBuffer,
      },
    ]);

    expect(valid).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toContain("10MB");
  });

  it("rejects PDF with wrong magic bytes", () => {
    const fakeBuffer = Buffer.from("This is not a PDF");

    const { valid, rejected } = validateAttachments([
      {
        filename: "fake.pdf",
        contentType: "application/pdf",
        sizeBytes: fakeBuffer.length,
        content: fakeBuffer,
      },
    ]);

    expect(valid).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toContain("does not match");
  });

  it("processes mixed valid and invalid attachments", () => {
    const pdfBuffer = Buffer.alloc(200);
    pdfBuffer[0] = 0x25;
    pdfBuffer[1] = 0x50;
    pdfBuffer[2] = 0x44;
    pdfBuffer[3] = 0x46;

    const { valid, rejected } = validateAttachments([
      {
        filename: "good.pdf",
        contentType: "application/pdf",
        sizeBytes: pdfBuffer.length,
        content: pdfBuffer,
      },
      {
        filename: "bad.zip",
        contentType: "application/zip",
        sizeBytes: 100,
        content: Buffer.alloc(100),
      },
    ]);

    expect(valid).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it("validates attachments from parsed PDF fixture", () => {
    const parsed = parseInboundEmail(pdfFixture);
    const { valid } = validateAttachments(parsed.attachments);
    expect(valid).toHaveLength(1);
    expect(valid[0].detectedType).toBe("application/pdf");
  });
});
