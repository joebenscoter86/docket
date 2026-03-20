# DOC-69: Multi-File Upload UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the upload flow to accept multiple files (up to 25), show per-file validation and upload progress, track extraction status in real-time, and present a batch summary on completion.

**Architecture:** Extend existing `UploadZone` for multi-file selection with a file list UI. New `UploadQueue` component handles concurrent uploads (3 at a time) and real-time extraction tracking via `useInvoiceStatuses`. `UploadFlow` orchestrates: single file uses existing flow (no batch_id), multiple files renders `UploadQueue`. Upload API route already supports `batch_id` (from DOC-68).

**Tech Stack:** Next.js 14, React, TypeScript, Tailwind CSS, Supabase Realtime, custom concurrency limiter (same pattern as `lib/extraction/queue.ts`)

**Spec:** `docs/superpowers/specs/2026-03-19-doc-69-multi-file-upload-ui-design.md`

**Advisory notes from spec review:**
1. `useInvoiceStatuses` re-subscribes on every new invoiceId (channel key changes). This is fine for ≤25 files — the hook already handles teardown/setup cleanly.
2. Single-file upload keeps existing UploadZone upload logic — no UploadQueue for 1 file.
3. `beforeunload` scoped to active uploads only, not extractions. Extraction tracking is informational.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `components/invoices/UploadZone.tsx` | **Modified.** Multi-file drop/select, file list with validation, "Upload N Files" button. No longer handles upload API calls — delegates via `onUploadStart(files)` for batch, keeps `onUploadComplete` for single-file. |
| `components/invoices/UploadZone.test.tsx` | **Modified.** Update existing tests for multi-file behavior, add tests for file list, 25-file cap, validation display, remove button. |
| `components/invoices/UploadQueue.tsx` | **New.** Receives files array, manages batch_id, concurrent uploads (3 max), real-time status tracking via `useInvoiceStatuses`, batch summary, retry, beforeunload. |
| `components/invoices/UploadQueue.test.tsx` | **New.** Tests for concurrent upload, status tracking, batch summary, retry, beforeunload, usage limit mid-batch. |
| `components/invoices/UploadFlow.tsx` | **Modified.** Route between single-file flow (existing) and batch flow (UploadQueue) based on file count. |
| `components/invoices/UploadFlow.test.tsx` | **New.** Tests for routing logic between single and batch flows. |
| `app/(dashboard)/invoices/page.tsx` | **Modified.** Accept `batch_id` search param, pass to query. |
| `lib/invoices/queries.ts` | **Modified.** Add `batch_id` filter to `fetchInvoiceList`. |
| `lib/invoices/types.ts` | **Modified.** Add `batch_id` to `InvoiceListParams`. |

---

## Task 1: Enhance UploadZone for Multi-File Selection

**Files:**
- Modify: `components/invoices/UploadZone.tsx`
- Modify: `components/invoices/UploadZone.test.tsx`

The UploadZone currently accepts one file, validates it, and immediately uploads. We need to change it to:
1. Accept multiple files (drag-and-drop and file picker)
2. Accumulate files in a local list (up to 25)
3. Show per-file validation status
4. Emit valid files via `onUploadStart` callback when user clicks "Upload N Files"
5. Keep single-file upload working via existing `onUploadComplete` path

### Step-by-step

- [ ] **Step 1: Update tests for multi-file acceptance**

Update the existing test that rejects multiple files. Add new tests for multi-file behavior.

