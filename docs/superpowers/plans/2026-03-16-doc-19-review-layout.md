# DOC-19: Side-by-Side Review Layout — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the review page layout container at `/invoices/[id]/review` with a two-panel side-by-side shell (PDF left, form right), mobile tab toggle, page header, and data loading from Supabase.

**Architecture:** Server component fetches invoice + extracted data + signed URL, then passes everything to a `ReviewLayout` client component. The client handles the two-panel desktop layout and mobile tab switching. Processing states (uploading/extracting/error) are handled by a `ReviewProcessingState` wrapper around the existing `ExtractionProgress` component.

**Tech Stack:** Next.js 14 App Router (server components), Supabase (data + storage), Tailwind CSS, Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-03-16-doc-19-review-layout-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `components/invoices/ReviewLayout.tsx` | Create | Client component: page header, two-panel desktop, mobile tabs |
| `components/invoices/ReviewLayout.test.tsx` | Create | Tests for ReviewLayout |
| `components/invoices/ReviewProcessingState.tsx` | Create | Client component: wraps ExtractionProgress for review page context |
| `components/invoices/ReviewProcessingState.test.tsx` | Create | Tests for ReviewProcessingState |
| `components/invoices/PdfViewer.tsx` | Modify | Update stub to accept props, render placeholder |
| `components/invoices/ExtractionForm.tsx` | Modify | Update stub to accept props, render placeholder |
| `app/(dashboard)/invoices/[id]/review/page.tsx` | Rewrite | Server component: data fetching, guards, orchestration |

---

## Chunk 1: Placeholder Stubs + ReviewProcessingState

### Task 1: Update PdfViewer and ExtractionForm stubs

**Files:**
- Modify: `components/invoices/PdfViewer.tsx`
- Modify: `components/invoices/ExtractionForm.tsx`

- [ ] **Step 1: Update PdfViewer stub to accept props**

```tsx
// components/invoices/PdfViewer.tsx
interface PdfViewerProps {
  signedUrl: string;
  fileType: string;
}

export default function PdfViewer({ signedUrl, fileType }: PdfViewerProps) {
  return (
    <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-400">
      <div className="text-center">
        <p className="text-2xl mb-2">📄</p>
        <p>PDF Viewer — DOC-20</p>
        <p className="text-xs mt-1 font-mono truncate max-w-xs">{fileType}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update ExtractionForm stub to accept props**

```tsx
// components/invoices/ExtractionForm.tsx
interface ExtractionFormProps {
  extractedData: {
    id: string;
    confidence_score: "high" | "medium" | "low";
    [key: string]: unknown;
    extracted_line_items: Array<{
      id: string;
      [key: string]: unknown;
    }>;
  };
}

