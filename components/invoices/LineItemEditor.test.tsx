import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LineItemEditor from "./LineItemEditor";
import type { ExtractedLineItemRow } from "@/lib/types/invoice";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const MOCK_ITEMS: ExtractedLineItemRow[] = [
  {
    id: "li-1",
    description: "Web development",
    quantity: 40,
    unit_price: 150,
    amount: 6000,
    gl_account_id: null,
    sort_order: 0,
    suggested_gl_account_id: null,
    gl_suggestion_source: null,
    is_user_confirmed: false,
  },
  {
    id: "li-2",
    description: "Hosting",
    quantity: 1,
    unit_price: 120,
    amount: 120,
    gl_account_id: null,
    sort_order: 1,
    suggested_gl_account_id: null,
    gl_suggestion_source: null,
    is_user_confirmed: false,
  },
];

const defaultProps = {
  lineItems: MOCK_ITEMS,
  invoiceId: "inv-1",
  extractedDataId: "ed-1",
  currency: "USD",
  onSubtotalChange: vi.fn(),
  accounts: [],
  accountsLoading: false,
  accountingConnected: false,
};

describe("LineItemEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { field: "description", value: "test", saved: true } }),
    });
  });

  it("renders line items in table format", () => {
    render(<LineItemEditor {...defaultProps} />);
    expect(screen.getByDisplayValue("Web development")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Hosting")).toBeInTheDocument();
  });

  it("renders column headers", () => {
    render(<LineItemEditor {...defaultProps} />);
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Qty")).toBeInTheDocument();
    expect(screen.getByText("Unit Price")).toBeInTheDocument();
    expect(screen.getByText("Amount")).toBeInTheDocument();
  });

  it("renders empty state when no items", () => {
    render(<LineItemEditor {...defaultProps} lineItems={[]} />);
    expect(screen.getByText(/no line items were extracted/i)).toBeInTheDocument();
  });

  it("does not call API on blur when value is unchanged", async () => {
    render(<LineItemEditor {...defaultProps} />);
    const descInput = screen.getByDisplayValue("Web development");
    fireEvent.focus(descInput);
    fireEvent.blur(descInput);

    expect(mockFetch).not.toHaveBeenCalledWith(
      "/api/invoices/inv-1/line-items/li-1",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("calls API on blur to save field", async () => {
    render(<LineItemEditor {...defaultProps} />);
    const descInput = screen.getByDisplayValue("Web development");
    fireEvent.focus(descInput);
    fireEvent.change(descInput, { target: { value: "Updated desc" } });
    fireEvent.blur(descInput);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/invoices/inv-1/line-items/li-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ field: "description", value: "Updated desc" }),
        })
      );
    });
  });

  it("auto-calculates amount when qty changes", async () => {
    render(<LineItemEditor {...defaultProps} />);
    const qtyInputs = screen.getAllByDisplayValue("40");
    const qtyInput = qtyInputs[0];
    fireEvent.focus(qtyInput);
    fireEvent.change(qtyInput, { target: { value: "50" } });
    fireEvent.blur(qtyInput);

    // Amount should be recalculated: 50 * 150 = 7500
    await waitFor(() => {
      expect(screen.getByDisplayValue("$7,500.00")).toBeInTheDocument();
    });
  });

  it("calls onSubtotalChange when amount changes", async () => {
    render(<LineItemEditor {...defaultProps} />);
    const qtyInputs = screen.getAllByDisplayValue("40");
    fireEvent.focus(qtyInputs[0]);
    fireEvent.change(qtyInputs[0], { target: { value: "50" } });
    fireEvent.blur(qtyInputs[0]);

    await waitFor(() => {
      // 7500 (updated) + 120 (unchanged) = 7620
      expect(defaultProps.onSubtotalChange).toHaveBeenCalledWith(7620);
    });
  });

  it("adds a new line item via API", async () => {
    const newItem = {
      id: "li-new", description: null, quantity: null,
      unit_price: null, amount: null, gl_account_id: null, sort_order: 2,
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: newItem }),
    });

    render(<LineItemEditor {...defaultProps} />);
    const addButton = screen.getByText(/add line item/i);
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/invoices/inv-1/line-items",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ extracted_data_id: "ed-1" }),
        })
      );
    });
  });

  it("removes a line item via API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { deleted: true } }),
    });

    render(<LineItemEditor {...defaultProps} />);
    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/invoices/inv-1/line-items/li-1",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  it("shows confirmation for removing last item", () => {
    render(
      <LineItemEditor
        {...defaultProps}
        lineItems={[MOCK_ITEMS[0]]}
      />
    );
    const removeButton = screen.getByRole("button", { name: /remove/i });
    fireEvent.click(removeButton);

    expect(screen.getByText(/remove last item/i)).toBeInTheDocument();
  });
});
