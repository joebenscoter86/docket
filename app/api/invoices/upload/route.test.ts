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
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockAdminClient = {
  storage: {
    from: vi.fn(() => ({
      upload: mockStorageUpload,
      createSignedUrl: mockCreateSignedUrl,
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
        update: vi.fn(() => ({
          eq: mockUpdate,
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

// Helper: create a mock Request with FormData
function createUploadRequest(
  file?: { name: string; type: string; content: Buffer }
): Request {
  const formData = new FormData();
  if (file) {
    const f = new File([new Uint8Array(file.content)], file.name, { type: file.type });
    formData.append("file", f);
  }
  return new Request("http://localhost/api/invoices/upload", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/invoices/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("returns 400 when no file is provided", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({
      data: { org_id: "org-1" },
      error: null,
    });

    const req = createUploadRequest(); // no file

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when file size validation fails", async () => {
    const { validateFileSize } = await import("@/lib/upload/validate");
    vi.mocked(validateFileSize).mockReturnValueOnce(false);

    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({
      data: { org_id: "org-1" },
      error: null,
    });

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

    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({
      data: { org_id: "org-1" },
      error: null,
    });

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
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({
      data: { org_id: "org-1" },
      error: null,
    });
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
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({
      data: { org_id: "org-1" },
      error: null,
    });
    mockStorageUpload.mockResolvedValue({
      data: { path: "org-1/inv-1/invoice.pdf" },
      error: null,
    });
    mockInsert.mockResolvedValue({
      data: null,
      error: { message: "DB insert failed" },
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

  it("returns 200 with invoiceId and signedUrl on success", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockFrom.mockResolvedValue({
      data: { org_id: "org-1" },
      error: null,
    });
    mockStorageUpload.mockResolvedValue({ data: { path: "org-1/inv-1/invoice.pdf" }, error: null });
    mockInsert.mockResolvedValue({
      data: { id: "inv-1" },
      error: null,
    });
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
    expect(body.data).toHaveProperty("invoiceId");
    expect(body.data).toHaveProperty("signedUrl");
    expect(body.data).toHaveProperty("fileName", "invoice.pdf");
  });
});
