# DOC-25: Invoice List View — Design Spec

## Overview

The invoices page (`/app/invoices`) is the default landing page after login. It shows all invoices for the user's org with status, extracted data summary, and quick navigation to the review page. Server-rendered with URL-based state for filters, sort, and pagination.

## Architecture Decision

**Server-side rendering with URL search params (Approach A).** Filter, sort, and cursor live in the URL. Clicking a filter tab or sort option updates the URL, triggering a server re-render. This is the simplest pattern at MVP scale (<100 invoices/month). Upgrade to hybrid (server initial load + client-side subsequent fetches) when filter latency exceeds 200ms or invoice volume exceeds ~500/org. Logged in CLAUDE.md decisions.

## Data Fetching

The page server component queries Supabase directly using the server client — no fetch to an API route. The `GET /api/invoices` route exists as a thin wrapper over the same query logic (shared via `lib/invoices/queries.ts`) for future client-side use when upgrading to hybrid approach. Both paths use the same query parameters and return the same shape.

### Query Parameters

| Param | Type | Default | Values |
|-------|------|---------|--------|
| `status` | string | `all` | `all`, `pending_review`, `approved`, `synced`, `error` |
| `sort` | string | `uploaded_at` | `uploaded_at`, `invoice_date`, `vendor_name`, `total_amount` |
| `direction` | string | `desc` | `asc`, `desc` |
| `cursor` | string | — | Opaque cursor token (base64-encoded JSON of sort value + ID) |
| `limit` | number | 25 | 1–100 |

### Response Shape

```json
{
  "data": {
    "invoices": [
      {
        "id": "uuid",
        "file_name": "invoice-001.pdf",
        "status": "pending_review",
        "uploaded_at": "2026-03-16T12:00:00Z",
        "extracted_data": {
          "vendor_name": "Acme Corp",
          "invoice_number": "INV-001",
          "invoice_date": "2026-03-10",
          "total_amount": 1250.00
        }
      }
    ],
    "nextCursor": "base64-encoded-string-or-null",
    "counts": {
      "all": 47,
      "pending_review": 3,
      "approved": 12,
      "synced": 30,
      "error": 2
    }
  }
}
```

### Query Strategy

1. **Main query:** Left join `invoices` + `extracted_data` on `invoice_id`. Filtered by org (RLS), optional status filter. Ordered by sort param. Fetches `limit + 1` rows to detect next page.

2. **Cursor pagination:** The cursor is a base64-encoded JSON object containing the sort column value and the invoice ID of the last row: `{ sortValue: "2026-03-10", id: "uuid" }`. This supports stable pagination on any sort column, including nullable joined fields. The query uses `WHERE (sort_column, id) < (cursor_sort_value, cursor_id)` with appropriate NULL handling. When sort column is nullable, NULLs sort last (NULLS LAST for desc, NULLS FIRST for asc), and the cursor encodes null explicitly.

3. **Counts query:** `SELECT status, count(*) FROM invoices GROUP BY status` (RLS scopes to org). Returns counts for all statuses including `uploading` and `extracting`. The `all` count is computed as `COUNT(*)` separately (not a sum of visible tabs) to correctly include transient statuses.

4. **Sort on joined fields:** `vendor_name`, `invoice_date`, and `total_amount` come from `extracted_data`. Invoices without extracted data sort last.

### Shared Query Logic: `lib/invoices/queries.ts`

Exports `fetchInvoiceList(params)` and `fetchInvoiceCounts(supabase)`. Used by both the server component and the API route. Keeps query logic in one place for the hybrid upgrade path.

### Auth & Ownership

- Supabase server client with user session (RLS handles org scoping)
- Validate sort/status params against allowlists (prevent injection)
- Clamp limit to 1–100

## Page: `/app/(dashboard)/invoices/page.tsx`

Server component. Reads `searchParams`, calls shared query functions, passes data to `InvoiceList` client component.

**Loading state:** A `loading.tsx` sibling file provides a skeleton UI (pulsing table rows) shown during server-side data fetching via Next.js Suspense.

## Components

### `InvoiceList` (client component)

Top-level list component. Receives: `invoices`, `counts`, `nextCursor`, `currentStatus`, `currentSort`, `currentDirection`.

#### Filter Tabs

Horizontal tab row at the top:
- **All** (47) | **Pending Review** (3) | **Approved** (12) | **Synced** (30) | **Error** (2)
- Each tab shows its count in parentheses
- **Pending Review tab gets an accent badge** (blue-600 background, white text) when count > 0 to draw attention
- Active tab has bottom border accent + bold text
- Clicking a tab updates `?status=` in URL via `useRouter().push()`, resets cursor
- `uploading` and `extracting` statuses are excluded from filter tabs — these are transient states; they appear in "All"
- The `all` count includes all statuses (uploading, extracting, etc.)

