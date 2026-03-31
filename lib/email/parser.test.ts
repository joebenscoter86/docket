import { describe, it, expect } from "vitest";
import { parseInboundEmail, validateAttachments } from "./parser";

describe("parseInboundEmail", () => {
  it("unwraps data from Resend webhook envelope", () => {
    const result = parseInboundEmail({
      type: "email.received",
      created_at: "2026-03-24T10:00:00Z",
      data: {
        email_id: "abc-123",
        from: "vendor@example.com",
        to: ["invoices-abc1234567@ingest.dockett.app"],
        subject: "Invoice #1234",
        message_id: "<msg-001@example.com>",
        attachments: [
          { id: "att-1", filename: "invoice.pdf", content_type: "application/pdf" },
        ],
      },
    });

    expect(result.emailId).toBe("abc-123");
    expect(result.from).toBe("vendor@example.com");
    expect(result.to).toEqual(["invoices-abc1234567@ingest.dockett.app"]);
    expect(result.subject).toBe("Invoice #1234");
    expect(result.messageId).toBe("<msg-001@example.com>");
    expect(result.attachmentMetas).toHaveLength(1);
    expect(result.attachmentMetas[0].id).toBe("att-1");
    expect(result.attachmentMetas[0].filename).toBe("invoice.pdf");
    expect(result.attachmentMetas[0].contentType).toBe("application/pdf");
  });

  it("extracts bare email from angle bracket format", () => {
    const result = parseInboundEmail({
      type: "email.received",
      data: {
        from: "Vendor Inc <vendor@example.com>",
        to: ["<invoices-abc1234567@ingest.dockett.app>"],
      },
    });
    expect(result.from).toBe("vendor@example.com");
    expect(result.to).toEqual(["invoices-abc1234567@ingest.dockett.app"]);
  });

  it("normalizes email addresses to lowercase", () => {
    const result = parseInboundEmail({
      type: "email.received",
      data: {
        from: "USER@Example.COM",
        to: ["Invoices-ABC@INGEST.dockett.app"],
      },
    });
    expect(result.from).toBe("user@example.com");
    expect(result.to).toEqual(["invoices-abc@ingest.dockett.app"]);
  });

  it("handles missing fields gracefully", () => {
    const result = parseInboundEmail({});
    expect(result.from).toBe("");
    expect(result.subject).toBe("(no subject)");
    expect(result.messageId).toBe("");
    expect(result.attachmentMetas).toHaveLength(0);
  });

  it("handles flat payload (no data wrapper) for backwards compat", () => {
    const result = parseInboundEmail({
      from: "vendor@example.com",
      to: ["invoices-abc@ingest.dockett.app"],
      subject: "Test",
      email_id: "flat-123",
    });
    expect(result.emailId).toBe("flat-123");
    expect(result.from).toBe("vendor@example.com");
  });

  it("parses multiple attachment metas", () => {
    const result = parseInboundEmail({
      type: "email.received",
      data: {
        from: "vendor@example.com",
        to: ["invoices-abc@ingest.dockett.app"],
        attachments: [
          { id: "att-1", filename: "invoice.pdf", content_type: "application/pdf" },
          { id: "att-2", filename: "receipt.png", content_type: "image/png" },
        ],
      },
    });
    expect(result.attachmentMetas).toHaveLength(2);
  });

  it("returns empty attachmentMetas for emails with no attachments", () => {
    const result = parseInboundEmail({
      type: "email.received",
      data: {
        from: "vendor@example.com",
        to: ["invoices-abc@ingest.dockett.app"],
        attachments: [],
      },
    });
    expect(result.attachmentMetas).toHaveLength(0);
  });

  it("extracts htmlBody and textBody from webhook payload", () => {
    const result = parseInboundEmail({
      type: "email.received",
      data: {
        from: "vendor@example.com",
        to: ["invoices-abc@ingest.dockett.app"],
        subject: "Invoice #5678",
        html: "<table><tr><td>Total: $500.00</td></tr></table>",
        text: "Total: $500.00",
      },
    });
    expect(result.htmlBody).toBe("<table><tr><td>Total: $500.00</td></tr></table>");
    expect(result.textBody).toBe("Total: $500.00");
  });

  it("sets htmlBody and textBody to undefined when empty or missing", () => {
    const result = parseInboundEmail({
      type: "email.received",
      data: {
        from: "vendor@example.com",
        to: ["invoices-abc@ingest.dockett.app"],
        html: "",
        text: "   ",
      },
    });
    expect(result.htmlBody).toBeUndefined();
    expect(result.textBody).toBeUndefined();
  });

  it("sets htmlBody and textBody to undefined when fields not present", () => {
    const result = parseInboundEmail({
      type: "email.received",
      data: {
        from: "vendor@example.com",
        to: ["invoices-abc@ingest.dockett.app"],
      },
    });
    expect(result.htmlBody).toBeUndefined();
    expect(result.textBody).toBeUndefined();
  });
});

describe("validateAttachments", () => {
  it("accepts valid PDF by magic bytes", () => {
    const pdfBuffer = Buffer.alloc(200);
    pdfBuffer[0] = 0x25;
    pdfBuffer[1] = 0x50;
    pdfBuffer[2] = 0x44;
    pdfBuffer[3] = 0x46;

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

  it("rejects files exceeding 10MB", () => {
    const bigBuffer = Buffer.alloc(11 * 1024 * 1024);
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
  });
});
