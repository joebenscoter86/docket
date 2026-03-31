import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ActionBar from "./ActionBar";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) })
    )
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ActionBar — approve phase (pending_review)", () => {
  const baseProps = {
    invoiceId: "inv-1",
    currentStatus: "pending_review" as const,
    vendorName: "Acme Corp",
    totalAmount: 110,
    syncBlockers: [],
    outputType: "bill" as const,
    provider: "quickbooks" as const,
    onStatusChange: vi.fn(),
  };

  it("renders approve button when status is pending_review", () => {
    render(<ActionBar {...baseProps} />);
    expect(screen.getByText("Approve Invoice")).toBeTruthy();
  });

  it("disables approve when vendor_name is missing", () => {
    render(<ActionBar {...baseProps} vendorName="" />);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(screen.getByText(/Missing: vendor name/)).toBeTruthy();
  });

  it("disables approve when total_amount is missing", () => {
    render(<ActionBar {...baseProps} totalAmount={null} />);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(screen.getByText(/Missing:.*total amount/)).toBeTruthy();
  });

  it("single click triggers approve API (no confirm gate)", async () => {
    const onStatusChange = vi.fn();
    render(<ActionBar {...baseProps} onStatusChange={onStatusChange} />);

    fireEvent.click(screen.getByText("Approve Invoice"));

    // Advance past the 500ms blur delay
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // Fetch should have been called
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/invoices/inv-1/approve",
      { method: "POST" }
    );

    // Advance past the 500ms approved flash timer
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(onStatusChange).toHaveBeenCalledWith("approved");
  });

  it("shows error on approve failure and returns to idle", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "Server error" }),
        })
      )
    );

    render(<ActionBar {...baseProps} />);

    fireEvent.click(screen.getByText("Approve Invoice"));

    // Advance past the 500ms blur delay so fetch fires
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // Error should be visible
    expect(screen.getByText("Server error")).toBeTruthy();

    // Button returns to idle (approve button visible again)
    expect(screen.getByText("Approve Invoice")).toBeTruthy();
  });
});

describe("ActionBar — sync phase (approved)", () => {
  const baseProps = {
    invoiceId: "inv-1",
    currentStatus: "approved" as const,
    vendorName: "Acme Corp",
    totalAmount: 110,
    syncBlockers: [],
    outputType: "bill" as const,
    provider: "quickbooks" as const,
    onStatusChange: vi.fn(),
  };

  it("renders sync button when status is approved", () => {
    render(<ActionBar {...baseProps} />);
    expect(screen.getByText("Sync to QuickBooks")).toBeTruthy();
  });

  it("single click fires sync immediately", async () => {
    const onStatusChange = vi.fn();
    render(<ActionBar {...baseProps} onStatusChange={onStatusChange} />);

    await act(async () => {
      fireEvent.click(screen.getByText("Sync to QuickBooks"));
      await vi.runAllTimersAsync();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/invoices/inv-1/sync",
      { method: "POST", headers: {} }
    );

    expect(onStatusChange).toHaveBeenCalledWith("synced");
  });

  it("disables sync button when blockers exist", () => {
    render(
      <ActionBar {...baseProps} syncBlockers={["Select a QuickBooks vendor"]} />
    );
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(screen.getByText("Select a QuickBooks vendor")).toBeTruthy();
  });

  it("uses retry endpoint when isRetry is true", async () => {
    render(<ActionBar {...baseProps} isRetry />);

    expect(screen.getByText("Retry Sync to QuickBooks")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByText("Retry Sync to QuickBooks"));
      await vi.runAllTimersAsync();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/invoices/inv-1/sync/retry",
      { method: "POST", headers: {} }
    );
  });

  it("shows retry button on sync failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "QBO error" }),
        })
      )
    );

    render(<ActionBar {...baseProps} />);

    await act(async () => {
      fireEvent.click(screen.getByText("Sync to QuickBooks"));
      // Flush microtasks (fetch + json parse)
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("QBO error")).toBeTruthy();
    expect(screen.getByText("Retry Sync")).toBeTruthy();
  });

  it("shows attachment warning when present in response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { warning: "PDF attachment failed" },
            }),
        })
      )
    );

    render(<ActionBar {...baseProps} />);

    await act(async () => {
      fireEvent.click(screen.getByText("Sync to QuickBooks"));
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText("PDF attachment failed")).toBeTruthy();
  });
});

describe("ActionBar — approve-to-sync transition", () => {
  it("transitions from approve to sync when currentStatus changes", () => {
    const { rerender } = render(
      <ActionBar
        invoiceId="inv-1"
        currentStatus="pending_review"
        vendorName="Acme Corp"
        totalAmount={110}
        syncBlockers={[]}
        outputType="bill"
        provider="quickbooks"
        onStatusChange={vi.fn()}
      />
    );

    // Initially shows approve
    expect(screen.getByText("Approve Invoice")).toBeTruthy();

    // Parent updates currentStatus to approved
    rerender(
      <ActionBar
        invoiceId="inv-1"
        currentStatus="approved"
        vendorName="Acme Corp"
        totalAmount={110}
        syncBlockers={[]}
        outputType="bill"
        provider="quickbooks"
        onStatusChange={vi.fn()}
      />
    );

    // Now shows sync — no redirect, no page navigation
    expect(screen.getByText("Sync to QuickBooks")).toBeTruthy();
  });
});

describe("ActionBar — synced phase", () => {
  it("renders read-only success message when synced", () => {
    render(
      <ActionBar
        invoiceId="inv-1"
        currentStatus="synced"
        vendorName="Acme Corp"
        totalAmount={110}
        syncBlockers={[]}
        outputType="bill"
        provider="quickbooks"
        onStatusChange={vi.fn()}
      />
    );
    expect(screen.getByText("This invoice has been synced to QuickBooks.")).toBeTruthy();
  });
});
