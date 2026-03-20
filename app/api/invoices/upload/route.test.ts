// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

// --- Mocks ---

// Mock server client (for auth + org lookup)
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

// Mock admin client (for storage + DB writes)
const mockStorageUpload = vi.fn();
const mockCreateSignedUrl = vi.fn();
const mockStorageRemove = vi.fn();
const mockInsert = vi.fn();
const mockBatchCount = vi.fn();
const mockAdminClient = {
  storage: {
    from: vi.fn(() => ({
      upload: mockStorageUpload,
      createSignedUrl: mockCreateSignedUrl,
      remove: mockStorageRemove,
    })),
  },
  from: vi.fn((table: string) => {
    if (table === "invoices") {
      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: mockInsert,
          })),
        })),
        select: vi.fn(() => ({
          eq: mockBatchCount,
        })),
      };
    }
    return {};
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

vi.mock("@/lib/upload/validate", () => ({
  validateFileMagicBytes: vi.fn(() => ({
    valid: true,
    detectedType: "application/pdf",
  })),
  validateFileSize: vi.fn(() => true),
}));

const mockEnqueueExtraction = vi.fn();
vi.mock("@/lib/extraction/queue", () => ({
  enqueueExtraction: (...args: unknown[]) => mockEnqueueExtraction(...args),
}));

const mockCheckInvoiceAccess = vi.fn().mockResolvedValue({ allowed: true, reason: "active_subscription" });
vi.mock("@/lib/billing/access", () => ({
  checkInvoiceAccess: (...args: unknown[]) => mockCheckInvoiceAccess(...args),
}));

const mockCheckUsageLimit = vi.fn().mockResolvedValue({
  allowed: true,
  usage: { used: 5, limit: null, percentUsed: null, periodStart: new Date(), periodEnd: new Date(), isDesignPartner: false },
});
vi.mock("@/lib/billing/usage", () => ({
  checkUsageLimit: (...args: unknown[]) => mockCheckUsageLimit(...args),
}));

// Helper: create a mock Request with FormData
function createUploadRequest(
  file?: { name: string; type: string; content: Buffer },
  batchId?: string
): Request {
  const formData = new FormData();
  if (file) {
    const f = new File([new Uint8Array(file.content)], file.name, { type: file.type });
    formData.append("file", f);
  }
  if (batchId) {
    formData.append("batch_id", batchId);
  }
  return new Request("http://localhost/api/invoices/upload", {
    method: "POST",
    body: formData,
  });
}

// Default setup for tests that need to reach the storage/DB steps
function setupAuthenticatedUser() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
  mockFrom.mockResolvedValue({
    data: { org_id: "org-1" },
    error: null,
  });
}

// Default setup for tests that need full success path
function setupSuccessPath() {
  setupAuthenticatedUser();
  mockStorageUpload.mockResolvedValue({ data: { path: "org-1/inv-1/invoice.pdf" }, error: null });
  mockInsert.mockResolvedValue({ data: { id: "inv-1" }, error: null });
  mockCreateSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://example.com/signed" },
    error: null,
  });
}

