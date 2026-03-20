# Realtime Invoice Status Tracking Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add realtime status updates during invoice processing so users see live progress through uploading → extracting → ready for review (or error), with animated step indicators and a reusable status badge component.

**Architecture:** A `useInvoiceStatus` hook subscribes to Supabase Realtime Postgres changes filtered to a single invoice row. The `ExtractionProgress` component renders an animated vertical stepper that reacts to status changes. The `InvoiceStatusBadge` component is a simple presentational pill badge for use in list views. The UploadZone is modified to pass the invoiceId up after upload so the parent page can render the tracker.

**Tech Stack:** Supabase Realtime (already in `@supabase/supabase-js`), React hooks, Tailwind CSS + CSS keyframes for animations.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `lib/hooks/useInvoiceStatus.ts` | Supabase Realtime subscription hook for a single invoice's status |
| `components/invoices/ExtractionProgress.tsx` | Animated vertical stepper showing upload → extract → ready |
| `components/invoices/InvoiceStatusBadge.tsx` | Presentational pill badge (modify existing stub) |
| `components/invoices/UploadZone.tsx` | Modify to emit `onUploadComplete(invoiceId)` callback |
| `app/(dashboard)/upload/page.tsx` | Orchestrate UploadZone + ExtractionProgress via invoiceId state |
| `lib/hooks/useInvoiceStatus.test.ts` | Tests for the realtime hook |
| `components/invoices/ExtractionProgress.test.tsx` | Tests for the progress tracker |
| `components/invoices/InvoiceStatusBadge.test.tsx` | Tests for the status badge |
| `components/invoices/UploadZone.test.tsx` | Update existing tests for new onUploadComplete prop |

---

## Chunk 1: Invoice Status Types & Realtime Hook

### Task 1: Define shared invoice status type

**Files:**
- Create: `lib/types/invoice.ts`

- [ ] **Step 1: Create the shared type file**

```typescript
// lib/types/invoice.ts
export type InvoiceStatus =
  | "uploading"
  | "extracting"
  | "pending_review"
  | "approved"
  | "synced"
  | "error";
```

- [ ] **Step 2: Commit**

```bash
git add lib/types/invoice.ts
git commit -m "feat: add shared InvoiceStatus type (DOC-17)"
```

---

### Task 2: Write failing tests for useInvoiceStatus hook

**Files:**
- Create: `lib/hooks/useInvoiceStatus.test.ts`

The hook's contract:
- `useInvoiceStatus(invoiceId: string | null)` returns `{ status, errorMessage, isConnected }`
- When `invoiceId` is null, returns `{ status: null, errorMessage: null, isConnected: false }`
- Creates a Supabase Realtime channel filtered to `invoices:id=eq.{invoiceId}`
- Fetches current status on mount (handles navigate-away-and-back)
- Updates local state when Realtime UPDATE events arrive
- Cleans up channel on unmount
- Tracks `isConnected` state

We need to mock the Supabase browser client. The hook calls `createClient()` from `@/lib/supabase/client`.

- [ ] **Step 1: Write the test file**

