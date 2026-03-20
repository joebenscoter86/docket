// lib/xero/api.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

// Mock getValidAccessToken before importing api module
vi.mock("@/lib/xero/auth", () => ({
  getValidAccessToken: vi.fn().mockResolvedValue({
    accessToken: "test-access-token",
    tenantId: "test-tenant-id",
  }),
}));

// Mock logger
vi.mock("@/lib/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

const XERO_BASE = "https://api.xero.com/api.xro/2.0";

const server = setupServer();

beforeEach(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterEach(() => server.close());

describe("XeroApiError", () => {
  it("stores statusCode, errorCode, and detail", async () => {
    const { XeroApiError } = await import("@/lib/xero/api");
    const err = new XeroApiError({
      message: "Not found",
      statusCode: 404,
      errorCode: "NOT_FOUND",
      detail: "Contact not found",
    });
    expect(err.statusCode).toBe(404);
    expect(err.errorCode).toBe("NOT_FOUND");
    expect(err.detail).toBe("Contact not found");
    expect(err.name).toBe("XeroApiError");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("xeroFetch", () => {
  it("throws XeroApiError on 401 auth error", async () => {
    server.use(
      http.get(`${XERO_BASE}/Contacts`, () => {
        return HttpResponse.json(
          { Title: "Unauthorized", Status: 401, Detail: "Token expired" },
          { status: 401 }
        );
      })
    );

    const { queryContacts } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof queryContacts>[0];

    await expect(queryContacts(mockSupabase, "org-1")).rejects.toThrow(
      "Token expired"
    );
  });

  it("throws XeroApiError on 400 validation error", async () => {
    server.use(
      http.post(`${XERO_BASE}/Contacts`, () => {
        return HttpResponse.json(
          {
            StatusCode: 400,
            Message: "A validation error occurred",
            Elements: [
              {
                ValidationErrors: [{ Message: "Name is required" }],
              },
            ],
          },
          { status: 400 }
        );
      })
    );

    const { createContact } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof createContact>[0];

    await expect(
      createContact(mockSupabase, "org-1", "")
    ).rejects.toThrow("Name is required");
  });
});
