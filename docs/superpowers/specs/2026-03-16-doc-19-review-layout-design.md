# DOC-19: Side-by-Side Review Layout — Design Spec

## Overview

Build the review page layout at `/invoices/[id]/review`. This is the container that hosts the PDF viewer (left) and extraction form (right). DOC-19 builds the shell only — the PDF viewer (DOC-20/REV-2) and form (DOC-21/REV-3) are separate issues and render as placeholders here.

## Page Architecture

### Server Component: `app/(dashboard)/invoices/[id]/review/page.tsx`

Async server component that:

1. Gets the authenticated user via `createClient().auth.getUser()`
2. Fetches the invoice row from `invoices` table by `params.id`
3. Guards: if invoice not found → `redirect('/invoices')`
4. Guards: if status is `uploading`, `extracting`, or `error` → render processing state (not two-panel layout)
5. Fetches extracted data and signed URL in parallel via `Promise.all`:
   - `getExtractedData(invoiceId)` from `lib/extraction/data.ts`
   - `supabase.storage.from('invoices').createSignedUrl(filePath, 3600)` (1-hour expiry)
6. Guards: if signed URL generation fails → show error state ("Could not load document. The file may have been deleted.")
7. Renders `ReviewLayout` client component with all data as props

**Data fetching:** Invoice row is fetched first (needed for `file_path` and status guard). Then `getExtractedData` and `createSignedUrl` run in parallel via `Promise.all`.

### Client Component: `components/invoices/ReviewLayout.tsx`

The two-panel shell. Receives all data as props (no client-side fetching in DOC-19).

**Props:**
```typescript
import type { InvoiceStatus } from '@/lib/types/invoice';

interface ReviewLayoutProps {
  invoice: {
    id: string;
    fileName: string;
    fileType: string;
    status: InvoiceStatus;
  };
  signedUrl: string;
  /** Return type of getExtractedData() — Supabase-inferred, includes `id` field.
   *  Note: ExtractedDataRow in types.ts omits `id`; the actual Supabase response
   *  includes it. DOC-21 will need `id` for updateExtractedField() calls. */
  extractedData: {
    id: string;
    confidence_score: 'high' | 'medium' | 'low';
    [key: string]: unknown;
    extracted_line_items: Array<{
      id: string;
      [key: string]: unknown;
    }>;
  } | null;
}
```

Confidence score is derived from `extractedData.confidence_score` — no separate prop needed. When `extractedData` is null, the confidence indicator is hidden.

## Layout

### Desktop (md breakpoint and above)

```
┌──────────────────────────────────────────────────────┐
│  ← Back to Invoices    invoice-001.pdf    [Pending]  │  ← Page header (sticky)
│                                          ●● Medium   │  ← Confidence indicator
├─────────────────────────┬────────────────────────────┤
│                         │                            │
│    PDF Viewer           │    Extraction Form         │
│    (placeholder)        │    (placeholder)           │
│                         │                            │
│    50% width            │    50% width               │
│    overflow-y-auto      │    overflow-y-auto         │
│                         │                            │
│    Independently        │    Independently           │
│    scrollable           │    scrollable              │
│                         │                            │
└─────────────────────────┴────────────────────────────┘
```

- The review page renders inside the AppShell content area (below the existing app header + sidebar). Both panels fill remaining height: `h-[calc(100vh-<appShellHeader>-<reviewHeader>)]`. The exact pixel value depends on the AppShell header height — measure and hardcode or use `flex-1` with `min-h-0` on a flex column parent.
- Each panel has `overflow-y-auto` for independent scrolling
- No resizable divider for MVP
- Subtle `border-r border-gray-200` between panels

### Mobile (below md breakpoint)

```
┌──────────────────────────┐
│  ← Back    invoice.pdf   │  ← Page header (compact)
│            [Pending] ●●  │
├──────────────────────────┤
│  [Document]  |  Details  │  ← Tab bar
├──────────────────────────┤
│                          │
│   Active tab content     │
│   (full width,           │
│    full remaining height)│
│                          │
└──────────────────────────┘
```

- Two tabs: "Document" and "Details"
- `useState` tracks active tab, default: "Document"
- Only the active panel is rendered (not hidden — actually conditional)
- Tab bar: bottom border with active indicator (blue underline)