```typescript
// lib/hooks/useInvoiceStatus.test.ts
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useInvoiceStatus } from "./useInvoiceStatus";

// Mock the Supabase browser client
vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/client";

type ChannelCallback = (payload: {
  new: { status: string; error_message: string | null };
}) => void;

function buildMockSupabase(initialStatus = "extracting", errorMessage: string | null = null) {
  let channelCallback: ChannelCallback | null = null;
  const unsubscribe = vi.fn().mockResolvedValue("ok");
  const removeSub = vi.fn();

  const mockChannel = {
    on: vi.fn().mockImplementation((_event: string, _filter: unknown, cb: ChannelCallback) => {
      channelCallback = cb;
      return mockChannel;
    }),
    subscribe: vi.fn().mockImplementation((cb?: (status: string) => void) => {
      if (cb) cb("SUBSCRIBED");
      return mockChannel;
    }),
    unsubscribe,
  };

  const mockSupabase = {
    channel: vi.fn().mockReturnValue(mockChannel),
    removeChannel: removeSub,
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { status: initialStatus, error_message: errorMessage },
            error: null,
          }),
        }),
      }),
    }),
  };

  return {
    mockSupabase,
    mockChannel,
    getChannelCallback: () => channelCallback,
    unsubscribe,
    removeSub,
  };
}

describe("useInvoiceStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null status when invoiceId is null", () => {
    const { mockSupabase } = buildMockSupabase();
    (createClient as Mock).mockReturnValue(mockSupabase);

    const { result } = renderHook(() => useInvoiceStatus(null));

    expect(result.current.status).toBeNull();
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.isConnected).toBe(false);
    expect(mockSupabase.channel).not.toHaveBeenCalled();
  });

  it("fetches current status on mount", async () => {
    const { mockSupabase } = buildMockSupabase("pending_review");
    (createClient as Mock).mockReturnValue(mockSupabase);

    const { result } = renderHook(() => useInvoiceStatus("inv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("pending_review");
    });
  });

  it("subscribes to realtime channel on mount", async () => {
    const { mockSupabase, mockChannel } = buildMockSupabase();
    (createClient as Mock).mockReturnValue(mockSupabase);

    renderHook(() => useInvoiceStatus("inv-1"));

    await waitFor(() => {
      expect(mockSupabase.channel).toHaveBeenCalledWith("invoice-status-inv-1");
      expect(mockChannel.on).toHaveBeenCalledWith(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "invoices",
          filter: "id=eq.inv-1",
        },
        expect.any(Function)
      );
      expect(mockChannel.subscribe).toHaveBeenCalled();
    });
  });

  it("updates status when realtime event arrives", async () => {
    const { mockSupabase, getChannelCallback } = buildMockSupabase("extracting");
    (createClient as Mock).mockReturnValue(mockSupabase);

    const { result } = renderHook(() => useInvoiceStatus("inv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("extracting");
    });

    // Simulate realtime update
    act(() => {
      const cb = getChannelCallback();
      cb?.({ new: { status: "pending_review", error_message: null } });
    });

    expect(result.current.status).toBe("pending_review");
    expect(result.current.errorMessage).toBeNull();
  });

  it("sets errorMessage when status is error", async () => {
    const { mockSupabase, getChannelCallback } = buildMockSupabase("extracting");
    (createClient as Mock).mockReturnValue(mockSupabase);

    const { result } = renderHook(() => useInvoiceStatus("inv-1"));

    await waitFor(() => {
      expect(result.current.status).toBe("extracting");
    });

    act(() => {
      const cb = getChannelCallback();
      cb?.({ new: { status: "error", error_message: "Extraction timed out" } });
    });

    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("Extraction timed out");
  });

  it("sets isConnected to true after subscription", async () => {
    const { mockSupabase } = buildMockSupabase();
    (createClient as Mock).mockReturnValue(mockSupabase);

    const { result } = renderHook(() => useInvoiceStatus("inv-1"));

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
  });

  it("cleans up channel on unmount", async () => {
    const { mockSupabase, removeSub } = buildMockSupabase();
    (createClient as Mock).mockReturnValue(mockSupabase);

    const { result, unmount } = renderHook(() => useInvoiceStatus("inv-1"));

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    unmount();

    expect(removeSub).toHaveBeenCalled();
  });

  it("handles initial fetch failure gracefully", async () => {
    const { mockSupabase } = buildMockSupabase();
    // Override to simulate fetch error
    mockSupabase.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Not found" },
          }),
        }),
      }),
    });
    (createClient as Mock).mockReturnValue(mockSupabase);

    const { result } = renderHook(() => useInvoiceStatus("inv-1"));

    // Should still subscribe to realtime even if initial fetch fails
    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    // Status stays null when fetch fails
    expect(result.current.status).toBeNull();
  });

  it("resubscribes when invoiceId changes", async () => {
    const { mockSupabase, removeSub } = buildMockSupabase();
    (createClient as Mock).mockReturnValue(mockSupabase);

    const { rerender } = renderHook(
      ({ id }) => useInvoiceStatus(id),
      { initialProps: { id: "inv-1" as string | null } }
    );

    await waitFor(() => {
      expect(mockSupabase.channel).toHaveBeenCalledWith("invoice-status-inv-1");
    });

    rerender({ id: "inv-2" });

    await waitFor(() => {
      expect(removeSub).toHaveBeenCalled();
      expect(mockSupabase.channel).toHaveBeenCalledWith("invoice-status-inv-2");
    });
  });

  it("cleans up and does nothing when invoiceId changes to null", async () => {
    const { mockSupabase, removeSub } = buildMockSupabase();
    (createClient as Mock).mockReturnValue(mockSupabase);

    const { result, rerender } = renderHook(
      ({ id }) => useInvoiceStatus(id),
      { initialProps: { id: "inv-1" as string | null } }
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    rerender({ id: null });

    expect(removeSub).toHaveBeenCalled();
    expect(result.current.status).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/hooks/useInvoiceStatus.test.ts`
