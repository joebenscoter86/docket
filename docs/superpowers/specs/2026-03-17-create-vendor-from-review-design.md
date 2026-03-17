# Design Spec: Create Vendor from Invoice Review Page

**Date:** 2026-03-17
**Status:** Approved

## Problem

When a user reviews an invoice from a new vendor not yet in QuickBooks, they must leave Docket, manually create the vendor in QBO, return, and refresh the vendor list. This breaks the review flow and adds unnecessary friction.

## Solution

Add an inline "Create vendor" button to the VendorSelect dropdown that appears when no QBO vendors match the search. Clicking it creates the vendor in QBO immediately using the extracted invoice data, auto-selects it, and lets the user continue reviewing without leaving the page.

## UX Flow

1. User is on the review page, opens the vendor dropdown
2. They type or see the extracted vendor name — no QBO vendors match
3. Below "No vendors match", a button appears: **"+ Create [Vendor Name] in QuickBooks"**
4. User clicks → button shows a loading spinner ("Creating...")
5. Backend creates the vendor in QBO with extracted `vendor_name` (as DisplayName) and `vendor_address` (as BillAddr, if available)
6. On success: new vendor is auto-selected, vendor list refreshes with the new entry, field shows green save checkmark
7. On error: inline error message below the button (e.g., "Failed to create vendor. Please try again." or specific QBO error like duplicate name)

## API

### POST `/api/quickbooks/vendors`

**Request body:**
```json
{
  "displayName": "Acme Supplies Inc",
  "address": "123 Main St, Austin, TX 78701"
}
```

- `displayName` — required, non-empty string
- `address` — optional, may be null or omitted

**Response (success):**
```json
{
  "data": { "value": "123", "label": "Acme Supplies Inc" }
}
```

**Response (error):**
```json
{
  "error": "A vendor with this name already exists in QuickBooks.",
  "code": "CONFLICT"
}
```

### Route behavior

1. Authenticate user, resolve org via `org_memberships`
2. Validate `displayName` is present and non-empty
3. Get QBO connection for org, auto-refresh token if expired
4. Parse `address` string into QBO `BillAddr` fields:
   - Attempt to split into Line1, City, CountrySubDivisionCode, PostalCode
   - If parsing fails or address is incomplete, use the full string as `Line1` only
5. POST to QBO `/company/{companyId}/vendor` with `DisplayName` and optionally `BillAddr`
6. Return the new vendor as `{ value: Id, label: DisplayName }`

### Error responses

| QBO error | HTTP status | Error code | User message |
|-----------|-------------|------------|--------------|
| Duplicate DisplayName | 409 | `CONFLICT` | "A vendor with this name already exists in QuickBooks. Try refreshing." |
| Token expired + refresh fails | 401 | `AUTH_ERROR` | "QuickBooks connection expired. Reconnect in Settings." |
| QBO API error (400/500) | 500 | `INTERNAL_ERROR` | "Failed to create vendor in QuickBooks. Please try again." |
| Missing displayName | 400 | `VALIDATION_ERROR` | "Vendor name is required." |
| No QBO connection | 422 | `UNPROCESSABLE` | "No QuickBooks connection found. Connect in Settings." |

## Component Changes

### VendorSelect.tsx

Add to the "no matches" state in the dropdown:

- **"+ Create [vendor name] in QuickBooks"** button, styled as a text button with blue accent color
- New props:
  - `vendorAddress: string | null` (passed from ExtractionForm)
  - `onVendorCreated: (vendor: VendorOption) => void` (parent updates its vendor list state)
- Button only appears when:
  - QBO is connected
  - `vendorName` is non-empty
  - Search has no matches
- Loading state: button text changes to "Creating..." with spinner, button disabled
- Error state: red error text below button, auto-dismisses after 10s
- Success state: call `onVendorCreated(newVendor)` so parent adds it to the list, call `onSelect(newVendor.value)`, close dropdown
- **Zero-vendors edge case:** The input is currently disabled when `vendors.length === 0`. When QBO is connected, the input must remain enabled even with zero vendors so the user can access the create button. Update the disabled condition to: `disabled={disabled || (vendors.length === 0 && !isConnected)}`

### ExtractionForm.tsx

- Pass `vendorAddress` value from form state to `VendorSelect` component
- Pass `onVendorCreated` callback that adds the new vendor to `qboOptions.vendors`

### lib/quickbooks/api.ts

- Add `createVendor(supabase, orgId, displayName, address?)` function using the existing `qboFetch` helper
- Returns `VendorOption` (`{ value: Id, label: DisplayName }`)

## Edge Cases

| Case | Handling |
|------|----------|
| Vendor name already exists in QBO | QBO rejects duplicate DisplayName → show "A vendor with this name already exists in QuickBooks. Try refreshing." |
| QBO connection expired | Token auto-refresh (existing pattern in `makeQBORequest`). If refresh fails → show auth error |
| No QBO connection | Button doesn't appear (VendorSelect already hides dropdown when not connected) |
| Empty vendor_name | Button doesn't appear |
| Special characters in name | Pass through as-is — QBO handles most characters |
| Address is null/empty | Create vendor with name only — address is optional in QBO |
| Address is a single line (unparseable) | Use full string as BillAddr.Line1 |
| User double-clicks create button | Disable button on first click (loading state prevents double-fire) |
| Network failure mid-creation | Show generic error, vendor not created, user can retry |
| Zero vendors in QBO account | Input stays enabled when QBO is connected so user can open dropdown and access create button |

## QBO API Details

**Create Vendor endpoint:** `POST /company/{companyId}/vendor`

**Minimal payload:**
```json
{
  "DisplayName": "Acme Supplies Inc",
  "BillAddr": {
    "Line1": "123 Main St",
    "City": "Austin",
    "CountrySubDivisionCode": "TX",
    "PostalCode": "78701"
  }
}
```

- `DisplayName` is the only required field
- `BillAddr` is optional
- Returns the full vendor object with `Id` (string) on success (HTTP 200, not 201)
- Duplicate `DisplayName` returns a validation error with QBO error code `6240` on element `DisplayName` — use this to detect duplicates and return 409 CONFLICT
- Address parsing strategy: split on commas (expect "street, city, state zip" format). If fewer than 3 comma-separated parts, use full string as Line1 only. Do not over-engineer — fallback is fine.

## What This Does NOT Include

- Editing vendor details after creation (do that in QBO)
- Vendor matching/suggestion logic (existing auto-match by name stays as-is)
- Batch vendor creation
- Vendor deletion or deactivation