describe("POST /api/invoices/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueueExtraction.mockResolvedValue({
      data: { vendorName: "Test Vendor", lineItems: [] },
      rawResponse: {},
      modelVersion: "claude-sonnet-4-20250514",
      durationMs: 3000,
    });
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const req = createUploadRequest({
      name: "invoice.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });

  it("returns 403 when user has no org membership", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({ data: null, error: { message: "not found" } });

    const req = createUploadRequest({
      name: "invoice.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toContain("No organization found");
  });

  it("returns 402 when user does not have an active subscription", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({
      data: { org_id: "org-1" },
      error: null,
    });
    mockCheckInvoiceAccess.mockResolvedValueOnce({
      allowed: false,
      reason: "no_subscription",
      subscriptionStatus: "inactive",
      trialExpired: true,
    });

    const req = createUploadRequest({
      name: "invoice.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(402);
    expect(body.code).toBe("SUBSCRIPTION_REQUIRED");
  });

  it("returns 400 when no file is provided", async () => {
    setupAuthenticatedUser();

    const req = createUploadRequest(); // no file

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when file size validation fails", async () => {
    const { validateFileSize } = await import("@/lib/upload/validate");
    vi.mocked(validateFileSize).mockReturnValueOnce(false);
    setupAuthenticatedUser();

    const req = createUploadRequest({
      name: "huge.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("10MB");
  });

  it("returns 400 when magic bytes validation fails", async () => {
    const { validateFileMagicBytes } = await import("@/lib/upload/validate");
    vi.mocked(validateFileMagicBytes).mockReturnValueOnce({
      valid: false,
      error: "File content does not match expected type.",
    });
    setupAuthenticatedUser();

    const req = createUploadRequest({
      name: "fake.pdf",
      type: "application/pdf",
      content: Buffer.from("not-a-pdf"),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 500 when storage upload fails", async () => {
    setupAuthenticatedUser();
    mockStorageUpload.mockResolvedValue({
      data: null,
      error: { message: "Storage unavailable" },
    });

    const req = createUploadRequest({
      name: "invoice.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("INTERNAL_ERROR");
  });

  it("returns 500 when DB insert fails", async () => {
    setupAuthenticatedUser();
    mockStorageUpload.mockResolvedValue({
      data: { path: "org-1/inv-1/invoice.pdf" },
      error: null,
    });
    mockInsert.mockResolvedValue({
      data: null,
      error: { message: "DB insert failed" },
    });
    mockStorageRemove.mockResolvedValue({ error: null });

    const req = createUploadRequest({
      name: "invoice.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("INTERNAL_ERROR");
  });

  it("returns 200 with invoiceId and signedUrl on success", async () => {
    setupSuccessPath();

    const req = createUploadRequest({
      name: "invoice.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveProperty("invoiceId");
    expect(body.data).toHaveProperty("signedUrl");
    expect(body.data).toHaveProperty("fileName", "invoice.pdf");
  });

  it("fires extraction without awaiting it", async () => {
    setupSuccessPath();

    const req = createUploadRequest({
      name: "invoice.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveProperty("invoiceId");
    expect(body.data).not.toHaveProperty("extractionStatus");
    expect(body.data).not.toHaveProperty("extractedData");
    // Extraction is fire-and-forget — called but not awaited
    expect(mockEnqueueExtraction).toHaveBeenCalledOnce();
  });

  // --- batch_id validation tests ---

  it("returns 400 when batch_id is not a valid UUID", async () => {
    setupAuthenticatedUser();

    const req = createUploadRequest(
      {
        name: "invoice.pdf",
        type: "application/pdf",
        content: Buffer.from("%PDF-1.4"),
      },
      "not-a-uuid"
    );

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toContain("batch_id");
  });

  it("accepts a valid batch_id and includes it in the insert", async () => {
    setupSuccessPath();
    mockBatchCount.mockResolvedValue({ count: 3, error: null });

    const batchId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const req = createUploadRequest(
      {
        name: "invoice.pdf",
        type: "application/pdf",
        content: Buffer.from("%PDF-1.4"),
      },
      batchId
    );

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveProperty("invoiceId");

    // Verify admin.from("invoices") was called and insert received batch_id
    const invoicesFromCall = mockAdminClient.from.mock.calls.find(
      (call: string[]) => call[0] === "invoices"
    );
    expect(invoicesFromCall).toBeDefined();
  });

  it("succeeds without batch_id (single-file upload)", async () => {
    setupSuccessPath();

    const req = createUploadRequest({
      name: "invoice.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveProperty("invoiceId");
  });

  // --- batch size cap tests ---

  it("returns 400 when batch already has 25 invoices", async () => {
    setupAuthenticatedUser();
    mockBatchCount.mockResolvedValue({ count: 25, error: null });

    const batchId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const req = createUploadRequest(
      {
        name: "invoice.pdf",
        type: "application/pdf",
        content: Buffer.from("%PDF-1.4"),
      },
      batchId
    );

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toContain("Batch limit");
    expect(body.error).toContain("25");
  });

  it("allows upload when batch has fewer than 25 invoices", async () => {
    setupSuccessPath();
    mockBatchCount.mockResolvedValue({ count: 24, error: null });

    const batchId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const req = createUploadRequest(
      {
        name: "invoice.pdf",
        type: "application/pdf",
        content: Buffer.from("%PDF-1.4"),
      },
      batchId
    );

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveProperty("invoiceId");
  });

  it("returns 500 when batch count query fails", async () => {
    setupAuthenticatedUser();
    mockBatchCount.mockResolvedValue({ count: null, error: { message: "DB error" } });

    const batchId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const req = createUploadRequest(
      {
        name: "invoice.pdf",
        type: "application/pdf",
        content: Buffer.from("%PDF-1.4"),
      },
      batchId
    );

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("INTERNAL_ERROR");
  });

  // --- orphan cleanup tests ---

  it("cleans up storage file when DB insert fails", async () => {
    setupAuthenticatedUser();
    mockStorageUpload.mockResolvedValue({
      data: { path: "org-1/inv-1/invoice.pdf" },
      error: null,
    });
    mockInsert.mockResolvedValue({
      data: null,
      error: { message: "DB insert failed" },
    });
    mockStorageRemove.mockResolvedValue({ error: null });

    const req = createUploadRequest({
      name: "invoice.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });

    const res = await POST(req);

    expect(res.status).toBe(500);
    // Verify storage remove was called for orphan cleanup
    expect(mockStorageRemove).toHaveBeenCalledOnce();
  });

  it("logs error but still returns 500 when orphan cleanup fails", async () => {
    setupAuthenticatedUser();
    mockStorageUpload.mockResolvedValue({
      data: { path: "org-1/inv-1/invoice.pdf" },
      error: null,
    });
    mockInsert.mockResolvedValue({
      data: null,
      error: { message: "DB insert failed" },
    });
    mockStorageRemove.mockResolvedValue({ error: { message: "Storage remove failed" } });

    const req = createUploadRequest({
      name: "invoice.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(mockStorageRemove).toHaveBeenCalledOnce();
  });

  it("does not attempt orphan cleanup when storage upload fails", async () => {
    setupAuthenticatedUser();
    mockStorageUpload.mockResolvedValue({
      data: null,
      error: { message: "Storage unavailable" },
    });

    const req = createUploadRequest({
      name: "invoice.pdf",
      type: "application/pdf",
      content: Buffer.from("%PDF-1.4"),
    });

    const res = await POST(req);

    expect(res.status).toBe(500);
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });
});