Expected: FAIL — module `./useInvoiceStatus` not found

- [ ] **Step 3: Commit failing tests**

```bash
git add lib/hooks/useInvoiceStatus.test.ts
git commit -m "test: add failing tests for useInvoiceStatus hook (DOC-17)"
```

---

### Task 3: Implement useInvoiceStatus hook

**Files:**
- Create: `lib/hooks/useInvoiceStatus.ts`

- [ ] **Step 1: Write the hook implementation**

```typescript
// lib/hooks/useInvoiceStatus.ts
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { InvoiceStatus } from "@/lib/types/invoice";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UseInvoiceStatusReturn {
  status: InvoiceStatus | null;
  errorMessage: string | null;
  isConnected: boolean;
}

export function useInvoiceStatus(
  invoiceId: string | null
): UseInvoiceStatusReturn {
  const [status, setStatus] = useState<InvoiceStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const cleanup = useCallback((supabase: ReturnType<typeof createClient>) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (!invoiceId) {
      setStatus(null);
      setErrorMessage(null);
      setIsConnected(false);
      return;
    }

    const supabase = createClient();

    // 1. Fetch current status (handles navigate-away-and-back)
    supabase
      .from("invoices")
      .select("status, error_message")
      .eq("id", invoiceId)
      .single()
      .then(({ data }) => {
        if (data) {
          setStatus(data.status as InvoiceStatus);
          setErrorMessage(data.error_message);
        }
      });

    // 2. Subscribe to realtime changes
    const channel = supabase
      .channel(`invoice-status-${invoiceId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "invoices",
          filter: `id=eq.${invoiceId}`,
        },
        (payload) => {
          const newRow = payload.new as {
            status: InvoiceStatus;
            error_message: string | null;
          };
          setStatus(newRow.status);
          setErrorMessage(newRow.error_message);
        }
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === "SUBSCRIBED") {
          setIsConnected(true);
        }
      });

    channelRef.current = channel;

    return () => {
      cleanup(supabase);
    };
  }, [invoiceId, cleanup]);

  return { status, errorMessage, isConnected };
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run lib/hooks/useInvoiceStatus.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Fix any failing tests, iterate until green**

- [ ] **Step 4: Commit**

```bash
git add lib/hooks/useInvoiceStatus.ts
git commit -m "feat: implement useInvoiceStatus realtime hook (DOC-17)"
```

---

## Chunk 2: InvoiceStatusBadge Component

### Task 4: Write failing tests for InvoiceStatusBadge

**Files:**
- Create: `components/invoices/InvoiceStatusBadge.test.tsx`

- [ ] **Step 1: Write the test file**

```typescript
// components/invoices/InvoiceStatusBadge.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import InvoiceStatusBadge from "./InvoiceStatusBadge";

describe("InvoiceStatusBadge", () => {
  it('renders "Uploading" for uploading status', () => {
    render(<InvoiceStatusBadge status="uploading" />);
    expect(screen.getByText("Uploading")).toBeInTheDocument();
  });

  it('renders "Extracting" for extracting status with pulsing dot', () => {
    render(<InvoiceStatusBadge status="extracting" />);
    expect(screen.getByText("Extracting")).toBeInTheDocument();
    // Pulsing dot: the animate-ping span
    const badge = screen.getByText("Extracting").closest("span");
    expect(badge).toBeInTheDocument();
    const pulsingDot = badge?.querySelector(".animate-ping");
    expect(pulsingDot).toBeInTheDocument();
  });

  it('renders "Pending Review" for pending_review status', () => {
    render(<InvoiceStatusBadge status="pending_review" />);
    expect(screen.getByText("Pending Review")).toBeInTheDocument();
  });

  it('renders "Approved" for approved status', () => {
    render(<InvoiceStatusBadge status="approved" />);
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it('renders "Synced" for synced status', () => {
    render(<InvoiceStatusBadge status="synced" />);
    expect(screen.getByText("Synced")).toBeInTheDocument();
  });

  it('renders "Error" for error status', () => {
    render(<InvoiceStatusBadge status="error" />);
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("applies correct color classes per status", () => {
    const { rerender } = render(<InvoiceStatusBadge status="synced" />);
    // Synced = green
    let badge = screen.getByText("Synced").closest("span");
    expect(badge?.className).toMatch(/bg-green/);

    // Error = red
    rerender(<InvoiceStatusBadge status="error" />);
    badge = screen.getByText("Error").closest("span");
    expect(badge?.className).toMatch(/bg-red/);

    // Pending Review = amber
    rerender(<InvoiceStatusBadge status="pending_review" />);
    badge = screen.getByText("Pending Review").closest("span");
    expect(badge?.className).toMatch(/bg-amber/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/invoices/InvoiceStatusBadge.test.tsx`
