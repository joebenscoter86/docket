# DOC-14: Extraction API Route Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AI extraction pipeline that sends uploaded invoices to Claude Vision and stores structured results in the database.

**Architecture:** Provider-agnostic extraction interface with a Claude Vision implementation behind it. A shared `runExtraction()` orchestration function handles file fetching, provider calls, DB writes, and status transitions. Both the upload auto-trigger and the manual extract API route use this same function.

**Tech Stack:** Next.js 14 API routes, Anthropic SDK (`@anthropic-ai/sdk`), Supabase (Storage + Postgres), Vitest

**Spec:** `docs/superpowers/specs/2026-03-15-extraction-api-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `lib/extraction/types.ts` | TypeScript types: `ExtractedInvoice`, `ExtractedLineItem`, `ExtractionResult`, `ExtractionProvider` interface |
| `lib/extraction/provider.ts` | Factory function `getExtractionProvider()` returning the configured provider |
| `lib/extraction/claude.ts` | `ClaudeExtractionProvider` — calls Claude Vision API, parses response, maps fields |
| `lib/extraction/run.ts` | `runExtraction()` — orchestrates file fetch → provider call → DB writes → status updates |
| `app/api/invoices/[id]/extract/route.ts` | API route for manual extraction/retry with auth + ownership + status guards |
| `app/api/invoices/upload/route.ts` | Modified to auto-trigger `runExtraction()` after upload |

---

## Chunk 1: Types, Provider Interface, and Claude Implementation

### Task 1: Install Anthropic SDK

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install @anthropic-ai/sdk**

Run:
```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Verify installation**

Run:
```bash
node -e "require('@anthropic-ai/sdk'); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @anthropic-ai/sdk dependency (DOC-14)"
```

---

### Task 2: Create extraction types

**Files:**
- Create: `lib/extraction/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
export interface ExtractedLineItem {
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  sortOrder: number;
}

export interface ExtractedInvoice {
  vendorName: string | null;
  vendorAddress: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  subtotal: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  currency: string;
  paymentTerms: string | null;
  confidenceScore: "high" | "medium" | "low";
  lineItems: ExtractedLineItem[];
}

export interface ExtractionResult {
  data: ExtractedInvoice;
  rawResponse: Record<string, unknown>;
  modelVersion: string;
  durationMs: number;
}

export interface ExtractionProvider {
  extractInvoiceData(
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<ExtractionResult>;
}
```

- [ ] **Step 2: Verify types compile**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/extraction/types.ts
git commit -m "feat: add extraction type definitions (DOC-14)"
```

---

### Task 3: Create provider factory

**Files:**
- Create: `lib/extraction/provider.ts`

- [ ] **Step 1: Write the provider factory**

```typescript
import type { ExtractionProvider } from "./types";
import { ClaudeExtractionProvider } from "./claude";

