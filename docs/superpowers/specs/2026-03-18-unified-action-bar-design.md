# Unified Action Bar — Design Spec

## Problem

The invoice approval flow requires too many clicks and screen transitions. After approving an invoice, the user is hard-redirected back to `/invoices` and must navigate back into the same invoice to sync it. The approve action also has an unnecessary two-click confirmation gate (click "Approve" → click "Confirm Approval"), even though the user just reviewed the entire form. Total click path: 6 clicks across 2 screens.

## Solution

Replace the separate `ApproveBar` and `SyncBar` components with a single `ActionBar` component. The bar renders at the bottom of the ExtractionForm and progresses through states based on the invoice status — all on the same screen, no redirects.

### Click path comparison

| Flow | Current | New |
|------|---------|-----|
| Approve | 2 clicks (Approve → Confirm Approval) | 1 click (Approve) |
| Navigate back to invoice | 2 clicks (redirect → click row) | 0 (stays on page) |
| Sync | 2 clicks (Sync → Confirm Sync) | 2 clicks (Sync → Confirm Sync) |
| **Total** | **6 clicks, 2 screens** | **3 clicks, 1 screen** |

---

## State Machine

The ActionBar shows one primary action at a time based on `currentStatus`:

```
pending_review → [Approve] (single click, no confirm gate)
                     ↓ (on success, transitions in place)
approved       → [Sync to QuickBooks] → click → [Confirm Sync] → click
                     ↓ (on success)
synced         → "Synced to QuickBooks" (read-only success state)
```

### Why approve is single-click

The user just spent time reviewing every field in the form. That review IS the confirmation. Adding a second "are you sure?" click is friction without value — approving is reversible (no external side effects until sync).

### Why sync keeps its confirm gate

Sync creates a bill in QuickBooks — an irreversible action with real-money implications. The single confirm gate (click → "Confirm Sync" → click) is appropriate here.

---

## Component: `ActionBar`

**File:** `components/invoices/ActionBar.tsx`

Replaces both `ApproveBar.tsx` and `SyncBar.tsx`.

### Props

```typescript
interface ActionBarProps {
  invoiceId: string;
  currentStatus: InvoiceStatus;
  vendorName: string | number | null;
  totalAmount: string | number | null;
  vendorRef: string | null;
  syncBlockers: string[];
  isRetry?: boolean;
  onStatusChange: (newStatus: InvoiceStatus) => void;
}
```

### Internal state

```typescript
type ActionBarState =
  | "idle"           // Ready to show primary action
  | "approving"      // Approve API call in flight
  | "approved"       // Brief success flash before transitioning to sync
  | "confirming"     // Sync confirm gate (3s timeout)
  | "syncing"        // Sync API call in flight
  | "synced"         // Sync success
  | "failed";        // Sync failed, can retry
```

### Approve flow

1. User clicks "Approve Invoice"
2. Blur active element + 500ms wait (ensures pending auto-saves complete)
3. `POST /api/invoices/{id}/approve`
4. On success: brief "Approved" flash (500ms), then call `onStatusChange("approved")`
5. Parent updates `currentStatus`, ActionBar re-renders showing Sync button

### Sync flow

1. User clicks "Sync to QuickBooks"
2. Bar enters "confirming" state — button text changes to "Confirm Sync" (3s timeout back to idle)
3. User clicks "Confirm Sync"
4. `POST /api/invoices/{id}/sync`
5. On success: call `onStatusChange("synced")`, bar shows success state
6. Attachment warning surfaces inline if PDF attach failed

### Validation

**Approve validation** (same as current):
- Requires non-empty `vendor_name` and `total_amount`
- Button disabled with status message: "Missing: vendor name, total amount"

**Sync validation** (same as current):
- Requires `vendorRef` selected
- Requires all line items have GL accounts
- Blockers shown in warning panel above button

### Error handling

- Approve failure: error message shown inline, auto-dismisses after 5s, button returns to idle
- Sync failure: error message shown inline, auto-dismisses after 10s, button shows "Retry Sync"
- All error behavior identical to current ApproveBar/SyncBar

---

## ExtractionForm Changes

### What changes

Replace the two conditional rendering blocks (lines 457-481 in current ExtractionForm.tsx) with a single `ActionBar` render:

```tsx
{(currentStatus === "pending_review" || currentStatus === "approved" || currentStatus === "synced") && (
  <>
    <div className="border-t border-border" />
    <ActionBar
      invoiceId={invoiceId}
      currentStatus={currentStatus}
      vendorName={state.values.vendor_name}
      totalAmount={state.values.total_amount}
      vendorRef={vendorRef}
      syncBlockers={syncBlockers}
      isRetry={!!initialErrorMessage?.startsWith("Sync failed")}
      onStatusChange={setCurrentStatus}
    />
  </>
)}
```

The `handleSyncComplete` callback is replaced by `onStatusChange` — the ActionBar calls `onStatusChange("approved")` or `onStatusChange("synced")` and ExtractionForm's `setCurrentStatus` handles the rest.

### What gets deleted

- `ApproveBar.tsx` — fully replaced
- `SyncBar.tsx` — fully replaced
- `handleSyncComplete` callback in ExtractionForm
- Import statements for ApproveBar and SyncBar

### What stays the same

- `SyncStatusPanel` — still renders below the action bar
- All form auto-save behavior
- The approve and sync API routes (no backend changes)
- `syncKey` state for refreshing SyncStatusPanel

---

## Testing

| Test | Type | Description |
|------|------|-------------|
| Approve disabled when fields missing | Component | Button disabled + tooltip when vendor_name or total_amount empty |
| Single-click approve | Component | One click triggers approve API, no confirm gate |
| Approve transitions to sync | Component | After approve success, bar shows Sync button without redirect |
| Sync confirm gate | Component | First click shows "Confirm Sync", second click fires API |
| Sync confirm timeout | Component | "Confirm Sync" reverts to idle after 3s without second click |
| Sync blockers | Component | Warning panel shown + button disabled when blockers exist |
| Sync failure + retry | Component | Error shown, button becomes "Retry Sync" |
| Synced state | Component | Read-only success message after successful sync |
| Attachment warning | Component | Warning surfaces inline when PDF attach fails |

---

## Files Changed

| File | Change |
|------|--------|
| `components/invoices/ActionBar.tsx` | **New** — unified action bar component |
| `components/invoices/ExtractionForm.tsx` | Replace ApproveBar + SyncBar with ActionBar |
| `components/invoices/ApproveBar.tsx` | **Delete** |
| `components/invoices/SyncBar.tsx` | **Delete** |