Expected: FAIL — InvoiceStatusBadge doesn't accept `status` prop

- [ ] **Step 3: Commit failing tests**

```bash
git add components/invoices/InvoiceStatusBadge.test.tsx
git commit -m "test: add failing tests for InvoiceStatusBadge (DOC-17)"
```

---

### Task 5: Implement InvoiceStatusBadge

**Files:**
- Modify: `components/invoices/InvoiceStatusBadge.tsx` (replace stub)

- [ ] **Step 1: Replace the stub with full implementation**

```typescript
// components/invoices/InvoiceStatusBadge.tsx
import type { InvoiceStatus } from "@/lib/types/invoice";

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
}

const STATUS_CONFIG: Record<
  InvoiceStatus,
  { label: string; dotClass: string; bgClass: string; textClass: string; pulse: boolean }
> = {
  uploading: {
    label: "Uploading",
    dotClass: "bg-blue-500",
    bgClass: "bg-blue-50",
    textClass: "text-blue-700",
    pulse: false,
  },
  extracting: {
    label: "Extracting",
    dotClass: "bg-blue-500",
    bgClass: "bg-blue-50",
    textClass: "text-blue-700",
    pulse: true,
  },
  pending_review: {
    label: "Pending Review",
    dotClass: "bg-amber-500",
    bgClass: "bg-amber-50",
    textClass: "text-amber-700",
    pulse: false,
  },
  approved: {
    label: "Approved",
    dotClass: "bg-blue-500",
    bgClass: "bg-blue-50",
    textClass: "text-blue-700",
    pulse: false,
  },
  synced: {
    label: "Synced",
    dotClass: "bg-green-500",
    bgClass: "bg-green-50",
    textClass: "text-green-700",
    pulse: false,
  },
  error: {
    label: "Error",
    dotClass: "bg-red-500",
    bgClass: "bg-red-50",
    textClass: "text-red-700",
    pulse: false,
  },
};

export default function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bgClass} ${config.textClass}`}
    >
      <span className="relative flex h-2 w-2">
        {config.pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${config.dotClass}`}
          />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${config.dotClass}`}
        />
      </span>
      {config.label}
    </span>
  );
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run components/invoices/InvoiceStatusBadge.test.tsx`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add components/invoices/InvoiceStatusBadge.tsx
git commit -m "feat: implement InvoiceStatusBadge component (DOC-17)"
```

---

## Chunk 3: ExtractionProgress Animated Tracker

### Task 6: Write failing tests for ExtractionProgress

**Files:**
- Create: `components/invoices/ExtractionProgress.test.tsx`

The component's contract:
- `ExtractionProgress({ invoiceId, status, errorMessage, onRetry, onUploadAnother })`
- Renders 3 steps: "Uploaded", "Extracting data", "Ready for review"
- Steps have states: complete (checkmark), active (pulsing), pending (gray), error (red)
- When status is `pending_review` or later, shows "Review Invoice" link to `/invoices/{invoiceId}/review`
- When status is `error`, shows error message + "Retry" button
- "Upload another" link always visible

- [ ] **Step 1: Write the test file**

