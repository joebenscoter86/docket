# DOC-134: Default Tax Code Setting Per Org

**Source:** Rick Smith feedback (2026-03-31)
**Status:** Approved

## Problem

Rick has to select a tax code (e.g., "Tax on Purchases") on every line item of every invoice. He wants a default that auto-applies so he only intervenes on exceptions.

## Design

### Storage

Add `default_tax_code_id TEXT` column to `accounting_connections`.

- Null = no default (current behavior, no change to existing invoices).
- Value = provider tax code ID (QBO TaxCode Id or Xero TaxType string).
- Lives on `accounting_connections` because tax codes are provider-specific. Disconnecting and reconnecting naturally resets the default.

Migration: `supabase/migrations/YYYYMMDD_add_default_tax_code.sql`

### API

`PATCH /api/settings/defaults` -- updates the org's `accounting_connections.default_tax_code_id`.

Request body:
```json
{ "default_tax_code_id": "3" }   // or null to clear
```

Auth: requires authenticated user with org membership. Verifies org ownership of the connection row via RLS/admin client.

Returns `{ data: { default_tax_code_id: string | null } }`.

### Extraction Flow

In `lib/extraction/run.ts`, after storing line items (step 7):

1. Look up the org's `accounting_connections.default_tax_code_id`.
2. If non-null, update all newly inserted line items where `tax_code_id IS NULL` with the default value.
3. Line items that already have a tax code (from future AI extraction or other logic) are untouched.

This is a single UPDATE query, not per-row. Efficient even for invoices with many line items.

### Settings UI

New "Defaults" card on the Settings page, shown only when an accounting provider is connected.

Contents:
- Label: "Default Tax Code"
- Dropdown populated from `/api/accounting/tax-codes` (same source as the line item dropdown)
- "None" option to clear the default
- Auto-saves on change (same pattern as other Settings controls)
- Help text: "Applied automatically to new invoice line items. You can override per line item during review."

Placement: below the accounting connection cards, above the billing card.

### Edge Cases

- **No accounting connection:** Defaults card is hidden. No tax codes to choose from.
- **Provider disconnected and reconnected:** Connection row is deleted and re-created. Default resets to null. User sets it again.
- **Default tax code deleted in provider:** Line items get an ID that won't match the dropdown. Same existing behavior as stale GL account IDs -- not worth special handling for MVP.
- **Existing invoices in pending_review:** Unaffected. Default only applies at extraction time.
- **Batch extraction:** Each invoice's line items get the default independently. No special batch logic needed.

### What This Does NOT Do

- Does not bulk-apply to existing unsynced invoices.
- Does not add AI tax code extraction (separate feature if needed).
- Does not add per-vendor tax code defaults (future enhancement).
