import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join } from "path";
import { logger } from "@/lib/utils/logger";
import type {
  ExtractionProvider,
  ExtractionResult,
  ExtractedInvoice,
  ExtractedLineItem,
  ExtractionContext,
} from "./types";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;
const TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;

/**
 * Resolve the Anthropic API key.
 *
 * Next.js / dotenv will NOT override a variable that already exists in the
 * process environment — even if it is an empty string.  Tools like Claude Code
 * export `ANTHROPIC_API_KEY=` (empty) in the shell profile, which shadows the
 * real key stored in `.env.local`.
 *
 * Fallback order:
 *   1. process.env.ANTHROPIC_API_KEY  (if non-empty)
 *   2. Value parsed directly from .env.local
 */
function getAnthropicApiKey(): string | undefined {
  const fromEnv = process.env.ANTHROPIC_API_KEY;
  if (fromEnv) return fromEnv;

  // Fallback: read .env.local directly
  try {
    const envPath = join(process.cwd(), ".env.local");
    const content = readFileSync(envPath, "utf8");
    const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (match?.[1]) return match[1].trim();
  } catch {
    // .env.local not found or unreadable — acceptable in production
    // where the real env var should be set.
  }

  return undefined;
}

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
  "confidence": "high | medium | low — your confidence in the overall extraction accuracy",
  "tax_treatment": "exclusive | inclusive | no_tax — how line item amounts relate to tax"
}

Rules:
- Dates must be ISO format YYYY-MM-DD
- Numbers must be plain numbers (no currency symbols, no commas)
- If a field is not visible or cannot be determined, use null
- For vendor_address, use the vendor's company/headquarters/mailing address, NOT a store location, branch, or warehouse address. If the invoice shows both a store address and a company letterhead/remit-to address, use the letterhead or remit-to address.
- For line items, you MUST extract ALL line items visible in the invoice. Do not truncate or summarize. Count the line items to verify you have captured every one.
- Include shipping, freight, handling, and delivery charges as separate line items. Do not omit non-product charges.
- Include discount lines as line items with negative amounts.
- The confidence field reflects your overall confidence: "high" if the document is clear and all fields are readable, "medium" if some fields are ambiguous, "low" if the document is poor quality or heavily obscured
- Detect whether this document is a RECEIPT or an INVOICE. A receipt is any document showing a completed purchase: it says "receipt", shows a payment method (credit card, cash, check), has a transaction date, or comes from a retail store. An invoice is a request for future payment with terms like "Net 30" or "Due by [date]".
- If it is a RECEIPT: you MUST set payment_terms to "Paid" and you MUST set due_date equal to the invoice_date. Do not leave these null for receipts.
- If it is an INVOICE with no explicit due date: leave due_date as null so the user can enter it manually. Do NOT infer a due date from payment terms.
- For tax_treatment: "exclusive" if line item amounts are before tax (tax is shown separately), "inclusive" if line item amounts already include tax (common in UK/AU invoices), "no_tax" if no tax is shown at all. Default to "exclusive" if unclear.
- Do not infer or calculate values — extract only what is explicitly shown
- CRITICAL — arithmetic cross-check: after extracting all numbers, verify that subtotal + tax_amount = total_amount. If they do not add up, re-read the subtotal, tax, and total from the document carefully — receipt fonts can cause digits to be misread (e.g., "87" vs "59", "58" vs "86"). The total is usually the most prominent and reliable number. If after re-reading you still cannot make them add up, set confidence to "medium".
- Return raw JSON only — no wrapping, no explanation`;

function buildAccountPromptSection(
  accounts: Array<{ id: string; name: string }>
): string {
  const accountList = JSON.stringify(
    accounts.map((a) => ({ id: a.id, name: a.name }))
  );
  return `

Available expense accounts (use ONLY these IDs):
${accountList}

For each line item, also return:
  "suggested_gl_account_id": "string or null — the ID of the most likely expense account from the list above"

