# GL Account Suggestions — Design Spec

## Problem

When reviewing an extracted invoice, the user must manually select a GL (expense) account from a dropdown for every line item before syncing to QuickBooks. For invoices with 5-10+ line items, this is tedious and repetitive — especially since small businesses typically receive invoices from the same vendors with similar line items month after month.

New users face the worst experience: zero history, zero suggestions, pure manual selection. This friction risks churn before the user sees the product's value.

## Solution

A two-layer suggestion system that pre-fills GL account dropdowns:

1. **AI-Inferred suggestions (DOC-78):** During extraction, pass the user's QBO chart of accounts to Claude alongside the invoice. Claude returns a suggested GL account for each line item. Works from invoice #1 with zero history.

2. **History-based suggestions (DOC-79):** Record which GL accounts the user assigns to line items, keyed by vendor + description. On future invoices from the same vendor, look up historical mappings first. Higher confidence than AI guesses.

**Priority order at suggestion time:**
1. Historical match (vendor + description) → high confidence
2. AI inference → medium confidence
3. No suggestion → blank (same as today)

---

## DOC-78: AI-Inferred GL Account Suggestions

### Overview

Extend the extraction step to also suggest GL accounts for each line item. This requires passing the user's QBO expense account list into the Claude prompt so it can match line item descriptions to account names.

### Data Flow

```
User uploads invoice
  → runExtraction() fetches file bytes (existing)
  → NEW: Fetch org's QBO expense accounts (account ID + name) via admin client
  → Pass account list + invoice to Claude in a single extraction call
  → Claude returns extracted data + suggested GL account per line item
  → Validate suggested IDs against real account list (discard hallucinated IDs)
  → Store suggestions in extracted_line_items (suggested_gl_account_id + gl_account_id pre-fill)
  → Review UI shows suggestions as pre-filled but visually distinct
  → User confirms (one click) or overrides (select different account)
  → Confirmation state persisted via is_user_confirmed column
```

### Extraction Prompt Changes

The existing extraction prompt in `lib/extraction/claude.ts` will be extended. When QBO accounts are available, append an account mapping section to the prompt:

```
Available expense accounts (use ONLY these IDs):
[{"id": "84", "name": "Office Expenses"}, {"id": "85", "name": "Shipping & Delivery"}, ...]

For each line item, also return:
  "suggested_gl_account_id": "string or null — the ID of the most likely expense account from the list above"

Rules for GL account suggestions:
- Match based on the semantic meaning of the line item description to the account name
- Only suggest an account if you are reasonably confident in the match
- Use null if no account is a clear match
- Use the exact ID string from the provided account list
```

**Key design decision:** GL suggestions are part of the main extraction call, not a separate API call. This avoids a second Claude call (cost, latency) and lets the model use the full invoice context (vendor, line item descriptions, amounts) when suggesting accounts.

### Schema Changes

**`extracted_line_items` table — add three columns:**

```sql
ALTER TABLE extracted_line_items
  ADD COLUMN suggested_gl_account_id TEXT,
  ADD COLUMN gl_suggestion_source TEXT CHECK (gl_suggestion_source IN ('ai', 'history')),
  ADD COLUMN is_user_confirmed BOOLEAN DEFAULT false;
```

- `suggested_gl_account_id`: The original AI-suggested (or history-based) account ID. Preserved even if the user overrides `gl_account_id`. Null if no suggestion.
- `gl_suggestion_source`: Where the suggestion came from (`'ai'` for DOC-78, `'history'` for DOC-79). Null if no suggestion.
- `is_user_confirmed`: Whether the user has explicitly interacted with the GL dropdown for this line item. Defaults to `false` for AI/history suggestions, set to `true` when the user selects any value. Persists across page refreshes.

**No new tables for DOC-78.** The suggestion is stored directly on the line item row.

### Type Changes

**`lib/extraction/types.ts` — domain types (used by extraction provider):**

```typescript
export interface ExtractedLineItem {
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  sortOrder: number;
  suggestedGlAccountId: string | null;  // NEW
}
```

**`lib/types/invoice.ts` — UI types (used by components):**

