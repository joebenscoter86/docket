// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/helpers", () => ({
  getActiveOrgId: vi.fn(),
}));

import { GET, PATCH } from "./route";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/supabase/helpers";

const mockGetUser = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();

function makePatchRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/settings/defaults", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/settings/defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
    });

    (getActiveOrgId as ReturnType<typeof vi.fn>).mockResolvedValue("org-456");

    mockSelect.mockResolvedValue({
      data: { default_tax_code_id: "3" },
      error: null,
    });

    (createClient as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: { getUser: mockGetUser },
    });

    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: mockSelect,
          }),
        }),
      }),
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns default_tax_code_id from accounting_connections", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.default_tax_code_id).toBe("3");
  });

  it("returns null when no accounting connection exists", async () => {
    mockSelect.mockResolvedValue({ data: null, error: null });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.default_tax_code_id).toBeNull();
  });

  it("returns null when no active org found", async () => {
    (getActiveOrgId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.default_tax_code_id).toBeNull();
  });

  it("returns 500 when DB query fails", async () => {
    mockSelect.mockResolvedValue({
      data: null,
      error: { message: "db error" },
    });

    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/settings/defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
    });

    (getActiveOrgId as ReturnType<typeof vi.fn>).mockResolvedValue("org-456");

    mockUpdate.mockResolvedValue({ error: null });

    (createClient as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: { getUser: mockGetUser },
    });

    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: mockUpdate,
        }),
      }),
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await PATCH(makePatchRequest({ default_tax_code_id: "3" }));
    expect(res.status).toBe(401);
  });

  it("updates default_tax_code_id successfully", async () => {
    const res = await PATCH(makePatchRequest({ default_tax_code_id: "3" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.updated).toBe(true);
  });

  it("clears default_tax_code_id when null is provided", async () => {
    const res = await PATCH(makePatchRequest({ default_tax_code_id: null }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.updated).toBe(true);
  });

  it("returns 400 when default_tax_code_id is missing from body", async () => {
    const res = await PATCH(makePatchRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when default_tax_code_id is a number", async () => {
    const res = await PATCH(makePatchRequest({ default_tax_code_id: 3 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 500 when DB update fails", async () => {
    mockUpdate.mockResolvedValue({ error: { message: "db error" } });

    const res = await PATCH(makePatchRequest({ default_tax_code_id: "3" }));
    expect(res.status).toBe(500);
  });
});