Rules for GL account suggestions:
- Match based on the semantic meaning of the line item description to the account name
- Only suggest an account if you are reasonably confident in the match
- Use null if no account is a clear match
- Use the exact ID string from the provided account list`;
}

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
    suggested_gl_account_id?: string | null;
  }>;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  confidence: "high" | "medium" | "low";
  tax_treatment?: "exclusive" | "inclusive" | "no_tax";
}

function buildContentBlock(
  fileBuffer: Buffer,
  mimeType: string
): Anthropic.DocumentBlockParam | Anthropic.ImageBlockParam | Anthropic.TextBlockParam {
  // Text-based content (email body HTML or plain text) -- send as text block
  if (mimeType === "text/html" || mimeType === "text/plain") {
    const textContent = fileBuffer.toString("utf-8");
    return {
      type: "text" as const,
      text: `The following is an invoice received as an email body. Extract the invoice data from this content:\n\n${textContent}`,
    };
  }

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
      quantity: item.quantity != null ? Number(item.quantity) : null,
      unitPrice: item.unit_price != null ? Number(item.unit_price) : null,
      amount: item.amount != null ? Number(item.amount) : null,
      sortOrder: index,
      suggestedGlAccountId:
        typeof item.suggested_gl_account_id === "string"
          ? item.suggested_gl_account_id
          : null,
    })
  );

  const result: ExtractedInvoice = {
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
    taxTreatment: (ai.tax_treatment === "exclusive" || ai.tax_treatment === "inclusive" || ai.tax_treatment === "no_tax")
      ? ai.tax_treatment
      : "exclusive",
    lineItems,
  };

  // Auto-populate due_date for receipts: if payment_terms indicates already
  // paid and due_date is null, copy invoice_date. Matches common receipt
  // patterns the AI might return even if it doesn't follow the prompt exactly.
  if (!result.dueDate && result.invoiceDate && result.paymentTerms) {
    const terms = result.paymentTerms.trim().toLowerCase();
    if (
      terms === "paid" ||
      terms === "paid in full" ||
      terms === "due on receipt" ||
      terms === "cod" ||
      terms === "cash on delivery" ||
      terms === "prepaid"
    ) {
      result.dueDate = result.invoiceDate;
    }
  }

  return result;
}

export class ClaudeExtractionProvider implements ExtractionProvider {
  private client: Anthropic;

  constructor() {
    const apiKey = getAnthropicApiKey();
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not configured. Set it in .env.local or the system environment."
      );
    }
    this.client = new Anthropic({
      apiKey,
      timeout: TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });
  }

  async extractInvoiceData(
    fileBuffer: Buffer,
    mimeType: string,
    context?: ExtractionContext
  ): Promise<ExtractionResult> {
    const startTime = Date.now();

    let promptText = EXTRACTION_PROMPT;
    if (context?.accounts && context.accounts.length > 0) {
      promptText += buildAccountPromptSection(context.accounts);
    }

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
              { type: "text", text: promptText },
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

    // Truncation detection: if Claude hit max_tokens, the JSON is likely incomplete
    if (response.stop_reason === "max_tokens") {
      logger.warn("extraction_response_truncated", {
        action: "extract_invoice",
        stop_reason: response.stop_reason,
        max_tokens: MAX_TOKENS,
      });
    }

    let aiResponse: AIResponse;
    try {
      aiResponse = parseAIResponse(textBlock.text);
    } catch (parseError) {
      // If truncated AND parse fails, give a clearer error
      if (response.stop_reason === "max_tokens") {
        throw new Error(
          "This invoice is too complex to extract automatically. Please retry or enter the data manually."
        );
      }
      throw parseError;
    }

    const data = mapToExtractedInvoice(aiResponse);

    // Recalculate subtotal as sum of all line item amounts (including shipping/freight)
    // The invoice's "Subtotal" often excludes shipping, but our line items include it
    if (data.lineItems.length > 0) {
      const lineItemSum = data.lineItems.reduce(
        (sum, item) => sum + (item.amount ?? 0),
        0
      );
      const rounded = Math.round(lineItemSum * 100) / 100;
      if (rounded !== data.subtotal && rounded > 0) {
        data.subtotal = rounded;
      }
    }

    // Override confidence if response was truncated
    if (response.stop_reason === "max_tokens") {
      data.confidenceScore = "low";
    }

    // Arithmetic cross-check: the total is the most prominent number on receipts
    // and is almost always read correctly. Subtotal and tax are smaller/lighter
    // and frequently misread on receipt images. When we can detect a mismatch,
    // back-calculate the subtotal from total - tax.
    if (data.subtotal != null && data.totalAmount != null && data.taxAmount != null) {
      const expected = Math.round((data.subtotal + data.taxAmount) * 100) / 100;
      const actual = Math.round(data.totalAmount * 100) / 100;
      const correctedSubtotal = Math.round((data.totalAmount - data.taxAmount) * 100) / 100;

      if (Math.abs(actual - expected) > 0.01) {
        // Case 1: subtotal + tax != total — clear mismatch.
        // Trust total and back-calculate subtotal.
        if (correctedSubtotal > 0) {
          logger.warn("extraction_subtotal_corrected_from_total", {
            action: "extract_invoice",
            originalSubtotal: data.subtotal,
            correctedSubtotal,
            taxAmount: data.taxAmount,
            totalAmount: data.totalAmount,
          });
          data.subtotal = correctedSubtotal;
          // Fix single line item to match corrected subtotal
          if (data.lineItems.length === 1) {
            data.lineItems[0].amount = correctedSubtotal;
            if (data.lineItems[0].quantity === 1) {
              data.lineItems[0].unitPrice = correctedSubtotal;
            }
          }
        } else {
          logger.warn("extraction_subtotal_total_mismatch", {
            action: "extract_invoice",
            subtotal: data.subtotal,
            taxAmount: data.taxAmount,
            totalAmount: data.totalAmount,
            gap: Math.round((actual - expected) * 100) / 100,
          });
        }
        if (data.confidenceScore === "high") {
          data.confidenceScore = "medium";
        }
      }
    }

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
