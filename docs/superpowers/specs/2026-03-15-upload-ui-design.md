# DOC-12: Invoice Upload UI Design

## Overview

Build the drag-and-drop upload page at `/app/upload` — the user's first real interaction with Docket. Single file upload (PDF, JPG, PNG), 10MB max, native HTML5 drag events, Tailwind only, mobile responsive. Upload call is mocked until EXT-2 lands.

## Component Structure

```
app/(dashboard)/upload/page.tsx     — Page wrapper (heading + UploadZone)
components/invoices/UploadZone.tsx  — All upload logic ('use client' component)
```

All logic lives in `UploadZone`. No additional hooks, utilities, or abstractions needed.

## State Machine

Four states managed by a single `useState`:

| State | UI | Transitions |
|-------|-----|-------------|
| **idle** | Dashed border box, cloud icon, "Drag & drop your invoice" + "or click to browse", accepted formats note | → `dragging` (dragenter), → `uploading` (file selected + valid) |
| **dragging** | Border turns accent blue, background lightens, "Drop your file here" | → `idle` (dragleave/dragend), → `uploading` (drop + valid) |
| **uploading** | File name shown, progress bar animating, "Uploading..." | → `success` (complete), → `idle` (error, with inline error message) |
| **success** | Green checkmark, file name, "Processing..." indicator, "Upload Another" button | → `idle` (click "Upload Another") |

Additional state: `error` (string | null) for validation messages, `progress` (number) for the progress bar, `fileName` (string | null) for display.

**Edge case — file selected while uploading:** Ignore drops and clicks while in `uploading` state. The zone is non-interactive until upload completes or errors.

**Validation errors** keep the zone in `idle` state with the `error` string set. The error clears on the next valid file selection or drag. Upload-time network errors are deferred to EXT-2 (mock always succeeds).

## Validation

Client-side checks run in order before upload starts:

1. **Single file only** — if `files.length > 1`, show "Please upload one file at a time."
2. **File type** — accept `.pdf`, `.jpg`, `.jpeg`, `.png`. Validate against both file extension and `File.type` MIME. Note: the `accept` attribute on the hidden input only filters the browse dialog; drag-and-drop bypasses it, so validation must run on all dropped files. Show "Unsupported file type. Please upload a PDF, JPG, or PNG."
3. **File size** — max 10MB (10 * 1024 * 1024 bytes). Show "File exceeds 10MB limit."

Validation errors display inline below the upload zone using the existing error styling pattern (`text-sm text-error`). Zone stays in idle so user can retry.

Accepted MIME types: `application/pdf`, `image/jpeg`, `image/png`.

## Mock Upload

Since the upload API route (EXT-2) isn't built yet:

- Simulates progress via `setTimeout` intervals: 0% → 30% (400ms) → 60% (400ms) → 90% (400ms) → 100% (400ms)
- ~1.6 second total duration
- Always succeeds
- When EXT-2 lands, swap mock for `fetch('/api/invoices/upload', { method: 'POST', body: FormData })`

## Upload Zone Styling

### Idle State
- `border-2 border-dashed border-gray-300 rounded-lg bg-white`
- Min height ~300px desktop, ~200px mobile
- Centered content: cloud icon, primary text, secondary text, format note
- `cursor-pointer` — entire zone is clickable

### Dragging State
- `border-accent bg-blue-50`
- Text changes to "Drop your file here"

### Uploading State
- File name displayed (truncated if long)
- Progress bar: `bg-gray-200 rounded-full h-2` track, `bg-accent rounded-full h-2` fill with width transition
- "Uploading..." text below

### Success State
- Green checkmark icon (inline SVG)
- File name
- "Processing..." with a subtle pulsing dot animation (CSS only)
- "Upload Another" button (secondary style)

### Error Display
- Inline below the upload zone
- `text-sm text-error` — matches existing error patterns

## Hidden File Input

- `<input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden">` with a ref
- Clicking anywhere on the upload zone triggers `inputRef.current.click()`
- Same input handles mobile tap-to-browse

## Drag Event Handling

- `onDragEnter` / `onDragOver`: prevent default, set dragging state. Use a drag counter (increment on enter, decrement on leave) to handle child element events correctly.
- `onDragLeave`: decrement counter, set idle when counter hits 0.
- `onDrop`: prevent default, reset counter, extract `e.dataTransfer.files`, validate, start upload.

## Page Layout

`upload/page.tsx` is minimal:
- Heading: "Upload Invoice" (`text-lg font-semibold text-primary`)
- `UploadZone` component below
- Max width container (`max-w-2xl mx-auto`) to keep the zone centered and not too wide

## Responsive Behavior

- Upload zone is full-width within its container
- On mobile: tap triggers file picker, drag-and-drop still works but tap is primary
- Padding reduces on smaller screens (`p-8` desktop, `p-4` mobile)
- Text sizes stay the same (already using `text-sm` / `text-base`)

## Files Changed

| File | Change |
|------|--------|
| `app/(dashboard)/upload/page.tsx` | Replace placeholder with heading + UploadZone |
| `components/invoices/UploadZone.tsx` | Full implementation (drag-drop, validation, mock upload, all states) |

## Accessibility

- Upload zone is focusable (`tabIndex={0}`) with a visible focus ring (`focus:outline-none focus:ring-2 focus:ring-accent`)
- `Enter` or `Space` on the focused zone triggers the file input (same as click)
- Zone has `role="button"` and `aria-label="Upload invoice file"`
- State transitions announced via an `aria-live="polite"` region for screen readers (e.g., "Uploading invoice.pdf", "Upload complete")
- Error messages linked to the zone via `aria-describedby`

## Out of Scope

- Actual Supabase Storage upload (EXT-2)
- Server-side magic byte validation (EXT-2)
- Auto-redirect to review page (future, when review UI exists)
- Batch/multi-file upload (Phase 2)
