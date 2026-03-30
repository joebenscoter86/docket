import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

import { getInvoiceActivity } from "./activity";

// ---------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------

const JOE_ID = "user-joe-uuid";
const JANE_ID = "user-jane-uuid";

const MOCK_INVOICE = {
  uploaded_by: JOE_ID,
  uploaded_at: "2026-03-01T10:00:00Z",
  approved_by: JANE_ID,
  approved_at: "2026-03-01T11:30:00Z",
};

// Two corrections by the same user within 60 seconds → one "edited" event
const MOCK_CORRECTIONS = [
  {
    user_id: JOE_ID,
    field_name: "vendor_name",
    corrected_at: "2026-03-01T10:05:00Z",
  },
  {
    user_id: JOE_ID,
    field_name: "total_amount",
    corrected_at: "2026-03-01T10:05:30Z", // 30s after first — same window
  },
];

const MOCK_SYNC_LOG = [
  {
    synced_by: JANE_ID,
    synced_at: "2026-03-01T12:00:00Z",
    status: "success",
    provider: "quickbooks",
  },
];

const MOCK_USERS = [
  { id: JOE_ID, email: "joe@acme.com" },
  { id: JANE_ID, email: "jane@acme.com" },
];

// ---------------------------------------------------------------
// Helper: build a chainable Supabase mock for a given resolved value
// ---------------------------------------------------------------

function makeQueryChain(resolved: { data: unknown; error: null }) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "in", "order", "single"];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  // The final awaited call resolves with the mock data
  (chain as unknown as Promise<unknown>)[Symbol.iterator] = undefined;
  Object.defineProperty(chain, "then", {
    get() {
      return (resolve: (v: unknown) => void) => resolve(resolved);
    },
  });
  return chain;
}

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

describe("getInvoiceActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockFrom.mockImplementation((table: string) => {
      if (table === "invoices") {
        return makeQueryChain({ data: MOCK_INVOICE, error: null });
      }
      if (table === "corrections") {
        return makeQueryChain({ data: MOCK_CORRECTIONS, error: null });
      }
      if (table === "sync_log") {
        return makeQueryChain({ data: MOCK_SYNC_LOG, error: null });
      }
      if (table === "users") {
        return makeQueryChain({ data: MOCK_USERS, error: null });
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("assembles upload, correction, approval, and sync events in chronological order", async () => {
    const events = await getInvoiceActivity("inv-uuid-1");

    // Expect exactly 4 events
    expect(events).toHaveLength(4);

    // 1. Uploaded by joe
    expect(events[0].type).toBe("uploaded");
    expect(events[0].userEmail).toBe("joe@acme.com");
    expect(events[0].timestamp).toBe("2026-03-01T10:00:00Z");

    // 2. Edited by joe — two corrections grouped into one event
    expect(events[1].type).toBe("edited");
    expect(events[1].userEmail).toBe("joe@acme.com");
    expect(events[1].detail).toBe("vendor_name, total_amount");

    // 3. Approved by jane
    expect(events[2].type).toBe("approved");
    expect(events[2].userEmail).toBe("jane@acme.com");
    expect(events[2].timestamp).toBe("2026-03-01T11:30:00Z");

    // 4. Synced by jane
    expect(events[3].type).toBe("synced");
    expect(events[3].userEmail).toBe("jane@acme.com");
    expect(events[3].timestamp).toBe("2026-03-01T12:00:00Z");
    expect(events[3].detail).toBe("quickbooks");
  });

  it("returns empty array when invoice not found", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "invoices") {
        return makeQueryChain({ data: null, error: null });
      }
      if (table === "corrections") {
        return makeQueryChain({ data: [], error: null });
      }
      if (table === "sync_log") {
        return makeQueryChain({ data: [], error: null });
      }
      if (table === "users") {
        return makeQueryChain({ data: [], error: null });
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const events = await getInvoiceActivity("nonexistent-id");
    expect(events).toHaveLength(0);
  });

  it("handles null user IDs gracefully (email is null)", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "invoices") {
        return makeQueryChain({
          data: {
            ...MOCK_INVOICE,
            uploaded_by: null,
            approved_by: null,
          },
          error: null,
        });
      }
      if (table === "corrections") {
        return makeQueryChain({ data: [], error: null });
      }
      if (table === "sync_log") {
        return makeQueryChain({ data: [], error: null });
      }
      if (table === "users") {
        return makeQueryChain({ data: [], error: null });
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const events = await getInvoiceActivity("inv-uuid-1");

    const uploaded = events.find((e) => e.type === "uploaded");
    expect(uploaded?.userEmail).toBeNull();
    expect(uploaded?.userId).toBeNull();

    const approved = events.find((e) => e.type === "approved");
    expect(approved?.userEmail).toBeNull();
  });

  it("splits corrections into separate groups when user changes", async () => {
    const corrections = [
      { user_id: JOE_ID, field_name: "vendor_name", corrected_at: "2026-03-01T10:05:00Z" },
      { user_id: JANE_ID, field_name: "total_amount", corrected_at: "2026-03-01T10:05:10Z" },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "invoices") {
        return makeQueryChain({ data: MOCK_INVOICE, error: null });
      }
      if (table === "corrections") {
        return makeQueryChain({ data: corrections, error: null });
      }
      if (table === "sync_log") {
        return makeQueryChain({ data: [], error: null });
      }
      if (table === "users") {
        return makeQueryChain({ data: MOCK_USERS, error: null });
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const events = await getInvoiceActivity("inv-uuid-1");
    const editEvents = events.filter((e) => e.type === "edited");

    // Different users → two separate edit events
    expect(editEvents).toHaveLength(2);
    expect(editEvents[0].userEmail).toBe("joe@acme.com");
    expect(editEvents[1].userEmail).toBe("jane@acme.com");
  });

  it("splits corrections into separate groups when gap exceeds 60 seconds", async () => {
    const corrections = [
      { user_id: JOE_ID, field_name: "vendor_name", corrected_at: "2026-03-01T10:05:00Z" },
      { user_id: JOE_ID, field_name: "total_amount", corrected_at: "2026-03-01T10:06:05Z" }, // 65s later
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "invoices") {
        return makeQueryChain({ data: MOCK_INVOICE, error: null });
      }
      if (table === "corrections") {
        return makeQueryChain({ data: corrections, error: null });
      }
      if (table === "sync_log") {
        return makeQueryChain({ data: [], error: null });
      }
      if (table === "users") {
        return makeQueryChain({ data: MOCK_USERS, error: null });
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const events = await getInvoiceActivity("inv-uuid-1");
    const editEvents = events.filter((e) => e.type === "edited");

    // Same user but >60s gap → two separate edit events
    expect(editEvents).toHaveLength(2);
  });
});
