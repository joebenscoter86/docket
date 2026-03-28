import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ReviewLayout from "./ReviewLayout";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("./PdfViewer", () => ({
  default: ({ signedUrl }: { signedUrl: string }) => (
    <div data-testid="pdf-viewer">PDF: {signedUrl}</div>
  ),
}));

vi.mock("./ExtractionForm", () => ({
  default: () => <div data-testid="extraction-form">Form</div>,
}));

vi.mock("./InvoiceStatusBadge", () => ({
  default: ({ status }: { status: string }) => (
    <span data-testid="status-badge">{status}</span>
  ),
}));

const defaultProps = {
  invoice: {
    id: "inv-1",
    fileName: "invoice-2024-001.pdf",
    fileType: "application/pdf",
    status: "pending_review" as const,
    outputType: "bill" as const,
    paymentAccountId: null,
    paymentAccountName: null,
    batchId: null,
  },
  orgDefaults: {
    defaultOutputType: "bill" as const,
    defaultPaymentAccountId: null,
    defaultPaymentAccountName: null,
  },
  signedUrl: "https://example.com/signed-url",
  extractedData: {
    id: "ext-1",
    invoice_id: "inv-1",
    vendor_name: "Acme Corp",
    vendor_address: null,
    vendor_ref: null,
    invoice_number: "INV-001",
    invoice_date: "2024-01-15",
    due_date: null,
    payment_terms: null,
    currency: "USD",
    subtotal: 100.0,
    tax_amount: 10.0,
    total_amount: 110.0,
    confidence_score: "high" as const,
    raw_ai_response: null,
    model_version: "claude-sonnet-4-6",
    extraction_duration_ms: 3800,
    extracted_at: "2024-01-15T10:00:00Z",
    extracted_line_items: [
      {
        id: "li-1",
        description: "Service",
        quantity: 1,
        unit_price: 100.0,
        amount: 100.0,
        gl_account_id: null,
        sort_order: 0,
        suggested_gl_account_id: null,
        gl_suggestion_source: null,
        is_user_confirmed: false,
        tracking: null,
      },
    ],
  },
};

describe("ReviewLayout", () => {
  it("displays file name in header", () => {
    render(<ReviewLayout {...defaultProps} />);
    expect(screen.getByText("invoice-2024-001.pdf")).toBeDefined();
  });

  it("displays status badge", () => {
    render(<ReviewLayout {...defaultProps} />);
    expect(screen.getByTestId("status-badge")).toBeDefined();
  });

  it("displays back link to invoices", () => {
    render(<ReviewLayout {...defaultProps} />);
    const backLink = screen.getByRole("link", { name: /back/i });
    expect(backLink.getAttribute("href")).toBe("/invoices");
  });

  it("displays confidence indicator with correct color for high", () => {
    render(<ReviewLayout {...defaultProps} />);
    expect(screen.getByText(/high confidence/i)).toBeDefined();
  });

  it("displays confidence indicator for medium", () => {
    render(
      <ReviewLayout
        {...defaultProps}
        extractedData={{ ...defaultProps.extractedData, confidence_score: "medium" }}
      />
    );
    expect(screen.getByText(/medium confidence/i)).toBeDefined();
  });

  it("displays confidence indicator for low", () => {
    render(
      <ReviewLayout
        {...defaultProps}
        extractedData={{ ...defaultProps.extractedData, confidence_score: "low" }}
      />
    );
    expect(screen.getByText(/low confidence/i)).toBeDefined();
  });

  it("hides confidence indicator when extractedData is null", () => {
    render(<ReviewLayout {...defaultProps} extractedData={null} />);
    expect(screen.queryByText(/confidence/i)).toBeNull();
  });

  it("renders both panels on desktop", () => {
    render(<ReviewLayout {...defaultProps} />);
    expect(screen.getByTestId("pdf-viewer")).toBeDefined();
    expect(screen.getByTestId("extraction-form")).toBeDefined();
  });

  it("renders tab bar for mobile", () => {
    render(<ReviewLayout {...defaultProps} />);
    expect(screen.getByRole("tab", { name: /document/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /details/i })).toBeDefined();
  });

  it("Document tab is selected by default", () => {
    render(<ReviewLayout {...defaultProps} />);
    const docTab = screen.getByRole("tab", { name: /document/i });
    expect(docTab.getAttribute("aria-selected")).toBe("true");
  });

  it("clicking Details tab selects it", () => {
    render(<ReviewLayout {...defaultProps} />);
    const detailsTab = screen.getByRole("tab", { name: /details/i });
    fireEvent.click(detailsTab);
    expect(detailsTab.getAttribute("aria-selected")).toBe("true");
    const docTab = screen.getByRole("tab", { name: /document/i });
    expect(docTab.getAttribute("aria-selected")).toBe("false");
  });

  it("truncates long file names", () => {
    render(
      <ReviewLayout
        {...defaultProps}
        invoice={{ ...defaultProps.invoice, fileName: "a-very-long-invoice-filename-that-should-be-truncated.pdf" }}
      />
    );
    const nameEl = screen.getByText("a-very-long-invoice-filename-that-should-be-truncated.pdf");
    expect(nameEl.className).toContain("truncate");
  });

  it("shows fallback message when extractedData is null", () => {
    render(<ReviewLayout {...defaultProps} extractedData={null} />);
    expect(screen.getByText("No extraction data found.")).toBeDefined();
    expect(screen.getByText("Please retry extraction.")).toBeDefined();
    const backLink = screen.getAllByRole("link").find(
      (el) => el.getAttribute("href") === "/invoices" && el.textContent === "Back to Invoices"
    );
    expect(backLink).toBeDefined();
  });
});
