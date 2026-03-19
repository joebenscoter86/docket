# DOC-85: Transaction Type Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show transaction type labels on synced invoices, add a type filter to the invoice list, and make SyncStatusPanel messages type-aware.

**Architecture:** Display-only changes across 6 files. Add `output_type` to the invoice list data pipeline (types → query → server page → client component). Update SyncStatusPanel to use existing `TRANSACTION_TYPE_SHORT_LABELS` and `SYNC_SUCCESS_MESSAGES` constants. Expand sync log API response with two new columns.

**Tech Stack:** Next.js 14 (App Router), Supabase, TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-19-doc-85-transaction-type-display-design.md`

---

### Task 1: Add `output_type` to invoice list types

**Files:**
- Modify: `lib/invoices/types.ts:1-44`

- [ ] **Step 1: Update InvoiceListItem interface**

Add `output_type` to the interface, after `uploaded_at`:

```typescript
// lib/invoices/types.ts, line 3-14 — add output_type field
export interface InvoiceListItem {
  id: string;
  file_name: string;
  status: InvoiceStatus;
  uploaded_at: string;
  output_type: OutputType | null;  // ← NEW
  extracted_data: {
    vendor_name: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
    total_amount: number | null;
  } | null;
}
```

Add the import at line 1:

```typescript
import { InvoiceStatus, OutputType } from "@/lib/types/invoice";
```

- [ ] **Step 2: Add `output_type` to InvoiceListParams**

```typescript
// lib/invoices/types.ts, line 24-30 — add output_type field
export interface InvoiceListParams {
  status?: string;
  sort?: string;
  direction?: string;
  cursor?: string;
  limit?: number;
  output_type?: string;  // ← NEW
}
```

- [ ] **Step 3: Add VALID_OUTPUT_TYPES allowlist**

After `VALID_DIRECTIONS` (line 41):

```typescript
export const VALID_OUTPUT_TYPES = ["bill", "check", "cash", "credit_card"] as const;
```

- [ ] **Step 4: Commit**

```bash
git add lib/invoices/types.ts
git commit -m "feat: add output_type to invoice list types (DOC-85)"
```

---

### Task 2: Add `output_type` filter to queries

**Files:**
- Modify: `lib/invoices/queries.ts:1-252`

- [ ] **Step 1: Import VALID_OUTPUT_TYPES**

Update the import from `./types` (line 2-11) to include `VALID_OUTPUT_TYPES`:

```typescript
import {
  InvoiceListItem,
  InvoiceListCounts,
  InvoiceListParams,
  VALID_STATUSES,
  VALID_SORTS,
  VALID_DIRECTIONS,
  VALID_OUTPUT_TYPES,  // ← NEW
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from "./types";
```

- [ ] **Step 2: Add output_type validation to validateListParams**

In `validateListParams` (after direction validation, around line 80), add:

```typescript
  // Validate output_type
  const output_type =
    params.output_type &&
    VALID_OUTPUT_TYPES.includes(params.output_type as (typeof VALID_OUTPUT_TYPES)[number])
      ? (params.output_type as (typeof VALID_OUTPUT_TYPES)[number])
      : "all";
```

Add `output_type` to the return object (line 86-92):

```typescript
  return {
    status,
    sort,
    direction,
    cursor: params.cursor,
    limit,
    output_type,  // ← NEW
  };
```

- [ ] **Step 3: Add output_type to select query and filter in fetchInvoiceList**

Update the `ValidatedParams` interface (line 140-146):

```typescript
interface ValidatedParams {
  status: string;
  sort: string;
  direction: string;
  cursor?: string;
  limit: number;
  output_type: string;  // ← NEW
}
```

Add `output_type` to the select columns (line 155-166) — add it after `uploaded_at`:

```typescript
  let query = supabase.from("invoices").select(`
      id,
      file_name,
      status,
      uploaded_at,
      output_type,
      extracted_data (
        vendor_name,
        invoice_number,
        invoice_date,
        total_amount
      )
    `);
```

Update the destructuring at line 152 to include `output_type`:

```typescript
  const { status, sort, direction, cursor, limit, output_type } = params;
```

Add the output_type filter after the status filter (after line 171):

```typescript
  // Output type filter
  if (output_type !== "all") {
    query = query.eq("output_type", output_type);
  }
```

Update the row mapping (line 219-239) to include `output_type`:

```typescript
      return {
        id: row.id as string,
        file_name: row.file_name as string,
        status: row.status as InvoiceListItem["status"],
        uploaded_at: row.uploaded_at as string,
        output_type: (row.output_type as InvoiceListItem["output_type"]) ?? null,  // ← NEW
        extracted_data: extracted
          ? {
              vendor_name: (extracted as Record<string, unknown>).vendor_name as string | null,
              invoice_number: (extracted as Record<string, unknown>).invoice_number as string | null,
              invoice_date: (extracted as Record<string, unknown>).invoice_date as string | null,
              total_amount: (extracted as Record<string, unknown>).total_amount as number | null,
            }
          : null,
      };
```

- [ ] **Step 4: Commit**

```bash
git add lib/invoices/queries.ts
git commit -m "feat: add output_type filter to invoice list query (DOC-85)"
```

---

### Task 3: Pass output_type through the server page

**Files:**
- Modify: `app/(dashboard)/invoices/page.tsx:1-73`

- [ ] **Step 1: Add output_type to searchParams type**

Update `InvoicesPageProps` (line 8-16):

```typescript
interface InvoicesPageProps {
  searchParams: Promise<{
    status?: string;
    sort?: string;
    direction?: string;
    cursor?: string;
    limit?: string;
    output_type?: string;  // ← NEW
  }>;
}
```

- [ ] **Step 2: Pass output_type to validateListParams**

Update the params object (line 27-33):

```typescript
  const params = validateListParams({
    status: resolvedParams.status,
    sort: resolvedParams.sort,
    direction: resolvedParams.direction,
    cursor: resolvedParams.cursor,
    limit: resolvedParams.limit ? Number(resolvedParams.limit) : undefined,
    output_type: resolvedParams.output_type,  // ← NEW
  });
```

- [ ] **Step 3: Pass currentOutputType to InvoiceList**

Add the prop to the `<InvoiceList>` component (line 62-70):

```tsx
      <InvoiceList
        invoices={listResult.invoices}
        counts={counts}
        nextCursor={listResult.nextCursor}
        currentStatus={params.status}
        currentSort={params.sort}
        currentDirection={params.direction}
        currentOutputType={params.output_type}  // ← NEW
        hasCursor={!!resolvedParams.cursor}
      />
```

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/invoices/page.tsx"
git commit -m "feat: pass output_type filter through invoices page (DOC-85)"
```

---

### Task 4: Add type label and filter chips to InvoiceList

**Files:**
- Modify: `components/invoices/InvoiceList.tsx:1-292`

- [ ] **Step 1: Add imports and props**

Add import at top of file:

```typescript
import { TRANSACTION_TYPE_SHORT_LABELS, OutputType } from "@/lib/types/invoice";
```

Add `currentOutputType` to the props interface (line 11-19):

```typescript
interface InvoiceListProps {
  invoices: InvoiceListItem[];
  counts: InvoiceListCounts;
  nextCursor: string | null;
  currentStatus: string;
  currentSort: string;
  currentDirection: string;
  currentOutputType: string;  // ← NEW
  hasCursor: boolean;
}
```

Add it to the destructured props (line 65-73):

```typescript
export default function InvoiceList({
  invoices,
  counts,
  nextCursor,
  currentStatus,
  currentSort,
  currentDirection,
  currentOutputType,  // ← NEW
  hasCursor,
}: InvoiceListProps) {
```

- [ ] **Step 2: Add type filter chip constants**

After `SORT_OPTIONS` (line 34), add:

```typescript
const TYPE_FILTER_CHIPS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "bill", label: "Bill" },
  { key: "check", label: "Check" },
  { key: "cash", label: "Expense" },
  { key: "credit_card", label: "Credit Card" },
];
```

- [ ] **Step 3: Add type filter chip row to JSX**

After the status filter tabs `</div>` (after line 135), insert the type filter row:

```tsx
      {/* Type Filter Chips */}
      <div className="flex gap-2 mb-6">
        {TYPE_FILTER_CHIPS.map((chip) => {
          const isActive = currentOutputType === chip.key;
          return (
            <Link
              key={chip.key}
              href={buildUrl(pathname, searchParams, {
                output_type: chip.key === "all" ? undefined : chip.key,
                cursor: undefined,
              })}
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 ease-in-out ${
                isActive
                  ? "bg-primary text-white shadow-soft"
                  : "bg-surface text-text border border-border hover:border-primary/30"
              }`}
            >
              {chip.label}
            </Link>
          );
        })}
      </div>