export function getExtractionProvider(): ExtractionProvider {
  return new ClaudeExtractionProvider();
}
```

> Note: This file will fail typecheck until Task 4 creates `claude.ts`. That's expected — we'll verify after Task 4.

- [ ] **Step 2: Commit**

```bash
git add lib/extraction/provider.ts
git commit -m "feat: add extraction provider factory (DOC-14)"
```

---

### Task 4: Build Claude Vision provider — tests first

**Files:**
- Create: `lib/extraction/claude.test.ts`
- Create: `lib/extraction/claude.ts`

- [ ] **Step 1: Write the test file**

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClaudeExtractionProvider } from "./claude";

// Mock the Anthropic SDK
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
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

function mockSuccessResponse(jsonStr?: string) {
  mockCreate.mockResolvedValue({
    content: [
      {
        type: "text",
        text: jsonStr ?? JSON.stringify(SAMPLE_AI_RESPONSE),
      },
    ],
    model: "claude-sonnet-4-20250514",
    usage: { input_tokens: 2000, output_tokens: 300 },
  });
}

describe("ClaudeExtractionProvider", () => {
  let provider: ClaudeExtractionProvider;
  const pdfBuffer = Buffer.from("%PDF-1.4 test content");

  beforeEach(() => {
    vi.clearAllMocks();
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
    (apiError as Record<string, unknown>).status = 500;
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run lib/extraction/claude.test.ts
```
Expected: FAIL (ClaudeExtractionProvider doesn't exist yet)

- [ ] **Step 3: Write the Claude provider implementation**

```typescript
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

// Snake_case shape returned by the AI prompt
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

  // JPEG or PNG — use image content block
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

  // Strip markdown code fences if present
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
              buildContentBlock(fileBuffer, mimeType),
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
```

> **Note on rate limiting:** The Anthropic SDK's `maxRetries` config handles 429 retries with exponential backoff automatically. Setting `maxRetries: 3` satisfies the CLAUDE.md requirement for "exponential backoff (1s, 2s, 4s). Max 3 retries." without custom retry logic.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run lib/extraction/claude.test.ts
```
Expected: All tests PASS

- [ ] **Step 5: Type check**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add lib/extraction/claude.ts lib/extraction/claude.test.ts
git commit -m "feat: implement Claude Vision extraction provider with tests (DOC-14)"
```

---

## Chunk 2: Orchestration and API Routes

### Task 5: Build runExtraction orchestration — tests first

**Files:**
- Create: `lib/extraction/run.test.ts`
- Create: `lib/extraction/run.ts`

- [ ] **Step 1: Write the test file**

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runExtraction } from "./run";
import type { ExtractionResult } from "./types";

// Mock provider
const mockExtractInvoiceData = vi.fn();
vi.mock("./provider", () => ({
  getExtractionProvider: () => ({
    extractInvoiceData: mockExtractInvoiceData,
  }),
}));

// Mock admin client
const mockStorageCreateSignedUrl = vi.fn();
const mockInsertExtractedData = vi.fn();
const mockInsertLineItems = vi.fn();
const mockUpdate = vi.fn();
const mockSelectRetryCount = vi.fn();
const mockAdminClient = {
  storage: {
    from: vi.fn(() => ({
      createSignedUrl: mockStorageCreateSignedUrl,
    })),
  },
  from: vi.fn((table: string) => {
    if (table === "extracted_data") {
      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: mockInsertExtractedData,
          })),
        })),
      };
    }
    if (table === "extracted_line_items") {
      return {
        insert: mockInsertLineItems,
      };
    }
    if (table === "invoices") {
      return {
        update: vi.fn(() => ({
          eq: mockUpdate,
        })),
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockSelectRetryCount,
          })),
        })),
      };
    }
    return {};
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

// Mock fetch for downloading file from signed URL
const mockFetchResponse = {
  ok: true,
  arrayBuffer: vi.fn(() =>
    Promise.resolve(new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer)
  ),
};
vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(mockFetchResponse)));

const SAMPLE_RESULT: ExtractionResult = {
  data: {
    vendorName: "Acme Corp",
    vendorAddress: "123 Main St",
    invoiceNumber: "INV-001",
    invoiceDate: "2024-03-15",
    dueDate: "2024-04-14",
    subtotal: 500.0,
    taxAmount: 40.0,
    totalAmount: 540.0,
    currency: "USD",
    paymentTerms: "Net 30",
    confidenceScore: "high",
    lineItems: [
      {
        description: "Widget A",
        quantity: 10,
        unitPrice: 25.0,
        amount: 250.0,
        sortOrder: 0,
      },
    ],
  },
  rawResponse: { vendor_name: "Acme Corp" },
  modelVersion: "claude-sonnet-4-20250514",
  durationMs: 3500,
};

const DEFAULT_PARAMS = {
  invoiceId: "inv-123",
  orgId: "org-1",
  userId: "user-1",
  filePath: "org-1/inv-123/invoice.pdf",
  fileType: "application/pdf",
};