```typescript
// In UploadZone.test.tsx — replace the "rejects multiple files" test and add new tests

describe("Multi-file selection", () => {
  it("accepts multiple files via drop and shows file list", () => {
    const onUploadStart = vi.fn();
    render(<UploadZone onUploadStart={onUploadStart} />);
    const file1 = createFile("a.pdf", 1024, "application/pdf");
    const file2 = createFile("b.pdf", 2048, "application/pdf");

    fireEvent.drop(getZone(), createDropData([file1, file2]));

    expect(screen.getByText("a.pdf")).toBeInTheDocument();
    expect(screen.getByText("b.pdf")).toBeInTheDocument();
  });

  it("accepts multiple files via file picker", () => {
    render(<UploadZone />);
    const input = getInput();
    const file1 = createFile("a.pdf", 1024, "application/pdf");
    const file2 = createFile("b.png", 2048, "image/png");
    selectFiles(input, [file1, file2]);

    expect(screen.getByText("a.pdf")).toBeInTheDocument();
    expect(screen.getByText("b.png")).toBeInTheDocument();
  });

  it("enforces 25-file cap and shows warning", () => {
    render(<UploadZone />);
    const files = Array.from({ length: 30 }, (_, i) =>
      createFile(`file-${i}.pdf`, 1024, "application/pdf")
    );

    fireEvent.drop(getZone(), createDropData(files));

    // Should only have 25 files in the list
    expect(screen.getByText("file-0.pdf")).toBeInTheDocument();
    expect(screen.getByText("file-24.pdf")).toBeInTheDocument();
    expect(screen.queryByText("file-25.pdf")).not.toBeInTheDocument();
    expect(screen.getByText(/Maximum 25 files/)).toBeInTheDocument();
  });

  it("appends files on subsequent drops up to 25", () => {
    render(<UploadZone />);
    const file1 = createFile("a.pdf", 1024, "application/pdf");
    fireEvent.drop(getZone(), createDropData([file1]));
    expect(screen.getByText("a.pdf")).toBeInTheDocument();

    const file2 = createFile("b.pdf", 1024, "application/pdf");
    fireEvent.drop(getZone(), createDropData([file2]));
    expect(screen.getByText("a.pdf")).toBeInTheDocument();
    expect(screen.getByText("b.pdf")).toBeInTheDocument();
  });

  it("shows invalid files with error reason", () => {
    render(<UploadZone />);
    const valid = createFile("good.pdf", 1024, "application/pdf");
    const invalid = createFile("bad.docx", 1024, "application/msword");

    fireEvent.drop(getZone(), createDropData([valid, invalid]));

    expect(screen.getByText("good.pdf")).toBeInTheDocument();
    expect(screen.getByText("bad.docx")).toBeInTheDocument();
    expect(screen.getByText(/Unsupported/)).toBeInTheDocument();
  });

  it("removes file from list when remove button is clicked", () => {
    render(<UploadZone />);
    const file1 = createFile("a.pdf", 1024, "application/pdf");
    const file2 = createFile("b.pdf", 1024, "application/pdf");
    fireEvent.drop(getZone(), createDropData([file1, file2]));

    const removeButtons = screen.getAllByLabelText(/Remove/);
    fireEvent.click(removeButtons[0]);

    expect(screen.queryByText("a.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("b.pdf")).toBeInTheDocument();
  });

  it("shows 'Upload N Files' button counting only valid files", () => {
    render(<UploadZone />);
    const valid1 = createFile("a.pdf", 1024, "application/pdf");
    const valid2 = createFile("b.pdf", 1024, "application/pdf");
    const invalid = createFile("c.docx", 1024, "application/msword");
    fireEvent.drop(getZone(), createDropData([valid1, valid2, invalid]));

    expect(screen.getByText("Upload 2 Files")).toBeInTheDocument();
  });

  it("disables button when all files are invalid", () => {
    render(<UploadZone />);
    const invalid = createFile("c.docx", 1024, "application/msword");
    fireEvent.drop(getZone(), createDropData([invalid]));

    const button = screen.getByText("No valid files to upload");
    expect(button).toBeDisabled();
  });

  it("calls onUploadStart with valid files when upload button is clicked", () => {
    const onUploadStart = vi.fn();
    render(<UploadZone onUploadStart={onUploadStart} />);
    const valid = createFile("a.pdf", 1024, "application/pdf");
    const invalid = createFile("b.docx", 1024, "application/msword");
    fireEvent.drop(getZone(), createDropData([valid, invalid]));

    fireEvent.click(screen.getByText("Upload 1 File"));

    expect(onUploadStart).toHaveBeenCalledWith([valid]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- components/invoices/UploadZone.test.tsx`