```

- [ ] **Step 4: Add type label to desktop table status column**

In the desktop table, update the Status `<td>` (line 214-216):

```tsx
                    <td className="py-3.5 px-3">
                      <span className="inline-flex items-center gap-2">
                        <InvoiceStatusBadge status={invoice.status} />
                        {invoice.status === "synced" && invoice.output_type && (
                          <span className="text-xs text-muted">
                            {TRANSACTION_TYPE_SHORT_LABELS[invoice.output_type as OutputType]}
                          </span>
                        )}
                      </span>
                    </td>
```

- [ ] **Step 5: Add type label to mobile card**

In the mobile card, update the status badge area (line 238):

```tsx
                  <span className="inline-flex items-center gap-2">
                    <InvoiceStatusBadge status={invoice.status} />
                    {invoice.status === "synced" && invoice.output_type && (
                      <span className="text-xs text-muted">
                        {TRANSACTION_TYPE_SHORT_LABELS[invoice.output_type as OutputType]}
                      </span>
                    )}
                  </span>
```

- [ ] **Step 6: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add components/invoices/InvoiceList.tsx
git commit -m "feat: add transaction type label and filter chips to invoice list (DOC-85)"
```

---

### Task 5: Expand sync log API response

**Files:**
- Modify: `app/api/invoices/[id]/sync/log/route.ts:46-49`

