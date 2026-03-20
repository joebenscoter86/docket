// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { processBatchSync } from "./batch-sync";
import type { BatchSyncInvoice } from "./batch-sync";

// ─── Mocks ───

vi.mock("@/lib/quickbooks/auth", () => ({
  getValidAccessToken: vi.fn().mockResolvedValue({
    accessToken: "fake-token",
    companyId: "123",
  }),
}));

const mockCreateBill = vi.fn();
const mockCreatePurchase = vi.fn();
const mockAttachPdfToEntity = vi.fn();

vi.mock("@/lib/quickbooks/api", () => ({
  createBill: (...args: unknown[]) => mockCreateBill(...args),
  createPurchase: (...args: unknown[]) => mockCreatePurchase(...args),
  attachPdfToEntity: (...args: unknown[]) => mockAttachPdfToEntity(...args),
  QBOApiError: class QBOApiError extends Error {
    statusCode: number;
    qboErrors: Array<{
      Message: string;
      Detail: string;
      code: string;
      element?: string;
    }>;
    faultType: string;
    constructor(
      statusCode: number,
      errors: Array<{
        Message: string;
        Detail: string;
        code: string;
        element?: string;
      }> = [],
      faultType = "unknown"
    ) {
      super(errors[0]?.Message ?? "Unknown");
      this.statusCode = statusCode;
      this.qboErrors = errors;
      this.faultType = faultType;
    }
    get errorCode() {
      return this.qboErrors[0]?.code ?? "unknown";
    }
    get element() {
      return this.qboErrors[0]?.element;
    }
    get detail() {
      return this.qboErrors[0]?.Detail ?? this.message;
    }
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Admin client mock factory ───

function makeAdminClient({
  syncLogData = null as { provider_bill_id: string } | null,
  syncLogError = { code: "PGRST116", message: "not found" } as { code: string; message: string } | null,
  extractedData = {
    id: "ed-1",
    invoice_id: "inv-1",
    vendor_ref: "vendor-42",
    invoice_date: "2026-03-01",
    due_date: "2026-04-01",
    invoice_number: "INV-001",
  },
  lineItems = [
    {
      id: "li-1",
      amount: 100,
      gl_account_id: "gl-1",
      description: "Supplies",
      sort_order: 0,
    },
  ],
  storageData = { arrayBuffer: async () => new ArrayBuffer(8) },
  storageError = null as { message: string } | null,
} = {}) {
  const mockSyncLogInsert = vi.fn().mockResolvedValue({ error: null });
  const mockInvoicesUpdate = vi.fn().mockResolvedValue({ error: null });
  const mockStorageDownload = vi
    .fn()
    .mockResolvedValue({ data: storageError ? null : storageData, error: storageError });

  const client = {
    from: vi.fn((table: string) => {
      if (table === "sync_log") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: syncLogData,
                error: syncLogError,
              }),
            })),
          })),
          insert: mockSyncLogInsert,
        };
      }
      if (table === "extracted_data") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: extractedData,
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === "extracted_line_items") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({ data: lineItems, error: null }),
            })),
          })),
        };
      }
      if (table === "invoices") {
        return {
          update: vi.fn(() => ({
            eq: mockInvoicesUpdate,
          })),
        };
      }
      return {};
    }),
    storage: {
      from: vi.fn(() => ({
        download: mockStorageDownload,
      })),
    },
    _mockSyncLogInsert: mockSyncLogInsert,
    _mockInvoicesUpdate: mockInvoicesUpdate,
    _mockStorageDownload: mockStorageDownload,
  };

  return client;
}

// ─── Fixtures ───

const ORG_ID = "org-1";
const BATCH_ID = "b1000000-0000-0000-0000-000000000001";

const billInvoice: BatchSyncInvoice = {
  id: "inv-1",
  org_id: ORG_ID,
  output_type: "bill",
  payment_account_id: null,
  file_path: "invoices/inv-1.pdf",
  file_name: "invoice1.pdf",
  retry_count: 0,
};

// ─── Tests ───

describe("processBatchSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateBill.mockResolvedValue({ Bill: { Id: "qbo-bill-123" } });
    mockCreatePurchase.mockResolvedValue({ Purchase: { Id: "qbo-purchase-456" } });
    mockAttachPdfToEntity.mockResolvedValue(undefined);
  });

  it("syncs all invoices sequentially and returns correct counts", async () => {
    const invoice2: BatchSyncInvoice = {
      ...billInvoice,
      id: "inv-2",
      file_name: "invoice2.pdf",
    };

    // We need two separate extracted_data records — use a flexible admin client
    let callCount = 0;
    const admin = makeAdminClient();
    // Override the extracted_data select to return different data per call
    const origFrom = admin.from.bind(admin);
    admin.from = vi.fn((table: string) => {
      if (table === "extracted_data") {
        callCount++;
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: `ed-${callCount}`,
                  invoice_id: `inv-${callCount}`,
                  vendor_ref: "vendor-42",
                  invoice_date: "2026-03-01",
                  due_date: null,
                  invoice_number: null,
                },
                error: null,
              }),
            })),
          })),
        };
      }
      return origFrom(table);
    });

    const result = await processBatchSync(admin as unknown as ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>, ORG_ID, BATCH_ID, [
      billInvoice,
      invoice2,
    ]);

    expect(result.synced).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.skippedIdempotent).toBe(0);
    expect(mockCreateBill).toHaveBeenCalledTimes(2);
  });

  it("continues processing after individual invoice failure", async () => {
    const invoice2: BatchSyncInvoice = {
      ...billInvoice,
      id: "inv-2",
      file_name: "invoice2.pdf",
    };

    // First call fails, second succeeds
    mockCreateBill
      .mockRejectedValueOnce(new Error("QBO error"))
      .mockResolvedValueOnce({ Bill: { Id: "qbo-bill-999" } });

    const admin = makeAdminClient();

    const result = await processBatchSync(
      admin as unknown as ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
      ORG_ID,
      BATCH_ID,
      [billInvoice, invoice2]
    );

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.skippedIdempotent).toBe(0);
    expect(mockCreateBill).toHaveBeenCalledTimes(2);
  });

  it("skips already-synced invoices (idempotency) and increments skippedIdempotent", async () => {
    const admin = makeAdminClient({
      syncLogData: { provider_bill_id: "existing-qbo-bill-456" },
      syncLogError: null,
    });

    const result = await processBatchSync(
      admin as unknown as ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
      ORG_ID,
      BATCH_ID,
      [billInvoice]
    );

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skippedIdempotent).toBe(1);
    expect(mockCreateBill).not.toHaveBeenCalled();
  });

  it("returns totalMs as a positive number", async () => {
    const admin = makeAdminClient();

    const result = await processBatchSync(
      admin as unknown as ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
      ORG_ID,
      BATCH_ID,
      [billInvoice]
    );

    expect(result.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("handles empty invoice list gracefully", async () => {
    const admin = makeAdminClient();

    const result = await processBatchSync(
      admin as unknown as ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
      ORG_ID,
      BATCH_ID,
      []
    );

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skippedIdempotent).toBe(0);
    expect(mockCreateBill).not.toHaveBeenCalled();
  });

  it("proceeds with partial success when PDF attachment fails", async () => {
    mockAttachPdfToEntity.mockRejectedValueOnce(new Error("S3 download failed"));
    const admin = makeAdminClient();

    const result = await processBatchSync(
      admin as unknown as ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
      ORG_ID,
      BATCH_ID,
      [billInvoice]
    );

    // Invoice still marked synced despite attachment failure
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });
});
