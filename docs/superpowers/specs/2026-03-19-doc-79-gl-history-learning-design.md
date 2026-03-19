# DOC-79: History-Based GL Account Learning — Design Spec

## Summary

Layer history-based GL account learning on top of DOC-78's AI suggestion system. When a user confirms or changes a GL account, record the vendor + description → account mapping. On future invoices from the same vendor, historical mappings take priority over AI suggestions.

## Database

### New Table: `gl_account_mappings`

```sql
CREATE TABLE gl_account_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  vendor_name TEXT NOT NULL,
  description_pattern TEXT NOT NULL,
  gl_account_id TEXT NOT NULL,
  usage_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, vendor_name, description_pattern)
);

CREATE INDEX idx_gl_account_mappings_org_vendor
  ON gl_account_mappings(org_id, vendor_name);

ALTER TABLE gl_account_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gl_account_mappings_org_access" ON gl_account_mappings
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
    )
  );
```

### Column Semantics

| Column | Purpose |
|--------|---------|
| `vendor_name` | Normalized vendor name (lowercase, trimmed, collapsed spaces) |
| `description_pattern` | Normalized line item description (lowercase, trimmed, collapsed spaces) |
| `gl_account_id` | QBO account ID string |
| `usage_count` | Incremented on each upsert — tracks how many times this mapping has been confirmed |
| `last_used_at` | Timestamp of most recent confirmation — useful for future staleness heuristics |

## Write Path: Recording Mappings

### Trigger Point

In the existing PATCH endpoint at `app/api/invoices/[id]/line-items/[itemId]/route.ts`, when `field === "gl_account_id"` and `value !== null`.

### Flow