```typescript
// components/invoices/ExtractionProgress.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ExtractionProgress from "./ExtractionProgress";

// Mock next/link to render as a simple anchor
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("ExtractionProgress", () => {
  const defaultProps = {
    invoiceId: "inv-1",
    status: "extracting" as const,
    errorMessage: null,
    onRetry: vi.fn(),
    onUploadAnother: vi.fn(),
  };

  describe("Step rendering", () => {
    it("shows all three step labels", () => {
      render(<ExtractionProgress {...defaultProps} />);
      expect(screen.getByText("Uploaded")).toBeInTheDocument();
      expect(screen.getByText("Extracting data")).toBeInTheDocument();
      expect(screen.getByText("Ready for review")).toBeInTheDocument();
    });

    it("marks Uploaded as complete when extracting", () => {
      render(<ExtractionProgress {...defaultProps} status="extracting" />);
      // The Uploaded step should have a checkmark (svg with check path)
      const uploadedStep = screen.getByText("Uploaded").closest("[data-step]");
      expect(uploadedStep?.getAttribute("data-state")).toBe("complete");
    });

    it("marks Extracting as active when extracting", () => {
      render(<ExtractionProgress {...defaultProps} status="extracting" />);
      const extractStep = screen.getByText("Extracting data").closest("[data-step]");
      expect(extractStep?.getAttribute("data-state")).toBe("active");
    });

    it("marks Ready for review as pending when extracting", () => {
      render(<ExtractionProgress {...defaultProps} status="extracting" />);
      const reviewStep = screen.getByText("Ready for review").closest("[data-step]");
      expect(reviewStep?.getAttribute("data-state")).toBe("pending");
    });
  });

  describe("Completion state (pending_review)", () => {
    it("marks all steps as complete", () => {
      render(<ExtractionProgress {...defaultProps} status="pending_review" />);
      const steps = screen.getAllByTestId("step-icon");
      // All 3 should be complete
      steps.forEach((step) => {
        expect(step.closest("[data-step]")?.getAttribute("data-state")).toBe("complete");
      });
    });

    it("shows Review Invoice link", () => {
      render(<ExtractionProgress {...defaultProps} status="pending_review" />);
      const link = screen.getByRole("link", { name: /review invoice/i });
      expect(link).toHaveAttribute("href", "/invoices/inv-1/review");
    });
  });

  describe("Error state", () => {
    it("shows error message", () => {
      render(
        <ExtractionProgress
          {...defaultProps}
          status="error"
          errorMessage="Extraction timed out"
        />
      );
      expect(screen.getByText("Extraction timed out")).toBeInTheDocument();
    });

    it("shows Retry button", () => {
      render(
        <ExtractionProgress
          {...defaultProps}
          status="error"
          errorMessage="Extraction timed out"
        />
      );
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });

    it("calls onRetry when Retry is clicked", () => {
      const onRetry = vi.fn();
      render(
        <ExtractionProgress
          {...defaultProps}
          status="error"
          errorMessage="Extraction timed out"
          onRetry={onRetry}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: /retry/i }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("marks extracting step as error state", () => {
      render(
        <ExtractionProgress
          {...defaultProps}
          status="error"
          errorMessage="Failed"
        />
      );
      const extractStep = screen.getByText("Extracting data").closest("[data-step]");
      expect(extractStep?.getAttribute("data-state")).toBe("error");
    });
  });

  describe("Upload another", () => {
    it("shows Upload Another button", () => {
      render(<ExtractionProgress {...defaultProps} />);
      expect(screen.getByRole("button", { name: /upload another/i })).toBeInTheDocument();
    });

    it("calls onUploadAnother when clicked", () => {
      const onUploadAnother = vi.fn();
      render(<ExtractionProgress {...defaultProps} onUploadAnother={onUploadAnother} />);
      fireEvent.click(screen.getByRole("button", { name: /upload another/i }));
      expect(onUploadAnother).toHaveBeenCalledTimes(1);
    });
  });

  describe("Accessibility", () => {
    it("has aria-live region for status announcements", () => {
      render(<ExtractionProgress {...defaultProps} />);
      const liveRegion = document.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/invoices/ExtractionProgress.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Commit failing tests**

```bash
git add components/invoices/ExtractionProgress.test.tsx
git commit -m "test: add failing tests for ExtractionProgress tracker (DOC-17)"
```

---

### Task 7: Implement ExtractionProgress component

**Files:**
- Create: `components/invoices/ExtractionProgress.tsx`

- [ ] **Step 1: Write the component**

```typescript
// components/invoices/ExtractionProgress.tsx
"use client";

import Link from "next/link";
import type { InvoiceStatus } from "@/lib/types/invoice";

type StepState = "complete" | "active" | "pending" | "error";

interface Step {
  label: string;
  state: StepState;
}

interface ExtractionProgressProps {
  invoiceId: string;
  status: InvoiceStatus | null;
  errorMessage: string | null;
  retryError?: string | null;
  onRetry: () => void;
  onUploadAnother: () => void;
}

