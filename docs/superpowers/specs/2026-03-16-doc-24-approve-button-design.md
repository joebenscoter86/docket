# DOC-24: Approve Button Design

## Overview

Add an approve button to the extraction review form that validates required fields, records corrections, transitions the invoice to `approved` status, and redirects to the invoice list.

## Components

### ApproveBar

Sticky bottom bar rendered at the bottom of ExtractionForm.

**Layout:** Flexbox row with validation status on the left, approve button on the right. White background with top border (`border-t border-gray-200`), padding `px-6 py-4`. Positioned as the last element in ExtractionForm — not CSS sticky, just always visible at the bottom of the form content since the right panel of ReviewLayout scrolls independently.

**Validation status (left side):**
- When ready: green dot + "Ready to approve"
- When missing fields: amber dot + "Missing: vendor name" / "Missing: total amount" / both

**Approve button (right side):**
- Default state: `bg-blue-600 text-white hover:bg-blue-700 px-6 py-2.5 rounded-md font-medium text-sm` — label "Approve Invoice"
- Disabled state: `bg-blue-300 cursor-not-allowed` — when vendor_name or total_amount is empty
- Confirming state: button transforms to "Confirm Approval" with `bg-green-600 hover:bg-green-700` — reverts after 3 seconds if not clicked (two-click deliberate action pattern)
- Submitting state: "Approving..." with spinner, disabled
- Approved state: "Approved" with checkmark icon, `bg-green-600`, disabled — shown briefly before redirect
- Error state: reverts to "Approve Invoice" (default state) and shows error toast with the API error message

### Two-Click Confirmation Flow

1. User clicks "Approve Invoice"
2. Button changes to "Confirm Approval" (green) with a 3-second timeout
3. If user clicks again within 3 seconds → fires API call
4. If timeout expires → reverts to "Approve Invoice"
5. No modal dialog — fast but deliberate
6. Before firing the API call, blur the active element (`document.activeElement?.blur()`) to trigger any pending auto-save, then wait 500ms for the save to complete

## API Route

**`POST /api/invoices/[id]/approve`** — replaces current 501 stub.

### Request

No body required. Invoice ID from URL params.

### Flow

1. Authenticate user via Supabase server client
2. Fetch invoice by ID with RLS (verifies org ownership)
3. Status guard: only `pending_review` invoices can be approved. Return 409 Conflict for `approved`, `synced`. Return 400 for `uploading`, `extracting`, `error`.
4. Fetch extracted_data for this invoice
5. Validate required fields: `vendor_name` and `total_amount` must be non-null and non-empty. Return 400 with field names if missing.
6. Update invoice status to `approved` via admin client
7. Return `{ data: { status: "approved" } }`

### Logging

Entry log: `{ action: "invoice.approve.start", invoiceId, orgId, userId }`
Exit log: `{ action: "invoice.approve.success", invoiceId, orgId, userId, durationMs }` or `{ action: "invoice.approve.error", ..., error }`

### Error Responses

| Scenario | Status | Code |
|----------|--------|------|
| Not authenticated | 401 | AUTH_ERROR |
| Invoice not found (RLS) | 404 | NOT_FOUND |
| Wrong status | 409 | CONFLICT |
| Missing required fields | 400 | VALIDATION_ERROR |
| Server error | 500 | INTERNAL_ERROR |

## Post-Approval UX

1. Button shows "Approved" with checkmark (green)
2. Success toast appears: "Invoice approved. Ready to sync to QuickBooks."
3. After 2 seconds, redirect to `/invoices`

## Integration Points

### ExtractionForm Changes

- Accept `invoiceId` and `invoiceStatus` as props (already has access to form values via reducer)
- Render ApproveBar at the bottom of the form, inside the scroll container
- ApproveBar reads current `vendor_name` and `total_amount` from form state to determine button enabled/disabled
- Only show ApproveBar when status is `pending_review`

### Success Toast

Inline toast rendered inside ApproveBar (replaces the validation status text area on success/error). Green text for success, red text for errors. Auto-dismiss errors after 5 seconds. No separate toast component needed — keeps it simple and co-located.

## What's NOT Included

- No "Save Draft" button — auto-save on blur already persists all edits
- No "un-approve" flow — one-way for MVP per issue constraints
- No "Sync Now" button — deferred to QBO integration (Project 4)
- No corrections comparison in the approve API — corrections are already recorded incrementally by the extracted-data PATCH route on each field blur. The approve route only transitions status; it does not need to diff values.
