import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import InvoiceList from "./InvoiceList";
import { InvoiceListItem, InvoiceListCounts } from "@/lib/invoices/types";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/invoices",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock dependencies
vi.mock("@/lib/utils/currency", () => ({
  formatCurrency: (val: number) => `$${val.toFixed(2)}`,
}));

vi.mock("@/lib/utils/date", () => ({
  formatRelativeTime: () => "2 hours ago",
}));

vi.mock("./InvoiceStatusBadge", () => ({
  default: ({ status }: { status: string }) => <span data-testid="status-badge">{status}</span>,
}));

const emptyCounts: InvoiceListCounts = {
  all: 0,
  pending_review: 0,
  approved: 0,
  synced: 0,
  error: 0,
};

const sampleCounts: InvoiceListCounts = {
  all: 20,
  pending_review: 3,
  approved: 7,
  synced: 9,
  error: 1,
};

const sampleInvoices: InvoiceListItem[] = [
  {
    id: "inv-1",
    file_name: "invoice-001.pdf",
    status: "pending_review",
    uploaded_at: "2026-03-16T12:00:00Z",
    output_type: null,
    batch_id: null,
    source: "upload",
    email_sender: null,
    error_message: null,
    sms_body_context: null,
    extracted_data: {
      vendor_name: "Acme Corp",
      invoice_number: "INV-001",
      invoice_date: "2026-03-10",
      total_amount: 1250.0,
    },
  },
  {
    id: "inv-2",
    file_name: "receipt.pdf",
    status: "synced",
    uploaded_at: "2026-03-15T10:00:00Z",
    output_type: null,
    batch_id: null,
    source: "upload",
    email_sender: null,
    error_message: null,
    sms_body_context: null,
    extracted_data: null,
  },
];

describe("InvoiceList", () => {
  it("shows empty state when no invoices exist", () => {
    render(
      <InvoiceList
        invoices={[]}
        counts={emptyCounts}
        nextCursor={null}
        currentStatus="all"
        currentSort="uploaded_at"
        currentDirection="desc"
        hasCursor={false}
        currentOutputType="all"
      />
    );
    expect(screen.getByText(/no invoices yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /upload/i })).toBeInTheDocument();
  });

  it("shows filter-empty state when filter has no results", () => {
    render(
      <InvoiceList
        invoices={[]}
        counts={sampleCounts}
        nextCursor={null}
        currentStatus="approved"
        currentSort="uploaded_at"
        currentDirection="desc"
        hasCursor={false}
        currentOutputType="all"
      />
    );
    expect(screen.getByText(/no invoices match this filter/i)).toBeInTheDocument();
  });

  it("renders filter tabs with counts", () => {
    render(
      <InvoiceList
        invoices={sampleInvoices}
        counts={sampleCounts}
        nextCursor={null}
        currentStatus="all"
        currentSort="uploaded_at"
        currentDirection="desc"
        hasCursor={false}
        currentOutputType="all"
      />
    );
    expect(screen.getAllByText(/^all$/i).length).toBeGreaterThan(0);
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders invoice data in the table", () => {
    render(
      <InvoiceList
        invoices={sampleInvoices}
        counts={sampleCounts}
        nextCursor={null}
        currentStatus="all"
        currentSort="uploaded_at"
        currentDirection="desc"
        hasCursor={false}
        currentOutputType="all"
      />
    );
    expect(screen.getAllByText("invoice-001.pdf").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Acme Corp").length).toBeGreaterThan(0);
    expect(screen.getAllByText("INV-001").length).toBeGreaterThan(0);
  });

  it("shows 'Pending' for invoices without extracted data", () => {
    render(
      <InvoiceList
        invoices={sampleInvoices}
        counts={sampleCounts}
        nextCursor={null}
        currentStatus="all"
        currentSort="uploaded_at"
        currentDirection="desc"
        hasCursor={false}
        currentOutputType="all"
      />
    );
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
  });

  it("shows next page button when nextCursor exists", () => {
    render(
      <InvoiceList
        invoices={sampleInvoices}
        counts={sampleCounts}
        nextCursor="abc123"
        currentStatus="all"
        currentSort="uploaded_at"
        currentDirection="desc"
        hasCursor={false}
        currentOutputType="all"
      />
    );
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("does not show next page button when nextCursor is null", () => {
    render(
      <InvoiceList
        invoices={sampleInvoices}
        counts={sampleCounts}
        nextCursor={null}
        currentStatus="all"
        currentSort="uploaded_at"
        currentDirection="desc"
        hasCursor={false}
        currentOutputType="all"
      />
    );
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
  });

  it("shows previous page link when hasCursor is true", () => {
    render(
      <InvoiceList
        invoices={sampleInvoices}
        counts={sampleCounts}
        nextCursor={null}
        currentStatus="all"
        currentSort="uploaded_at"
        currentDirection="desc"
        hasCursor={true}
        currentOutputType="all"
      />
    );
    expect(screen.getByText("Previous")).toBeInTheDocument();
  });
});
