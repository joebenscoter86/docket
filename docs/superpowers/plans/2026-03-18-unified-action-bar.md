# Unified Action Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace separate ApproveBar + SyncBar with a unified ActionBar that keeps the user on one screen, reducing the approval flow from 6 clicks to 3.

**Architecture:** New `ActionBar` client component with internal state machine handles approve (single-click) and sync (confirm-gated) flows. ExtractionForm swaps out two conditional component renders for one. No backend changes.

**Tech Stack:** React, TypeScript, Vitest, @testing-library/react

**Spec:** `docs/superpowers/specs/2026-03-18-unified-action-bar-design.md`

---

### Task 1: Create ActionBar Component

**Files:**
- Create: `components/invoices/ActionBar.tsx`

- [ ] **Step 1: Create the ActionBar component**

Create `components/invoices/ActionBar.tsx` with the full implementation. This component merges behavior from `ApproveBar.tsx` and `SyncBar.tsx` into a single state machine.

```tsx
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { InvoiceStatus } from "@/lib/types/invoice";

type ActionBarState =
  | "idle"
  | "approving"
  | "approved"
  | "confirming"
  | "syncing"
  | "synced"
  | "failed";

interface ActionBarProps {
  invoiceId: string;
  currentStatus: InvoiceStatus;
  vendorName: string | number | null;
  totalAmount: string | number | null;
  vendorRef: string | null;
  syncBlockers: string[];
  isRetry?: boolean;
  onStatusChange: (newStatus: InvoiceStatus) => void;
}

export default function ActionBar({
  invoiceId,
  currentStatus,
  vendorName,
  totalAmount,
  vendorRef,
  syncBlockers,
  isRetry = false,
  onStatusChange,
}: ActionBarProps) {
  const [barState, setBarState] = useState<ActionBarState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const approvedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      if (errorTimer.current) clearTimeout(errorTimer.current);
      if (approvedTimer.current) clearTimeout(approvedTimer.current);
    };
  }, []);

  // Reset internal state when parent status changes (e.g., after approve transitions to sync phase)
  useEffect(() => {
    setBarState("idle");
    setErrorMessage(null);
    setWarning(null);
  }, [currentStatus]);

  // --- Approve validation ---
  const missingFields: string[] = [];
  const vendorStr = String(vendorName ?? "").trim();
  if (!vendorStr) missingFields.push("vendor name");
  if (totalAmount === null || totalAmount === undefined || String(totalAmount).trim() === "") {
    missingFields.push("total amount");
  }
  const canApprove = missingFields.length === 0;

  // --- Sync validation ---
  const canSync = currentStatus === "approved" && syncBlockers.length === 0;

  // --- Approve handler (single click, no confirm gate) ---
  const handleApprove = useCallback(async () => {
    if (!canApprove) return;

    // Blur active element to trigger pending auto-saves
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    await new Promise((resolve) => setTimeout(resolve, 500));

    setBarState("approving");
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/invoices/${invoiceId}/approve`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Failed to approve invoice");
      }

      setBarState("approved");
      // Brief success flash, then notify parent
      approvedTimer.current = setTimeout(() => {
        onStatusChange("approved");
      }, 500);
    } catch (err) {
      setBarState("idle");
      const message = err instanceof Error ? err.message : "Failed to approve invoice";
      setErrorMessage(message);
      errorTimer.current = setTimeout(() => {
        setErrorMessage(null);
      }, 5000);
    }
  }, [canApprove, invoiceId, onStatusChange]);

  // --- Sync handler (with confirm gate) ---
  const handleSync = useCallback(async () => {
    if (!canSync) return;

    if (barState === "idle" || barState === "failed") {
      setBarState("confirming");
      setErrorMessage(null);
      setWarning(null);
      // Revert to idle on timeout (matches original SyncBar behavior)
      confirmTimer.current = setTimeout(() => {
        setBarState("idle");
      }, 3000);
      return;
    }

    if (barState === "confirming") {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      setBarState("syncing");
      setErrorMessage(null);

      try {
        const endpoint = isRetry
          ? `/api/invoices/${invoiceId}/sync/retry`
          : `/api/invoices/${invoiceId}/sync`;

        const res = await fetch(endpoint, { method: "POST" });
        const body = await res.json();

        if (!res.ok) {
          throw new Error(body.error ?? "Failed to sync invoice");
        }

        setBarState("synced");

        if (body.data?.warning) {
          setWarning(body.data.warning);
        }

        onStatusChange("synced");
      } catch (err) {
        setBarState("failed");
        const message = err instanceof Error ? err.message : "Failed to sync invoice";
        setErrorMessage(message);
        errorTimer.current = setTimeout(() => {
          setErrorMessage(null);
        }, 10000);
      }
    }
  }, [barState, canSync, invoiceId, isRetry, onStatusChange]);

  // --- Render: pending_review phase (approve) ---
  if (currentStatus === "pending_review") {
    const buttonConfig: Record<
      "idle" | "approving" | "approved",
      { label: string; className: string; disabled: boolean }
    > = {
      idle: {
        label: "Approve Invoice",
        className: canApprove
          ? "bg-primary text-white hover:bg-primary-hover"
          : "bg-primary/50 text-white cursor-not-allowed",
        disabled: !canApprove,
      },
      approving: {
        label: "Approving...",
        className: "bg-primary/60 text-white cursor-not-allowed",
        disabled: true,
      },
      approved: {
        label: "Approved",
        className: "bg-accent text-white cursor-not-allowed",
        disabled: true,
      },
    };

    const approveState = barState as "idle" | "approving" | "approved";
    const btn = buttonConfig[approveState] ?? buttonConfig.idle;

    return (
      <div className="bg-white px-6 py-4 flex items-center justify-between gap-4">
        <div className="text-sm flex items-center gap-2 min-w-0">
          {barState === "approved" ? (
            <>
              <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
              <span className="text-accent">Invoice approved. Ready to sync.</span>
            </>
          ) : errorMessage ? (
            <>
              <span className="h-2 w-2 rounded-full bg-error shrink-0" />
              <span className="text-error truncate">{errorMessage}</span>
            </>
          ) : canApprove ? (
            <>
              <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
              <span className="text-accent">Ready to approve</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-warning shrink-0" />
              <span className="text-warning">Missing: {missingFields.join(", ")}</span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={handleApprove}
          disabled={btn.disabled}
          className={`${btn.className} px-6 py-2.5 rounded-md font-medium text-sm shrink-0 flex items-center gap-2 transition-colors`}
        >
          {barState === "approving" && <SpinnerIcon />}
          {barState === "approved" && <CheckIcon />}
          {btn.label}
        </button>
      </div>
    );
  }

  // --- Render: synced phase (read-only) ---
  if (currentStatus === "synced") {
    return (
      <div className="bg-white px-6 py-4 space-y-2">
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 text-accent shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span className="text-sm text-accent">This invoice has been synced to QuickBooks.</span>
        </div>
        {warning && <WarningBanner message={warning} />}
      </div>
    );
  }

  // --- Render: approved phase (sync) ---
  if (currentStatus !== "approved") return null;

  const syncButtonConfig: Record<
    "idle" | "confirming" | "syncing" | "synced" | "failed",
    { label: string; className: string; disabled: boolean }
  > = {
    idle: {
      label: isRetry ? "Retry Sync to QuickBooks" : "Sync to QuickBooks",
      className: syncBlockers.length > 0
        ? "bg-border text-muted cursor-not-allowed"
        : "bg-primary text-white hover:bg-primary-hover",
      disabled: syncBlockers.length > 0,
    },
    confirming: {
      label: isRetry ? "Confirm Retry" : "Confirm Sync",
      className: "bg-accent text-white hover:bg-green-700",
      disabled: false,
    },
    syncing: {
      label: "Syncing...",
      className: "bg-primary/60 text-white cursor-not-allowed",
      disabled: true,
    },
    synced: {
      label: "Synced",
      className: "bg-accent text-white cursor-not-allowed",
      disabled: true,
    },
    failed: {
      label: "Retry Sync",
      className: syncBlockers.length > 0
        ? "bg-border text-muted cursor-not-allowed"
        : "bg-error text-white hover:bg-red-700",
      disabled: syncBlockers.length > 0,
    },
  };

  const syncState = barState as "idle" | "confirming" | "syncing" | "synced" | "failed";
  const syncBtn = syncButtonConfig[syncState] ?? syncButtonConfig.idle;

  return (
    <div className="bg-white px-6 py-4 space-y-2">
      {syncBlockers.length > 0 && (
        <div className="flex items-start gap-2 bg-warning/5 border border-warning/20 rounded-md p-2.5">
          <svg className="h-4 w-4 text-warning shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div className="text-xs text-warning">
            <p className="font-medium mb-1">Before syncing:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {syncBlockers.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm flex items-center gap-2 min-w-0">
          {barState === "synced" ? (
            <>
              <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
              <span className="text-accent">Invoice synced to QuickBooks.</span>
            </>
          ) : errorMessage ? (
            <>
              <span className="h-2 w-2 rounded-full bg-error shrink-0" />
              <span className="text-error truncate">{errorMessage}</span>
            </>
          ) : barState === "confirming" ? (
            <>
              <span className="h-2 w-2 rounded-full bg-warning shrink-0 animate-pulse" />
              <span className="text-warning">Click again to confirm</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
              <span className="text-muted">
                {barState === "failed"
                  ? "Previous sync failed. Ready to retry."
                  : isRetry
                    ? "Previous sync failed. Ready to retry."
                    : "Ready to sync to QuickBooks."}
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncBtn.disabled}
          className={`${syncBtn.className} px-6 py-2.5 rounded-md font-medium text-sm shrink-0 flex items-center gap-2 transition-colors`}
        >
          {barState === "syncing" && <SpinnerIcon />}
          {barState === "synced" && <CheckIcon />}
          {syncBtn.label}
        </button>
      </div>
      {warning && <WarningBanner message={warning} />}
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

function WarningBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 bg-warning/5 border border-warning/20 rounded-md p-2.5">
      <svg className="h-4 w-4 text-warning shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      <p className="text-xs text-warning">{message}</p>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to `ActionBar.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/invoices/ActionBar.tsx
git commit -m "feat: add unified ActionBar component replacing ApproveBar + SyncBar"
```

---

### Task 2: Write ActionBar Tests

**Files:**
- Create: `components/invoices/ActionBar.test.tsx`

- [ ] **Step 1: Write the test file**

```tsx
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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
});

describe("ActionBar — approve phase (pending_review)", () => {
  const baseProps = {
    invoiceId: "inv-1",
    currentStatus: "pending_review" as const,
    vendorName: "Acme Corp",
    totalAmount: 110,
    vendorRef: null,
    syncBlockers: [],
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

    await act(async () => {
      fireEvent.click(screen.getByText("Approve Invoice"));
      // Wait for blur + 500ms delay
      await vi.advanceTimersByTimeAsync(500);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/invoices/inv-1/approve",
        { method: "POST" }
      );
    });

    // After 500ms approved flash, onStatusChange is called
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

    await act(async () => {
      fireEvent.click(screen.getByText("Approve Invoice"));
      await vi.advanceTimersByTimeAsync(500);
    });

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeTruthy();
    });

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
    vendorRef: "vendor-1",
    syncBlockers: [],
    onStatusChange: vi.fn(),
  };

  it("renders sync button when status is approved", () => {
    render(<ActionBar {...baseProps} />);
    expect(screen.getByText("Sync to QuickBooks")).toBeTruthy();
  });

  it("shows confirm gate on first click, fires on second", async () => {
    const onStatusChange = vi.fn();
    render(<ActionBar {...baseProps} onStatusChange={onStatusChange} />);

    // First click → confirming
    fireEvent.click(screen.getByText("Sync to QuickBooks"));
    expect(screen.getByText("Confirm Sync")).toBeTruthy();
    expect(screen.getByText("Click again to confirm")).toBeTruthy();

    // Second click → fires sync
    await act(async () => {
      fireEvent.click(screen.getByText("Confirm Sync"));
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/invoices/inv-1/sync",
        { method: "POST" }
      );
    });

    expect(onStatusChange).toHaveBeenCalledWith("synced");
  });

  it("confirm gate times out after 3s", async () => {
    render(<ActionBar {...baseProps} />);

    fireEvent.click(screen.getByText("Sync to QuickBooks"));
    expect(screen.getByText("Confirm Sync")).toBeTruthy();

    // Wait 3 seconds
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.getByText("Sync to QuickBooks")).toBeTruthy();
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

    fireEvent.click(screen.getByText("Retry Sync to QuickBooks"));
    expect(screen.getByText("Confirm Retry")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByText("Confirm Retry"));
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/invoices/inv-1/sync/retry",
        { method: "POST" }
      );
    });
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

    fireEvent.click(screen.getByText("Sync to QuickBooks"));
    await act(async () => {
      fireEvent.click(screen.getByText("Confirm Sync"));
    });

    await waitFor(() => {
      expect(screen.getByText("QBO error")).toBeTruthy();
      expect(screen.getByText("Retry Sync")).toBeTruthy();
    });
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

    fireEvent.click(screen.getByText("Sync to QuickBooks"));
    await act(async () => {
      fireEvent.click(screen.getByText("Confirm Sync"));
    });

    await waitFor(() => {
      expect(screen.getByText("PDF attachment failed")).toBeTruthy();
    });
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
        vendorRef="vendor-1"
        syncBlockers={[]}
        onStatusChange={vi.fn()}
      />
    );

    // Initially shows approve
    expect(screen.getByText("Approve Invoice")).toBeTruthy();

    // Parent updates currentStatus to approved (simulating what ExtractionForm does)
    rerender(
      <ActionBar
        invoiceId="inv-1"
        currentStatus="approved"
        vendorName="Acme Corp"
        totalAmount={110}
        vendorRef="vendor-1"
        syncBlockers={[]}
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
        vendorRef="vendor-1"
        syncBlockers={[]}
        onStatusChange={vi.fn()}
      />
    );
    expect(screen.getByText("This invoice has been synced to QuickBooks.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm run test -- components/invoices/ActionBar.test.tsx`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add components/invoices/ActionBar.test.tsx
git commit -m "test: add ActionBar component tests"
```

---

### Task 3: Update ExtractionForm to Use ActionBar

**Files:**
- Modify: `components/invoices/ExtractionForm.tsx`

- [ ] **Step 1: Update imports**

Replace the ApproveBar and SyncBar imports with ActionBar:

```tsx
// REMOVE these two lines:
import ApproveBar from "./ApproveBar";
import SyncBar from "./SyncBar";

// ADD this line:
import ActionBar from "./ActionBar";
```

- [ ] **Step 2: Replace handleSyncComplete with handleStatusChange**

Replace the `handleSyncComplete` callback (around line 97-100):

```tsx
// REMOVE:
const handleSyncComplete = useCallback(() => {
  setSyncKey((k) => k + 1);
  setCurrentStatus("synced");
}, []);

// ADD:
const handleStatusChange = useCallback((newStatus: InvoiceStatus) => {
  setCurrentStatus(newStatus);
  if (newStatus === "synced") {
    setSyncKey((k) => k + 1);
  }
}, []);
```

- [ ] **Step 3: Replace the two conditional render blocks**

**Intentional behavioral change:** The old code used `invoiceStatus` (the server prop) for the ApproveBar condition and `currentStatus` (client state) for the SyncBar condition. The new code uses `currentStatus` for the single ActionBar, which means the bar reacts to in-place status transitions (approve → sync) without needing a page reload. This is the core UX improvement.

Replace the ApproveBar block (around lines 457-467) and SyncBar block (around lines 469-481) with a single ActionBar:

```tsx
// REMOVE the entire ApproveBar block (lines 457-467) and SyncBar block (lines 469-481)

// ADD:
{(currentStatus === "pending_review" || currentStatus === "approved" || currentStatus === "synced") && (
  <>
    <div className="border-t border-border" />
    <ActionBar
      invoiceId={invoiceId}
      currentStatus={currentStatus}
      vendorName={state.values.vendor_name}
      totalAmount={state.values.total_amount}
      vendorRef={vendorRef}
      syncBlockers={syncBlockers}
      isRetry={!!initialErrorMessage?.startsWith("Sync failed")}
      onStatusChange={handleStatusChange}
    />
  </>
)}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add components/invoices/ExtractionForm.tsx
git commit -m "refactor: replace ApproveBar + SyncBar with unified ActionBar in ExtractionForm"
```

---

### Task 4: Update ExtractionForm Tests

**Files:**
- Modify: `components/invoices/ExtractionForm.test.tsx`

- [ ] **Step 1: Update the mock**

The test file mocks `ApproveBar`. Update it to mock `ActionBar` instead:

```tsx
// REMOVE:
vi.mock("./ApproveBar", () => ({
  default: () => <div data-testid="approve-bar" />,
}));

// ADD:
vi.mock("./ActionBar", () => ({
  default: () => <div data-testid="action-bar" />,
}));
```

Also update any test assertions that reference `approve-bar` testid to use `action-bar`.

- [ ] **Step 2: Run all ExtractionForm tests**

Run: `npm run test -- components/invoices/ExtractionForm.test.tsx`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add components/invoices/ExtractionForm.test.tsx
git commit -m "test: update ExtractionForm tests for ActionBar mock"
```

---

### Task 5: Delete Old Components

**Files:**
- Delete: `components/invoices/ApproveBar.tsx`
- Delete: `components/invoices/SyncBar.tsx`

- [ ] **Step 1: Verify no other files import ApproveBar or SyncBar**

Run: `grep -r "ApproveBar\|SyncBar" components/ app/ lib/ --include="*.tsx" --include="*.ts" -l`
Expected: Only the deleted files and possibly test files (which we already updated)

- [ ] **Step 2: Delete the files**

```bash
rm components/invoices/ApproveBar.tsx components/invoices/SyncBar.tsx
```

- [ ] **Step 3: Run full test suite and build**

Run: `npm run test && npm run build`
Expected: All tests pass, build succeeds

- [ ] **Step 4: Commit**

```bash
git add -u components/invoices/ApproveBar.tsx components/invoices/SyncBar.tsx
git commit -m "chore: delete ApproveBar and SyncBar (replaced by ActionBar)"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run the completion self-check**

```bash
npm run lint && npx tsc --noEmit && npm run test && npm run build
```

All four must pass clean.

- [ ] **Step 2: Verify no remaining references to old components**

Run: `grep -r "ApproveBar\|SyncBar" --include="*.tsx" --include="*.ts" components/ app/ lib/`
Expected: No matches
