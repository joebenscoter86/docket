// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { PATCH } from "./route";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const mockGetUser = vi.fn();
const mockSelectOrgMembership = vi.fn();
const mockUpdateOrg = vi.fn();

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/settings/organization", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/settings/organization", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    mockSelectOrgMembership.mockResolvedValue({
      data: { active_org_id: "org-456" },
      error: null,
    });

    mockUpdateOrg.mockResolvedValue({
      data: { name: "New Org Name" },
      error: null,
    });

    (createClient as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: { getUser: mockGetUser },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: mockSelectOrgMembership,
          }),
        }),
      }),
    });

    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: mockUpdateOrg,
            }),
          }),
        }),
      }),
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "not authenticated" },
    });

    const res = await PATCH(makeRequest({ name: "Test" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is empty", async () => {
    const res = await PATCH(makeRequest({ name: "   " }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when name exceeds 100 characters", async () => {
    const res = await PATCH(makeRequest({ name: "a".repeat(101) }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when user has no org membership", async () => {
    mockSelectOrgMembership.mockResolvedValue({
      data: null,
      error: { message: "not found" },
    });

    const res = await PATCH(makeRequest({ name: "Test" }));
    expect(res.status).toBe(404);
  });

  it("returns 200 and updated name on success", async () => {
    const res = await PATCH(makeRequest({ name: "New Org Name" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("New Org Name");
  });
});
