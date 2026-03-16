import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtractionResult } from "./types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the extraction provider
const mockExtractInvoiceData = vi.fn();
vi.mock("./provider", () => ({
  getExtractionProvider: () => ({ extractInvoiceData: mockExtractInvoiceData }),
}));

// Mock logger to silence output during tests
vi.mock("@/lib/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Supabase admin mock — must handle multiple tables with different chains
// ---------------------------------------------------------------------------

// Spies exposed per-table so tests can assert independently
const mockExtractedDataInsert = vi.fn();
const mockLineItemsInsert = vi.fn();
const mockInvoicesUpdate = vi.fn();
const mockInvoicesSelect = vi.fn();

// Storage mock
const mockCreateSignedUrl = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: mockCreateSignedUrl,
      }),
    },
    from: (table: string) => {
      if (table === "extracted_data") {
        return {
          insert: (data: unknown) => {
            mockExtractedDataInsert(data);
            return {
              select: () => ({
                single: () => mockExtractedDataInsert.mock.results.length > 0
                  ? Promise.resolve({ data: { id: "ed-uuid-1" }, error: null })
                  : Promise.resolve({ data: null, error: { message: "insert failed" } }),
              }),
            };
          },
        };
      }

      if (table === "extracted_line_items") {
        return {
          insert: (data: unknown) => {
            mockLineItemsInsert(data);
            return mockLineItemsInsert.mock.results.length > 0
              ? Promise.resolve({ error: null })
              : Promise.resolve({ error: { message: "line items insert failed" } });
          },
        };
      }

      if (table === "invoices") {
        return {
          update: (data: unknown) => {
            mockInvoicesUpdate(data);
            return {
              eq: () => Promise.resolve({ error: null }),
            };
          },
          select: (cols: unknown) => {
            mockInvoicesSelect(cols);
            return {
              eq: () => ({
                single: () => Promise.resolve({ data: { retry_count: 0 }, error: null }),
              }),
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

// ---------------------------------------------------------------------------
// Global fetch mock
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const BASE_PARAMS = {
  invoiceId: "invoice-uuid-1",
  orgId: "org-uuid-1",
  userId: "user-uuid-1",
  filePath: "org-uuid-1/invoice-uuid-1/document.pdf",
  fileType: "application/pdf",
};

const MOCK_RESULT: ExtractionResult = {
  data: {
    vendorName: "Acme Corp",
    vendorAddress: "123 Main St, Springfield",
    invoiceNumber: "INV-001",
    invoiceDate: "2026-03-01",
    dueDate: "2026-03-31",
    subtotal: 900,
    taxAmount: 90,
    totalAmount: 990,
    currency: "USD",
    paymentTerms: "Net 30",
    confidenceScore: "high",
    lineItems: [
      {
        description: "Widget A",
        quantity: 10,
        unitPrice: 90,
        amount: 900,
        sortOrder: 0,
      },
    ],
  },
  rawResponse: { parsed: { vendor_name: "Acme Corp" } },
  modelVersion: "claude-sonnet-4-20250514",
  durationMs: 3800,
};

// ---------------------------------------------------------------------------
// Helper: set up default happy-path mocks
// ---------------------------------------------------------------------------

function setupHappyPath() {
  mockCreateSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://storage.example.com/signed/document.pdf" },
    error: null,
  });

  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    arrayBuffer: async () => new ArrayBuffer(8),
  });

  mockExtractInvoiceData.mockResolvedValue(MOCK_RESULT);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runExtraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs the full pipeline successfully", async () => {
    setupHappyPath();
    const { runExtraction } = await import("./run");

    const result = await runExtraction(BASE_PARAMS);

    expect(result).toEqual(MOCK_RESULT);
  });

  it("generates a signed URL from the correct storage path", async () => {
    setupHappyPath();
    const { runExtraction } = await import("./run");

    await runExtraction(BASE_PARAMS);

    expect(mockCreateSignedUrl).toHaveBeenCalledWith(BASE_PARAMS.filePath, 3600);
  });

  it("fetches the file from the signed URL", async () => {
    setupHappyPath();
    const { runExtraction } = await import("./run");

    await runExtraction(BASE_PARAMS);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://storage.example.com/signed/document.pdf"
    );
  });

  it("passes file buffer and mimeType to the provider", async () => {
    setupHappyPath();
    const { runExtraction } = await import("./run");

    await runExtraction(BASE_PARAMS);

    expect(mockExtractInvoiceData).toHaveBeenCalledWith(
      expect.any(Buffer),
      BASE_PARAMS.fileType
    );
  });

  it("inserts extracted_data with correct field mapping", async () => {
    setupHappyPath();
    const { runExtraction } = await import("./run");

    await runExtraction(BASE_PARAMS);

    expect(mockExtractedDataInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice_id: BASE_PARAMS.invoiceId,
        vendor_name: MOCK_RESULT.data.vendorName,
        vendor_address: MOCK_RESULT.data.vendorAddress,
        invoice_number: MOCK_RESULT.data.invoiceNumber,
        invoice_date: MOCK_RESULT.data.invoiceDate,
        due_date: MOCK_RESULT.data.dueDate,
        subtotal: MOCK_RESULT.data.subtotal,
        tax_amount: MOCK_RESULT.data.taxAmount,
        total_amount: MOCK_RESULT.data.totalAmount,
        currency: MOCK_RESULT.data.currency,
        payment_terms: MOCK_RESULT.data.paymentTerms,
        confidence_score: MOCK_RESULT.data.confidenceScore,
        model_version: MOCK_RESULT.modelVersion,
        extraction_duration_ms: MOCK_RESULT.durationMs,
      })
    );
  });

  it("inserts line items into extracted_line_items", async () => {
    setupHappyPath();
    const { runExtraction } = await import("./run");

    await runExtraction(BASE_PARAMS);

    expect(mockLineItemsInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          extracted_data_id: "ed-uuid-1",
          description: "Widget A",
          quantity: 10,
          unit_price: 90,
          amount: 900,
          sort_order: 0,
          gl_account_id: null,
        }),
      ])
    );
  });

  it("updates invoice status to pending_review on success", async () => {
    setupHappyPath();
    const { runExtraction } = await import("./run");

    await runExtraction(BASE_PARAMS);

    expect(mockInvoicesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending_review",
        error_message: null,
      })
    );
  });

  it("throws and sets invoice status to error when signed URL generation fails", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "Storage bucket not found" },
    });

    const { runExtraction } = await import("./run");

    await expect(runExtraction(BASE_PARAMS)).rejects.toThrow(
      "Failed to retrieve uploaded file"
    );

    // Error path: reads retry_count then updates status to error
    expect(mockInvoicesSelect).toHaveBeenCalled();
    expect(mockInvoicesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error" })
    );
  });

  it("throws when file fetch returns non-200 status", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example.com/signed/document.pdf" },
      error: null,
    });

    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      arrayBuffer: async () => new ArrayBuffer(0),
    });

    const { runExtraction } = await import("./run");

    await expect(runExtraction(BASE_PARAMS)).rejects.toThrow(
      "Failed to retrieve uploaded file"
    );
  });

  it("throws and sets invoice status to error when extraction provider fails", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example.com/signed/document.pdf" },
      error: null,
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(8),
    });

    mockExtractInvoiceData.mockRejectedValue(
      new Error("Extraction timed out. Please retry.")
    );

    const { runExtraction } = await import("./run");

    await expect(runExtraction(BASE_PARAMS)).rejects.toThrow(
      "Extraction timed out. Please retry."
    );

    expect(mockInvoicesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error" })
    );
  });

  it("throws when extracted_data DB insert fails", async () => {
    setupHappyPath();

    // Reset and re-mock for this specific test to simulate insert failure
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        storage: {
          from: () => ({
            createSignedUrl: mockCreateSignedUrl,
          }),
        },
        from: (table: string) => {
          if (table === "extracted_data") {
            return {
              insert: () => ({
                select: () => ({
                  single: () =>
                    Promise.resolve({
                      data: null,
                      error: { message: "DB constraint violation" },
                    }),
                }),
              }),
            };
          }
          if (table === "invoices") {
            return {
              update: (data: unknown) => {
                mockInvoicesUpdate(data);
                return { eq: () => Promise.resolve({ error: null }) };
              },
              select: () => ({
                eq: () => ({
                  single: () =>
                    Promise.resolve({ data: { retry_count: 2 }, error: null }),
                }),
              }),
            };
          }
          throw new Error(`Unexpected table: ${table}`);
        },
      }),
    }));

    // Re-import to pick up the new mock
    vi.resetModules();
    const { runExtraction: runExtractionFresh } = await import("./run");

    // Re-apply provider mock after reset
    vi.doMock("./provider", () => ({
      getExtractionProvider: () => ({
        extractInvoiceData: mockExtractInvoiceData,
      }),
    }));

    await expect(runExtractionFresh(BASE_PARAMS)).rejects.toThrow(
      "Failed to store extraction results"
    );

    // Restore original mocks
    vi.resetModules();
  });
});