```typescript
export interface ExtractedLineItemRow {
  id: string;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  gl_account_id: string | null;
  sort_order: number;
  suggested_gl_account_id: string | null;  // NEW
  gl_suggestion_source: string | null;     // NEW
  is_user_confirmed: boolean;              // NEW
}
```

Both type definitions must be updated — `lib/extraction/types.ts` for the extraction pipeline and `lib/types/invoice.ts` for the UI layer.

**`ExtractionProvider` interface — add optional context parameter:**

```typescript
export interface ExtractionProvider {
  extractInvoiceData(
    fileBuffer: Buffer,
    mimeType: string,
    context?: ExtractionContext  // NEW optional param
  ): Promise<ExtractionResult>;
}

export interface ExtractionContext {
  accounts?: Array<{ id: string; name: string }>;
}
```

Context flows through the method parameter, not the constructor. The existing `getExtractionProvider()` factory in `provider.ts` constructs the provider once and reuses it — constructor injection would require restructuring.

### Orchestration Changes (`lib/extraction/run.ts`)

Before calling the provider, fetch the org's QBO accounts using the admin client (which bypasses RLS — appropriate since extraction runs server-side with verified ownership):

```typescript
// After fetching file bytes, before calling provider:
let accountContext: ExtractionContext | undefined;
try {
  const accounts = await queryAccounts(admin, orgId);
  if (accounts.length > 0) {
    accountContext = {
      accounts: accounts.map(a => ({
        id: a.Id,
        name: a.SubAccount ? a.FullyQualifiedName : a.Name,
      })),
    };
  }
} catch (err) {
  // Non-fatal: extraction works without suggestions
  logger.warn("gl_suggestion_accounts_fetch_failed", { orgId, error: err });
}

const result = await provider.extractInvoiceData(fileBuffer, fileType, accountContext);
```

**Failure handling:** If QBO accounts can't be fetched (disconnected, token expired, API error), extraction proceeds normally without GL suggestions. This is non-fatal — the user just gets the current experience of manual selection.

### Data Query Changes (`lib/extraction/data.ts`)

The `getExtractedData()` function must include the new columns in its select:

```typescript
.select(`
  *,
  extracted_line_items (
    id, description, quantity, unit_price, amount,
    gl_account_id, sort_order,
    suggested_gl_account_id, gl_suggestion_source, is_user_confirmed
  )
`)
```

The `createLineItem()` function must include the new columns in its insert (defaulting to null/false) and select return.

### Line Item Storage

When storing line items in `extracted_line_items`, include the new fields:

```typescript
{
  // ...existing fields...
  gl_account_id: item.suggestedGlAccountId,           // Pre-fill the actual field
  suggested_gl_account_id: item.suggestedGlAccountId,  // Keep original suggestion for tracking
  gl_suggestion_source: item.suggestedGlAccountId ? 'ai' : null,
  is_user_confirmed: false,                            // Not yet confirmed by user
}
```

**Important:** We pre-fill `gl_account_id` (the actual field used for sync) with the suggestion. This means the suggestion is "accepted by default" — the user only needs to act if they want to change it. This minimizes clicks for the common case where the suggestion is correct.

### UI Changes

**`GlAccountSelect.tsx` — visual treatment of suggestions:**

The dropdown already works with `currentAccountId`. The change is purely visual — when a value is pre-filled from a suggestion, show an indicator:

- **AI suggestion present, not yet confirmed by user:** Show a small "AI" badge/icon next to the dropdown and a subtle background tint (e.g., light blue/purple). The dropdown value is pre-selected but the visual treatment signals "this is a suggestion, review it."
- **User confirms (selects any value, even the same one) or changes:** Badge disappears, normal appearance. `is_user_confirmed` set to `true` via API call.
- **No suggestion:** Dropdown shows "Select account..." placeholder (same as today).

Props added to `GlAccountSelect`:

```typescript
interface GlAccountSelectProps {
  // ...existing props...
  isSuggested?: boolean;        // true if current value is an unconfirmed suggestion
  suggestionSource?: 'ai' | 'history' | null;  // for badge text/icon
}
```

