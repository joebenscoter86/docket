# Invoice Sorting Fix + Date Filter

## Context

Sorting on the invoice list page is broken. When sorting by vendor name, invoice date, or total amount, the list order doesn't change. The root cause is that Supabase's `.order()` with `referencedTable` sorts nested `extracted_data` rows within each invoice -- it does not sort the parent invoice rows. Only `uploaded_at` (on the `invoices` table itself) sorts correctly.

Additionally, there is no date range filtering. Users need to filter invoices by time period using either upload date or invoice date, with presets (Today, This Week, This Month) and custom date ranges.

## Sorting Fix

### Problem

`fetchInvoiceList` in `lib/invoices/queries.ts` uses:

```ts
query.order(sortConfig.column, {
  referencedTable: "extracted_data",  // This sorts nested rows, not parent rows
});
```

This is a PostgREST limitation -- `referencedTable` ordering applies within the join, not to the result set.

### Solution: Database View

Create a Postgres view `invoice_list_view` that flattens `invoices` + `extracted_data` into a single queryable surface:

```sql
CREATE OR REPLACE VIEW invoice_list_view AS
SELECT
  i.id,
  i.org_id,
  i.file_name,
  i.status,
  i.uploaded_at,
  i.output_type,
  i.batch_id,
  i.source,
  i.email_sender,
  ed.vendor_name,
  ed.invoice_number,
  ed.invoice_date,
  ed.total_amount
FROM invoices i
LEFT JOIN extracted_data ed ON ed.invoice_id = i.id;
```

- RLS: Views inherit RLS from underlying tables. Since `invoices` has RLS via `org_id`, the view respects it automatically.
- `fetchInvoiceList` switches from `supabase.from("invoices").select(...)` to `supabase.from("invoice_list_view").select(...)`.
- All sort columns become top-level, so `.order(column)` works correctly without `referencedTable`.
- The `extracted_data` nested object is no longer needed in the select -- all fields are flat.

### Cursor Pagination Fix

Current cursor pagination always keys on `(uploaded_at, id)`. This must change to key on `(active_sort_column, id)` so pagination is consistent with the sort order.

When sort is `vendor_name`, cursor encodes `(vendor_name_value, id)`. When sort is `total_amount`, cursor encodes `(total_amount_value, id)`. The `.or()` filter in cursor logic uses the active sort column.

## Date Filter

### URL Parameters

| Param | Values | Default |
|-------|--------|---------|
| `date_field` | `uploaded_at`, `invoice_date` | `uploaded_at` |
| `date_preset` | `today`, `week`, `month` | (none) |
| `date_from` | `YYYY-MM-DD` | (none) |
| `date_to` | `YYYY-MM-DD` | (none) |

Rules:
- `date_preset` and `date_from`/`date_to` are mutually exclusive. If `date_preset` is set, `date_from`/`date_to` are ignored.
- Presets are resolved server-side in `validateListParams` to concrete date ranges.
- When no date params are present, no date filter is applied (show all dates).

### Preset Resolution

All presets use the server's current date (UTC):

| Preset | From | To |
|--------|------|----|
| `today` | Start of today | End of today |
| `week` | Start of this week (Monday) | End of today |
| `month` | Start of this month (1st) | End of today |

### Query Layer

After resolving presets to `date_from`/`date_to`, `fetchInvoiceList` adds:

```ts
if (date_from) query = query.gte(date_field, date_from);
if (date_to) query = query.lte(date_field, date_to + "T23:59:59.999Z");
```

Since `uploaded_at` is a `timestamptz` and `invoice_date` is a `date`, the comparison works for both -- Postgres handles date-to-timestamp comparison.

### UI

A new filter row below the existing type filter chips:

```
[Upload Date v] [Invoice Date]    [Today] [This Week] [This Month] [Custom]
```

- **Date field toggle**: Two buttons, one active at a time. Defaults to "Upload Date".
- **Preset buttons**: Pill-shaped, same style as type filter chips. Clicking one sets `date_preset` in the URL and clears any custom range.
- **Custom**: Clicking "Custom" reveals two date inputs (From / To) inline. Setting dates adds `date_from`/`date_to` to URL and clears `date_preset`.
- **Clear**: When any date filter is active, show a small "x" or "Clear" link to remove all date params.

The date filter row is part of the `InvoiceList` component (client component), consistent with existing filter/sort controls.

## Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/YYYYMMDD_invoice_list_view.sql` | New: create `invoice_list_view` |
| `lib/invoices/queries.ts` | Switch to view, fix sort, add date filter logic |
| `lib/invoices/types.ts` | Add date filter params to `InvoiceListParams`, add `VALID_DATE_FIELDS`, `VALID_DATE_PRESETS` |
| `components/invoices/InvoiceList.tsx` | Add date filter UI row, update sort to use flat fields |
| `app/(dashboard)/invoices/page.tsx` | Pass new date params through |
| `app/api/invoices/route.ts` | Pass new date params through |

## Verification

1. Sort by each option (Uploaded Date, Invoice Date, Vendor, Amount) in both asc/desc -- confirm order changes visibly
2. Paginate while sorted by vendor name -- confirm page 2 continues correctly
3. Apply "Today" preset on upload date -- confirm only today's uploads show
4. Switch to "Invoice Date" and apply "This Month" -- confirm filtering by invoice_date
5. Use custom date range -- confirm from/to boundaries work
6. Clear date filter -- confirm all invoices return
7. Combine date filter with status tab and output type chip -- confirm all filters compose
8. `npm run lint && npx tsc --noEmit && npm run test && npm run build` all pass
