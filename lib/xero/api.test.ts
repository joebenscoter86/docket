// lib/xero/api.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { XeroContact } from "@/lib/xero/types";

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

const CONTACT_1: XeroContact = {
  ContactID: "aaaa-1111",
  Name: "Acme Corp",
  ContactStatus: "ACTIVE",
  IsSupplier: true,
  IsCustomer: false,
};

const CONTACT_2: XeroContact = {
  ContactID: "bbbb-2222",
  Name: "Beta Inc",
  ContactStatus: "ACTIVE",
  IsSupplier: true,
  IsCustomer: true,
};

describe("queryContacts", () => {
  it("fetches active supplier contacts", async () => {
    server.use(
      http.get(`${XERO_BASE}/Contacts`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("where")).toContain("IsSupplier==true");
        return HttpResponse.json({ Contacts: [CONTACT_1, CONTACT_2] });
      })
    );

    const { queryContacts } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof queryContacts>[0];
    const contacts = await queryContacts(mockSupabase, "org-1");

    expect(contacts).toHaveLength(2);
    expect(contacts[0].ContactID).toBe("aaaa-1111");
  });

  it("paginates when >100 contacts returned", async () => {
    const page1Contacts = Array.from({ length: 100 }, (_, i) => ({
      ...CONTACT_1,
      ContactID: `page1-${i}`,
      Name: `Vendor ${String(i).padStart(3, "0")}`,
    }));
    const page2Contacts = Array.from({ length: 50 }, (_, i) => ({
      ...CONTACT_1,
      ContactID: `page2-${i}`,
      Name: `Vendor ${String(i + 100).padStart(3, "0")}`,
    }));

    let requestCount = 0;
    server.use(
      http.get(`${XERO_BASE}/Contacts`, ({ request }) => {
        requestCount++;
        const url = new URL(request.url);
        const page = url.searchParams.get("page") ?? "1";
        if (page === "1") {
          return HttpResponse.json({ Contacts: page1Contacts });
        }
        return HttpResponse.json({ Contacts: page2Contacts });
      })
    );

    const { queryContacts } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof queryContacts>[0];
    const contacts = await queryContacts(mockSupabase, "org-1");

    expect(contacts).toHaveLength(150);
    expect(requestCount).toBe(2);
  });

  it("returns empty array when no contacts exist", async () => {
    server.use(
      http.get(`${XERO_BASE}/Contacts`, () => {
        return HttpResponse.json({ Contacts: [] });
      })
    );

    const { queryContacts } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof queryContacts>[0];
    const contacts = await queryContacts(mockSupabase, "org-1");

    expect(contacts).toEqual([]);
  });
});

describe("getContactOptions", () => {
  it("maps contacts to VendorOption shape", async () => {
    server.use(
      http.get(`${XERO_BASE}/Contacts`, () => {
        return HttpResponse.json({ Contacts: [CONTACT_2, CONTACT_1] });
      })
    );

    const { getContactOptions } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof getContactOptions>[0];
    const options = await getContactOptions(mockSupabase, "org-1");

    expect(options).toEqual([
      { value: "aaaa-1111", label: "Acme Corp" },
      { value: "bbbb-2222", label: "Beta Inc" },
    ]);
  });
});

describe("createContact", () => {
  it("creates a supplier contact and returns VendorOption", async () => {
    server.use(
      http.post(`${XERO_BASE}/Contacts`, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        expect(body.Name).toBe("New Vendor LLC");
        expect(body.IsSupplier).toBe(true);
        return HttpResponse.json({
          Contacts: [
            {
              ContactID: "cccc-3333",
              Name: "New Vendor LLC",
              ContactStatus: "ACTIVE",
              IsSupplier: true,
              IsCustomer: false,
            },
          ],
        });
      })
    );

    const { createContact } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof createContact>[0];
    const vendor = await createContact(mockSupabase, "org-1", "New Vendor LLC");

    expect(vendor).toEqual({
      value: "cccc-3333",
      label: "New Vendor LLC",
    });
  });

  it("creates a contact with parsed address", async () => {
    server.use(
      http.post(`${XERO_BASE}/Contacts`, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        expect(body.Addresses).toBeDefined();
        return HttpResponse.json({
          Contacts: [
            {
              ContactID: "dddd-4444",
              Name: "Address Vendor",
              ContactStatus: "ACTIVE",
              IsSupplier: true,
              IsCustomer: false,
            },
          ],
        });
      })
    );

    const { createContact } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof createContact>[0];
    const vendor = await createContact(
      mockSupabase,
      "org-1",
      "Address Vendor",
      "123 Main St, Springfield, IL 62704"
    );

    expect(vendor.value).toBe("dddd-4444");
  });
});
