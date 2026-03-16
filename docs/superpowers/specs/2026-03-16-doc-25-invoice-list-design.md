# DOC-25: Invoice List View — Design Spec

## Overview

The invoices page (`/app/invoices`) is the default landing page after login. It shows all invoices for the user's org with status, extracted data summary, and quick navigation to the review page. Server-rendered with URL-based state for filters, sort, and pagination.

## Architecture Decision

**Server-side rendering with URL search params (Approach A).** Filter, sort, and cursor live in the URL. Clicking a filter tab or sort option updates the URL, triggering a server re-render. This is the simplest pattern at MVP scale (<100 invoices/month). Upgrade to hybrid (server initial load + client-side subsequent fetches) when filter latency exceeds 200ms or invoice volume exceeds ~500/org. Logged in CLAUDE.md decisions.

## API Route: `GET /api/invoices`

### Query Parameters

| Param | Type | Default | Values |
|-------|------|---------|--------|
| `status` | string | `all` | `all`, `pending_review`, `approved`, `synced`, `error` |
| `sort` | string | `uploaded_at` | `uploaded_at`, `invoice_date`, `vendor_name`, `total_amount` |
| `direction` | string | `desc` | `asc`, `desc` |
| `cursor` | string (UUID) | — | ID of last invoice from previous page |
| `limit` | number | 20 | 1–100 |

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
          "invoice_date": "2026-03-10",
          "total_amount": 1250.00
        }
      }
    ],
    "nextCursor": "uuid-or-null",
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

1. **Main query:** Left join `invoices` + `extracted_data` on `invoice_id`. Filtered by org (RLS), optional status filter. Ordered by sort param. Uses cursor-based pagination: `WHERE (sort_column, id) < (cursor_sort_value, cursor_id)` for stable ordering. Fetches `limit + 1` rows to detect next page.

2. **Counts query:** `SELECT status, count(*) FROM invoices WHERE org_id = ? GROUP BY status`. Single query, no join needed. Returns all status counts in one call. The `all` count is the sum.

3. **Sort on joined fields:** `vendor_name`, `invoice_date`, and `total_amount` come from `extracted_data`. Invoices without extracted data sort last (NULLS LAST for desc, NULLS FIRST for asc).

### Auth & Ownership

- Supabase server client with user session (RLS handles org scoping)
- Validate sort/status params against allowlists (prevent injection)
- Clamp limit to 1–100

## Page: `/app/(dashboard)/invoices/page.tsx`

Server component. Reads `searchParams`, queries Supabase directly (no fetch to own API route — server components can query DB directly). Passes data to `InvoiceList` client component.

Also fetches counts for filter tab badges.

## Components

### `InvoiceList` (client component)

Top-level list component. Receives: `invoices`, `counts`, `nextCursor`, `currentStatus`, `currentSort`, `currentDirection`.

#### Filter Tabs

Horizontal tab row at the top:
- **All** (47) | **Pending Review** (3) | **Approved** (12) | **Synced** (30) | **Error** (2)
- Each tab shows its count in parentheses
- **Pending Review tab gets an accent badge** (blue-600 background, white text) when count > 0 to draw attention
- Active tab has bottom border accent + bold text
- Clicking a tab updates `?status=` in URL via `useRouter().push()`
- `uploading` and `extracting` statuses are excluded from filters — these are transient states users don't need to filter by; they appear in "All"

#### Sort Controls

- Dropdown above the table: "Sort by: Uploaded Date / Invoice Date / Vendor / Amount"
- Toggle direction (asc/desc) via a chevron button next to the dropdown
- Updates `?sort=` and `?direction=` in URL

#### Desktop Table (md and up)

| Column | Source | Notes |
|--------|--------|-------|
| File Name | `invoice.file_name` | Truncate long names with ellipsis |
| Vendor | `extracted_data.vendor_name` | Show "Pending" in muted text if null |
| Invoice Date | `extracted_data.invoice_date` | Format as locale date, "—" if null |
| Amount | `extracted_data.total_amount` | Format as currency, "—" if null |
| Status | `invoice.status` | Uses `InvoiceStatusBadge` component |
| Uploaded | `invoice.uploaded_at` | Relative time ("2 hours ago") |

- Entire row is clickable → `router.push(/invoices/[id]/review)`
- Hover state: `bg-gray-50`
- Header row with column labels, muted text

#### Mobile Cards (below md)

Each invoice rendered as a card:
- Top line: file name (truncated) + status badge
- Second line: vendor name (or "Pending")
- Third line: amount + uploaded date
- Card is clickable → navigates to review
- Stack layout with `space-y-3`

#### Empty States

1. **No invoices at all** (counts.all === 0): "No invoices yet. Upload your first invoice to get started." + Button linking to `/upload`
2. **Filter returns nothing** (invoices.length === 0 but counts.all > 0): "No invoices match this filter."

#### Pagination

- "Load more" button at bottom when `nextCursor` is not null
- Clicking appends `?cursor=` to URL
- **Note:** Since this is server-rendered, "Load more" will re-render the page showing the next page of results. This is intentional for Approach A simplicity. If we upgrade to hybrid (Approach C), this becomes client-side append.
- Show "Showing X of Y invoices" using the relevant count from `counts`

### Types

```typescript
type InvoiceListItem = {
  id: string
  file_name: string
  status: 'uploading' | 'extracting' | 'pending_review' | 'approved' | 'synced' | 'error'
  uploaded_at: string
  extracted_data: {
    vendor_name: string | null
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
- **Invalid search params:** Silently fall back to defaults (status=all, sort=uploaded_at, direction=desc, limit=20). Don't error on bad input.

## Testing Plan

- **API route tests:** Happy path (returns invoices with extracted data), empty org, status filter, sort options, cursor pagination (correct next page), invalid params fall back to defaults, auth failure returns 401
- **Component tests:** Renders table rows from data, shows empty states, filter tabs update URL, mobile card layout renders, pagination button appears when nextCursor present, "Pending Review" badge highlighted when count > 0
- **Edge cases:** Invoice with no extracted_data shows "Pending"/"—", very long file names truncate, zero counts hide badge number styling

## Files to Create/Modify

| File | Action |
|------|--------|
| `app/(dashboard)/invoices/page.tsx` | Replace stub with server component |
| `app/api/invoices/route.ts` | Replace stub with full implementation |
| `components/invoices/InvoiceList.tsx` | Replace stub with full component |
| `lib/types/invoice.ts` | Add `InvoiceListItem` and `InvoiceListCounts` types |
| `lib/utils/date.ts` | Add relative time formatter (new file) |
| Tests for API route and components | New files |