describe("runExtraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.com/signed-url" },
      error: null,
    });
    mockExtractInvoiceData.mockResolvedValue(SAMPLE_RESULT);
    mockInsertExtractedData.mockResolvedValue({
      data: { id: "ed-1" },
      error: null,
    });
    mockInsertLineItems.mockResolvedValue({ error: null });
    mockUpdate.mockResolvedValue({ error: null });
    mockSelectRetryCount.mockResolvedValue({ data: { retry_count: 0 }, error: null });
  });

  it("completes the full extraction pipeline successfully", async () => {
    const result = await runExtraction(DEFAULT_PARAMS);

    expect(result.data.vendorName).toBe("Acme Corp");
    expect(result.modelVersion).toBe("claude-sonnet-4-20250514");
  });

  it("generates a fresh signed URL from Storage", async () => {
    await runExtraction(DEFAULT_PARAMS);

    expect(mockAdminClient.storage.from).toHaveBeenCalledWith("invoices");
    expect(mockStorageCreateSignedUrl).toHaveBeenCalledWith(
      "org-1/inv-123/invoice.pdf",
      3600
    );
  });

  it("fetches the file from the signed URL", async () => {
    await runExtraction(DEFAULT_PARAMS);

    expect(fetch).toHaveBeenCalledWith("https://example.com/signed-url");
  });

  it("passes file buffer and mimeType to the provider", async () => {
    await runExtraction(DEFAULT_PARAMS);

    expect(mockExtractInvoiceData).toHaveBeenCalledWith(
      expect.any(Buffer),
      "application/pdf"
    );
  });

  it("inserts extracted_data with correct field mapping", async () => {
    await runExtraction(DEFAULT_PARAMS);

    expect(mockAdminClient.from).toHaveBeenCalledWith("extracted_data");
    expect(mockInsertExtractedData).toHaveBeenCalled();
  });

  it("inserts line items into extracted_line_items", async () => {
    await runExtraction(DEFAULT_PARAMS);

    expect(mockAdminClient.from).toHaveBeenCalledWith("extracted_line_items");
    expect(mockInsertLineItems).toHaveBeenCalled();
  });

  it("updates invoice status to pending_review on success", async () => {
    await runExtraction(DEFAULT_PARAMS);

    expect(mockAdminClient.from).toHaveBeenCalledWith("invoices");
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("sets invoice status to error when signed URL fails", async () => {
    mockStorageCreateSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "Storage error" },
    });

    await expect(runExtraction(DEFAULT_PARAMS)).rejects.toThrow();
    expect(mockAdminClient.from).toHaveBeenCalledWith("invoices");
  });

  it("sets invoice status to error when file fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 404 })));

    await expect(runExtraction(DEFAULT_PARAMS)).rejects.toThrow(
      "Failed to fetch file"
    );
  });

  it("sets invoice status to error when extraction fails", async () => {
    mockExtractInvoiceData.mockRejectedValue(
      new Error("Extraction timed out")
    );

    await expect(runExtraction(DEFAULT_PARAMS)).rejects.toThrow(
      "Extraction timed out"
    );
  });

  it("sets invoice status to error when DB insert fails", async () => {
    mockInsertExtractedData.mockResolvedValue({
      data: null,
      error: { message: "DB insert failed" },
    });

    await expect(runExtraction(DEFAULT_PARAMS)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run lib/extraction/run.test.ts
```
Expected: FAIL (runExtraction doesn't exist yet)

- [ ] **Step 3: Write the orchestration implementation**

```typescript
import { createAdminClient } from "@/lib/supabase/admin";
import { getExtractionProvider } from "./provider";
import { logger } from "@/lib/utils/logger";
import type { ExtractionResult } from "./types";

export async function runExtraction(params: {
  invoiceId: string;
  orgId: string;
  userId: string;
  filePath: string;
  fileType: string;
}): Promise<ExtractionResult> {
  const { invoiceId, orgId, userId, filePath, fileType } = params;
  const admin = createAdminClient();

  try {
    // 1. Generate fresh signed URL
    const { data: signedUrlData, error: signedUrlError } = await admin.storage
      .from("invoices")
      .createSignedUrl(filePath, 3600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error(
        "Failed to generate signed URL: " +
          (signedUrlError?.message ?? "unknown error")
      );
    }

    // 2. Fetch file bytes
    const fileResponse = await fetch(signedUrlData.signedUrl);
    if (!fileResponse.ok) {
      throw new Error(`Failed to fetch file: HTTP ${fileResponse.status}`);
    }
    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());

    // 3. Call extraction provider
    const provider = getExtractionProvider();
    const result = await provider.extractInvoiceData(fileBuffer, fileType);

    // 4. Store extracted_data
    const { data: extractedRow, error: insertError } = await admin
      .from("extracted_data")
      .insert({
        invoice_id: invoiceId,
        vendor_name: result.data.vendorName,
        vendor_address: result.data.vendorAddress,
        invoice_number: result.data.invoiceNumber,
        invoice_date: result.data.invoiceDate,
        due_date: result.data.dueDate,
        subtotal: result.data.subtotal,
        tax_amount: result.data.taxAmount,
        total_amount: result.data.totalAmount,
        currency: result.data.currency,
        payment_terms: result.data.paymentTerms,
        raw_ai_response: result.rawResponse,
        confidence_score: result.data.confidenceScore,
        model_version: result.modelVersion,
        extraction_duration_ms: result.durationMs,
      })
      .select("id")
      .single();

    if (insertError || !extractedRow) {
      throw new Error(
        "Failed to store extraction results: " +
          (insertError?.message ?? "unknown error")
      );
    }

    // 5. Store line items
    if (result.data.lineItems.length > 0) {
      const lineItemRows = result.data.lineItems.map((item) => ({
        extracted_data_id: extractedRow.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        amount: item.amount,
        gl_account_id: null,
        sort_order: item.sortOrder,
      }));

      const { error: lineItemError } = await admin
        .from("extracted_line_items")
        .insert(lineItemRows);

      if (lineItemError) {
        throw new Error(
          "Failed to store line items: " + lineItemError.message
        );
      }
    }

    // 6. Update invoice status to pending_review
    const { error: statusError } = await admin
      .from("invoices")
      .update({ status: "pending_review", error_message: null })
      .eq("id", invoiceId);

    if (statusError) {
      logger.warn("extraction_status_update_failed", {
        invoiceId,
        orgId,
        userId,
        error: statusError.message,
      });
      // Non-fatal: data is stored, status can be fixed manually
    }

    // 7. Log success
    logger.info("extraction_complete", {
      invoiceId,
      orgId,
      userId,
      durationMs: result.durationMs,
      modelVersion: result.modelVersion,
      confidenceScore: result.data.confidenceScore,
      lineItemCount: result.data.lineItems.length,
      status: "success",
    });

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown extraction error";

    // Read current retry_count, then update with increment
    const { data: currentInvoice } = await admin
      .from("invoices")
      .select("retry_count")
      .eq("id", invoiceId)
      .single();

    await admin
      .from("invoices")
      .update({
        status: "error",
        error_message: errorMessage,
        retry_count: (currentInvoice?.retry_count ?? 0) + 1,
      })
      .eq("id", invoiceId);

    logger.error("extraction_failed", {
      invoiceId,
      orgId,
      userId,
      error: errorMessage,
      status: "error",
    });

    throw error;
  }
}
```

> **Note on retry_count increment:** Supabase JS client doesn't support `SET retry_count = retry_count + 1` natively. We use read-then-write: read current `retry_count`, then update with `+ 1`. This has a minor race condition with concurrent extractions, but that's not possible for the same invoice (status guard prevents it).

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run lib/extraction/run.test.ts
```
Expected: All tests PASS

- [ ] **Step 5: Type check**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add lib/extraction/run.ts lib/extraction/run.test.ts
git commit -m "feat: implement extraction orchestration with tests (DOC-14)"
```

---

### Task 6: Build the extract API route — tests first

**Files:**
- Modify: `app/api/invoices/[id]/extract/route.ts`
- Create: `app/api/invoices/[id]/extract/route.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

// Mock server client (auth)
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockServerClient = {
  auth: { getUser: mockGetUser },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: mockFrom,
      })),
    })),
  })),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockServerClient,
}));