## Page Header

Sticky header bar containing:

| Element | Desktop | Mobile |
|---------|---------|--------|
| Back button | `← Back to Invoices` text link | `←` icon only |
| File name | Full name, truncated with `truncate` class | Truncated shorter |
| Status badge | `InvoiceStatusBadge` component | Same |
| Confidence | Colored dot + label (High/Medium/Low) | Dot only, no label |

Confidence score colors:
- `high`: green dot + "High confidence"
- `medium`: amber dot + "Medium confidence"
- `low`: red dot + "Low confidence"
- `null`: hidden

## Edge Cases

### Extraction Not Complete (status: `uploading` | `extracting` | `error`)

Instead of the two-panel layout, render a full-width centered state via `ReviewProcessingState`:
- Wraps `ExtractionProgress` with adapted callbacks for the review page context
- `onRetry`: calls `POST /api/invoices/[id]/retry` (same as upload page)
- `onUploadAnother`: navigates to `/upload` (contextually different from upload page but still valid — user may want to try a different file)
- Subscribes to realtime status via `useInvoiceStatus` hook so the page updates live when extraction completes
- When status transitions to `pending_review`, the component triggers a page refresh (via `router.refresh()`) to load extracted data server-side

### Signed URL Failure

If `createSignedUrl` returns an error, show a centered error state: "Could not load document. The file may have been deleted." with a "Back to Invoices" link. Do not render the two-panel layout.

### No Extracted Data (status: `pending_review` but `getExtractedData` returns null)

Defensive edge case. Show a centered message: "No extraction data found. Please retry extraction." with a link back to the invoice list.

### Invoice Not Found

`redirect('/invoices')` — handled in the server component.

## Components Created / Modified

| File | Action | Purpose |
|------|--------|---------|
| `app/(dashboard)/invoices/[id]/review/page.tsx` | Rewrite | Server component: data fetching, guards, layout orchestration |
| `components/invoices/ReviewLayout.tsx` | New | Client component: two-panel shell, mobile tabs, header |
| `components/invoices/ReviewProcessingState.tsx` | New | Client component: wraps ExtractionProgress with realtime subscription for the review page |
| `components/invoices/PdfViewer.tsx` | Update stub | Accept `signedUrl` and `fileType` props, render placeholder UI |
| `components/invoices/ExtractionForm.tsx` | Update stub | Accept `extractedData` prop, render placeholder UI |

## Data Flow

```
page.tsx (server)
  ├── auth check (redirect if not authenticated — handled by dashboard layout)
  ├── fetch invoice row
  │   ├── not found → redirect('/invoices')
  │   ├── uploading/extracting/error → render ReviewProcessingState
  │   └── pending_review/approved/synced → continue
  ├── Promise.all([getExtractedData(), createSignedUrl()])
  │   ├── signed URL failed → render error state
  │   └── success → continue
  └── render ReviewLayout
        ├── Page header (back, filename, status badge, confidence)
        ├── Desktop: side-by-side
        │   ├── PdfViewer (placeholder)
        │   └── ExtractionForm (placeholder)
        └── Mobile: tab toggle
            ├── Tab: Document → PdfViewer (placeholder)
            └── Tab: Details → ExtractionForm (placeholder)
```

## Testing

### Server Component Tests (`review/page.test.tsx`)
- Renders review layout when invoice has extracted data
- Redirects to `/invoices` when invoice not found
- Shows processing state when status is `extracting`
- Shows processing state when status is `uploading`
- Handles null extracted data defensively
- Shows error state when signed URL generation fails
- Shows processing state when status is `error`

### ReviewLayout Tests (`ReviewLayout.test.tsx`)
- Desktop: renders both panels side by side
- Mobile: renders tab bar with Document/Details tabs
- Mobile: switching tabs shows correct panel
- Mobile: default tab is Document
- Displays file name in header
- Displays status badge
- Displays confidence indicator with correct color
- Truncates long file names

### ReviewProcessingState Tests (`ReviewProcessingState.test.tsx`)
- Renders ExtractionProgress with correct status
- Subscribes to realtime updates via useInvoiceStatus