function getSteps(status: InvoiceStatus | null): Step[] {
  switch (status) {
    case "uploading":
      return [
        { label: "Uploaded", state: "active" },
        { label: "Extracting data", state: "pending" },
        { label: "Ready for review", state: "pending" },
      ];
    case "extracting":
      return [
        { label: "Uploaded", state: "complete" },
        { label: "Extracting data", state: "active" },
        { label: "Ready for review", state: "pending" },
      ];
    case "pending_review":
    case "approved":
    case "synced":
      return [
        { label: "Uploaded", state: "complete" },
        { label: "Extracting data", state: "complete" },
        { label: "Ready for review", state: "complete" },
      ];
    case "error":
      return [
        { label: "Uploaded", state: "complete" },
        { label: "Extracting data", state: "error" },
        { label: "Ready for review", state: "pending" },
      ];
    default:
      return [
        { label: "Uploaded", state: "pending" },
        { label: "Extracting data", state: "pending" },
        { label: "Ready for review", state: "pending" },
      ];
  }
}

function getStatusAnnouncement(status: InvoiceStatus | null): string {
  switch (status) {
    case "uploading":
      return "Upload in progress";
    case "extracting":
      return "Extracting invoice data";
    case "pending_review":
      return "Extraction complete. Ready for review.";
    case "error":
      return "Extraction failed";
    default:
      return "";
  }
}

