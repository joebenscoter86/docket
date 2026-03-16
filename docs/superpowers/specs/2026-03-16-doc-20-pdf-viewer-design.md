# DOC-20: PDF Viewer Component Design

## Overview

Build a document viewer for the left panel of the invoice review page. Renders PDFs using `react-pdf` (built on pdf.js) and images natively. Supports zoom, scroll, page indicators, and loading/error states.

## Component Structure

```
PdfViewer (entry point — branches on fileType)
├── ViewerToolbar (shared zoom controls + page indicator)
├── PdfDocumentView (application/pdf — react-pdf canvas rendering)
└── ImageDocumentView (image/jpeg, image/png — native <img> with CSS zoom)
```

All sub-components live in `components/invoices/PdfViewer.tsx` as a single file with `"use client"` directive (required for useState, useEffect, event handlers, IntersectionObserver). No reason to split until complexity demands it.

## Props

```typescript
interface PdfViewerProps {
  signedUrl: string;
  fileType: string; // "application/pdf" | "image/jpeg" | "image/png"
}
```

These are already passed by `ReviewLayout` from DOC-19.

## PDF Rendering (react-pdf)

- Library: `react-pdf` (wraps pdf.js)
- Worker setup:
  - Copy worker file via postinstall script: `"postinstall": "cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/"`
  - Configure at module scope in component: `pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'`
- next.config.js webpack config: exclude `canvas` and `encoding` modules that pdf.js tries to import in SSR:
  ```js
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  }
  ```
- Rendering mode: canvas (sharp at all zoom levels)
- Layout: continuous vertical scroll through all pages (not page-flip). Users reviewing invoices want to scan the entire document without clicking through pages.
- Each page rendered as a `<Page>` component at the current zoom scale
- Container uses `overflow-y-auto` to scroll within the constrained panel

## Image Rendering

- Render with native `<img>` tag
- Zoom via explicit `width`/`height` style properties (`naturalWidth * scale`, `naturalHeight * scale`). CSS `transform: scale()` doesn't affect layout flow so scrollable area wouldn't expand — using explicit dimensions ensures the overflow container scrolls correctly when zoomed in.
- Container uses `overflow: auto` for pan when zoomed in
- No additional libraries needed

## Toolbar

Position: sticky top of viewer panel, above the scrollable document area.

Controls:
- **Zoom out** (−) button: decrements by 25%
- **Zoom level** display: "100%" text
- **Zoom in** (+) button: increments by 25%
- **Page indicator** (PDF only): "Page 2 of 5"
- **Fit width** button: for MVP, resets zoom to 1.0 (100%). True fit-to-width (measuring container width vs page intrinsic width) adds complexity for minimal benefit on typical invoice PDFs.

Zoom range: 50% to 200%, default 100%, step 25%.

Keyboard zoom: Ctrl/Cmd + scroll wheel adjusts zoom level.

Styling: `bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between` — consistent with app design tokens.

## State Management

All state is local to the component (useState):

```typescript
scale: number          // 0.5 to 2.0, default 1.0
numPages: number       // total pages (PDF only), set on document load
currentPage: number    // tracked via IntersectionObserver on page elements
loadingState: 'loading' | 'loaded' | 'error'
```

No global state, no context, no external store.

## Loading State

- Centered skeleton: pulsing document icon + "Loading document..." text
- Shown while react-pdf downloads and parses the PDF, or while the image loads
- Uses `animate-pulse` Tailwind class for the skeleton effect

## Error State

- Centered error display: red document icon + "Unable to load document" + description text
- "Try again" button that triggers a full page reload (to get a fresh signed URL from the server component)
- Reason: signed URLs expire after 1 hour. A client-side retry can't regenerate the URL since the server component owns that logic. A page reload is the simplest correct approach for MVP.

## Current Page Tracking (PDF)

Use `IntersectionObserver` on each rendered `<Page>` element with threshold array `[0, 0.25, 0.5, 0.75, 1.0]` to get granular visibility updates. Track each page's current intersection ratio in a ref map. The page with the highest ratio is the "current" page. This gives accurate tracking during continuous scroll without complex scroll math.

## Dependencies

- `react-pdf` — PDF rendering (wraps pdf.js)
- `pdfjs-dist` — peer dependency of react-pdf (provides the worker)

No other dependencies needed.

## Testing Strategy

Test file: `components/invoices/PdfViewer.test.tsx`

- Mock `react-pdf` Document and Page components (don't load real pdf.js in tests)
- Test: PDF mode renders Document + Page components with correct props
- Test: image mode renders `<img>` with correct src
- Test: zoom controls increment/decrement scale within bounds
- Test: zoom doesn't exceed 200% or go below 50%
- Test: loading state shows skeleton
- Test: error state shows error message and retry button
- Test: page indicator shows correct "Page X of Y" for PDFs
- Test: page indicator hidden for images
- Test: toolbar renders zoom controls

## File Changes

| File | Change |
|------|--------|
| `components/invoices/PdfViewer.tsx` | Replace placeholder with full implementation |
| `components/invoices/PdfViewer.test.tsx` | New test file |
| `package.json` | Add `react-pdf` + `pdfjs-dist` |
| `next.config.js` | Add webpack config for pdf.js worker (canvas/node exclusions) |
| `public/pdf.worker.min.mjs` | Copied from pdfjs-dist (via postinstall) |

## Edge Cases

- **Expired signed URL**: Error state with page reload retry (gets fresh URL from server)
- **Zero-page PDF**: Show error state "Unable to load document"
- **Very large PDF (50+ pages)**: All pages render but performance may degrade. Acceptable for MVP (invoices are typically 1-5 pages). Virtualization deferred.
- **Corrupt PDF**: react-pdf fires onLoadError — caught and shown as error state
- **Network failure mid-load**: Same error handling path
