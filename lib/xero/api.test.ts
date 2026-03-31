// lib/xero/api.test.ts
import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { XeroContact, XeroAccount, XeroInvoicePayload, XeroBankTransactionPayload } from "@/lib/xero/types";

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

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

describe("XeroApiError", () => {
  it("stores statusCode, errorCode, detail, and element", async () => {
    const { XeroApiError } = await import("@/lib/xero/api");
    const err = new XeroApiError({
      message: "Not found",
      statusCode: 404,
      errorCode: "NOT_FOUND",
      detail: "Contact not found",
      element: "Name",
    });
    expect(err.statusCode).toBe(404);
    expect(err.errorCode).toBe("NOT_FOUND");
    expect(err.detail).toBe("Contact not found");
    expect(err.element).toBe("Name");
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

// ─── fetchAccounts ───

const ACCOUNT_1: XeroAccount = {
  AccountID: "uuid-1",
  Code: "500",
  Name: "Cost of Goods Sold",
  Status: "ACTIVE",
  Type: "DIRECTCOSTS",
  Class: "EXPENSE",
};

const ACCOUNT_2: XeroAccount = {
  AccountID: "uuid-2",
  Code: "600",
  Name: "Advertising",
  Status: "ACTIVE",
  Type: "EXPENSE",
  Class: "EXPENSE",
};

const ACCOUNT_ARCHIVED: XeroAccount = {
  AccountID: "uuid-3",
  Code: "501",
  Name: "Archived Account",
  Status: "ARCHIVED",
  Type: "EXPENSE",
  Class: "EXPENSE",
};

const ACCOUNT_LIABILITY: XeroAccount = {
  AccountID: "uuid-4",
  Code: "800",
  Name: "Officers Loans",
  Status: "ACTIVE",
  Type: "CURRLIAB",
  Class: "LIABILITY",
};



const ACCOUNT_BANK: XeroAccount = {
  AccountID: "uuid-6",
  Code: "090",
  Name: "Business Checking",
  Status: "ACTIVE",
  Type: "BANK",
  Class: "ASSET",
  BankAccountType: "BANK",
};

describe("fetchAccounts", () => {
  it("returns AccountOption[] sorted alphabetically by label", async () => {
    server.use(
      http.get(`${XERO_BASE}/Accounts`, () => {
        return HttpResponse.json({ Accounts: [ACCOUNT_1, ACCOUNT_2, ACCOUNT_LIABILITY] });
      })
    );

    const { fetchAccounts } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof fetchAccounts>[0];
    const result = await fetchAccounts(mockSupabase, "org-1");

    expect(result).toEqual([
      { value: "600", label: "Advertising", accountType: "EXPENSE", classification: "Expense" },
      { value: "500", label: "Cost of Goods Sold", accountType: "DIRECTCOSTS", classification: "Expense" },
      { value: "800", label: "Officers Loans", accountType: "CURRLIAB", classification: "Liability" },
    ]);
  });

  it("filters out archived accounts", async () => {
    server.use(
      http.get(`${XERO_BASE}/Accounts`, () => {
        return HttpResponse.json({ Accounts: [ACCOUNT_1, ACCOUNT_ARCHIVED] });
      })
    );

    const { fetchAccounts } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof fetchAccounts>[0];
    const result = await fetchAccounts(mockSupabase, "org-1");

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Cost of Goods Sold");
    expect(result[0].classification).toBe("Expense");
  });

  it("sets xero-tenant-id header on the request", async () => {
    let capturedHeaders: Record<string, string> = {};
    server.use(
      http.get(`${XERO_BASE}/Accounts`, ({ request }) => {
        capturedHeaders = Object.fromEntries(request.headers.entries());
        return HttpResponse.json({ Accounts: [] });
      })
    );

    const { fetchAccounts } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof fetchAccounts>[0];
    await fetchAccounts(mockSupabase, "org-1");

    expect(capturedHeaders["xero-tenant-id"]).toBe("test-tenant-id");
  });

  it("excludes bank-type accounts from GL dropdown", async () => {
    server.use(
      http.get(`${XERO_BASE}/Accounts`, () => {
        return HttpResponse.json({ Accounts: [ACCOUNT_1, ACCOUNT_BANK] });
      })
    );

    const { fetchAccounts } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof fetchAccounts>[0];
    const result = await fetchAccounts(mockSupabase, "org-1");

    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Cost of Goods Sold");
  });

  it("fetches all accounts without class filter", async () => {
    let capturedUrl = "";
    server.use(
      http.get(`${XERO_BASE}/Accounts`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ Accounts: [] });
      })
    );

    const { fetchAccounts } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof fetchAccounts>[0];
    await fetchAccounts(mockSupabase, "org-1");

    expect(capturedUrl).not.toContain("where=");
  });

  it("throws XeroApiError on non-ok response", async () => {
    server.use(
      http.get(`${XERO_BASE}/Accounts`, () => {
        return HttpResponse.json(
          { Title: "Unauthorized", Status: 401, Detail: "AuthenticationUnsuccessful" },
          { status: 401 }
        );
      })
    );

    const { fetchAccounts, XeroApiError } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof fetchAccounts>[0];

    await expect(fetchAccounts(mockSupabase, "org-1")).rejects.toThrow(XeroApiError);
  });

  it("returns empty array when Accounts is empty", async () => {
    server.use(
      http.get(`${XERO_BASE}/Accounts`, () => {
        return HttpResponse.json({ Accounts: [] });
      })
    );

    const { fetchAccounts } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof fetchAccounts>[0];
    const result = await fetchAccounts(mockSupabase, "org-1");

    expect(result).toEqual([]);
  });
});

// ─── createInvoice ───

describe("createInvoice", () => {
  const billPayload: XeroInvoicePayload = {
    Type: "ACCPAY",
    Contact: { ContactID: "contact-uuid-1" },
    DateString: "2026-03-20",
    DueDateString: "2026-04-20",
    InvoiceNumber: "INV-001",
    Reference: "INV-001",
    LineItems: [
      {
        Description: "Office Supplies",
        Quantity: 1,
        UnitAmount: 150.0,
        AccountCode: "500",
      },
      {
        Description: "Printing",
        Quantity: 2,
        UnitAmount: 75.0,
        AccountCode: "600",
      },
    ],
  };

  it("creates an ACCPAY invoice via PUT", async () => {
    let capturedMethod = "";
    server.use(
      http.put(`${XERO_BASE}/Invoices`, async ({ request }) => {
        capturedMethod = request.method;
        const body = (await request.json()) as XeroInvoicePayload;
        expect(body.Type).toBe("ACCPAY");
        expect(body.Contact.ContactID).toBe("contact-uuid-1");
        expect(body.LineItems).toHaveLength(2);
        return HttpResponse.json({
          Invoices: [
            {
              InvoiceID: "inv-uuid-123",
              InvoiceNumber: "INV-001",
              Type: "ACCPAY",
              Status: "DRAFT",
              Contact: { ContactID: "contact-uuid-1", Name: "Acme Corp" },
              DateString: "2026-03-20",
              DueDateString: "2026-04-20",
              Total: 300.0,
              AmountDue: 300.0,
              CurrencyCode: "USD",
              LineItems: body.LineItems,
            },
          ],
        });
      })
    );

    const { createInvoice } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof createInvoice>[0];
    const result = await createInvoice(mockSupabase, "org-1", billPayload);

    expect(capturedMethod).toBe("PUT");
    expect(result.Invoices[0].InvoiceID).toBe("inv-uuid-123");
    expect(result.Invoices[0].Status).toBe("DRAFT");
  });

  it("throws XeroApiError on validation failure", async () => {
    server.use(
      http.put(`${XERO_BASE}/Invoices`, () => {
        return HttpResponse.json(
          {
            StatusCode: 400,
            Message: "A validation error occurred",
            Elements: [
              {
                ValidationErrors: [
                  { Message: "Account code '999' is not a valid code" },
                ],
              },
            ],
          },
          { status: 400 }
        );
      })
    );

    const { createInvoice, XeroApiError } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof createInvoice>[0];

    await expect(
      createInvoice(mockSupabase, "org-1", billPayload)
    ).rejects.toThrow(XeroApiError);
  });

  it("throws XeroApiError on 401 auth error", async () => {
    server.use(
      http.put(`${XERO_BASE}/Invoices`, () => {
        return HttpResponse.json(
          { Title: "Unauthorized", Status: 401, Detail: "Token expired" },
          { status: 401 }
        );
      })
    );

    const { createInvoice } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof createInvoice>[0];

    await expect(
      createInvoice(mockSupabase, "org-1", billPayload)
    ).rejects.toThrow("Token expired");
  });

  it("logs warnings when invoice is created with warnings", async () => {
    const { logger } = await import("@/lib/utils/logger");
    server.use(
      http.put(`${XERO_BASE}/Invoices`, () => {
        return HttpResponse.json({
          Invoices: [
            {
              InvoiceID: "inv-uuid-warn",
              InvoiceNumber: "INV-002",
              Type: "ACCPAY",
              Status: "DRAFT",
              Contact: { ContactID: "contact-uuid-1", Name: "Acme Corp" },
              DateString: "2026-03-20",
              DueDateString: "2026-04-20",
              Total: 150.0,
              AmountDue: 150.0,
              CurrencyCode: "USD",
              LineItems: [],
              Warnings: [{ Message: "Account code not valid for this org" }],
            },
          ],
        });
      })
    );

    const { createInvoice } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof createInvoice>[0];
    const result = await createInvoice(mockSupabase, "org-1", billPayload);

    expect(result.Invoices[0].Warnings).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledWith(
      "xero.invoice_created_with_warnings",
      expect.objectContaining({ invoiceId: "inv-uuid-warn" })
    );
  });
});

// ─── attachDocumentToInvoice ───

describe("attachDocumentToInvoice", () => {
  it("uploads a PDF attachment via PUT with IncludeOnline=true", async () => {
    let capturedContentType = "";
    let capturedUrl = "";
    server.use(
      http.put(
        `${XERO_BASE}/Invoices/inv-uuid-123/Attachments/invoice.pdf`,
        ({ request }) => {
          capturedContentType = request.headers.get("content-type") ?? "";
          capturedUrl = request.url;
          return HttpResponse.json({
            Attachments: [
              {
                AttachmentID: "att-uuid-1",
                FileName: "invoice.pdf",
                Url: "https://api.xero.com/...",
                MimeType: "application/pdf",
                ContentLength: 1024,
              },
            ],
          });
        }
      )
    );

    const { attachDocumentToInvoice } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof attachDocumentToInvoice>[0];
    const result = await attachDocumentToInvoice(
      mockSupabase,
      "org-1",
      "inv-uuid-123",
      Buffer.from("PDF content"),
      "invoice.pdf"
    );

    expect(capturedContentType).toBe("application/pdf");
    expect(result.Attachments[0].AttachmentID).toBe("att-uuid-1");
    expect(capturedUrl).toContain("IncludeOnline=true");
  });

  it("sets correct MIME type for PNG files", async () => {
    let capturedContentType = "";
    server.use(
      http.put(
        `${XERO_BASE}/Invoices/inv-uuid-123/Attachments/invoice.png`,
        ({ request }) => {
          capturedContentType = request.headers.get("content-type") ?? "";
          return HttpResponse.json({
            Attachments: [
              {
                AttachmentID: "att-uuid-2",
                FileName: "invoice.png",
                Url: "https://api.xero.com/...",
                MimeType: "image/png",
                ContentLength: 2048,
              },
            ],
          });
        }
      )
    );

    const { attachDocumentToInvoice } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof attachDocumentToInvoice>[0];
    await attachDocumentToInvoice(
      mockSupabase,
      "org-1",
      "inv-uuid-123",
      Buffer.from("PNG content"),
      "invoice.png"
    );

    expect(capturedContentType).toBe("image/png");
  });

  it("throws XeroApiError on upload failure", async () => {
    server.use(
      http.put(
        `${XERO_BASE}/Invoices/inv-uuid-123/Attachments/invoice.pdf`,
        () => {
          return HttpResponse.json(
            { Title: "Not Found", Status: 404, Detail: "Invoice not found" },
            { status: 404 }
          );
        }
      )
    );

    const { attachDocumentToInvoice, XeroApiError } = await import(
      "@/lib/xero/api"
    );
    const mockSupabase = {} as Parameters<typeof attachDocumentToInvoice>[0];

    await expect(
      attachDocumentToInvoice(
        mockSupabase,
        "org-1",
        "inv-uuid-123",
        Buffer.from("PDF content"),
        "invoice.pdf"
      )
    ).rejects.toThrow(XeroApiError);
  });
});

// ─── createBankTransaction ───

describe("createBankTransaction", () => {
  const spendPayload: XeroBankTransactionPayload = {
    Type: "SPEND",
    Contact: { ContactID: "contact-uuid-1" },
    BankAccount: { AccountID: "bank-uuid-1" },
    LineItems: [
      {
        Description: "Check payment",
        Quantity: 1,
        UnitAmount: 200.0,
        AccountCode: "500",
      },
    ],
    Date: "2026-03-20",
    Reference: "CHK-001",
    Status: "AUTHORISED",
  };

  it("creates a SPEND bank transaction via PUT", async () => {
    let capturedMethod = "";
    server.use(
      http.put(`${XERO_BASE}/BankTransactions`, async ({ request }) => {
        capturedMethod = request.method;
        const body = (await request.json()) as XeroBankTransactionPayload;
        expect(body.Type).toBe("SPEND");
        expect(body.Contact.ContactID).toBe("contact-uuid-1");
        expect(body.BankAccount.AccountID).toBe("bank-uuid-1");
        expect(body.LineItems).toHaveLength(1);
        return HttpResponse.json({
          BankTransactions: [
            {
              BankTransactionID: "bt-uuid-123",
              Type: "SPEND",
              Status: "AUTHORISED",
              Contact: { ContactID: "contact-uuid-1", Name: "Acme Corp" },
              BankAccount: { AccountID: "bank-uuid-1", Name: "Checking", Code: "090" },
              DateString: "2026-03-20",
              Reference: "CHK-001",
              Total: 200.0,
              LineItems: body.LineItems,
            },
          ],
        });
      })
    );

    const { createBankTransaction } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof createBankTransaction>[0];
    const result = await createBankTransaction(mockSupabase, "org-1", spendPayload);

    expect(capturedMethod).toBe("PUT");
    expect(result.BankTransactions[0].BankTransactionID).toBe("bt-uuid-123");
    expect(result.BankTransactions[0].Status).toBe("AUTHORISED");
  });

  it("throws XeroApiError on validation failure", async () => {
    server.use(
      http.put(`${XERO_BASE}/BankTransactions`, () => {
        return HttpResponse.json(
          {
            StatusCode: 400,
            Message: "A validation error occurred",
            Elements: [
              {
                ValidationErrors: [
                  { Message: "Account code '999' is not a valid code" },
                ],
              },
            ],
          },
          { status: 400 }
        );
      })
    );

    const { createBankTransaction, XeroApiError } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof createBankTransaction>[0];

    await expect(
      createBankTransaction(mockSupabase, "org-1", spendPayload)
    ).rejects.toThrow(XeroApiError);
  });

  it("throws XeroApiError on 401 auth error", async () => {
    server.use(
      http.put(`${XERO_BASE}/BankTransactions`, () => {
        return HttpResponse.json(
          { Title: "Unauthorized", Status: 401, Detail: "Token expired" },
          { status: 401 }
        );
      })
    );

    const { createBankTransaction } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof createBankTransaction>[0];

    await expect(
      createBankTransaction(mockSupabase, "org-1", spendPayload)
    ).rejects.toThrow("Token expired");
  });

  it("logs warnings when bank transaction is created with warnings", async () => {
    const { logger } = await import("@/lib/utils/logger");
    server.use(
      http.put(`${XERO_BASE}/BankTransactions`, () => {
        return HttpResponse.json({
          BankTransactions: [
            {
              BankTransactionID: "bt-uuid-warn",
              Type: "SPEND",
              Status: "AUTHORISED",
              Contact: { ContactID: "contact-uuid-1", Name: "Acme Corp" },
              BankAccount: { AccountID: "bank-uuid-1", Name: "Checking", Code: "090" },
              DateString: "2026-03-20",
              Total: 200.0,
              LineItems: [],
              Warnings: [{ Message: "Account code not valid for this org" }],
            },
          ],
        });
      })
    );

    const { createBankTransaction } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof createBankTransaction>[0];
    const result = await createBankTransaction(mockSupabase, "org-1", spendPayload);

    expect(result.BankTransactions[0].Warnings).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledWith(
      "xero.bank_transaction_created_with_warnings",
      expect.objectContaining({ bankTransactionId: "bt-uuid-warn" })
    );
  });
});

// ─── attachDocumentToBankTransaction ───

describe("attachDocumentToBankTransaction", () => {
  it("uploads a PDF attachment via PUT with IncludeOnline=true", async () => {
    let capturedContentType = "";
    let capturedUrl = "";
    server.use(
      http.put(
        `${XERO_BASE}/BankTransactions/bt-uuid-123/Attachments/receipt.pdf`,
        ({ request }) => {
          capturedContentType = request.headers.get("content-type") ?? "";
          capturedUrl = request.url;
          return HttpResponse.json({
            Attachments: [
              {
                AttachmentID: "att-bt-uuid-1",
                FileName: "receipt.pdf",
                Url: "https://api.xero.com/...",
                MimeType: "application/pdf",
                ContentLength: 1024,
              },
            ],
          });
        }
      )
    );

    const { attachDocumentToBankTransaction } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof attachDocumentToBankTransaction>[0];
    const result = await attachDocumentToBankTransaction(
      mockSupabase,
      "org-1",
      "bt-uuid-123",
      Buffer.from("PDF content"),
      "receipt.pdf"
    );

    expect(capturedContentType).toBe("application/pdf");
    expect(result.Attachments[0].AttachmentID).toBe("att-bt-uuid-1");
    expect(capturedUrl).toContain("IncludeOnline=true");
  });

  it("sets correct MIME type for PNG files", async () => {
    let capturedContentType = "";
    server.use(
      http.put(
        `${XERO_BASE}/BankTransactions/bt-uuid-123/Attachments/receipt.png`,
        ({ request }) => {
          capturedContentType = request.headers.get("content-type") ?? "";
          return HttpResponse.json({
            Attachments: [
              {
                AttachmentID: "att-bt-uuid-2",
                FileName: "receipt.png",
                Url: "https://api.xero.com/...",
                MimeType: "image/png",
                ContentLength: 2048,
              },
            ],
          });
        }
      )
    );

    const { attachDocumentToBankTransaction } = await import("@/lib/xero/api");
    const mockSupabase = {} as Parameters<typeof attachDocumentToBankTransaction>[0];
    await attachDocumentToBankTransaction(
      mockSupabase,
      "org-1",
      "bt-uuid-123",
      Buffer.from("PNG content"),
      "receipt.png"
    );

    expect(capturedContentType).toBe("image/png");
  });

  it("throws XeroApiError on upload failure", async () => {
    server.use(
      http.put(
        `${XERO_BASE}/BankTransactions/bt-uuid-123/Attachments/receipt.pdf`,
        () => {
          return HttpResponse.json(
            { Title: "Not Found", Status: 404, Detail: "Bank transaction not found" },
            { status: 404 }
          );
        }
      )
    );

    const { attachDocumentToBankTransaction, XeroApiError } = await import(
      "@/lib/xero/api"
    );
    const mockSupabase = {} as Parameters<typeof attachDocumentToBankTransaction>[0];

    await expect(
      attachDocumentToBankTransaction(
        mockSupabase,
        "org-1",
        "bt-uuid-123",
        Buffer.from("PDF content"),
        "receipt.pdf"
      )
    ).rejects.toThrow(XeroApiError);
  });
});