Expected: New tests fail (multi-file selection not implemented yet). Existing "rejects multiple files" test may also need updating.

- [ ] **Step 3: Implement multi-file UploadZone**

Update `UploadZone.tsx` with these changes:

1. **New props:** Add `onUploadStart?: (files: File[]) => void` to `UploadZoneProps`.
2. **New state:** Replace single-file state with `selectedFiles: Array<{ file: File, id: string, valid: boolean, error?: string }>` and `capWarning: string | null`.
3. **File input:** Add `multiple` attribute.
4. **`handleFiles`:** Instead of validating one file and immediately uploading, accumulate files into `selectedFiles`. Validate each file. Enforce 25-file cap. Show warning if cap exceeded.
5. **Remove `uploadFile`** from UploadZone — single-file uploads are still handled here but through the existing `onUploadComplete` path by uploading inline. The `uploadFile` method stays but is only called for single-file (when `onUploadStart` is not provided, or only 1 file selected).
6. **State machine change:** `idle` state now includes the file list. New state: `idle` (with or without files) | `dragging` | `uploading` (single-file only) | `success` (single-file only).
7. **File list UI:** Render below the dropzone when `selectedFiles.length > 0`. Each row: validation icon, filename, file size formatted, error reason if invalid, remove button.
8. **Upload button:** Below file list. Text: "Upload N Files" or "Upload 1 File". Disabled with "No valid files to upload" if no valid files.
9. **Upload button click:** If `onUploadStart` is provided and valid files > 1, call `onUploadStart(validFiles)`. If only 1 valid file and no `onUploadStart`, use existing `uploadFile` for backwards compatibility.

Key implementation details:
- File IDs: `crypto.randomUUID()` for each file entry (for React keys and remove targeting)
- File size formatting: helper function `formatFileSize(bytes)` — e.g., "2.4 MB", "856 KB"
- Validation: reuse existing `validateFile` function, store result per file
- 25-file cap: `const remaining = 25 - selectedFiles.length; const accepted = files.slice(0, remaining);`
- Remove: filter `selectedFiles` by id
- Clear list: reset when navigating away or starting new batch

CSS for file list rows (per UIdesign.md §7.2 and existing Precision Flow tokens):
- Valid row: white bg, green check icon, gray file size text
- Invalid row: `bg-red-50`, red X icon, struck-through filename, red error text
- Remove button: gray `×`, hover darkens
- Upload button: primary variant from `Button` component

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- components/invoices/UploadZone.test.tsx`
Expected: All tests pass.

- [ ] **Step 5: Verify existing single-file behavior still works**

Manually verify: when no `onUploadStart` is provided and user drops 1 file, the existing upload + `onUploadComplete` flow works unchanged.

- [ ] **Step 6: Commit**

```bash
git add components/invoices/UploadZone.tsx components/invoices/UploadZone.test.tsx
git commit -m "feat: enhance UploadZone for multi-file selection with file list UI (DOC-69)"
```

---

## Task 2: Build UploadQueue Component

**Files:**
- Create: `components/invoices/UploadQueue.tsx`
- Create: `components/invoices/UploadQueue.test.tsx`

This is the core new component. It receives an array of files, generates a batch_id, uploads them with concurrency control, and tracks extraction status in real-time.

### Step-by-step

- [ ] **Step 1: Write tests for UploadQueue**

```typescript
// components/invoices/UploadQueue.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import UploadQueue from "./UploadQueue";

// Mock useInvoiceStatuses
vi.mock("@/lib/hooks/useInvoiceStatuses", () => ({
  useInvoiceStatuses: vi.fn(() => ({ statuses: {}, isConnected: true })),
}));

// Mock crypto.randomUUID
const mockUUID = vi.fn(() => "mock-batch-id");
vi.stubGlobal("crypto", { randomUUID: mockUUID });

const mockFetch = vi.fn();
global.fetch = mockFetch;

function createFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

describe("UploadQueue", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockUUID.mockReturnValue("mock-batch-id");
  });

  it("renders a row for each file", () => {
    const files = [
      createFile("a.pdf", 1024, "application/pdf"),
      createFile("b.png", 2048, "image/png"),
    ];
    // Use a never-resolving fetch so uploads stay in progress
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<UploadQueue files={files} />);

    expect(screen.getByText("a.pdf")).toBeInTheDocument();
    expect(screen.getByText("b.png")).toBeInTheDocument();
  });

  it("uploads files with batch_id in FormData", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { invoiceId: "inv-1" } }),
    });
    const files = [createFile("a.pdf", 1024, "application/pdf")];
    render(<UploadQueue files={files} />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const call = mockFetch.mock.calls[0];
    const formData = call[1].body as FormData;
    expect(formData.get("batch_id")).toBe("mock-batch-id");
  });

  it("limits concurrent uploads to 3", async () => {
    let resolvers: Array<(value: unknown) => void> = [];
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );

    const files = Array.from({ length: 5 }, (_, i) =>
      createFile(`file-${i}.pdf`, 1024, "application/pdf")
    );
    render(<UploadQueue files={files} />);

    // Wait for concurrent uploads to start
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    // Resolve first upload to start 4th
    act(() => {
      resolvers[0]({
        ok: true,
        json: async () => ({ data: { invoiceId: "inv-0" } }),
      });
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  it("shows batch summary when all uploads complete", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      const id = `inv-${callCount++}`;
      return { ok: true, json: async () => ({ data: { invoiceId: id } }) };
    });

    const files = [
      createFile("a.pdf", 1024, "application/pdf"),
      createFile("b.pdf", 1024, "application/pdf"),
    ];
    render(<UploadQueue files={files} />);

    await waitFor(() => {
      expect(screen.getByText(/2 of 2/)).toBeInTheDocument();
    });
  });

  it("shows failure count in summary when upload fails", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { invoiceId: "inv-1" } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Upload failed" }),
      });

    const files = [
      createFile("a.pdf", 1024, "application/pdf"),
      createFile("b.pdf", 1024, "application/pdf"),
    ];
    render(<UploadQueue files={files} />);

    await waitFor(() => {
      expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
      expect(screen.getByText(/1 failed/)).toBeInTheDocument();
    });
  });

  it("adds beforeunload handler during uploads", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const addSpy = vi.spyOn(window, "addEventListener");

    const files = [createFile("a.pdf", 1024, "application/pdf")];
    render(<UploadQueue files={files} />);

    expect(addSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function)
    );
    addSpy.mockRestore();
  });

  it("shows retry button on failed uploads", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Upload failed" }),
    });

    const files = [createFile("a.pdf", 1024, "application/pdf")];
    render(<UploadQueue files={files} />);

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
  });

  it("skips remaining files when usage limit is hit", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { invoiceId: "inv-1" } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: "Monthly invoice limit reached",
          code: "USAGE_LIMIT",
        }),
      });

    const files = [
      createFile("a.pdf", 1024, "application/pdf"),
      createFile("b.pdf", 1024, "application/pdf"),
      createFile("c.pdf", 1024, "application/pdf"),
    ];
    render(<UploadQueue files={files} />);

    await waitFor(() => {
      expect(screen.getByText(/Monthly limit reached/)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- components/invoices/UploadQueue.test.tsx`
Expected: Fails because `UploadQueue.tsx` doesn't exist yet.

- [ ] **Step 3: Implement UploadQueue**

Create `components/invoices/UploadQueue.tsx`:

**Props:**
```typescript
interface UploadQueueProps {
  files: File[];
  onComplete?: () => void;  // called when all uploads finish (for UploadFlow to reset if needed)
}
```

**Internal state:**
```typescript
type FileUploadStatus = "queued" | "uploading" | "uploaded" | "extracting" | "pending_review" | "approved" | "synced" | "error";

interface FileUploadEntry {
  id: string;           // crypto.randomUUID() — for React keys
  file: File;
  status: FileUploadStatus;
  invoiceId: string | null;
  errorMessage: string | null;
  usageLimitHit: boolean;
}
```

**Key implementation:**

1. **`batchId`** — `useRef(crypto.randomUUID())`, generated once on mount.

2. **Concurrent upload** — Use a `createLimit(3)` function (same pattern as `lib/extraction/queue.ts` but simpler — no timeout needed, just concurrency control). On mount, iterate through files and enqueue each upload via the limiter.

3. **Upload function per file:**
   ```typescript
   async function uploadFile(entry: FileUploadEntry) {
     updateEntry(entry.id, { status: "uploading" });
     const formData = new FormData();
     formData.append("file", entry.file);
     formData.append("batch_id", batchId.current);

     try {
       const res = await fetch("/api/invoices/upload", { method: "POST", body: formData });
       const body = await res.json();

       if (!res.ok) {
         if (body.code === "USAGE_LIMIT") {
           updateEntry(entry.id, { status: "error", errorMessage: "Monthly limit reached.", usageLimitHit: true });
           cancelRemaining();  // skip queued files
           return;
         }
         updateEntry(entry.id, { status: "error", errorMessage: body.error || "Upload failed." });
         return;
       }

       updateEntry(entry.id, { status: "uploaded", invoiceId: body.data.invoiceId });
     } catch {
       updateEntry(entry.id, { status: "error", errorMessage: "Upload failed. Check connection." });
     }
   }
   ```

4. **Real-time tracking** — Collect all non-null `invoiceId`s from entries, pass to `useInvoiceStatuses(invoiceIds)`. Merge returned statuses into entries: when `statuses[entry.invoiceId]` updates, update the entry's status to match (e.g., `extracting`, `pending_review`, `error`).

5. **`beforeunload`** — `useEffect` that adds the handler when any entry has status `uploading`, removes when no entries are `uploading`. Scoped to uploads only, not extractions.

6. **Batch summary** — Derived state: `allDone = entries.every(e => terminal status)`. Show summary bar when all uploads are done (not waiting for extractions). Terminal upload statuses: `uploaded`, `error`. Extraction statuses update the rows live but don't block the summary.
   - "X of Y invoices uploaded successfully. Z failed."
   - "Review All →" button: `<Link href={/invoices?batch_id=${batchId.current}}>Review All</Link>`

7. **Retry** — On retry click, re-upload the file (new `fetch` call with same `batch_id`). The old invoice row stays as `error` in the DB; the new upload creates a fresh invoice row.

8. **Row UI** (per UIdesign.md §7.2):
   ```
   ┌─────────────────────────────────────────────────────┐
   │ 📄 invoice-march.pdf          Extracting data...    │
   │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░ (3px progress)   │
   └─────────────────────────────────────────────────────┘
   ```
   - Row height: `h-16` (64px)
   - Background: `bg-surface`
   - Shadow: `shadow-soft`
   - Progress bar: `h-[3px]` at bottom, `bg-[#3B82F6]` (blue) during upload/extraction, `bg-green-500` on success
   - Status text colors: `text-muted` for uploading, `text-blue-600` for extracting, `text-green-600` for ready, `text-red-600` for error
   - "View →" link: `text-blue-600` on completed rows, links to `/invoices/{invoiceId}/review`
   - "Retry" button: small outline button on error rows

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- components/invoices/UploadQueue.test.tsx`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/invoices/UploadQueue.tsx components/invoices/UploadQueue.test.tsx
git commit -m "feat: add UploadQueue component with concurrent uploads and batch tracking (DOC-69)"
```

---

## Task 3: Update UploadFlow to Route Between Single and Batch

**Files:**
- Modify: `components/invoices/UploadFlow.tsx`
- Create: `components/invoices/UploadFlow.test.tsx`

### Step-by-step

- [ ] **Step 1: Write tests for UploadFlow routing**

```typescript
// components/invoices/UploadFlow.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import UploadFlow from "./UploadFlow";

// Mock child components
vi.mock("./UploadZone", () => ({
  default: ({ onUploadComplete, onUploadStart }: {
    onUploadComplete?: (id: string) => void;
    onUploadStart?: (files: File[]) => void;
  }) => (
    <div data-testid="upload-zone">
      <button onClick={() => onUploadComplete?.("inv-1")}>
        Single Upload
      </button>
      <button onClick={() => {
        const f1 = new File(["a"], "a.pdf", { type: "application/pdf" });
        const f2 = new File(["b"], "b.pdf", { type: "application/pdf" });
        onUploadStart?.([f1, f2]);
      }}>
        Batch Upload
      </button>
    </div>
  ),
}));

vi.mock("./ExtractionProgress", () => ({
  default: () => <div data-testid="extraction-progress">ExtractionProgress</div>,
}));

vi.mock("./UploadQueue", () => ({
  default: ({ files }: { files: File[] }) => (
    <div data-testid="upload-queue">Queue: {files.length} files</div>
  ),
}));

vi.mock("@/lib/hooks/useInvoiceStatus", () => ({
  useInvoiceStatus: () => ({ status: null, errorMessage: null, isConnected: false }),
}));

describe("UploadFlow", () => {
  it("renders UploadZone initially", () => {
    render(<UploadFlow />);
    expect(screen.getByTestId("upload-zone")).toBeInTheDocument();
  });

  it("shows ExtractionProgress after single-file upload", () => {
    render(<UploadFlow />);
    fireEvent.click(screen.getByText("Single Upload"));
    expect(screen.getByTestId("extraction-progress")).toBeInTheDocument();
  });

  it("shows UploadQueue after multi-file upload", () => {
    render(<UploadFlow />);
    fireEvent.click(screen.getByText("Batch Upload"));
    expect(screen.getByTestId("upload-queue")).toBeInTheDocument();
    expect(screen.getByText("Queue: 2 files")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- components/invoices/UploadFlow.test.tsx`
Expected: Fails because UploadFlow doesn't have batch routing yet.

- [ ] **Step 3: Update UploadFlow**

Modify `components/invoices/UploadFlow.tsx`:

```typescript
"use client";

import { useState, useCallback } from "react";
import UploadZone from "@/components/invoices/UploadZone";
import ExtractionProgress from "@/components/invoices/ExtractionProgress";
import UploadQueue from "@/components/invoices/UploadQueue";
import { useInvoiceStatus } from "@/lib/hooks/useInvoiceStatus";

type FlowState =
  | { mode: "select" }
  | { mode: "single"; invoiceId: string }
  | { mode: "batch"; files: File[] };

export default function UploadFlow() {
  const [flow, setFlow] = useState<FlowState>({ mode: "select" });
  const [retryError, setRetryError] = useState<string | null>(null);

  const invoiceId = flow.mode === "single" ? flow.invoiceId : null;
  const { status, errorMessage } = useInvoiceStatus(invoiceId);

  const handleUploadComplete = useCallback((id: string) => {
    setFlow({ mode: "single", invoiceId: id });
  }, []);

  const handleUploadStart = useCallback((files: File[]) => {
    setFlow({ mode: "batch", files });
  }, []);

  const handleUploadAnother = useCallback(() => {
    setFlow({ mode: "select" });
    setRetryError(null);
  }, []);

  const handleRetry = useCallback(async () => {
    if (flow.mode !== "single") return;
    setRetryError(null);
    try {
      const response = await fetch(`/api/invoices/${flow.invoiceId}/retry`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json();
        setRetryError(body.error || "Retry failed. Please try again.");
      }
    } catch {
      setRetryError("Retry failed. Please check your connection.");
    }
  }, [flow]);

  if (flow.mode === "batch") {
    return <UploadQueue files={flow.files} onComplete={handleUploadAnother} />;
  }

  if (flow.mode === "single") {
    return (
      <div className="rounded-brand-lg border border-border bg-surface p-8">
        <ExtractionProgress
          invoiceId={flow.invoiceId}
          status={status}
          errorMessage={errorMessage}
          retryError={retryError}
          onRetry={handleRetry}
          onUploadAnother={handleUploadAnother}
        />
      </div>
    );
  }

  return (
    <UploadZone
      onUploadComplete={handleUploadComplete}
      onUploadStart={handleUploadStart}
    />
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- components/invoices/UploadFlow.test.tsx`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/invoices/UploadFlow.tsx components/invoices/UploadFlow.test.tsx
git commit -m "feat: route UploadFlow between single-file and batch modes (DOC-69)"
```

---

## Task 4: Add batch_id Filtering to Invoice List

**Files:**
- Modify: `lib/invoices/types.ts`
- Modify: `lib/invoices/queries.ts`
- Modify: `app/(dashboard)/invoices/page.tsx`

### Step-by-step

- [ ] **Step 1: Add `batch_id` to `InvoiceListParams`**

In `lib/invoices/types.ts`, add `batch_id?: string` to the `InvoiceListParams` interface:

```typescript
export interface InvoiceListParams {
  status?: string;
  sort?: string;
  direction?: string;
  cursor?: string;
  limit?: number;
  output_type?: string;
  batch_id?: string;  // NEW
}
```

- [ ] **Step 2: Add batch_id filter to `fetchInvoiceList`**

In `lib/invoices/queries.ts`, add `batch_id` to `ValidatedParams` interface and add filter in `fetchInvoiceList`:

Add to `ValidatedParams`:
```typescript
interface ValidatedParams {
  status: string;
  sort: string;
  direction: string;
  cursor?: string;
  limit: number;
  output_type: string;
  batch_id?: string;  // NEW
}
```

Add to `validateListParams` — pass through `batch_id` if present and valid UUID:
```typescript
// In validateListParams return, add:
batch_id: params.batch_id,
```

Add filter in `fetchInvoiceList`, after the output_type filter:
```typescript
// Batch filter
if (params.batch_id) {
  query = query.eq("batch_id", params.batch_id);
}
```

- [ ] **Step 3: Accept `batch_id` search param in invoices page**

In `app/(dashboard)/invoices/page.tsx`:

Add `batch_id?: string` to the `searchParams` type.

Pass it to `validateListParams`:
```typescript
const params = validateListParams({
  // ...existing params...
  batch_id: resolvedParams.batch_id,
});
```

Add a "Clear filter" link when `batch_id` is active, above the invoice list:
```tsx
{resolvedParams.batch_id && (
  <div className="mb-4 flex items-center gap-2 text-sm text-muted">
    <span>Showing batch upload results</span>
    <Link href="/invoices" className="text-blue-600 hover:underline">
      View all invoices
    </Link>
  </div>
)}
```

- [ ] **Step 4: Run full test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/invoices/types.ts lib/invoices/queries.ts "app/(dashboard)/invoices/page.tsx"
git commit -m "feat: add batch_id filtering to invoice list page (DOC-69)"
```

---

## Task 5: Integration Testing & Polish

**Files:**
- All modified files from Tasks 1-4

### Step-by-step

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: All tests pass with zero failures.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: Zero warnings, zero errors.

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Manual smoke test checklist**

Verify locally (`npm run dev`):
1. Drop single file → existing flow works (upload + extraction progress)
2. Drop 3 files → file list appears with validation, "Upload 3 Files" button
3. Drop mix of valid/invalid → invalid files shown in red, button count reflects valid only
4. Remove a file → file disappears from list, button count updates
5. Click upload → queue appears, files upload concurrently (max 3)
6. Queue rows update in real-time as extraction progresses
7. All done → batch summary appears with counts
8. "Review All" → navigates to invoice list filtered by batch_id
9. "View →" on individual file → navigates to review page
10. Drop 26 files → only 25 accepted, warning shown
11. Navigate away during upload → browser warning appears

- [ ] **Step 6: Final commit if any polish needed**

```bash
git add -A
git commit -m "chore: polish multi-file upload UI (DOC-69)"
```