The parent (`LineItemEditor`) derives `isSuggested` from the line item's `is_user_confirmed` and `suggested_gl_account_id` fields. When the user interacts with the dropdown, `LineItemEditor` calls the API to set `is_user_confirmed = true`.

**Sync blocking behavior:** Suggested (pre-filled) GL accounts **do count** as valid for sync purposes. The user is not forced to manually confirm every suggestion before syncing — they only need to review and change the ones that look wrong. This keeps the flow fast: upload → extract → glance at suggestions → sync.

### Validation

Before storing AI-suggested account IDs, validate them against the account list that was passed to Claude. Discard any suggestion where the returned ID doesn't match a real account ID. This prevents hallucinated IDs from being stored.

### Cost Impact

The account list adds ~500-2000 tokens to the prompt (typical small business has 20-80 expense accounts). At Claude Sonnet pricing, this adds roughly $0.001-0.003 per extraction. Negligible.

### Error Handling

| Scenario | Handling |
|----------|----------|
| QBO not connected | Skip GL suggestions entirely. Extract normally. |
| QBO token expired during extraction | Skip GL suggestions. Log warning. Extract normally. |
| Claude returns invalid account ID | Discard that suggestion. Line item gets no suggestion. |
| Claude returns no suggestions | All line items show "Select account..." (same as today). |
| Account list is empty | Skip GL suggestions. |
| Suggested account no longer in QBO at review time | Dropdown shows the value but it won't match any option — user must re-select. Same behavior as if a previously-selected account was deactivated. |

---

## DOC-79: History-Based GL Account Learning

### Overview

Record which GL accounts users assign to line items, keyed by vendor and description. Use this history to suggest accounts on future invoices, with higher confidence than AI inference.

### New Table: `gl_account_mappings`

```sql
CREATE TABLE gl_account_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  vendor_name TEXT NOT NULL,
  description_pattern TEXT NOT NULL,     -- normalized line item description
  gl_account_id TEXT NOT NULL,           -- QBO account ID
  usage_count INTEGER DEFAULT 1,         -- how many times this mapping was used
  last_used_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, vendor_name, description_pattern)
);

CREATE INDEX idx_gl_mappings_org_vendor ON gl_account_mappings(org_id, vendor_name);

ALTER TABLE gl_account_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gl_account_mappings_org_access" ON gl_account_mappings
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
  );
```

### Recording Mappings

Mappings are recorded **server-side** in the existing `PATCH /api/invoices/[id]/line-items/[itemId]` endpoint when `field === "gl_account_id"`. This avoids threading vendor name through client components — the server can look up the vendor name from `extracted_data` directly.

```typescript
// In the PATCH line-items API route, after updating gl_account_id:
if (field === "gl_account_id" && value) {
  const extractedData = await getExtractedDataForLineItem(itemId);
  if (extractedData?.vendor_name) {
    await upsertGlMapping({
      orgId,
      vendorName: extractedData.vendor_name,
      description: lineItem.description,
      glAccountId: value as string,
    });
  }
}
```

**Important:** Mappings are only recorded on explicit user interaction with the dropdown (the PATCH call), not when syncing an invoice with unconfirmed AI suggestions. This ensures the learning data reflects deliberate user choices, not unreviewed AI guesses.

**Normalization:** `description_pattern` is a normalized version of the line item description:
- Lowercase
- Strip leading/trailing whitespace
- Collapse multiple spaces

Start with these simple rules only. More aggressive normalization (stripping dates, item numbers) can be added later if exact matching proves too strict.

### Lookup at Extraction Time

In `runExtraction()`, after extraction completes but before storing line items:

1. Get the extracted vendor name
2. Query `gl_account_mappings` for this org + vendor
3. For each line item, check if the normalized description matches a mapping
4. **Validate the mapped account ID against the current active account list** — discard if the account no longer exists in QBO
5. If valid match found: use the historical account (source: `'history'`), overriding any AI suggestion. Update both `suggestedGlAccountId` and the pre-filled `gl_account_id`.
6. If no match: keep the AI suggestion (source: `'ai'`) or null

