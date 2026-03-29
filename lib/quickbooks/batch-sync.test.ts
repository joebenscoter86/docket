// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { processBatchSync } from "./batch-sync";
import type { BatchSyncInvoice } from "./batch-sync";

// ─── Mocks ───

const mockCreateBill = vi.fn();
const mockCreatePurchase = vi.fn();
const mockAttachDocument = vi.fn();

vi.mock("@/lib/accounting", () => ({
  getAccountingProvider: vi.fn(() => ({
    createBill: (...args: unknown[]) => mockCreateBill(...args),
    createPurchase: (...args: unknown[]) => mockCreatePurchase(...args),
    attachDocument: (...args: unknown[]) => mockAttachDocument(...args),
  })),
  AccountingApiError: class AccountingApiError extends Error {
    statusCode: number;
    errorCode: string;
    detail: string;
    element?: string;
    constructor(
      statusCode: number,
      message: string,
      opts: { errorCode?: string; detail?: string; element?: string } = {}
    ) {
      super(message);
      this.name = "AccountingApiError";
      this.statusCode = statusCode;
      this.errorCode = opts.errorCode ?? "unknown";
      this.detail = opts.detail ?? message;
      this.element = opts.element;
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
  xero_bill_status: null,
};

// ─── Tests ───

describe("processBatchSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateBill.mockResolvedValue({ entityId: "qbo-bill-123", entityType: "Bill", providerResponse: {} });
    mockCreatePurchase.mockResolvedValue({ entityId: "qbo-purchase-456", entityType: "Purchase", providerResponse: {} });
    mockAttachDocument.mockResolvedValue({ attachmentId: null, success: true });
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
    ], "quickbooks");

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
      .mockResolvedValueOnce({ entityId: "qbo-bill-999", entityType: "Bill", providerResponse: {} });

    const admin = makeAdminClient();

    const result = await processBatchSync(
      admin as unknown as ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
      ORG_ID,
      BATCH_ID,
      [billInvoice, invoice2],
      "quickbooks"
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
      [billInvoice],
      "quickbooks"
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
      [billInvoice],
      "quickbooks"
    );

    expect(result.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("handles empty invoice list gracefully", async () => {
    const admin = makeAdminClient();

    const result = await processBatchSync(
      admin as unknown as ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
      ORG_ID,
      BATCH_ID,
      [],
      "quickbooks"
    );

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skippedIdempotent).toBe(0);
    expect(mockCreateBill).not.toHaveBeenCalled();
  });

  it("proceeds with partial success when PDF attachment fails", async () => {
    mockAttachDocument.mockRejectedValueOnce(new Error("S3 download failed"));
    const admin = makeAdminClient();

    const result = await processBatchSync(
      admin as unknown as ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
      ORG_ID,
      BATCH_ID,
      [billInvoice],
      "quickbooks"
    );

    // Invoice still marked synced despite attachment failure
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });
});
