// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

// ─── Mock: @vercel/functions ───

const mockWaitUntil = vi.fn();
vi.mock("@vercel/functions", () => ({
  waitUntil: (p: Promise<unknown>) => mockWaitUntil(p),
}));

// ─── Mock: processBatchSync ───

vi.mock("@/lib/quickbooks/batch-sync", () => ({
  processBatchSync: vi
    .fn()
    .mockResolvedValue({ synced: 0, failed: 0, skippedIdempotent: 0, totalMs: 0 }),
}));

// ─── Mock: next/cache ───

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ─── Mock: Supabase server client ───

const mockGetUser = vi.fn();
const mockMembershipSingle = vi.fn();

const mockServerClient = {
  auth: { getUser: mockGetUser },
  from: vi.fn((table: string) => {
    if (table === "org_memberships") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            limit: vi.fn(() => ({
              single: mockMembershipSingle,
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

// ─── Mock: Supabase admin client ───

const mockAdminInvoicesSelectIn = vi.fn();
const mockAdminExtractedDataSelectIn = vi.fn();
const mockAdminLineItemsSelectIn = vi.fn();

const mockAdminClient = {
  from: vi.fn((table: string) => {
    if (table === "invoices") {
      return {
        select: vi.fn(() => ({
          in: mockAdminInvoicesSelectIn,
        })),
      };
    }
    if (table === "extracted_data") {
      return {
        select: vi.fn(() => ({
          in: mockAdminExtractedDataSelectIn,
        })),
      };
    }
    if (table === "extracted_line_items") {
      return {
        select: vi.fn(() => ({
          in: mockAdminLineItemsSelectIn,
        })),
      };
    }
    return { select: vi.fn() };
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

// ─── Mock: billing access ───

const mockCheckInvoiceAccess = vi.fn();

vi.mock("@/lib/billing/access", () => ({
  checkInvoiceAccess: (...args: unknown[]) => mockCheckInvoiceAccess(...args),
}));

// ─── Mock: accounting connection helpers ───

const mockIsOrgConnected = vi.fn();
const mockGetOrgProvider = vi.fn();

vi.mock("@/lib/accounting", () => ({
  isOrgConnected: (...args: unknown[]) => mockIsOrgConnected(...args),
  getOrgProvider: (...args: unknown[]) => mockGetOrgProvider(...args),
}));

// ─── Helpers ───

const VALID_BATCH_ID = "b1000000-0000-0000-0000-000000000001";
const ORG_ID = "org-1";

function makeRequest(body: Record<string, unknown> = { batch_id: VALID_BATCH_ID }) {
  return new Request("http://localhost/api/invoices/batch/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const fakeApprovedInvoices = [
  {
    id: "inv-1",
    org_id: ORG_ID,
    status: "approved",
    output_type: "bill",
    payment_account_id: null,
    file_path: "invoices/inv-1.pdf",
    file_name: "invoice1.pdf",
    retry_count: 0,
  },
  {
    id: "inv-2",
    org_id: ORG_ID,
    status: "approved",
    output_type: "bill",
    payment_account_id: null,
    file_path: "invoices/inv-2.pdf",
    file_name: "invoice2.pdf",
    retry_count: 0,
  },
];

const fakeExtractedRows = [
  { id: "ed-1", invoice_id: "inv-1", vendor_ref: "vendor-42" },
  { id: "ed-2", invoice_id: "inv-2", vendor_ref: "vendor-99" },
];

const fakeLineItems = [
  { extracted_data_id: "ed-1", gl_account_id: "gl-1" },
  { extracted_data_id: "ed-2", gl_account_id: "gl-2" },
];

// ─── Tests ───

describe("POST /api/invoices/batch/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: authenticated
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockMembershipSingle.mockResolvedValue({ data: { org_id: ORG_ID }, error: null });

    // Default: subscription allowed
    mockCheckInvoiceAccess.mockResolvedValue({ allowed: true, reason: "active_subscription" });

    // Default: QBO connected
    mockIsOrgConnected.mockResolvedValue(true);
    mockGetOrgProvider.mockResolvedValue("quickbooks");

    // Default: invoices, extracted data, line items
    mockAdminInvoicesSelectIn.mockResolvedValue({ data: fakeApprovedInvoices, error: null });
    mockAdminExtractedDataSelectIn.mockResolvedValue({ data: fakeExtractedRows, error: null });
    mockAdminLineItemsSelectIn.mockResolvedValue({ data: fakeLineItems, error: null });
  });

  // ─── Auth & validation ───

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });

  it("returns 401 when no org membership exists", async () => {
    mockMembershipSingle.mockResolvedValue({ data: null, error: null });

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

  it("returns 400 when no accounting connection", async () => {
    mockIsOrgConnected.mockResolvedValue(false);
    mockGetOrgProvider.mockResolvedValue(null);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.error).toMatch(/connect an accounting provider/i);
  });

  it("returns 403 when any invoice belongs to a different org", async () => {
    mockAdminInvoicesSelectIn.mockResolvedValue({
      data: [
        { ...fakeApprovedInvoices[0] },
        { ...fakeApprovedInvoices[1], org_id: "other-org" },
      ],
      error: null,
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe("AUTH_ERROR");
  });

  // ─── Happy path ───

  it("returns syncing count and fires waitUntil for valid invoices", async () => {
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.syncing).toBe(2);
    expect(body.data.skipped).toBe(0);
    expect(body.data.skippedInvoices).toHaveLength(0);
    expect(body.data.invoiceIds).toHaveLength(2);
    expect(mockWaitUntil).toHaveBeenCalledOnce();
  });

  it("returns syncing:0 and does not call waitUntil when no approved invoices", async () => {
    mockAdminInvoicesSelectIn.mockResolvedValue({
      data: [
        { ...fakeApprovedInvoices[0], status: "pending_review" },
        { ...fakeApprovedInvoices[1], status: "synced" },
      ],
      error: null,
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.syncing).toBe(0);
    expect(body.data.skipped).toBe(0);
    expect(mockWaitUntil).not.toHaveBeenCalled();
  });

  // ─── Pre-flight validation skips ───

  it("skips invoices missing vendor_ref in pre-flight", async () => {
    mockAdminExtractedDataSelectIn.mockResolvedValue({
      data: [
        { id: "ed-1", invoice_id: "inv-1", vendor_ref: null },
        { id: "ed-2", invoice_id: "inv-2", vendor_ref: "vendor-99" },
      ],
      error: null,
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.syncing).toBe(1);
    expect(body.data.skipped).toBe(1);
    expect(body.data.skippedInvoices[0].id).toBe("inv-1");
    expect(body.data.skippedInvoices[0].reason).toMatch(/vendor/i);
  });

  it("skips invoices with no line items", async () => {
    // Only inv-2 has line items
    mockAdminLineItemsSelectIn.mockResolvedValue({
      data: [{ extracted_data_id: "ed-2", gl_account_id: "gl-2" }],
      error: null,
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.syncing).toBe(1);
    expect(body.data.skipped).toBe(1);
    expect(body.data.skippedInvoices[0].id).toBe("inv-1");
    expect(body.data.skippedInvoices[0].reason).toMatch(/line item/i);
  });

  it("skips invoices with unmapped GL accounts on line items", async () => {
    mockAdminLineItemsSelectIn.mockResolvedValue({
      data: [
        { extracted_data_id: "ed-1", gl_account_id: null }, // unmapped
        { extracted_data_id: "ed-2", gl_account_id: "gl-2" },
      ],
      error: null,
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.syncing).toBe(1);
    expect(body.data.skipped).toBe(1);
    expect(body.data.skippedInvoices[0].id).toBe("inv-1");
    expect(body.data.skippedInvoices[0].reason).toMatch(/gl account/i);
  });

  it("skips non-bill invoices missing payment_account_id", async () => {
    mockAdminInvoicesSelectIn.mockResolvedValue({
      data: [
        {
          ...fakeApprovedInvoices[0],
          output_type: "check",
          payment_account_id: null, // missing
        },
        fakeApprovedInvoices[1],
      ],
      error: null,
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.syncing).toBe(1);
    expect(body.data.skipped).toBe(1);
    expect(body.data.skippedInvoices[0].id).toBe("inv-1");
    expect(body.data.skippedInvoices[0].reason).toMatch(/payment account/i);
  });

  it("skips invoices with no extracted_data record", async () => {
    // Only inv-2 has extracted data
    mockAdminExtractedDataSelectIn.mockResolvedValue({
      data: [{ id: "ed-2", invoice_id: "inv-2", vendor_ref: "vendor-99" }],
      error: null,
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.syncing).toBe(1);
    expect(body.data.skipped).toBe(1);
    expect(body.data.skippedInvoices[0].id).toBe("inv-1");
  });
});
