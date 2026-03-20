# DOC-60: Provider Switching UX in Settings Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show both QBO and Xero connection cards on the Settings page with one-at-a-time enforcement, make sync buttons and status displays provider-aware throughout the app.

**Architecture:** The Settings page already fetches a provider-agnostic connection via `getOrgConnection()`. We add a `XeroConnectionCard` matching the `QBOConnectionCard` pattern, update the Settings page to show both cards with mutual exclusion (disabled state when other is connected), and thread provider identity through `ActionBar` and `SyncStatusPanel` so all "QuickBooks" hardcodes become dynamic.

**Tech Stack:** Next.js App Router, Tailwind CSS, existing provider abstraction (`lib/accounting/`)

**Linear Issue:** [DOC-60](https://linear.app/jkbtech/issue/DOC-60/xro-9-provider-switching-ux-in-settings-page)

---

## File Structure

### New Files
```
components/settings/XeroConnectionCard.tsx    — Xero connection card (mirrors QBOConnectionCard)
lib/accounting/links.ts                       — Provider-agnostic transaction URL helper
```

### Modified Files
```
components/settings/QBOConnectionCard.tsx     — Add disabled prop for mutual exclusion
app/(dashboard)/settings/page.tsx             — Show both cards, pass disabled state, handle xero alerts
components/invoices/ActionBar.tsx              — Accept provider prop, dynamic labels + links
components/invoices/SyncStatusPanel.tsx        — Use provider from sync_log for dynamic labels + links
components/invoices/ExtractionForm.tsx         — Thread provider through to ActionBar, update sync blockers + disconnection banner
components/invoices/ReviewLayout.tsx           — Pass connectedProvider through to ExtractionForm
app/(dashboard)/invoices/[id]/review/page.tsx — Fetch connectedProvider, pass to ReviewLayout
lib/types/invoice.ts                          — Make SYNC_SUCCESS_MESSAGES provider-aware
```

---

## Task 1: Provider-Agnostic Transaction URL Helper

**Files:**
- Create: `lib/accounting/links.ts`
- Modify: `lib/quickbooks/links.ts` (no changes needed, stays as-is for import compatibility)

The current `getQuickBooksTransactionUrl` in `lib/quickbooks/links.ts` only handles QBO. We need a provider-agnostic wrapper that routes to the right implementation. Xero doesn't have deep links to individual transactions in the web app, so we link to the bills list.

- [ ] **Step 1: Create lib/accounting/links.ts**

```typescript
import type { TransactionType } from "@/lib/types/invoice";
import type { AccountingProviderType } from "./types";
import { getQuickBooksTransactionUrl } from "@/lib/quickbooks/links";

const XERO_BASE_URL = "https://go.xero.com";

function getXeroTransactionUrl(): string {
  // Xero doesn't support deep links to individual bills.
  // Link to the bills awaiting payment list instead.
  return `${XERO_BASE_URL}/AccountsPayable/`;
}

/**
 * Returns a URL to view the transaction in the connected accounting provider.
 * Falls back to the provider's transaction list if deep linking isn't supported.
 */
export function getTransactionUrl(
  provider: AccountingProviderType,
  transactionType: TransactionType,
  entityId: string
): string {
  if (provider === "quickbooks") {
    return getQuickBooksTransactionUrl(transactionType, entityId);
  }
  return getXeroTransactionUrl();
}

/**
 * Returns the display label for a provider.
 */
export function getProviderLabel(provider: AccountingProviderType): string {
  return provider === "quickbooks" ? "QuickBooks" : "Xero";
}
```

- [ ] **Step 2: Verify types**

```bash
npx tsc --noEmit
```

Expected: passes clean

- [ ] **Step 3: Commit**

```bash
git add lib/accounting/links.ts
git commit -m "feat: add provider-agnostic transaction URL helper (DOC-60)"
```

---

## Task 2: XeroConnectionCard + QBOConnectionCard Disabled State

**Files:**
- Create: `components/settings/XeroConnectionCard.tsx`
- Modify: `components/settings/QBOConnectionCard.tsx`

- [ ] **Step 1: Add disabled prop to QBOConnectionCard**

Add `disabled?: boolean` and `disabledReason?: string` to `QBOConnectionCardProps`. When `disabled` is true and the card is disconnected, the Connect button is disabled and shows a tooltip.

In `components/settings/QBOConnectionCard.tsx`, update the interface:

```typescript
interface QBOConnectionCardProps {
  connection: {
    connected: boolean;
    companyId?: string;
    companyName?: string;
    connectedAt?: string;
  };
  disabled?: boolean;
  disabledReason?: string;
}
```

Update the component signature:

```typescript
export function QBOConnectionCard({ connection, disabled, disabledReason }: QBOConnectionCardProps) {
```

Replace the disconnected state block (the `<>` inside the `: (` branch around lines 103-112) with:

```tsx
<>
  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F1F5F9] text-muted">
    Not connected
  </span>
  {disabled ? (
    <span className="relative group">
      <button
        disabled
        className="h-9 px-3 text-[13px] rounded-brand-md border border-border text-muted cursor-not-allowed font-medium"
      >
        Connect
      </button>
      {disabledReason && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-md bg-text px-3 py-2 text-xs text-white text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
          {disabledReason}
        </span>
      )}
    </span>
  ) : (
    <a href="/api/quickbooks/connect">
      <Button variant="outline" className="h-9 px-3 text-[13px]">
        Connect
      </Button>
    </a>
  )}
</>
```

- [ ] **Step 2: Create XeroConnectionCard**

Create `components/settings/XeroConnectionCard.tsx` matching the QBO card structure:

```tsx
"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

interface XeroConnectionCardProps {
  connection: {
    connected: boolean;
    companyId?: string;
    companyName?: string;
    connectedAt?: string;
  };
  disabled?: boolean;
  disabledReason?: string;
}

export function XeroConnectionCard({ connection, disabled, disabledReason }: XeroConnectionCardProps) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const response = await fetch("/api/xero/disconnect", {
        method: "POST",
      });

      if (response.ok) {
        window.location.href = "/settings?xero_success=" + encodeURIComponent("Xero disconnected.");
      } else {
        window.location.href = "/settings?xero_error=" + encodeURIComponent("Failed to disconnect Xero.");
      }
    } catch {
      setDisconnecting(false);
      window.location.href = "/settings?xero_error=" + encodeURIComponent("Failed to disconnect Xero.");
    }
  }

  const connectedDate = connection.connectedAt
    ? new Date(connection.connectedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-5 flex items-center gap-5 transition-all duration-150 ease-in-out hover:-translate-y-0.5 hover:shadow-float">
      {/* Xero Logo */}
      <div className="flex h-11 w-11 items-center justify-center rounded-brand-md bg-[#13B5EA] flex-shrink-0">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4.5 5.5L12 13M12 13L19.5 5.5M12 13L4.5 20.5M12 13L19.5 20.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-body font-bold text-[15px] text-text">
          Xero
        </p>
        <p className="font-body text-[13px] text-muted">
          {connection.connected && connection.companyName
            ? `${connection.companyName}${connectedDate ? ` · Connected ${connectedDate}` : ""}`
            : "Connect your Xero account to sync invoices as bills."}
        </p>
      </div>

      {/* Right side: status + action */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {connection.connected ? (
          <>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#D1FAE5] text-[#065F46]">
              Connected
            </span>
            {showConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-muted">
                  Disconnect?
                </span>
                <Button
                  variant="danger"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="h-9 px-3 text-[13px]"
                >
                  {disconnecting ? "..." : "Yes"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowConfirm(false)}
                  className="h-9 px-3 text-[13px]"
                >
                  No
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => setShowConfirm(true)}
                className="text-error border-[#FECACA] h-9 px-3 text-[13px]"
              >
                Disconnect
              </Button>
            )}
          </>
        ) : (
          <>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F1F5F9] text-muted">
              Not connected
            </span>
            {disabled ? (
              <span className="relative group">
                <button
                  disabled
                  className="h-9 px-3 text-[13px] rounded-brand-md border border-border text-muted cursor-not-allowed font-medium"
                >
                  Connect
                </button>
                {disabledReason && (
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-md bg-text px-3 py-2 text-xs text-white text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {disabledReason}
                  </span>
                )}
              </span>
            ) : (
              <a href="/api/xero/connect">
                <Button variant="outline" className="h-9 px-3 text-[13px]">
                  Connect
                </Button>
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify types**

```bash
npx tsc --noEmit
```

Expected: passes clean

- [ ] **Step 4: Commit**

```bash
git add components/settings/XeroConnectionCard.tsx components/settings/QBOConnectionCard.tsx
git commit -m "feat: add XeroConnectionCard and disabled state to QBOConnectionCard (DOC-60)"
```

---

## Task 3: Update Settings Page

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`

The page already fetches `connectionData` with `provider` field. We need to:
1. Show both QBO and Xero cards
2. Pass disabled state when the other provider is connected
3. Handle `xero_success`/`xero_error` search params

- [ ] **Step 1: Update imports**

Add the Xero card import:

```typescript
import { XeroConnectionCard } from "@/components/settings/XeroConnectionCard";
```

- [ ] **Step 2: Update searchParams type**

Change the searchParams type to also accept xero alerts:

```typescript
searchParams: { qbo_success?: string; qbo_error?: string; xero_success?: string; xero_error?: string; subscribed?: string };
```

- [ ] **Step 3: Add Xero alert display**

After the existing QBO alert blocks (after line 113), add:

```tsx
{searchParams.xero_success && (
  <SettingsAlert type="success" message={searchParams.xero_success} />
)}
{searchParams.xero_error && (
  <SettingsAlert type="error" message={searchParams.xero_error} />
)}
```

- [ ] **Step 4: Build connection props for both cards**

Replace the existing `qboConnection` variable (lines 73-78) with:

```typescript
const connectedProvider = connectionData.connected ? connectionData.provider : null;

const qboConnection = {
  connected: connectedProvider === "quickbooks",
  companyId: connectedProvider === "quickbooks" ? connectionData.companyId : undefined,
  companyName: connectedProvider === "quickbooks" ? connectionData.companyName : undefined,
  connectedAt: connectedProvider === "quickbooks" ? connectionData.connectedAt : undefined,
};

const xeroConnection = {
  connected: connectedProvider === "xero",
  companyId: connectedProvider === "xero" ? connectionData.companyId : undefined,
  companyName: connectedProvider === "xero" ? connectionData.companyName : undefined,
  connectedAt: connectedProvider === "xero" ? connectionData.connectedAt : undefined,
};
```

- [ ] **Step 5: Update the Connections section JSX**

Replace the single `<QBOConnectionCard connection={qboConnection} />` (line 133) with both cards in a vertical stack with mutual exclusion:

```tsx
<div className="space-y-3">
  <QBOConnectionCard
    connection={qboConnection}
    disabled={connectedProvider === "xero"}
    disabledReason="Disconnect Xero before connecting QuickBooks"
  />
  <XeroConnectionCard
    connection={xeroConnection}
    disabled={connectedProvider === "quickbooks"}
    disabledReason="Disconnect QuickBooks before connecting Xero"
  />
</div>
```

- [ ] **Step 6: Verify build**

```bash
npx tsc --noEmit && npm run build
```

Expected: passes clean

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/settings/page.tsx"
git commit -m "feat: show both QBO and Xero cards with mutual exclusion on Settings page (DOC-60)"
```

---

## Task 4: Make ActionBar Provider-Aware

**Files:**
- Modify: `components/invoices/ActionBar.tsx`

Replace all hardcoded "QuickBooks" references with dynamic provider labels. Add a `provider` prop.

- [ ] **Step 1: Update imports and props**

Replace the `getQuickBooksTransactionUrl` import with:

```typescript
import { getTransactionUrl, getProviderLabel } from "@/lib/accounting/links";
import type { AccountingProviderType } from "@/lib/accounting/types";
```

Add `provider` to `ActionBarProps`:

```typescript
interface ActionBarProps {
  invoiceId: string;
  currentStatus: InvoiceStatus;
  vendorName: string | number | null;
  totalAmount: string | number | null;
  syncBlockers: string[];
  isRetry?: boolean;
  outputType: OutputType;
  provider: AccountingProviderType | null;
  onStatusChange: (newStatus: InvoiceStatus) => void;
}
```

Update the destructured params:

```typescript
export default function ActionBar({
  invoiceId,
  currentStatus,
  vendorName,
  totalAmount,
  syncBlockers,
  isRetry = false,
  outputType,
  provider,
  onStatusChange,
}: ActionBarProps) {
```

- [ ] **Step 2: Replace hardcoded "QuickBooks" in synced status (line ~237)**

Change:

```tsx
<span className="text-sm text-accent">This invoice has been synced to QuickBooks.</span>
```

To:

```tsx
<span className="text-sm text-accent">
  This invoice has been synced to {provider ? getProviderLabel(provider) : "your accounting software"}.
</span>
```

- [ ] **Step 3: Replace hardcoded sync button labels (lines ~250-251)**

Change:

```typescript
label: isRetry ? "Retry Sync to QuickBooks" : "Sync to QuickBooks",
```

To:

```typescript
label: isRetry
  ? `Retry Sync to ${provider ? getProviderLabel(provider) : "Accounting"}`
  : `Sync to ${provider ? getProviderLabel(provider) : "Accounting"}`,
```

- [ ] **Step 4: Replace hardcoded sync success message (line ~304)**

Change:

```tsx
<span className="text-accent">Invoice synced to QuickBooks.</span>
```

To:

```tsx
<span className="text-accent">
  Invoice synced to {provider ? getProviderLabel(provider) : "accounting"}.
</span>
```

- [ ] **Step 5: Replace "View in QuickBooks" link (line ~307-315)**

Change:

```tsx
href={getQuickBooksTransactionUrl(outputType, syncedEntityId)}
```

To:

```tsx
href={provider ? getTransactionUrl(provider, outputType, syncedEntityId) : "#"}
```

Change:

```tsx
View in QuickBooks
```

To:

```tsx
View in {provider ? getProviderLabel(provider) : "accounting"}
```

- [ ] **Step 6: Replace "Ready to sync to QuickBooks" idle message (line ~333)**

Change:

```tsx
: "Ready to sync to QuickBooks."}
```

To:

```tsx
: `Ready to sync to ${provider ? getProviderLabel(provider) : "accounting"}.`}
```

- [ ] **Step 7: Verify types**

```bash
npx tsc --noEmit
```

Expected: will fail because ExtractionForm doesn't pass `provider` yet. That's Task 6.

- [ ] **Step 8: Commit (partial, will be completed in Task 6)**

Don't commit yet — wait for Task 6 to wire it all together.

---

## Task 5: Make SyncStatusPanel Provider-Aware

**Files:**
- Modify: `components/invoices/SyncStatusPanel.tsx`

The `SyncLogEntry` interface already has a `provider` field from the API. We just need to use it for dynamic labels and links.

- [ ] **Step 1: Update imports**

Replace:

```typescript
import { getQuickBooksTransactionUrl } from "@/lib/quickbooks/links";
```

With:

```typescript
import { getTransactionUrl, getProviderLabel } from "@/lib/accounting/links";
import type { AccountingProviderType } from "@/lib/accounting/types";
```

- [ ] **Step 2: Update getSuccessMessage to be fully provider-aware (line ~42-47)**

The `SYNC_SUCCESS_MESSAGES` in `lib/types/invoice.ts` are hardcoded to "QuickBooks". Rather than changing the shared constant (which other code may depend on), build the message dynamically here:

Change the entire `getSuccessMessage` function:

```typescript
function getSuccessMessage(entry: SyncLogEntry): string {
  const providerLabel = getProviderLabel((entry.provider as AccountingProviderType) || "quickbooks");
  if (entry.transaction_type) {
    const typeLabels: Record<string, string> = {
      bill: "Bill created",
      check: "Check created",
      cash: "Expense recorded",
      credit_card: "Credit card expense recorded",
    };
    const label = typeLabels[entry.transaction_type] ?? "Synced";
    return `${label} in ${providerLabel}`;
  }
  return `Synced to ${providerLabel}`;
}
```

This avoids using the hardcoded `SYNC_SUCCESS_MESSAGES` constant entirely. Remove the `SYNC_SUCCESS_MESSAGES` import from the top of the file if it becomes unused.

- [ ] **Step 3: Update "View in QuickBooks" link (lines ~161-172)**

Change:

```tsx
href={getQuickBooksTransactionUrl(latestLog.transaction_type, latestLog.provider_bill_id)}
```

To:

```tsx
href={getTransactionUrl(
  (latestLog.provider as AccountingProviderType) || "quickbooks",
  latestLog.transaction_type,
  latestLog.provider_bill_id
)}
```

Change:

```tsx
View in QuickBooks
```

To:

```tsx
View in {getProviderLabel((latestLog.provider as AccountingProviderType) || "quickbooks")}
```

- [ ] **Step 4: Verify types**

```bash
npx tsc --noEmit
```

Expected: passes clean (SyncStatusPanel doesn't need new props; it reads provider from sync_log data)

- [ ] **Step 5: Commit**

```bash
git add components/invoices/SyncStatusPanel.tsx
git commit -m "feat: make SyncStatusPanel provider-aware using sync_log provider field (DOC-60)"
```

---

## Task 6: Thread Provider Through Review Page -> ReviewLayout -> ExtractionForm -> ActionBar

**Files:**
- Modify: `app/(dashboard)/invoices/[id]/review/page.tsx`
- Modify: `components/invoices/ReviewLayout.tsx`
- Modify: `components/invoices/ExtractionForm.tsx`

The data flow is: `review/page.tsx` (server) -> `ReviewLayout` (client) -> `ExtractionForm` (client) -> `ActionBar` (client). We need to thread `connectedProvider` through the entire chain.

- [ ] **Step 1: Fetch connectedProvider in the review page server component**

In `app/(dashboard)/invoices/[id]/review/page.tsx`, add import:

```typescript
import { getOrgProvider } from "@/lib/accounting";
```

The review page already has an `admin` client (line 65) and fetches `orgResult` which includes `membership.org_id`. After the existing `Promise.all` (line 66), fetch the provider using the org_id already retrieved inside the org query:

Add after the `Promise.all` block (after line 85):

```typescript
// Fetch connected provider for dynamic sync labels
const orgId = await supabase
  .from("org_memberships")
  .select("org_id")
  .limit(1)
  .single()
  .then(({ data }) => data?.org_id ?? null);