function StepIcon({ state }: { state: StepState }) {
  switch (state) {
    case "complete":
      return (
        <div
          data-testid="step-icon"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 transition-colors duration-300"
        >
          <svg
            className="h-4 w-4 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    case "active":
      return (
        <div
          data-testid="step-icon"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 transition-colors duration-300"
        >
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500" />
          </span>
        </div>
      );
    case "error":
      return (
        <div
          data-testid="step-icon"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 transition-colors duration-300"
        >
          <svg
            className="h-4 w-4 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      );
    case "pending":
    default:
      return (
        <div
          data-testid="step-icon"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 transition-colors duration-300"
        >
          <span className="h-2 w-2 rounded-full bg-gray-300" />
        </div>
      );
  }
}

function StepConnector({ fromState, toState }: { fromState: StepState; toState: StepState }) {
  const filled = fromState === "complete" && toState !== "pending";
  return (
    <div className="ml-[13px] h-6 w-px">
      <div
        className={`h-full w-full transition-colors duration-500 ${
          filled ? "bg-green-300" : "bg-gray-200"
        }`}
      />
    </div>
  );
}

export default function ExtractionProgress({
  invoiceId,
  status,
  errorMessage,
  retryError,
  onRetry,
  onUploadAnother,
}: ExtractionProgressProps) {
  const steps = getSteps(status);
  const isComplete = status === "pending_review" || status === "approved" || status === "synced";
  const isError = status === "error";

  return (
    <div className="flex flex-col items-center">
      {/* Stepper */}
      <div className="w-full max-w-xs">
        {steps.map((step, index) => (
          <div key={step.label}>
            <div data-step data-state={step.state} className="flex items-center gap-3">
              <StepIcon state={step.state} />
              <span
                className={`text-sm font-medium transition-colors duration-300 ${
                  step.state === "complete"
                    ? "text-green-700"
                    : step.state === "active"
                    ? "text-blue-700"
                    : step.state === "error"
                    ? "text-red-700"
                    : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <StepConnector fromState={step.state} toState={steps[index + 1].state} />
            )}
          </div>
        ))}
      </div>

      {/* Error message + retry */}
      {isError && errorMessage && (
        <div className="mt-4 w-full max-w-xs">
          <p className="text-sm text-red-600">{errorMessage}</p>
          {retryError && (
            <p className="mt-1 text-sm text-red-600">{retryError}</p>
          )}
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Review Invoice link */}
      {isComplete && (
        <div className="mt-4 animate-fade-in">
          <Link
            href={`/invoices/${invoiceId}/review`}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Review Invoice
          </Link>
        </div>
      )}

      {/* Upload Another */}
      <button
        type="button"
        onClick={onUploadAnother}
        className="mt-3 text-sm font-medium text-gray-500 hover:text-gray-700"
      >
        Upload another
      </button>

      {/* Accessibility */}
      <div aria-live="polite" className="sr-only">
        {getStatusAnnouncement(status)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the `animate-fade-in` keyframe to Tailwind config**

In `tailwind.config.ts`, add to `theme.extend`:

```typescript
// Add inside theme.extend, alongside colors:
keyframes: {
  "fade-in": {
    "0%": { opacity: "0", transform: "translateY(4px)" },
    "100%": { opacity: "1", transform: "translateY(0)" },
  },
},
animation: {
  "fade-in": "fade-in 0.3s ease-out",
},
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run components/invoices/ExtractionProgress.test.tsx`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add components/invoices/ExtractionProgress.tsx tailwind.config.ts
git commit -m "feat: implement ExtractionProgress animated tracker (DOC-17)"
```

---

## Chunk 4: Wire Into Upload Flow

### Task 8: Modify UploadZone to emit invoiceId on success

**Files:**
- Modify: `components/invoices/UploadZone.tsx`
- Modify: `components/invoices/UploadZone.test.tsx`

The UploadZone currently manages the full post-upload UI (success state with "Processing..." indicator). We need to:
1. Add an `onUploadComplete(invoiceId: string)` optional prop
2. When upload succeeds, call `onUploadComplete` with the invoiceId from the API response
3. The success state rendering stays for backward compatibility, but the parent can now take over

- [ ] **Step 1: Update the test file — add tests for onUploadComplete callback**

Add to the existing `UploadZone.test.tsx` file, inside the `"Upload lifecycle"` describe block:

```typescript
// Add this test to the "Upload lifecycle" describe block:
it("calls onUploadComplete with invoiceId after successful upload", async () => {
  const onUploadComplete = vi.fn();
  render(<UploadZone onUploadComplete={onUploadComplete} />);
  const file = createFile("invoice.pdf", 1024, "application/pdf");
  selectFiles(getInput(), [file]);

  await waitFor(() => {
    expect(onUploadComplete).toHaveBeenCalledWith("inv-1");
  });
});

it("does not call onUploadComplete on API failure", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    json: async () => ({ error: "Upload failed", code: "INTERNAL_ERROR" }),
  });
  const onUploadComplete = vi.fn();
  render(<UploadZone onUploadComplete={onUploadComplete} />);
  const file = createFile("invoice.pdf", 1024, "application/pdf");
  selectFiles(getInput(), [file]);

  await waitFor(() => {
    expect(screen.getByText("Upload failed")).toBeInTheDocument();
  });
  expect(onUploadComplete).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run components/invoices/UploadZone.test.tsx`
Expected: New tests FAIL (onUploadComplete not called)

- [ ] **Step 3: Modify UploadZone to accept and call onUploadComplete**

In `components/invoices/UploadZone.tsx`:

1. Add props interface:
```typescript
interface UploadZoneProps {
  onUploadComplete?: (invoiceId: string) => void;
}

export default function UploadZone({ onUploadComplete }: UploadZoneProps) {
```

2. In the `uploadFile` callback, after `setState("success")`:
```typescript
        setProgress(100);
        setState("success");
        setStatusAnnouncement("Upload complete");

        // Notify parent with invoiceId for realtime tracking
        if (onUploadComplete && body.data?.invoiceId) {
          onUploadComplete(body.data.invoiceId);
        }
```

- [ ] **Step 4: Run ALL UploadZone tests to verify nothing broke**

Run: `npx vitest run components/invoices/UploadZone.test.tsx`
Expected: All tests PASS (existing + new)

- [ ] **Step 5: Commit**

```bash
git add components/invoices/UploadZone.tsx components/invoices/UploadZone.test.tsx
git commit -m "feat: add onUploadComplete callback to UploadZone (DOC-17)"
```

---

### Task 9: Wire up the upload page to show ExtractionProgress

**Files:**
- Modify: `app/(dashboard)/upload/page.tsx`

The upload page currently just renders `<UploadZone />`. After DOC-17:
1. It becomes a client component (needs `useState` for invoiceId)
2. When `onUploadComplete` fires, it stores the invoiceId and renders `ExtractionProgress` below the UploadZone
3. `useInvoiceStatus` subscribes to that invoiceId
4. On "Upload Another", clears the invoiceId state (which cleans up the realtime subscription)
5. On "Retry", calls `POST /api/invoices/[id]/retry`

- [ ] **Step 1: Rewrite the upload page**

```typescript
// app/(dashboard)/upload/page.tsx
"use client";

import { useState, useCallback } from "react";
import UploadZone from "@/components/invoices/UploadZone";
import ExtractionProgress from "@/components/invoices/ExtractionProgress";
import { useInvoiceStatus } from "@/lib/hooks/useInvoiceStatus";

export default function UploadPage() {
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const { status, errorMessage } = useInvoiceStatus(invoiceId);

  const handleUploadComplete = useCallback((id: string) => {
    setInvoiceId(id);
  }, []);

  const handleUploadAnother = useCallback(() => {
    setInvoiceId(null);
    setRetryError(null);
  }, []);

  const handleRetry = useCallback(async () => {
    if (!invoiceId) return;
    setRetryError(null);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/retry`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json();
        setRetryError(body.error || "Retry failed. Please try again.");
      }
    } catch {
      setRetryError("Retry failed. Please check your connection.");
    }
  }, [invoiceId]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-lg font-semibold text-primary">Upload Invoice</h1>
      <div className="mt-6">
        {!invoiceId ? (
          <UploadZone onUploadComplete={handleUploadComplete} />
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-8">
            <ExtractionProgress
              invoiceId={invoiceId}
              status={status}
              errorMessage={errorMessage}
              retryError={retryError}
              onRetry={handleRetry}
              onUploadAnother={handleUploadAnother}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the full test suite to verify nothing broke**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Run lint, typecheck, build**

```bash
npm run lint && npx tsc --noEmit && npm run build
```
Expected: All pass clean

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/upload/page.tsx"
git commit -m "feat: wire realtime status tracking into upload page (DOC-17)"
```

---

## Chunk 5: Supabase Realtime Configuration

### Task 10: Enable Supabase Realtime on the invoices table

**Files:**
- Create: `supabase/migrations/20260316000000_enable_realtime_invoices.sql`

Supabase Realtime requires the table to be added to the `supabase_realtime` publication. By default, new tables are NOT in it.

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260316000000_enable_realtime_invoices.sql
-- Enable Supabase Realtime on the invoices table
-- Required for DOC-17: realtime status updates during extraction

ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
```

- [ ] **Step 2: Apply migration to the dev Supabase project**

Use the Supabase MCP tool `apply_migration` or run via Supabase CLI:
```bash
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260316000000_enable_realtime_invoices.sql
git commit -m "chore: enable Supabase Realtime on invoices table (DOC-17)"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run the full test suite**

```bash
npm run test
```
Expected: All tests PASS

- [ ] **Step 2: Run lint + typecheck + build**

```bash
npm run lint && npx tsc --noEmit && npm run build
```
Expected: All pass clean

- [ ] **Step 3: Verify no `console.log` in new code**

```bash
grep -rn "console.log" lib/hooks/useInvoiceStatus.ts components/invoices/ExtractionProgress.tsx components/invoices/InvoiceStatusBadge.tsx
```
Expected: No matches

- [ ] **Step 4: Verify no `any` types in new code**

```bash
grep -rn ": any" lib/hooks/useInvoiceStatus.ts components/invoices/ExtractionProgress.tsx components/invoices/InvoiceStatusBadge.tsx lib/types/invoice.ts
```
Expected: No matches

- [ ] **Step 5: Push branch and create PR**

```bash
git push -u origin feature/DOC-17-realtime-status-tracking
gh pr create --title "DOC-17: Build invoice status tracking with realtime updates" --body "$(cat <<'EOF'
## Summary
- Add `useInvoiceStatus` hook that subscribes to Supabase Realtime for live invoice status updates
- Add `ExtractionProgress` animated stepper component showing upload → extract → ready for review
- Implement `InvoiceStatusBadge` pill badge for invoice list views
- Wire into upload page: after upload, UploadZone swaps for the progress tracker
- Enable Supabase Realtime on invoices table via migration

## Test plan
- [ ] Unit tests pass for useInvoiceStatus hook (subscribe, update, cleanup, resubscribe)
- [ ] Unit tests pass for ExtractionProgress (all status states, error, retry, upload another)
- [ ] Unit tests pass for InvoiceStatusBadge (all 6 statuses, correct colors)
- [ ] Existing UploadZone tests still pass with new onUploadComplete prop
- [ ] Manual QA: upload a PDF, watch stepper animate through stages in realtime
- [ ] Manual QA: navigate away during extraction, come back — shows correct current status
- [ ] Manual QA: trigger an extraction error — see red error state with retry button

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Deliver status report**
