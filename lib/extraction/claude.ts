import Anthropic from "@anthropic-ai/sdk";
import type {
  ExtractionProvider,
  ExtractionResult,
  ExtractedInvoice,
  ExtractedLineItem,
} from "./types";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 2048;
const TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;

const EXTRACTION_PROMPT = `You are an invoice data extraction system. Extract structured data from the provided invoice document.

Return ONLY valid JSON matching this exact schema — no markdown, no explanation, no code fences:

{
  "vendor_name": "string or null",
  "vendor_address": "string or null — full address as a single string",
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "payment_terms": "string or null (e.g., 'Net 30', 'Due on receipt')",
  "currency": "ISO 4217 code (e.g., 'USD', 'GBP') or null",
  "line_items": [
    {
      "description": "string or null",
      "quantity": number or null,
      "unit_price": number or null,
      "amount": number or null
    }
  ],
  "subtotal": number or null,
  "tax_amount": number or null — use 0 if no tax shown,
  "total_amount": number or null,
  "confidence": "high | medium | low — your confidence in the overall extraction accuracy"
}

Rules:
- Dates must be ISO format YYYY-MM-DD
- Numbers must be plain numbers (no currency symbols, no commas)
- If a field is not visible or cannot be determined, use null
- For line items, extract every line item visible in the invoice
- The confidence field reflects your overall confidence: "high" if the document is clear and all fields are readable, "medium" if some fields are ambiguous, "low" if the document is poor quality or heavily obscured
- Do not infer or calculate values — extract only what is explicitly shown
- Return raw JSON only — no wrapping, no explanation`;

interface AIResponse {
  vendor_name: string | null;
  vendor_address: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  payment_terms: string | null;
  currency: string | null;
  line_items: Array<{
    description: string | null;
    quantity: number | null;
    unit_price: number | null;
    amount: number | null;
  }>;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  confidence: "high" | "medium" | "low";
}

function buildContentBlock(
  fileBuffer: Buffer,
  mimeType: string
): Anthropic.DocumentBlockParam | Anthropic.ImageBlockParam {
  const base64Data = fileBuffer.toString("base64");

  if (mimeType === "application/pdf") {
    return {
      type: "document" as const,
      source: {
        type: "base64" as const,
        media_type: "application/pdf" as const,
        data: base64Data,
      },
    };
  }

  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: mimeType as "image/jpeg" | "image/png",
      data: base64Data,
    },
  };
}

function parseAIResponse(text: string): AIResponse {
  let jsonStr = text.trim();

  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    return JSON.parse(jsonStr) as AIResponse;
  } catch {
    throw new Error(
      "Could not parse extraction results. Raw response: " +
        jsonStr.substring(0, 200)
    );
  }
}

function mapToExtractedInvoice(ai: AIResponse): ExtractedInvoice {
  const lineItems: ExtractedLineItem[] = (ai.line_items ?? []).map(
    (item, index) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      amount: item.amount,
      sortOrder: index,
    })
  );

  return {
    vendorName: ai.vendor_name,
    vendorAddress: ai.vendor_address,
    invoiceNumber: ai.invoice_number,
    invoiceDate: ai.invoice_date,
    dueDate: ai.due_date,
    subtotal: ai.subtotal,
    taxAmount: ai.tax_amount,
    totalAmount: ai.total_amount,
    currency: ai.currency ?? "USD",
    paymentTerms: ai.payment_terms,
    confidenceScore: ai.confidence,
    lineItems,
  };
}

export class ClaudeExtractionProvider implements ExtractionProvider {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });
  }

  async extractInvoiceData(
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<ExtractionResult> {
    const startTime = Date.now();

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [
          {
            role: "user",
            content: [
              buildContentBlock(fileBuffer, mimeType) as Anthropic.ContentBlockParam,
              { type: "text", text: EXTRACTION_PROMPT },
            ],
          },
        ],
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "APIConnectionTimeoutError"
      ) {
        throw new Error("Extraction timed out. Please retry.");
      }
      if (error instanceof Error && error.name === "RateLimitError") {
        throw new Error(
          "Extraction service is busy. Please retry in a moment."
        );
      }
      if (error instanceof Error && error.name === "APIError") {
        throw new Error("Extraction service unavailable. Please retry.");
      }
      throw error;
    }

    const durationMs = Date.now() - startTime;

    const textBlock = response.content.find(
      (block) => block.type === "text"
    );
    if (!textBlock || textBlock.type !== "text" || !textBlock.text) {
      throw new Error(
        "Could not extract data from this document. The file may be unreadable or unsupported."
      );
    }

    const aiResponse = parseAIResponse(textBlock.text);
    const data = mapToExtractedInvoice(aiResponse);

    return {
      data,
      rawResponse: {
        content: response.content,
        model: response.model,
        usage: response.usage,
        stop_reason: response.stop_reason,
        parsed: aiResponse,
      } as unknown as Record<string, unknown>,
      modelVersion: response.model,
      durationMs,
    };
  }
}