// Mock admin client (for status update)
const mockAdminUpdate = vi.fn();
const mockAdminClient = {
  from: vi.fn(() => ({
    update: vi.fn(() => ({
      eq: mockAdminUpdate,
    })),
  })),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

// Mock runExtraction
const mockRunExtraction = vi.fn();
vi.mock("@/lib/extraction/run", () => ({
  runExtraction: (...args: unknown[]) => mockRunExtraction(...args),
}));

function createRequest(invoiceId: string): Request {
  return new Request(
    `http://localhost/api/invoices/${invoiceId}/extract`,
    { method: "POST" }
  );
}

const SAMPLE_EXTRACTION_RESULT = {
  data: {
    vendorName: "Acme Corp",
    vendorAddress: "123 Main St",
    invoiceNumber: "INV-001",
    invoiceDate: "2024-03-15",
    dueDate: "2024-04-14",
    subtotal: 500.0,
    taxAmount: 40.0,
    totalAmount: 540.0,
    currency: "USD",
    paymentTerms: "Net 30",
    confidenceScore: "high",
    lineItems: [],
  },
  rawResponse: {},
  modelVersion: "claude-sonnet-4-20250514",
  durationMs: 3500,
};

describe("POST /api/invoices/[id]/extract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(createRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });

  it("returns 404 when invoice is not found or not owned", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({ data: null, error: { message: "not found" } });

    const res = await POST(createRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 409 when invoice is already extracting", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({
      data: {
        id: "inv-1",
        status: "extracting",
        org_id: "org-1",
        file_path: "org-1/inv-1/file.pdf",
        file_type: "application/pdf",
      },
      error: null,
    });

    const res = await POST(createRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("CONFLICT");
  });

  it("returns 409 when invoice is approved", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({
      data: {
        id: "inv-1",
        status: "approved",
        org_id: "org-1",
        file_path: "org-1/inv-1/file.pdf",
        file_type: "application/pdf",
      },
      error: null,
    });

    const res = await POST(createRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("CONFLICT");
  });

  it("returns 409 when invoice is already synced", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({
      data: {
        id: "inv-1",
        status: "synced",
        org_id: "org-1",
        file_path: "org-1/inv-1/file.pdf",
        file_type: "application/pdf",
      },
      error: null,
    });

    const res = await POST(createRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("CONFLICT");
  });

  it("returns 200 with extracted data on success", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({
      data: {
        id: "inv-1",
        status: "error",
        org_id: "org-1",
        file_path: "org-1/inv-1/file.pdf",
        file_type: "application/pdf",
      },
      error: null,
    });
    mockAdminUpdate.mockResolvedValue({ error: null });
    mockRunExtraction.mockResolvedValue(SAMPLE_EXTRACTION_RESULT);

    const res = await POST(createRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.vendorName).toBe("Acme Corp");
  });

  it("returns 500 when extraction fails", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({
      data: {
        id: "inv-1",
        status: "error",
        org_id: "org-1",
        file_path: "org-1/inv-1/file.pdf",
        file_type: "application/pdf",
      },
      error: null,
    });
    mockAdminUpdate.mockResolvedValue({ error: null });
    mockRunExtraction.mockRejectedValue(new Error("Extraction timed out"));

    const res = await POST(createRequest("inv-1"), {
      params: Promise.resolve({ id: "inv-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain("Extraction timed out");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run "app/api/invoices/\\[id\\]/extract/route.test.ts"
```
Expected: FAIL (route is a stub)

- [ ] **Step 3: Write the extract route implementation**

Replace the stub in `app/api/invoices/[id]/extract/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runExtraction } from "@/lib/extraction/run";
import {
  authError,
  notFound,
  conflict,
  internalError,
  apiSuccess,
} from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const { id: invoiceId } = await params;
  let userId: string | undefined;

  try {
    // 1. Auth check
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.warn("extraction_auth_failed", { invoiceId });
      return authError();
    }
    userId = user.id;

    // 2. Ownership check — query invoice joined through org_memberships
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id, status, org_id, file_path, file_type")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      logger.warn("extraction_invoice_not_found", { userId, invoiceId });
      return notFound("Invoice not found.");
    }

    // 3. Status guard
    if (invoice.status === "extracting") {
      return conflict("Extraction is already in progress.");
    }
    if (invoice.status === "approved") {
      return conflict("Invoice is approved. Cannot re-extract without unapproving first.");
    }
    if (invoice.status === "synced") {
      return conflict("Already synced, cannot re-extract.");
    }

    // 4. Set status to extracting
    const admin = createAdminClient();
    await admin
      .from("invoices")
      .update({ status: "extracting", error_message: null })
      .eq("id", invoiceId);

    // 5. Run extraction
    const result = await runExtraction({
      invoiceId,
      orgId: invoice.org_id,
      userId,
      filePath: invoice.file_path,
      fileType: invoice.file_type,
    });

    const durationMs = Date.now() - startTime;
    logger.info("extraction_route_success", {
      invoiceId,
      userId,
      orgId: invoice.org_id,
      durationMs,
      status: "success",
    });

    // 6. Return extracted data
    return apiSuccess(result.data);
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    logger.error("extraction_route_failed", {
      invoiceId,
      userId,
      durationMs,
      error: errorMessage,
      status: "error",
    });

    return internalError(errorMessage);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run "app/api/invoices/\\[id\\]/extract/route.test.ts"
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add "app/api/invoices/[id]/extract/route.ts" "app/api/invoices/[id]/extract/route.test.ts"
git commit -m "feat: implement extract API route with tests (DOC-14)"
```

---

### Task 7: Modify upload route to auto-trigger extraction

**Files:**
- Modify: `app/api/invoices/upload/route.ts`
- Modify: `app/api/invoices/upload/route.test.ts`

- [ ] **Step 1: Add extraction auto-trigger to upload route**

In `app/api/invoices/upload/route.ts`, add import at top:
```typescript
import { runExtraction } from "@/lib/extraction/run";
```

Then after step 8 (signed URL generation, around line 155), add:

```typescript
    // 9. Auto-trigger extraction
    let extractionStatus: "pending_review" | "error" = "error";
    let extractedData = null;
    try {
      const extractionResult = await runExtraction({
        invoiceId,
        orgId,
        userId,
        filePath: storagePath,
        fileType,
      });
      extractionStatus = "pending_review";
      extractedData = extractionResult.data;
    } catch {
      // Extraction failure is non-fatal for the upload response.
      // Invoice status is already set to 'error' by runExtraction.
      // User can retry via the extract endpoint.
      logger.warn("invoice_upload_extraction_failed", {
        userId,
        orgId,
        invoiceId,
        status: "extraction_failed",
      });
    }
```

Update the return statement to include extraction data:
```typescript
    return apiSuccess({
      invoiceId,
      fileName,
      signedUrl: signedUrlData?.signedUrl || null,
      extractionStatus,
      extractedData,
    });
```

- [ ] **Step 2: Add extraction mock to upload tests**

In `app/api/invoices/upload/route.test.ts`, add mock for runExtraction after the existing mocks:

```typescript
const mockRunExtraction = vi.fn();
vi.mock("@/lib/extraction/run", () => ({
  runExtraction: (...args: unknown[]) => mockRunExtraction(...args),
}));
```

In `beforeEach`, add default mock behavior:
```typescript
mockRunExtraction.mockResolvedValue({
  data: { vendorName: "Test Vendor", lineItems: [] },
  rawResponse: {},
  modelVersion: "claude-sonnet-4-20250514",
  durationMs: 3000,
});
```

- [ ] **Step 3: Add test for successful extraction auto-trigger**

Add to the describe block:
```typescript
  it("auto-triggers extraction and returns extracted data on success", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({
      data: { org_id: "org-1" },
      error: null,
    });
    mockStorageUpload.mockResolvedValue({ data: { path: "org-1/inv-1/invoice.pdf" }, error: null });
    mockInsert.mockResolvedValue({ data: { id: "inv-1" }, error: null });
    mockUpdate.mockResolvedValue({ error: null });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.com/signed" },
      error: null,
    });

    const req = createUploadRequest({
      name: "invoice.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.extractionStatus).toBe("pending_review");
    expect(body.data.extractedData).toBeDefined();
    expect(body.data.extractedData.vendorName).toBe("Test Vendor");
    expect(mockRunExtraction).toHaveBeenCalled();
  });
```

- [ ] **Step 4: Add test for failed extraction (non-fatal)**

```typescript
  it("returns 200 even when extraction fails", async () => {
    mockRunExtraction.mockRejectedValue(new Error("Extraction timed out"));

    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({
      data: { org_id: "org-1" },
      error: null,
    });
    mockStorageUpload.mockResolvedValue({ data: { path: "org-1/inv-1/invoice.pdf" }, error: null });
    mockInsert.mockResolvedValue({ data: { id: "inv-1" }, error: null });
    mockUpdate.mockResolvedValue({ error: null });
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.com/signed" },
      error: null,
    });

    const req = createUploadRequest({
      name: "invoice.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.invoiceId).toBeDefined();
    expect(body.data.extractionStatus).toBe("error");
    expect(body.data.extractedData).toBeNull();
  });
```

- [ ] **Step 5: Update existing success test to match new response shape**

Update the existing success test assertion to also check for the new fields:
```typescript
    expect(body.data).toHaveProperty("extractionStatus");
    expect(body.data).toHaveProperty("extractedData");
```

- [ ] **Step 6: Run all tests**

Run:
```bash
npx vitest run app/api/invoices/upload/route.test.ts
```
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add app/api/invoices/upload/route.ts app/api/invoices/upload/route.test.ts
git commit -m "feat: auto-trigger extraction from upload route (DOC-14)"
```

---

## Chunk 3: Verification and Cleanup

### Task 8: Full verification

- [ ] **Step 1: Run all tests**

Run:
```bash
npm run test
```
Expected: All tests PASS

- [ ] **Step 2: Type check**

Run:
```bash
npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Lint**

Run:
```bash
npm run lint
```
Expected: No warnings, no errors

- [ ] **Step 4: Build**

Run:
```bash
npm run build
```
Expected: Build succeeds

---

### Task 9: Update CLAUDE.md Decisions Log

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add decisions to the log**

Add these entries to the Decisions Log table (at the top, reverse chronological):

```markdown
| 2026-03-15 | Provider interface uses `fileBuffer + mimeType` instead of `fileUrl` | Decouples provider from Supabase Storage — future providers (Google Doc AI) won't need signed URLs. Orchestration layer handles file fetching. | DOC-14 |
| 2026-03-15 | Added `lib/extraction/run.ts` orchestration layer | Separates DB writes and status management from both the API route and the provider. Single shared function for upload auto-trigger and manual retry. | DOC-14 |
```

- [ ] **Step 2: Add `run.ts` to folder structure**

In the CLAUDE.md folder structure under `lib/extraction/`, add:
```
│   ├── extraction/
│   │   ├── provider.ts                     # Provider-agnostic interface
│   │   ├── claude.ts                       # Claude Vision implementation
│   │   ├── run.ts                          # Extraction orchestration (shared)
│   │   └── types.ts                        # ExtractedInvoice type
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update decisions log and folder structure for extraction (DOC-14)"
```
