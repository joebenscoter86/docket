import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ExtractionForm from "./ExtractionForm";
import type { ExtractedDataRow } from "@/lib/types/invoice";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock LineItemEditor and ActionBar to isolate ExtractionForm tests
vi.mock("./LineItemEditor", () => ({
  default: () => <div data-testid="line-item-editor" />,
}));
vi.mock("./ActionBar", () => ({
  default: () => <div data-testid="action-bar" />,
}));
vi.mock("./OutputTypeSelector", () => ({
  default: () => <div data-testid="output-type-selector" />,
}));

const defaultOutputProps = {
  outputType: "bill" as const,
  paymentAccountId: null,
  paymentAccountName: null,
  accountingProvider: "quickbooks" as const,
  orgDefaults: {
    defaultOutputType: "bill" as const,
    defaultPaymentAccountId: null,
    defaultPaymentAccountName: null,
  },
};

function makeExtractedData(
  overrides: Partial<ExtractedDataRow> = {}
): ExtractedDataRow {
  return {
    id: "ed-1",
    invoice_id: "inv-1",
    vendor_name: "Acme Corp",
    vendor_address: "123 Main St",
    vendor_ref: null,
    invoice_number: "INV-001",
    invoice_date: "2026-01-15",
    due_date: "2026-02-15",
    payment_terms: "Net 30",
    currency: "USD",
    subtotal: 100,
    tax_amount: 10,
    total_amount: 110,
    confidence_score: null,
    raw_ai_response: null,
    model_version: null,
    extraction_duration_ms: null,
    extracted_at: "2026-01-15T00:00:00Z",
    extracted_line_items: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }))
  );
});

describe("ExtractionForm confidence indicators", () => {
  it.each(["high", "medium", "low"] as const)(
    "renders confidence left border on fields when confidence is %s",
    (level) => {
      const { container } = render(
        <ExtractionForm
          extractedData={makeExtractedData({ confidence_score: level })}
          invoiceId="inv-1"
          invoiceStatus="pending_review"
          {...defaultOutputProps}
        />
      );
      const borderClass =
        level === "high"
          ? "border-accent"
          : level === "medium"
            ? "border-warning"
            : "border-error";
      const fieldsWithBorder = container.querySelectorAll(`.${borderClass}`);
      expect(fieldsWithBorder.length).toBeGreaterThan(0);
    }
  );

  it.each(["high", "medium", "low"] as const)(
    "renders confidence icon with aria-label for %s confidence",
    (level) => {
      render(
        <ExtractionForm
          extractedData={makeExtractedData({ confidence_score: level })}
          invoiceId="inv-1"
          invoiceStatus="pending_review"
          {...defaultOutputProps}
        />
      );
      const label =
        level === "high"
          ? "High confidence"
          : level === "medium"
            ? "Medium confidence"
            : "Low confidence";
      const icons = screen.getAllByLabelText(label);
      expect(icons.length).toBeGreaterThan(0);
    }
  );

  it("renders low-confidence banner when confidence is low", () => {
    render(
      <ExtractionForm
        extractedData={makeExtractedData({ confidence_score: "low" })}
        invoiceId="inv-1"
        invoiceStatus="pending_review"
        {...defaultOutputProps}
      />
    );
    expect(
      screen.getByText("Some fields may need extra attention. Please review carefully.")
    ).toBeDefined();
  });

  it("does not render banner for high confidence", () => {
    render(
      <ExtractionForm
        extractedData={makeExtractedData({ confidence_score: "high" })}
        invoiceId="inv-1"
        invoiceStatus="pending_review"
        {...defaultOutputProps}
      />
    );
    expect(
      screen.queryByText("Some fields may need extra attention. Please review carefully.")
    ).toBeNull();
  });

  it("does not render banner for medium confidence", () => {
    render(
      <ExtractionForm
        extractedData={makeExtractedData({ confidence_score: "medium" })}
        invoiceId="inv-1"
        invoiceStatus="pending_review"
        {...defaultOutputProps}
      />
    );
    expect(
      screen.queryByText("Some fields may need extra attention. Please review carefully.")
    ).toBeNull();
  });

  it("renders no confidence indicators when confidence_score is null", () => {
    render(
      <ExtractionForm
        extractedData={makeExtractedData({ confidence_score: null })}
        invoiceId="inv-1"
        invoiceStatus="pending_review"
        {...defaultOutputProps}
      />
    );
    expect(screen.queryByLabelText("High confidence")).toBeNull();
    expect(screen.queryByLabelText("Medium confidence")).toBeNull();
    expect(screen.queryByLabelText("Low confidence")).toBeNull();
  });

  it("clears confidence indicator on a field when user types in it", () => {
    render(
      <ExtractionForm
        extractedData={makeExtractedData({ confidence_score: "medium" })}
        invoiceId="inv-1"
        invoiceStatus="pending_review"
        {...defaultOutputProps}
      />
    );

    // Vendor name field should have amber border initially
    const vendorInput = screen.getByDisplayValue("Acme Corp");
    const vendorWrapper = vendorInput.closest(".border-warning");
    expect(vendorWrapper).not.toBeNull();

    // Type in the field to change its value
    fireEvent.change(vendorInput, { target: { value: "Acme Corp Updated" } });

    // Now the vendor wrapper should have primary border (changed), not warning
    const updatedWrapper = vendorInput.closest(".border-primary");
    expect(updatedWrapper).not.toBeNull();
    const warningWrapper = vendorInput.closest(".border-warning");
    expect(warningWrapper).toBeNull();
  });
});
