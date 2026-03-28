// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClaudeExtractionProvider } from "./claude";

// Mock the Anthropic SDK
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  const MockAnthropic = function (this: unknown) {
    (this as { messages: { create: typeof mockCreate } }).messages = {
      create: mockCreate,
    };
  };
  return { default: MockAnthropic };
});

vi.mock("@/lib/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Sample AI response matching the FND-11 prompt output format
const SAMPLE_AI_RESPONSE = {
  vendor_name: "Acme Corp",
  vendor_address: "123 Main St, Springfield, IL 62701",
  invoice_number: "INV-2024-001",
  invoice_date: "2024-03-15",
  due_date: "2024-04-14",
  payment_terms: "Net 30",
  currency: "USD",
  line_items: [
    {
      description: "Widget A",
      quantity: 10,
      unit_price: 25.0,
      amount: 250.0,
    },
    {
      description: "Widget B",
      quantity: 5,
      unit_price: 50.0,
      amount: 250.0,
    },
  ],
  subtotal: 500.0,
  tax_amount: 40.0,
  total_amount: 540.0,
  confidence: "high",
};

function mockSuccessResponse(jsonStr?: string, stopReason = "end_turn") {
  mockCreate.mockResolvedValue({
    content: [
      {
        type: "text",
        text: jsonStr ?? JSON.stringify(SAMPLE_AI_RESPONSE),
      },
    ],
    model: "claude-sonnet-4-20250514",
    usage: { input_tokens: 2000, output_tokens: 300 },
    stop_reason: stopReason,
  });
}

describe("ClaudeExtractionProvider", () => {
  let provider: ClaudeExtractionProvider;
  const pdfBuffer = Buffer.from("%PDF-1.4 test content");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-for-mocked-tests");
    provider = new ClaudeExtractionProvider();
  });

  it("extracts invoice data from a PDF successfully", async () => {
    mockSuccessResponse();

    const result = await provider.extractInvoiceData(
      pdfBuffer,
      "application/pdf"
    );

    expect(result.data.vendorName).toBe("Acme Corp");
    expect(result.data.invoiceNumber).toBe("INV-2024-001");
    expect(result.data.totalAmount).toBe(540.0);
    expect(result.data.confidenceScore).toBe("high");
    expect(result.data.lineItems).toHaveLength(2);
    expect(result.data.lineItems[0].unitPrice).toBe(25.0);
    expect(result.data.lineItems[0].sortOrder).toBe(0);
    expect(result.data.lineItems[1].sortOrder).toBe(1);
    expect(result.data.currency).toBe("USD");
    expect(result.modelVersion).toBe("claude-sonnet-4-20250514");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.rawResponse).toBeDefined();
  });

  it("sends PDF as document type content block", async () => {
    mockSuccessResponse();

    await provider.extractInvoiceData(pdfBuffer, "application/pdf");

    const callArgs = mockCreate.mock.calls[0][0];
    const content = callArgs.messages[0].content;
    expect(content[0].type).toBe("document");
    expect(content[0].source.media_type).toBe("application/pdf");
  });

  it("sends JPEG as image type content block", async () => {
    mockSuccessResponse();

    await provider.extractInvoiceData(pdfBuffer, "image/jpeg");

    const callArgs = mockCreate.mock.calls[0][0];
    const content = callArgs.messages[0].content;
    expect(content[0].type).toBe("image");
    expect(content[0].source.media_type).toBe("image/jpeg");
  });

  it("sends PNG as image type content block", async () => {
    mockSuccessResponse();

    await provider.extractInvoiceData(pdfBuffer, "image/png");

    const callArgs = mockCreate.mock.calls[0][0];
    const content = callArgs.messages[0].content;
    expect(content[0].type).toBe("image");
    expect(content[0].source.media_type).toBe("image/png");
  });

  it("strips markdown code fences from response", async () => {
    mockSuccessResponse(
      "```json\n" + JSON.stringify(SAMPLE_AI_RESPONSE) + "\n```"
    );

    const result = await provider.extractInvoiceData(
      pdfBuffer,
      "application/pdf"
    );

    expect(result.data.vendorName).toBe("Acme Corp");
  });

  it("handles null fields in AI response", async () => {
    const partialResponse = {
      ...SAMPLE_AI_RESPONSE,
      vendor_address: null,
      due_date: null,
      payment_terms: null,
      subtotal: null,
      tax_amount: null,
    };
    mockSuccessResponse(JSON.stringify(partialResponse));

    const result = await provider.extractInvoiceData(
      pdfBuffer,
      "application/pdf"
    );

    expect(result.data.vendorAddress).toBeNull();
    expect(result.data.dueDate).toBeNull();
    expect(result.data.paymentTerms).toBeNull();
  });

  it("defaults currency to USD when not provided", async () => {
    const noCurrency = { ...SAMPLE_AI_RESPONSE, currency: null };
    mockSuccessResponse(JSON.stringify(noCurrency));

    const result = await provider.extractInvoiceData(
      pdfBuffer,
      "application/pdf"
    );

    expect(result.data.currency).toBe("USD");
  });

  it("throws on empty response content", async () => {
    mockCreate.mockResolvedValue({
      content: [],
      model: "claude-sonnet-4-20250514",
      usage: { input_tokens: 100, output_tokens: 0 },
    });

    await expect(
      provider.extractInvoiceData(pdfBuffer, "application/pdf")
    ).rejects.toThrow("Could not extract data from this document");
  });

  it("throws on malformed JSON response", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "this is not json at all" }],
      model: "claude-sonnet-4-20250514",
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    await expect(
      provider.extractInvoiceData(pdfBuffer, "application/pdf")
    ).rejects.toThrow("Could not parse extraction results");
  });

  it("throws on timeout", async () => {
    const timeoutError = new Error("Request timed out");
    timeoutError.name = "APIConnectionTimeoutError";
    mockCreate.mockRejectedValue(timeoutError);

    await expect(
      provider.extractInvoiceData(pdfBuffer, "application/pdf")
    ).rejects.toThrow("Extraction timed out");
  });

  it("throws on API error (5xx)", async () => {
    const apiError = new Error("Internal server error");
    (apiError as unknown as Record<string, unknown>).status = 500;
    apiError.name = "APIError";
    mockCreate.mockRejectedValue(apiError);

    await expect(
      provider.extractInvoiceData(pdfBuffer, "application/pdf")
    ).rejects.toThrow("Extraction service unavailable");
  });

  it("throws on rate limit after retries exhausted", async () => {
    const rateLimitError = new Error("Rate limit exceeded");
    rateLimitError.name = "RateLimitError";
    mockCreate.mockRejectedValue(rateLimitError);

    await expect(
      provider.extractInvoiceData(pdfBuffer, "application/pdf")
    ).rejects.toThrow("Extraction service is busy");
  });

  describe("prompt content", () => {
    it("includes vendor address guidance about company vs store address", async () => {
      mockSuccessResponse();

      await provider.extractInvoiceData(pdfBuffer, "application/pdf");

      const callArgs = mockCreate.mock.calls[0][0];
      const textBlock = callArgs.messages[0].content[1];
      expect(textBlock.text).toContain("company/headquarters/mailing address");
      expect(textBlock.text).toContain("NOT a store location");
    });

    it("includes shipping/freight extraction rule", async () => {
      mockSuccessResponse();

      await provider.extractInvoiceData(pdfBuffer, "application/pdf");

      const callArgs = mockCreate.mock.calls[0][0];
      const textBlock = callArgs.messages[0].content[1];
      expect(textBlock.text).toContain("shipping, freight, handling");
    });

    it("includes line item completeness rule", async () => {
      mockSuccessResponse();

      await provider.extractInvoiceData(pdfBuffer, "application/pdf");

      const callArgs = mockCreate.mock.calls[0][0];
      const textBlock = callArgs.messages[0].content[1];
      expect(textBlock.text).toContain("MUST extract ALL line items");
      expect(textBlock.text).toContain("Count the line items to verify");
    });
  });

  describe("truncation detection", () => {
    it("sets confidence to low when response is truncated", async () => {
      mockSuccessResponse(JSON.stringify(SAMPLE_AI_RESPONSE), "max_tokens");

      const result = await provider.extractInvoiceData(
        pdfBuffer,
        "application/pdf"
      );

      expect(result.data.confidenceScore).toBe("low");
    });

    it("throws clear error when truncated response cannot be parsed", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: '{"vendor_name": "Acme", "line_items": [' }],
        model: "claude-sonnet-4-20250514",
        usage: { input_tokens: 2000, output_tokens: 2048 },
        stop_reason: "max_tokens",
      });

      await expect(
        provider.extractInvoiceData(pdfBuffer, "application/pdf")
      ).rejects.toThrow("too complex to extract");
    });
  });

  describe("subtotal/total mismatch detection", () => {
    it("downgrades confidence when total exceeds subtotal + tax", async () => {
      const mismatchResponse = {
        ...SAMPLE_AI_RESPONSE,
        subtotal: 253.0,
        tax_amount: 0,
        total_amount: 299.48,
        confidence: "high",
      };
      mockSuccessResponse(JSON.stringify(mismatchResponse));

      const result = await provider.extractInvoiceData(
        pdfBuffer,
        "application/pdf"
      );

      expect(result.data.confidenceScore).toBe("medium");
    });

    it("keeps confidence high when subtotal + tax matches total", async () => {
      mockSuccessResponse();

      const result = await provider.extractInvoiceData(
        pdfBuffer,
        "application/pdf"
      );

      // 500 + 40 = 540 = total, so no mismatch
      expect(result.data.confidenceScore).toBe("high");
    });

    it("downgrades confidence when total is less than subtotal + tax (missing discount)", async () => {
      const discountMismatch = {
        ...SAMPLE_AI_RESPONSE,
        subtotal: 500.0,
        tax_amount: 40.0,
        total_amount: 490.0,
        confidence: "high",
      };
      mockSuccessResponse(JSON.stringify(discountMismatch));

      const result = await provider.extractInvoiceData(
        pdfBuffer,
        "application/pdf"
      );

      expect(result.data.confidenceScore).toBe("medium");
    });
  });

  it("preserves shipping/freight as line items", async () => {
    const responseWithShipping = {
      ...SAMPLE_AI_RESPONSE,
      line_items: [
        ...SAMPLE_AI_RESPONSE.line_items,
        {
          description: "Shipping & Handling",
          quantity: 1,
          unit_price: 15.0,
          amount: 15.0,
        },
      ],
      subtotal: 515.0,
      total_amount: 555.0,
    };
    mockSuccessResponse(JSON.stringify(responseWithShipping));

    const result = await provider.extractInvoiceData(
      pdfBuffer,
      "application/pdf"
    );

    expect(result.data.lineItems).toHaveLength(3);
    expect(result.data.lineItems[2].description).toBe("Shipping & Handling");
    expect(result.data.lineItems[2].amount).toBe(15.0);
  });

  describe("GL account suggestions", () => {
    const sampleAccounts = [
      { id: "123", name: "Office Supplies" },
      { id: "456", name: "Professional Services" },
    ];

    it("includes account list in prompt when context has accounts", async () => {
      mockSuccessResponse();

      await provider.extractInvoiceData(pdfBuffer, "application/pdf", {
        accounts: sampleAccounts,
      });

      const callArgs = mockCreate.mock.calls[0][0];
      const textBlock = callArgs.messages[0].content[1];
      expect(textBlock.text).toContain("Available expense accounts");
      expect(textBlock.text).toContain("123");
      expect(textBlock.text).toContain("456");
    });

    it("does not include account section when context is undefined", async () => {
      mockSuccessResponse();

      await provider.extractInvoiceData(pdfBuffer, "application/pdf");

      const callArgs = mockCreate.mock.calls[0][0];
      const textBlock = callArgs.messages[0].content[1];
      expect(textBlock.text).not.toContain("Available expense accounts");
    });

    it("parses suggested_gl_account_id from AI response into suggestedGlAccountId", async () => {
      const responseWithGlSuggestions = {
        ...SAMPLE_AI_RESPONSE,
        line_items: [
          {
            description: "Office supplies",
            quantity: 1,
            unit_price: 50.0,
            amount: 50.0,
            suggested_gl_account_id: "123",
          },
          {
            description: "Consulting",
            quantity: 2,
            unit_price: 100.0,
            amount: 200.0,
            suggested_gl_account_id: null,
          },
        ],
      };
      mockSuccessResponse(JSON.stringify(responseWithGlSuggestions));

      const result = await provider.extractInvoiceData(
        pdfBuffer,
        "application/pdf",
        { accounts: sampleAccounts }
      );

      expect(result.data.lineItems[0].suggestedGlAccountId).toBe("123");
      expect(result.data.lineItems[1].suggestedGlAccountId).toBeNull();
    });
  });
});
