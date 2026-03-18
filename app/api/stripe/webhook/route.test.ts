// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConstructEvent = vi.fn();

vi.mock("@/lib/stripe/client", () => ({
  stripe: {
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
  },
}));

const mockUserUpdate = vi.fn();
const mockUserSelect = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: mockUserUpdate,
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockUserSelect,
        })),
      })),
    })),
  }),
}));

import { POST } from "./route";

function makeWebhookRequest(body: string, signature = "valid-sig") {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body,
  });
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserUpdate.mockResolvedValue({ error: null });
  });

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const res = await POST(makeWebhookRequest("{}"));
    expect(res.status).toBe(400);
  });

  it("handles checkout.session.completed — sets status to active", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "user-1",
          customer: "cus_123",
        },
      },
    });

    const res = await POST(makeWebhookRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalled();
  });

  it("handles customer.subscription.updated — maps active status", async () => {
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_123",
          status: "active",
        },
      },
    });
    mockUserSelect.mockResolvedValue({
      data: { id: "user-1" },
      error: null,
    });

    const res = await POST(makeWebhookRequest("{}"));
    expect(res.status).toBe(200);
  });

  it("handles customer.subscription.updated — maps past_due status", async () => {
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_123",
          status: "past_due",
        },
      },
    });
    mockUserSelect.mockResolvedValue({
      data: { id: "user-1" },
      error: null,
    });

    const res = await POST(makeWebhookRequest("{}"));
    expect(res.status).toBe(200);
  });

  it("handles customer.subscription.deleted — sets cancelled", async () => {
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: {
        object: {
          customer: "cus_123",
        },
      },
    });
    mockUserSelect.mockResolvedValue({
      data: { id: "user-1" },
      error: null,
    });

    const res = await POST(makeWebhookRequest("{}"));
    expect(res.status).toBe(200);
  });

  it("returns 200 for unknown event types (no-op)", async () => {
    mockConstructEvent.mockReturnValue({
      type: "some.unknown.event",
      data: { object: {} },
    });

    const res = await POST(makeWebhookRequest("{}"));
    expect(res.status).toBe(200);
  });
});