```typescript
// After extraction, before storing line items:
const vendorName = result.data.vendorName;
if (vendorName) {
  const mappings = await getGlMappings(admin, orgId, vendorName);
  const validAccountIds = new Set(accountContext?.accounts?.map(a => a.id) ?? []);

  for (const item of result.data.lineItems) {
    const match = findBestMapping(mappings, item.description);
    if (match && validAccountIds.has(match.gl_account_id)) {
      item.suggestedGlAccountId = match.gl_account_id;
      // suggestionSource tracked at storage time via gl_suggestion_source column
    }
  }
}
```

### Matching Strategy

**Exact match only for initial implementation:**

1. Exact match on normalized description → use it
2. No match → fall back to AI suggestion

Fuzzy matching (Levenshtein distance, substring containment) deferred. If users report that minor description variations cause missed matches, add fuzzy matching server-side (not in the DB query) as a fast follow.

### UI Changes

Extend the suggestion badge to distinguish sources:

- **History-based suggestion:** Small "Learned" or checkmark icon with subtle green tint. Higher trust — the user picked this before.
- **AI suggestion:** Small "AI" badge with subtle blue/purple tint. Lower trust — Claude's best guess.
- **User-confirmed:** No badge. Normal dropdown appearance.

The `suggestionSource` prop on `GlAccountSelect` (added in DOC-78) drives this distinction.

### Mapping Lifecycle

- **Upsert on confirm/change:** Every explicit GL account selection creates or updates a mapping
- **Usage count tracks popularity:** Incremented on each upsert. If a mapping is used 10 times, it's more trustworthy than one used once
- **No automatic deletion:** Mappings persist even if the QBO account is later deactivated. Validation at lookup time (checking against current active accounts) catches stale mappings and discards them
- **Per-org isolation:** RLS ensures mappings are scoped to the organization

### Dependencies

- Requires DOC-78 to be complete (UI patterns, schema columns, suggestion flow)
- Requires vendor name to be extracted (already in place)
- Requires GL account selection to hit the PATCH endpoint (already in place)

---

## Testing Strategy

### DOC-78 Tests

| Test | Type | Description |
|------|------|-------------|
| Extraction with accounts | Unit | Claude prompt includes account list, response includes suggested IDs |
| Extraction without QBO | Unit | Graceful degradation — no suggestions, extraction succeeds |
| Invalid account ID filtering | Unit | Hallucinated IDs are discarded before storage |
| Suggestion pre-fill | Component | GlAccountSelect shows pre-filled value with "AI" badge |
| Suggestion override | Component | Changing selection clears badge, saves new value, persists confirmation |
| Suggestion persists across refresh | Component | Revisiting review page shows correct badge state from `is_user_confirmed` |
| Sync with suggestions | API | Pre-filled suggestions count as valid for sync |
| Stale suggested account | Component | Suggested account not in current dropdown — user must re-select |

### DOC-79 Tests

| Test | Type | Description |
|------|------|-------------|
| Mapping upsert | Unit | Confirm/change GL account creates/updates mapping |
| Mapping lookup | Unit | Historical match overrides AI suggestion |
| Description normalization | Unit | Lowercase + whitespace normalization matches |
| History priority over AI | Integration | When both sources have a suggestion, history wins |
| New vendor fallback | Integration | Unknown vendor falls through to AI suggestion |
| Stale mapping validation | Unit | Mapping referencing deactivated account is discarded |
| Mapping only on explicit selection | Integration | Syncing unconfirmed AI suggestions does NOT create mappings |

---

## Migration Path

Both issues are additive — no breaking changes to existing data or flows.

- DOC-78 adds columns to `extracted_line_items` (nullable + default false, backward-compatible)
- DOC-79 adds a new table (`gl_account_mappings`)
- Existing invoices continue to work as-is; suggestions only appear on new extractions
- The `ExtractionProvider` interface change is backward-compatible (optional `context` parameter)
- Both `ExtractedLineItemRow` types (in `lib/extraction/types.ts` and `lib/types/invoice.ts`) must be updated
- `getExtractedData()` select query and `createLineItem()` insert in `data.ts` must include new columns