#### Sort Controls

- Dropdown above the table: "Sort by: Uploaded Date / Invoice Date / Vendor / Amount"
- Toggle direction (asc/desc) via a chevron button next to the dropdown
- Updates `?sort=` and `?direction=` in URL, resets cursor

#### Desktop Table (md and up)

| Column | Source | Notes |
|--------|--------|-------|
| File Name | `invoice.file_name` | Truncate long names with ellipsis |
| Vendor | `extracted_data.vendor_name` | Show "Pending" in muted text if null |
| Invoice # | `extracted_data.invoice_number` | Show "—" if null |
| Invoice Date | `extracted_data.invoice_date` | Format as locale date, "—" if null |
| Amount | `extracted_data.total_amount` | Format as currency, "—" if null |
| Status | `invoice.status` | Uses `InvoiceStatusBadge` component |
| Uploaded | `invoice.uploaded_at` | Relative time ("2 hours ago") |

- Row navigation: each row wraps content in a Next.js `<Link>` to `/invoices/[id]/review` for proper keyboard navigation and screen reader support
- Hover state: `bg-gray-50`
- Header row with column labels, muted text

#### Mobile Cards (below md)

Each invoice rendered as a card:
- Top line: file name (truncated) + status badge
- Second line: vendor name (or "Pending") + invoice number
- Third line: amount + uploaded date
- Card wraps in `<Link>` to review page
- Stack layout with `space-y-3`

#### Empty States

1. **No invoices at all** (counts.all === 0): "No invoices yet. Upload your first invoice to get started." + Button linking to `/upload`
2. **Filter returns nothing** (invoices.length === 0 but counts.all > 0): "No invoices match this filter."

#### Pagination

- **Next / Previous page navigation** (not "load more" — server re-render replaces content, not appends)
- "Next page" button when `nextCursor` is not null. Sets `?cursor=` in URL.
- "Previous page" button when a cursor is present in current URL (navigating back removes cursor to return to first page). For MVP, "Previous" returns to page 1 only — full backward cursoring is deferred.
- Show "Page N" indicator and total count from `counts`
- When upgrading to hybrid (Approach C), this becomes client-side append with "Load more"

### Types

```typescript
type InvoiceListItem = {
  id: string
  file_name: string
  status: 'uploading' | 'extracting' | 'pending_review' | 'approved' | 'synced' | 'error'
  uploaded_at: string
  extracted_data: {
    vendor_name: string | null
    invoice_number: string | null
    invoice_date: string | null
    total_amount: number | null
  } | null
}

type InvoiceListCounts = {
  all: number
  pending_review: number
  approved: number
  synced: number
  error: number
}
```

## Error Handling

- **Supabase query failure:** Show error state with "Failed to load invoices. Please try again." + retry link (reloads page)
- **Invalid search params:** Silently fall back to defaults (status=all, sort=uploaded_at, direction=desc, limit=25). Don't error on bad input.
- **Invalid cursor:** If cursor decoding fails, ignore it and return first page.

## Testing Plan

- **Query function tests:** Happy path (returns invoices with extracted data), empty org, status filter, sort options, cursor pagination (correct next page, null handling), invalid params fall back to defaults
- **API route tests:** Delegates to query functions, auth failure returns 401
- **Component tests:** Renders table rows from data, shows empty states, filter tabs display counts and update URL, mobile card layout renders, pagination buttons appear/hide correctly, "Pending Review" badge highlighted when count > 0, invoice number column displays
- **Edge cases:** Invoice with no extracted_data shows "Pending"/"—", very long file names truncate, zero counts, cursor with null sort value

## Files to Create/Modify

| File | Action |
|------|--------|
| `lib/invoices/queries.ts` | New — shared query logic for invoice list + counts |
| `app/(dashboard)/invoices/page.tsx` | Replace stub with server component |
| `app/(dashboard)/invoices/loading.tsx` | New — skeleton loading state |
| `app/api/invoices/route.ts` | Replace stub, delegates to shared queries |
| `components/invoices/InvoiceList.tsx` | Replace stub with full component |
| `lib/invoices/types.ts` | New — `InvoiceListItem` and `InvoiceListCounts` types (co-located with queries) |
| `lib/utils/date.ts` | New — relative time formatter |
| Tests for queries, API route, and components | New files |