1. After `updateLineItemField()` succeeds, query the line item with its parent chain: line item → `extracted_data` (via `extracted_data_id`) → get `vendor_name` and line item `description`. The current PATCH route SELECT does not include `extracted_data_id`, so expand the select to include it, then fetch `extracted_data.vendor_name` in a second query.
2. Normalize both values: `text.toLowerCase().trim().replace(/\s+/g, ' ')`
3. Skip if either is empty/null (can't learn without both vendor and description)
4. Use the `org_id` already available from the invoice (fetched at line 74 of the current PATCH route)
5. Upsert into `gl_account_mappings` using the admin client (avoids RLS complexity with upsert ON CONFLICT):

```sql
INSERT INTO gl_account_mappings (org_id, vendor_name, description_pattern, gl_account_id, usage_count, last_used_at)
VALUES ($1, $2, $3, $4, 1, now())
ON CONFLICT (org_id, vendor_name, description_pattern)
DO UPDATE SET
  gl_account_id = EXCLUDED.gl_account_id,
  usage_count = gl_account_mappings.usage_count + 1,
  last_used_at = now();
```

### Constraints

- Mappings only recorded on explicit user interaction (PATCH call with `gl_account_id`), never during extraction or sync
- Server-side only — no client changes needed for recording
- Non-blocking: if upsert fails, log warning and continue (don't fail the PATCH response)
- When user sets `gl_account_id = null` (clearing selection), no mapping is recorded or deleted

## Read Path: Lookup at Extraction Time

### Trigger Point

In `lib/extraction/run.ts`, after Claude returns extracted data but before storing line items to the database.

### Flow

1. After extraction completes, normalize the extracted `vendor_name`
2. Query `gl_account_mappings` for the org + normalized vendor name (batch query, not per-item)
3. For each extracted line item:
   a. Normalize the line item's `description`
   b. Look for exact match in the queried mappings
   c. If match found: validate `gl_account_id` against the active QBO accounts list (already fetched for AI suggestions)
   d. If valid: set `suggested_gl_account_id = mapped ID`, `gl_suggestion_source = 'history'`, `gl_account_id = mapped ID`
   e. If stale (account no longer in active list): discard mapping, keep AI suggestion
   f. If no match: keep AI suggestion from DOC-78

### Integration with Mapper

The history override happens in `runExtraction()` after extraction but before calling `mapToLineItemRows()`. Modify the `ExtractedLineItem` type to carry an optional `glAccountId` field (in addition to the existing `suggestedGlAccountId`). When a history match is found, set both fields on the extracted line item. Update `mapToLineItemRows()` to pass through `glAccountId` to the `gl_account_id` column instead of hardcoding `null`.

### Key Difference from AI Suggestions

History mappings pre-fill `gl_account_id` (not just `suggested_gl_account_id`), because the user already confirmed this exact mapping before. This means:

- History-matched line items don't block sync (they have `gl_account_id` set)
- The user can still override — changing the account records the new mapping
- `is_user_confirmed` remains `false` for history-filled items (it tracks explicit user action in this session)

### Non-Fatal Behavior

If the mappings query fails, log warning and proceed with AI suggestions only. Never block extraction due to mapping lookup failure.

## Description Normalization

Simple rules for v1:

```typescript
function normalizeDescription(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}
```

Fuzzy matching deferred to a future issue.

The normalization function lives in `lib/utils/normalize.ts` as a shared utility, used by both the write path (PATCH route) and the read path (`run.ts`).

## Frontend Changes

### GlAccountSelect Badge Treatment

Extend the existing suggestion badge in `GlAccountSelect.tsx` to distinguish sources:

| Source | Badge | Color | Behavior |
|--------|-------|-------|----------|
| `'history'` | "Learned" with book icon | Green tint (`bg-green-50 text-green-700 border-green-200`) | Dropdown pre-filled (gl_account_id is set). Badge shows next to dropdown. User can override. |
| `'ai'` | "AI" badge | Blue tint (unchanged from DOC-78) | Dropdown shows placeholder. Suggestion pill below. User must click to confirm. |
| `null` / user-confirmed | No badge | — | Normal dropdown appearance |

### Rendering Logic

The `suggestionSource` prop (already passed from DOC-78) drives the distinction. When `source === 'history'`:

- The dropdown shows the pre-filled account (since `gl_account_id` is set)
- A small "Learned" badge appears near the dropdown to explain why it was pre-filled
- If the user changes the selection, the badge disappears (frontend clears `gl_suggestion_source` locally) and the new mapping is recorded via the PATCH call

When `source === 'ai'`:
- Behavior unchanged from DOC-78 (suggestion pill below dropdown, click to confirm)

## Data Flow Summary

```
Recording (user confirms GL account):
  PATCH /line-items/[itemId] with gl_account_id
    → updateLineItemField() (existing)
    → look up vendor_name + description
    → normalize both
    → upsert gl_account_mappings
    → return updated line item

Lookup (new invoice extracted):
  runExtraction()
    → Claude extracts data + AI GL suggestions
    → query gl_account_mappings for org + vendor
    → for each line item:
        exact match on normalized description?
          yes + valid account → override with history mapping
          yes + stale account → discard, keep AI suggestion
          no match → keep AI suggestion
    → store line items with appropriate source flags
```

## Testing

| Test | Location | What it covers |
|------|----------|----------------|
| Normalization utility | `lib/utils/normalize.test.ts` | lowercase, trim, collapse spaces, empty/null handling |
| Mapping upsert | `lib/extraction/gl-mappings.test.ts` | insert, update on conflict, skip null vendor/description |
| Lookup + validation | `lib/extraction/gl-mappings.test.ts` | exact match, stale account discard, no match fallback |
| History override in run.ts | `lib/extraction/run.test.ts` | history takes priority over AI, fallback to AI on no match |
| PATCH records mapping | `app/api/invoices/[id]/line-items/[itemId]/route.test.ts` | mapping recorded on gl_account_id set, not on null |
| Frontend badge | `components/invoices/GlAccountSelect.test.tsx` | "Learned" badge for history, "AI" for ai, none for confirmed |

## Known Limitations (v1)

- **Vendor name variations**: "ACME Corp" and "Acme Corporation" normalize to different strings and won't match. Fuzzy vendor matching is out of scope for v1.
- **No retroactive application**: Mappings only apply to future extractions. Already-extracted invoices (e.g., from a batch upload) are not updated when a mapping is created.

## Out of Scope

- Fuzzy/partial description matching
- Vendor-level default account (without description match)
- Automatic mapping deletion or expiry
- Mapping management UI (view/edit/delete mappings)
- Cross-org mapping sharing