export default function ExtractionForm({ extractedData }: ExtractionFormProps) {
  return (
    <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-400">
      <div className="text-center">
        <p className="text-2xl mb-2">📝</p>
        <p>Extraction Form — DOC-21</p>
        <p className="text-xs mt-1">
          {extractedData.extracted_line_items.length} line items
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify no type errors**

Run: `npx tsc --noEmit`
Expected: PASS (stubs accept props but aren't consumed yet)

- [ ] **Step 4: Commit**

```bash
git add components/invoices/PdfViewer.tsx components/invoices/ExtractionForm.tsx
git commit -m "feat: update PdfViewer and ExtractionForm stubs with typed props (DOC-19)"
```

---

### Task 2: Build ReviewProcessingState

**Files:**
- Create: `components/invoices/ReviewProcessingState.tsx`
- Create: `components/invoices/ReviewProcessingState.test.tsx`

**Context:** This component wraps `ExtractionProgress` for use on the review page. It provides the retry/upload-another callbacks and subscribes to realtime status updates. When extraction completes, it refreshes the page to load extracted data server-side. Reference the upload page (`app/(dashboard)/upload/page.tsx`) for the retry callback pattern and `useInvoiceStatus` hook usage.

- [ ] **Step 1: Write failing tests for ReviewProcessingState**

```tsx
// components/invoices/ReviewProcessingState.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ReviewProcessingState from "./ReviewProcessingState";

// Mock next/navigation
const mockRefresh = vi.fn();
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}));

// Mock useInvoiceStatus
const mockUseInvoiceStatus = vi.fn();
vi.mock("@/lib/hooks/useInvoiceStatus", () => ({
  useInvoiceStatus: (...args: unknown[]) => mockUseInvoiceStatus(...args),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock fetch for retry
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("ReviewProcessingState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseInvoiceStatus.mockReturnValue({
      status: "extracting",
      errorMessage: null,
      isConnected: true,
    });
  });

  it("renders ExtractionProgress with current status", () => {
    render(<ReviewProcessingState invoiceId="inv-1" initialStatus="extracting" />);
    expect(screen.getByText("Extracting data")).toBeDefined();
  });

  it("subscribes to realtime status via useInvoiceStatus", () => {
    render(<ReviewProcessingState invoiceId="inv-1" initialStatus="extracting" />);
    expect(mockUseInvoiceStatus).toHaveBeenCalledWith("inv-1");
  });

  it("calls retry endpoint on retry click", async () => {
    mockUseInvoiceStatus.mockReturnValue({
      status: "error",
      errorMessage: "Extraction failed",
      isConnected: true,
    });
    mockFetch.mockResolvedValue({ ok: true });

    render(<ReviewProcessingState invoiceId="inv-1" initialStatus="error" />);
    fireEvent.click(screen.getByText("Retry"));

    expect(mockFetch).toHaveBeenCalledWith("/api/invoices/inv-1/retry", { method: "POST" });
  });

  it("navigates to upload on 'Upload another' click", () => {
    render(<ReviewProcessingState invoiceId="inv-1" initialStatus="extracting" />);
    fireEvent.click(screen.getByText("Upload another"));
    expect(mockPush).toHaveBeenCalledWith("/upload");
  });

  it("refreshes page when status transitions to pending_review", () => {
    mockUseInvoiceStatus.mockReturnValue({
      status: "pending_review",
      errorMessage: null,
      isConnected: true,
    });
    render(<ReviewProcessingState invoiceId="inv-1" initialStatus="extracting" />);
    expect(mockRefresh).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/invoices/ReviewProcessingState.test.tsx`
Expected: FAIL (component doesn't exist yet)

- [ ] **Step 3: Implement ReviewProcessingState**

```tsx
// components/invoices/ReviewProcessingState.tsx
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ExtractionProgress from "@/components/invoices/ExtractionProgress";
import { useInvoiceStatus } from "@/lib/hooks/useInvoiceStatus";
import type { InvoiceStatus } from "@/lib/types/invoice";

interface ReviewProcessingStateProps {
  invoiceId: string;
  initialStatus: InvoiceStatus;
}

export default function ReviewProcessingState({
  invoiceId,
  initialStatus,
}: ReviewProcessingStateProps) {
  const router = useRouter();
  const { status, errorMessage } = useInvoiceStatus(invoiceId);
  const [retryError, setRetryError] = useState<string | null>(null);
  const hasRefreshed = useRef(false);

  // Use realtime status if available, fall back to initial
  const currentStatus = status ?? initialStatus;

  // Refresh page when extraction completes so server component loads extracted data
  useEffect(() => {
    if (currentStatus === "pending_review" && !hasRefreshed.current) {
      hasRefreshed.current = true;
      router.refresh();
    }
  }, [currentStatus, router]);

  const handleRetry = useCallback(async () => {
    setRetryError(null);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/retry`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json();
        setRetryError(body.error || "Retry failed. Please try again.");
      }
    } catch {
      setRetryError("Retry failed. Please check your connection.");
    }
  }, [invoiceId]);

  const handleUploadAnother = useCallback(() => {
    router.push("/upload");
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center py-16">
      <ExtractionProgress
        invoiceId={invoiceId}
        status={currentStatus}
        errorMessage={errorMessage}
        retryError={retryError}
        onRetry={handleRetry}
        onUploadAnother={handleUploadAnother}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/invoices/ReviewProcessingState.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/invoices/ReviewProcessingState.tsx components/invoices/ReviewProcessingState.test.tsx
git commit -m "feat: add ReviewProcessingState with realtime updates and retry (DOC-19)"
```

---

## Chunk 2: ReviewLayout Client Component

### Task 3: Build ReviewLayout

**Files:**
- Create: `components/invoices/ReviewLayout.tsx`
- Create: `components/invoices/ReviewLayout.test.tsx`

**Context:** This is the main client component. It renders:
- A sticky page header with back button, file name, status badge, and confidence indicator
- On desktop (md+): two side-by-side panels, each independently scrollable
- On mobile (<md): tab bar with "Document" / "Details" toggle

The AppShell wraps the page with `flex h-screen`, a `h-14` header, and a `<main className="flex-1 overflow-y-auto p-6">`. The review page needs to fill this main area. The two panels need independent scrolling, so the review layout uses a flex column: sticky header → flex-1 row with two `overflow-y-auto` children.

**Important:** The AppShell's `<main>` already has `overflow-y-auto` and `p-6`. The review layout should work within these constraints — the `p-6` provides page-level padding, and the panels' own `overflow-y-auto` handles independent scroll within them.

- [ ] **Step 1: Write failing tests for ReviewLayout**

```tsx
// components/invoices/ReviewLayout.test.tsx
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
  },
  signedUrl: "https://example.com/signed-url",
  extractedData: {
    id: "ext-1",
    confidence_score: "high" as const,
    extracted_line_items: [{ id: "li-1" }],
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
    // Both should be in the DOM (mobile tabs only control visibility via CSS)
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/invoices/ReviewLayout.test.tsx`
Expected: FAIL (component doesn't exist yet)

- [ ] **Step 3: Implement ReviewLayout**

```tsx
// components/invoices/ReviewLayout.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import InvoiceStatusBadge from "./InvoiceStatusBadge";
import PdfViewer from "./PdfViewer";
import ExtractionForm from "./ExtractionForm";
import type { InvoiceStatus } from "@/lib/types/invoice";

interface ReviewLayoutProps {
  invoice: {
    id: string;
    fileName: string;
    fileType: string;
    status: InvoiceStatus;
  };
  signedUrl: string;
  extractedData: {
    id: string;
    confidence_score: "high" | "medium" | "low";
    [key: string]: unknown;
    extracted_line_items: Array<{
      id: string;
      [key: string]: unknown;
    }>;
  } | null;
}

type MobileTab = "document" | "details";

const CONFIDENCE_CONFIG = {
  high: { dotClass: "bg-green-500", label: "High confidence" },
  medium: { dotClass: "bg-amber-500", label: "Medium confidence" },
  low: { dotClass: "bg-red-500", label: "Low confidence" },
} as const;

export default function ReviewLayout({
  invoice,
  signedUrl,
  extractedData,
}: ReviewLayoutProps) {
  const [activeTab, setActiveTab] = useState<MobileTab>("document");

  const confidence = extractedData?.confidence_score ?? null;

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Page header */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 md:px-6">
        {/* Back button */}
        <Link
          href="/invoices"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors shrink-0"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-4 w-4"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          <span className="hidden md:inline">Back to Invoices</span>
        </Link>

        {/* File name */}
        <span className="truncate text-sm font-medium text-slate-800 min-w-0">
          {invoice.fileName}
        </span>

        {/* Status + confidence (right side) */}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <InvoiceStatusBadge status={invoice.status} />
          {confidence && (
            <span className="hidden md:flex items-center gap-1.5 text-xs text-gray-500">
              <span className={`h-2 w-2 rounded-full ${CONFIDENCE_CONFIG[confidence].dotClass}`} />
              {CONFIDENCE_CONFIG[confidence].label}
            </span>
          )}
          {confidence && (
            <span className="flex md:hidden items-center">
              <span className={`h-2 w-2 rounded-full ${CONFIDENCE_CONFIG[confidence].dotClass}`} />
            </span>
          )}
        </div>
      </div>

      {/* Mobile tab bar */}
      <div className="flex border-b border-gray-200 bg-white md:hidden" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === "document"}
          onClick={() => setActiveTab("document")}
          className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
            activeTab === "document"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Document
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "details"}
          onClick={() => setActiveTab("details")}
          className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
            activeTab === "details"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Details
        </button>
      </div>

      {/* Two-panel content area */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel: PDF viewer */}
        <div
          className={`${
            activeTab === "document" ? "flex" : "hidden"
          } md:flex w-full md:w-1/2 overflow-y-auto md:border-r md:border-gray-200`}
        >
          <div className="flex-1">
            <PdfViewer signedUrl={signedUrl} fileType={invoice.fileType} />
          </div>
        </div>

        {/* Right panel: Extraction form */}
        <div
          className={`${
            activeTab === "details" ? "flex" : "hidden"
          } md:flex w-full md:w-1/2 overflow-y-auto`}
        >
          <div className="flex-1 p-4 md:p-6">
            {extractedData ? (
              <ExtractionForm extractedData={extractedData} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                <div className="text-center">
                  <p>No extraction data found.</p>
                  <p className="mt-1">Please retry extraction.</p>
                  <Link
                    href="/invoices"
                    className="mt-3 inline-block text-blue-600 hover:text-blue-700 text-sm"
                  >
                    Back to Invoices
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Key layout decisions:**
- `-m-6` on the root div counteracts the `p-6` from AppShell's `<main>`, letting the review layout fill the full content area
- `flex-1 min-h-0` on the panel container allows independent scrolling
- Mobile: panels use `hidden` / `flex` display toggle instead of conditional rendering, so both stay mounted (preserving scroll position). **Intentional deviation from spec** which says "actually conditional" — CSS toggle is better UX because switching tabs preserves scroll position in each panel.
- Desktop: both panels always visible via `md:flex`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/invoices/ReviewLayout.test.tsx`
Expected: PASS

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/invoices/ReviewLayout.tsx components/invoices/ReviewLayout.test.tsx
git commit -m "feat: add ReviewLayout with two-panel desktop and mobile tabs (DOC-19)"
```

---

## Chunk 3: Server Component + Integration

### Task 4: Build the review page server component

**Files:**
- Rewrite: `app/(dashboard)/invoices/[id]/review/page.tsx`

**Context:** This is the server component that fetches data and renders the layout. It runs inside the dashboard layout which already handles auth and wraps in AppShell. The page needs to:
1. Fetch invoice row by ID (RLS-aware — user must own the invoice via org_memberships)
2. Guard on status — if processing/error, render ReviewProcessingState
3. Fetch extracted data + signed URL in parallel
4. Guard on signed URL failure
5. Render ReviewLayout with all data

Reference `lib/extraction/data.ts` for `getExtractedData()` and `lib/supabase/server.ts` for `createClient()`.

- [ ] **Step 1: Implement the server component**

```tsx
// app/(dashboard)/invoices/[id]/review/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getExtractedData } from "@/lib/extraction/data";
import { logger } from "@/lib/utils/logger";
import ReviewLayout from "@/components/invoices/ReviewLayout";
import ReviewProcessingState from "@/components/invoices/ReviewProcessingState";
import Link from "next/link";
import type { InvoiceStatus } from "@/lib/types/invoice";

const PROCESSING_STATUSES: InvoiceStatus[] = ["uploading", "extracting", "error"];

export default async function ReviewPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  // Fetch invoice row
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, status, file_path, file_name, file_type, error_message")
    .eq("id", params.id)
    .single();

  if (invoiceError || !invoice) {
    logger.warn("review_page_invoice_not_found", {
      invoiceId: params.id,
      error: invoiceError?.message ?? "not found",
      status: "error",
    });
    redirect("/invoices");
  }

  // If still processing or errored, show processing state
  if (PROCESSING_STATUSES.includes(invoice.status as InvoiceStatus)) {
    return (
      <ReviewProcessingState
        invoiceId={invoice.id}
        initialStatus={invoice.status as InvoiceStatus}
      />
    );
  }

  // Fetch extracted data and signed URL in parallel
  const [extractedData, signedUrlResult] = await Promise.all([
    getExtractedData(invoice.id),
    supabase.storage
      .from("invoices")
      .createSignedUrl(invoice.file_path, 3600),
  ]);

  // Guard: signed URL failure
  if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
    logger.error("review_page_signed_url_failed", {
      invoiceId: invoice.id,
      filePath: invoice.file_path,
      error: signedUrlResult.error?.message ?? "no signed URL",
      status: "error",
    });
    return (
      <div className="flex flex-col items-center justify-center py-16 text-sm text-gray-500">
        <p>Could not load document. The file may have been deleted.</p>
        <Link
          href="/invoices"
          className="mt-3 text-blue-600 hover:text-blue-700"
        >
          Back to Invoices
        </Link>
      </div>
    );
  }

  return (
    <ReviewLayout
      invoice={{
        id: invoice.id,
        fileName: invoice.file_name,
        fileType: invoice.file_type,
        status: invoice.status as InvoiceStatus,
      }}
      signedUrl={signedUrlResult.data.signedUrl}
      // getExtractedData returns Supabase-inferred types where confidence_score
      // is string | null. The DB CHECK constraint guarantees valid values.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extractedData={extractedData as any}
    />
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/invoices/[id]/review/page.tsx"
git commit -m "feat: build review page server component with data loading and guards (DOC-19)"
```

---

### Task 5: Lint, build, and full test run

- [ ] **Step 1: Run linter**

Run: `npm run lint`
Expected: PASS (zero warnings, zero errors)

- [ ] **Step 2: Run full test suite**

Run: `npm run test`
Expected: PASS (all existing + new tests pass)

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Fix any issues found, re-run checks**

If any step fails, fix and re-run all three.

- [ ] **Step 5: Final commit if any fixes were needed**

Stage only the specific files that were fixed, then commit:
```bash
git commit -m "fix: address lint/build/test issues (DOC-19)"
```

---

### Task 6: Push branch and create PR

- [ ] **Step 1: Create feature branch from dev**

```bash
git checkout -b feature/DOC-19-review-layout
```

Note: If already on a feature branch, skip this step.

- [ ] **Step 2: Push and create PR**

```bash
git push -u origin feature/DOC-19-review-layout
gh pr create --base dev --title "DOC-19: Build side-by-side review layout (REV-1)" --body "$(cat <<'EOF'
## Summary
- Two-panel review page layout (PDF left, form right) with independently scrollable panels
- Mobile: toggle tabs (Document / Details) for full-screen panels
- Page header with back button, file name, status badge, and confidence indicator
- Server component fetches invoice + extracted data + signed URL with guards for all edge cases
- ReviewProcessingState wraps ExtractionProgress for uploading/extracting/error states with realtime updates

## Test plan
- [ ] ReviewLayout renders both panels on desktop
- [ ] Mobile tab switching works correctly
- [ ] Confidence indicator shows correct color per score
- [ ] ReviewProcessingState subscribes to realtime updates
- [ ] Server component redirects when invoice not found
- [ ] Server component shows processing state for incomplete extraction
- [ ] Server component handles signed URL failure gracefully
- [ ] `npm run lint` passes clean
- [ ] `npm run build` completes
- [ ] `npm run test` passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Deliver status report**
