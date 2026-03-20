// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

// --- Mocks ---

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockGetUser = vi.fn();
const mockMembershipSelect = vi.fn();

const mockServerClient = {
  auth: { getUser: mockGetUser },
  from: vi.fn((table: string) => {
    if (table === "org_memberships") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            limit: vi.fn(() => ({
              single: mockMembershipSelect,
            })),
          })),
        })),
      };
    }
    return { select: vi.fn() };
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockServerClient,
}));

// Admin client: supports select (invoices + extracted_data) and update (invoices)
const mockAdminInvoicesSelect = vi.fn();
const mockAdminExtractedDataSelect = vi.fn();
const mockAdminInvoicesUpdate = vi.fn();

const mockAdminClient = {
  from: vi.fn((table: string) => {
    if (table === "invoices") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            data: undefined, // not used directly
          })),
          in: mockAdminInvoicesSelect,
        })),
        update: vi.fn(() => ({
          in: mockAdminInvoicesUpdate,
        })),
      };
    }
    if (table === "extracted_data") {
      return {
        select: vi.fn(() => ({
          in: mockAdminExtractedDataSelect,
        })),
      };
    }
    return { select: vi.fn() };
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

const mockCheckInvoiceAccess = vi.fn();

vi.mock("@/lib/billing/access", () => ({
  checkInvoiceAccess: (...args: unknown[]) => mockCheckInvoiceAccess(...args),
}));

// --- Helpers ---

const VALID_BATCH_ID = "b1000000-0000-0000-0000-000000000001";
const ORG_ID = "org-1";

function makeRequest(body: Record<string, unknown> = { batch_id: VALID_BATCH_ID }) {
  return new Request("http://localhost/api/invoices/batch/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const fakeInvoices = [
  { id: "inv-1", org_id: ORG_ID, status: "pending_review", file_name: "invoice1.pdf" },
  { id: "inv-2", org_id: ORG_ID, status: "pending_review", file_name: "invoice2.pdf" },
];

const fakeExtractedData = [
  { invoice_id: "inv-1", vendor_name: "Acme Corp", total_amount: 100.0 },
  { invoice_id: "inv-2", vendor_name: "Beta LLC", total_amount: 250.0 },
];

describe("POST /api/invoices/batch/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: authenticated user with org
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mockMembershipSelect.mockResolvedValue({
      data: { org_id: ORG_ID },
      error: null,
    });

    // Default: subscription allowed
    mockCheckInvoiceAccess.mockResolvedValue({ allowed: true, reason: "active_subscription" });

    // Default: admin fetches return happy-path data
    mockAdminInvoicesSelect.mockResolvedValue({ data: fakeInvoices, error: null });
    mockAdminExtractedDataSelect.mockResolvedValue({ data: fakeExtractedData, error: null });
    mockAdminInvoicesUpdate.mockResolvedValue({ error: null });
  });

  // --- Auth & validation ---

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });

  it("returns 401 when no org membership exists", async () => {
    mockMembershipSelect.mockResolvedValue({ data: null, error: null });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });

  it("returns 400 when batch_id is missing", async () => {
    const res = await POST(makeRequest({}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when batch_id is not a valid UUID", async () => {
    const res = await POST(makeRequest({ batch_id: "not-a-uuid" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 402 when subscription is inactive", async () => {
    mockCheckInvoiceAccess.mockResolvedValue({
      allowed: false,
      reason: "no_subscription",
      subscriptionStatus: "inactive",
      trialExpired: false,
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(402);
    expect(body.code).toBe("SUBSCRIPTION_REQUIRED");
  });

  // --- Ownership check ---

  it("returns 403 when any invoice belongs to a different org", async () => {
    mockAdminInvoicesSelect.mockResolvedValue({
      data: [
        { id: "inv-1", org_id: ORG_ID, status: "pending_review", file_name: "invoice1.pdf" },
        { id: "inv-2", org_id: "other-org", status: "pending_review", file_name: "invoice2.pdf" },
      ],
      error: null,
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe("AUTH_ERROR");
  });

  // --- Happy path ---

  it("approves all valid pending_review invoices and returns counts", async () => {
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.approved).toBe(2);
    expect(body.data.skipped).toBe(0);
    expect(body.data.skippedInvoices).toHaveLength(0);
  });

  it("skips invoices with missing vendor_name", async () => {
    mockAdminExtractedDataSelect.mockResolvedValue({
      data: [
        { invoice_id: "inv-1", vendor_name: null, total_amount: 100.0 },
        { invoice_id: "inv-2", vendor_name: "Beta LLC", total_amount: 250.0 },
      ],
      error: null,
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.approved).toBe(1);
    expect(body.data.skipped).toBe(1);
    expect(body.data.skippedInvoices[0].id).toBe("inv-1");
    expect(body.data.skippedInvoices[0].reason).toContain("vendor_name");
  });

  it("skips invoices with missing total_amount", async () => {
    mockAdminExtractedDataSelect.mockResolvedValue({
      data: [
        { invoice_id: "inv-1", vendor_name: "Acme Corp", total_amount: null },
        { invoice_id: "inv-2", vendor_name: "Beta LLC", total_amount: 250.0 },
      ],
      error: null,
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.approved).toBe(1);
    expect(body.data.skipped).toBe(1);
    expect(body.data.skippedInvoices[0].id).toBe("inv-1");
    expect(body.data.skippedInvoices[0].reason).toContain("total_amount");
  });

  it("skips invoices with no extracted_data record", async () => {
    // Only one invoice has extracted data; the other has none
    mockAdminExtractedDataSelect.mockResolvedValue({
      data: [
        { invoice_id: "inv-2", vendor_name: "Beta LLC", total_amount: 250.0 },
      ],
      error: null,
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.approved).toBe(1);
    expect(body.data.skipped).toBe(1);
    expect(body.data.skippedInvoices[0].id).toBe("inv-1");
  });

  it("returns 0 approved when no pending_review invoices exist", async () => {
    mockAdminInvoicesSelect.mockResolvedValue({
      data: [
        { id: "inv-1", org_id: ORG_ID, status: "approved", file_name: "invoice1.pdf" },
        { id: "inv-2", org_id: ORG_ID, status: "synced", file_name: "invoice2.pdf" },
      ],
      error: null,
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.approved).toBe(0);
    expect(body.data.skipped).toBe(0);
  });

  it("silently skips already-approved and synced invoices (not counted as skipped)", async () => {
    mockAdminInvoicesSelect.mockResolvedValue({
      data: [
        { id: "inv-1", org_id: ORG_ID, status: "pending_review", file_name: "invoice1.pdf" },
        { id: "inv-2", org_id: ORG_ID, status: "approved", file_name: "invoice2.pdf" },
        { id: "inv-3", org_id: ORG_ID, status: "synced", file_name: "invoice3.pdf" },
      ],
      error: null,
    });
    mockAdminExtractedDataSelect.mockResolvedValue({
      data: [
        { invoice_id: "inv-1", vendor_name: "Acme Corp", total_amount: 100.0 },
      ],
      error: null,
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.approved).toBe(1);
    expect(body.data.skipped).toBe(0);
  });

  it("returns skippedInvoices with id, fileName, and reason", async () => {
    mockAdminExtractedDataSelect.mockResolvedValue({
      data: [
        { invoice_id: "inv-1", vendor_name: null, total_amount: null },
        { invoice_id: "inv-2", vendor_name: "Beta LLC", total_amount: 250.0 },
      ],
      error: null,
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(body.data.skippedInvoices[0]).toMatchObject({
      id: "inv-1",
      fileName: "invoice1.pdf",
      reason: expect.any(String),
    });
  });
});