const connectedProvider = orgId ? await getOrgProvider(admin, orgId) : null;
```

Note: `admin` is already defined at line 65 as `createAdminClient()`.

Then pass `connectedProvider` to the `ReviewLayout` component (around line 109):

```tsx
<ReviewLayout
  invoice={{...}}
  signedUrl={signedUrlResult.data.signedUrl}
  extractedData={extractedData as unknown as ExtractedDataRow}
  orgDefaults={{...}}
  batchManifest={batchManifest}
  connectedProvider={connectedProvider}
/>
```

- [ ] **Step 2: Update ReviewLayout to accept and pass connectedProvider**

In `components/invoices/ReviewLayout.tsx`, add to `ReviewLayoutProps`:

```typescript
connectedProvider: "quickbooks" | "xero" | null;
```

Add to the destructured props:

```typescript
export default function ReviewLayout({
  invoice,
  signedUrl,
  extractedData,
  orgDefaults,
  batchManifest,
  connectedProvider,
}: ReviewLayoutProps) {
```

Pass it to `ExtractionForm` (around line 168):

```tsx
<ExtractionForm
  extractedData={extractedData}
  invoiceId={invoice.id}
  invoiceStatus={invoice.status}
  errorMessage={invoice.errorMessage}
  outputType={invoice.outputType}
  paymentAccountId={invoice.paymentAccountId}
  paymentAccountName={invoice.paymentAccountName}
  orgDefaults={orgDefaults}
  batchId={invoice.batchId}
  batchManifest={batchManifest}
  connectedProvider={connectedProvider}
/>
```

- [ ] **Step 3: Update ExtractionForm to accept and use connectedProvider**

In `components/invoices/ExtractionForm.tsx`:

Add to `ExtractionFormProps` interface:

```typescript
connectedProvider: "quickbooks" | "xero" | null;
```

Add an import at the top:

```typescript
import { getProviderLabel } from "@/lib/accounting/links";
```

Add to the destructured props of the component.

Update sync blockers (lines 284-288). Change:

```typescript
if (!qboOptions.connected) {
  syncBlockers.push("Connect QuickBooks in Settings");
}
if (!vendorRef) syncBlockers.push("Select a QuickBooks vendor");
```

To:

```typescript
if (!qboOptions.connected) {
  syncBlockers.push("Connect an accounting provider in Settings");
}
if (!vendorRef) syncBlockers.push("Select a vendor");
```

Update the disconnection warning banner (lines 432-461). Change the hardcoded "QuickBooks disconnected" to be provider-aware:

```tsx
{/* Accounting disconnection warning */}
{!qboOptions.loading && !qboOptions.connected && (
  <div className="flex items-start gap-2 bg-error/5 border border-error/20 rounded-md p-3">
    <svg
      className="h-5 w-5 text-error shrink-0 mt-0.5"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
    <div className="text-sm">
      <p className="text-error font-medium">
        {connectedProvider
          ? `${getProviderLabel(connectedProvider)} disconnected`
          : "No accounting provider connected"}
      </p>
      <p className="text-muted mt-0.5">
        {qboOptions.error ?? "Reconnect in Settings to sync invoices."}
        {" "}
        <a
          href="/settings"
          className="text-primary hover:text-primary-hover underline"
        >
          Go to Settings
        </a>
      </p>
    </div>
  </div>
)}
```

Update the `ActionBar` usage (around line 552) to pass the provider:

```tsx
<ActionBar
  invoiceId={invoiceId}
  currentStatus={currentStatus}
  vendorName={state.values.vendor_name}
  totalAmount={state.values.total_amount}
  syncBlockers={syncBlockers}
  isRetry={isRetry}
  outputType={currentOutputType}
  provider={connectedProvider}
  onStatusChange={handleStatusChange}
/>
```

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit && npm run build
```

Expected: passes clean

- [ ] **Step 5: Commit all provider-threading changes**

```bash
git add components/invoices/ActionBar.tsx components/invoices/ExtractionForm.tsx components/invoices/ReviewLayout.tsx
git add "app/(dashboard)/invoices/[id]/review/page.tsx"
git commit -m "feat: thread provider identity through review page, ReviewLayout, ExtractionForm, and ActionBar (DOC-60)"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Run full verification suite**

```bash
npm run lint && npx tsc --noEmit && npm run build
```

Expected: all pass clean

- [ ] **Step 2: Run tests**

```bash
npm run test
```

Expected: existing tests pass. ActionBar tests may need updating if they check for hardcoded "QuickBooks" text.

- [ ] **Step 3: Update ActionBar tests if needed**

Check `components/invoices/ActionBar.test.tsx`. If tests assert "Sync to QuickBooks" text, update them to pass `provider="quickbooks"` prop and assert the dynamic label.

- [ ] **Step 4: Manual verification checklist**

Verify all acceptance criteria:
- [ ] Settings page shows both QBO and Xero cards
- [ ] When QBO is connected, Xero card's Connect button is disabled with tooltip
- [ ] When Xero is connected, QBO card's Connect button is disabled with tooltip
- [ ] When neither is connected, both Connect buttons are enabled
- [ ] Disconnect flow works for both providers with confirmation
- [ ] Sync button on review page says "Sync to QuickBooks" when QBO connected
- [ ] Sync button on review page says "Sync to Xero" when Xero connected
- [ ] No-connection state shows "Connect an accounting provider in Settings"
- [ ] SyncStatusPanel shows correct provider name for synced invoices
- [ ] "View in QuickBooks" / "View in Xero" links work correctly

- [ ] **Step 5: Commit any test fixes**

```bash
git add components/invoices/ActionBar.test.tsx
git commit -m "test: update ActionBar tests for provider-aware labels (DOC-60)"
```