- [ ] **Step 1: Add new columns to select**

Update the select query (line 48):

```typescript
      .select("id, provider, provider_bill_id, status, synced_at, provider_response, transaction_type, provider_entity_type")
```

- [ ] **Step 2: Commit**

```bash
git add "app/api/invoices/[id]/sync/log/route.ts"
git commit -m "feat: include transaction_type in sync log API response (DOC-85)"
```

---

### Task 6: Make SyncStatusPanel type-aware

**Files:**
- Modify: `components/invoices/SyncStatusPanel.tsx:1-212`

- [ ] **Step 1: Add imports and update SyncLogEntry**

Add import at top:

```typescript
import { TransactionType, SYNC_SUCCESS_MESSAGES, TRANSACTION_TYPE_SHORT_LABELS } from "@/lib/types/invoice";
```

Update `SyncLogEntry` interface (line 5-12) to add optional fields:

```typescript
interface SyncLogEntry {
  id: string;
  provider: string;
  provider_bill_id: string | null;
  status: "success" | "failed" | "retrying";
  synced_at: string;
  provider_response: Record<string, unknown> | null;
  transaction_type: TransactionType | null;        // ← NEW
  provider_entity_type: string | null;              // ← NEW
}
```

- [ ] **Step 2: Add helper functions for type-aware messages**

After `getErrorMessage` (after line 36), add:

```typescript
function getSuccessMessage(entry: SyncLogEntry): string {
  if (entry.transaction_type) {
    return SYNC_SUCCESS_MESSAGES[entry.transaction_type];
  }
  return "Synced to QuickBooks";
}

function getFailureMessage(entry: SyncLogEntry): string {
  const typeLabel = entry.transaction_type
    ? TRANSACTION_TYPE_SHORT_LABELS[entry.transaction_type]
    : "Sync";
  return `${typeLabel} creation failed`;
}

function getEntityLabel(entry: SyncLogEntry): string {
  if (entry.transaction_type) {
    return TRANSACTION_TYPE_SHORT_LABELS[entry.transaction_type];
  }
  return "Bill";
}
```

- [ ] **Step 3: Update latest sync attempt display**

Replace the success message text (line 120-122):

```tsx
                {latestLog.status === "success"
                  ? getSuccessMessage(latestLog)
                  : getFailureMessage(latestLog)}
```

Replace the Bill ID line (line 129-133):

```tsx
            {latestLog.status === "success" && latestLog.provider_bill_id && (
              <p className="text-sm text-accent mt-1">
                {getEntityLabel(latestLog)} ID: <span className="font-mono">{latestLog.provider_bill_id}</span>
              </p>
            )}
```

- [ ] **Step 4: Update expanded history entries**

Replace the `provider_bill_id` display in the expanded history (line 188-192):

```tsx
                      {log.provider_bill_id && (
                        <span className="text-muted font-mono text-xs">
                          {getEntityLabel(log)} {log.provider_bill_id}
                        </span>
                      )}
```

- [ ] **Step 5: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add components/invoices/SyncStatusPanel.tsx
git commit -m "feat: type-aware sync status messages in SyncStatusPanel (DOC-85)"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: Zero warnings, zero errors

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Run tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 5: Push branch and create PR**

```bash
git push -u origin HEAD
gh pr create --title "feat: transaction type display in invoice list + sync status (DOC-85)" --body "$(cat <<'EOF'
## Summary
- Synced invoices show transaction type label (Bill/Check/Expense/CC) next to status badge
- Transaction type filter chips added below status tabs
- SyncStatusPanel messages are type-aware (success + error + history)
- Sync log API includes transaction_type and provider_entity_type

## Test plan
- [ ] Verify synced invoices show correct type label
- [ ] Verify label only appears for synced status
- [ ] Verify filter chips filter by output_type
- [ ] Verify type + status filters compose correctly
- [ ] Verify SyncStatusPanel shows type-specific messages
- [ ] Verify backward compat for old sync logs without transaction_type

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
