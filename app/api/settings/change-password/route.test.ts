// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { POST } from "./route";
import { createClient } from "@/lib/supabase/server";

const mockGetUser = vi.fn();
const mockResetPassword = vi.fn();

function makeRequest() {
  return new Request("http://localhost:3000/api/settings/change-password", {
    method: "POST",
    headers: { origin: "http://localhost:3000" },
  });
}

describe("POST /api/settings/change-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123", email: "test@example.com" } },
      error: null,
    });

    mockResetPassword.mockResolvedValue({
      data: {},
      error: null,
    });

    (createClient as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: {
        getUser: mockGetUser,
        resetPasswordForEmail: mockResetPassword,
      },
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "not authenticated" },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 200 and triggers reset email on success", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.message).toBe("Password reset email sent.");
    expect(mockResetPassword).toHaveBeenCalledWith("test@example.com", expect.objectContaining({
      redirectTo: expect.stringContaining("/settings"),
    }));
  });

  it("returns 500 when Supabase reset fails", async () => {
    mockResetPassword.mockResolvedValue({
      data: null,
      error: { message: "rate limited" },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
  });
});
