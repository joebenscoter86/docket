# DOC-114 (Delete Invoice) + DOC-122 (Feedback Form) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two quick-win features from first customer feedback before Monday Zoom call: (1) delete/archive invoice functionality, (2) in-app feedback form that sends via Resend.

**Architecture:** Delete uses soft-delete via a new `archived` status on the invoices table. A DELETE endpoint on `/api/invoices/[id]` sets status to `archived`, and the invoice list query already filters by status so archived invoices naturally disappear. The feedback form is a simple client component in the sidebar that POSTs to `/api/feedback` which sends an email via the existing Resend infrastructure.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + Storage), Tailwind CSS, Resend for email

---

## Part 1: DOC-114 -- Delete/Archive Invoice

### Task 1: Add DELETE endpoint for invoices

**Files:**
- Create: `app/api/invoices/[id]/delete/route.ts`
- Reference: `app/api/invoices/[id]/route.ts` (for auth/org pattern)
- Reference: `lib/utils/errors.ts` (for error helpers)

- [ ] **Step 1: Create the DELETE route**

```typescript
// app/api/invoices/[id]/delete/route.ts
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/utils/logger";
import { authError, validationError, apiSuccess, internalError, conflict } from "@/lib/utils/errors";

const NON_DELETABLE_STATUSES = ["extracting", "uploading"];

/**
 * DELETE /api/invoices/[id]/delete
 *
 * Soft-deletes an invoice by setting status to "archived".
 * Rejects if invoice is mid-extraction or mid-upload.
 * Warns if invoice has been synced to an accounting provider.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const { id: invoiceId } = await params;

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return authError();
    }

    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership) {
      return authError("No organization found.");
    }

    const orgId = membership.org_id;
    const adminSupabase = createAdminClient();

    // Verify invoice exists and belongs to org
    const { data: invoice } = await adminSupabase
      .from("invoices")
      .select("id, status, file_path")
      .eq("id", invoiceId)
      .eq("org_id", orgId)
      .single();

    if (!invoice) {
      return validationError("Invoice not found.");
    }

    // Block deletion during active processing
    if (NON_DELETABLE_STATUSES.includes(invoice.status)) {
      return conflict(
        `Cannot delete invoice while it is ${invoice.status}. Please wait for processing to complete.`
      );
    }

    // Check if synced -- include warning in response
    let syncWarning: string | null = null;
    if (invoice.status === "synced") {
      const { data: syncLog } = await adminSupabase
        .from("sync_log")
        .select("provider, provider_bill_id")
        .eq("invoice_id", invoiceId)
        .eq("status", "success")
        .limit(1)
        .single();

      if (syncLog) {
        syncWarning = `This invoice was synced to ${syncLog.provider}. The bill (ID: ${syncLog.provider_bill_id}) still exists in your accounting system and must be deleted there separately.`;
      }
    }

    // Soft delete: set status to archived
    const { error: updateError } = await adminSupabase
      .from("invoices")
      .update({ status: "archived" })
      .eq("id", invoiceId);

    if (updateError) {
      logger.error("invoice.delete_failed", {
        invoiceId,
        orgId,
        userId: user.id,
        error: updateError.message,
      });
      return internalError("Failed to delete invoice.");
    }

    logger.info("invoice.archived", {
      action: "delete_invoice",
      invoiceId,
      orgId,
      userId: user.id,
      previousStatus: invoice.status,
      durationMs: Date.now() - startTime,
      status: "success",
    });

    return apiSuccess({
      deleted: true,
      warning: syncWarning,
    });
  } catch (error) {
    logger.error("invoice.delete_unexpected_error", {
      invoiceId,
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return internalError("An unexpected error occurred.");
  }
}
```

- [ ] **Step 2: Add `archived` to valid invoice statuses**

The invoices table has a CHECK constraint on the `status` column. We need a migration to add `archived` as a valid value.

Create migration file: `supabase/migrations/[timestamp]_add_archived_status.sql`

```sql
-- Add 'archived' to the valid invoice statuses
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('uploading', 'uploaded', 'extracting', 'pending_review', 'approved', 'synced', 'error', 'archived'));
```

Run: `npx supabase db push` (or apply via Supabase dashboard SQL editor)

- [ ] **Step 3: Exclude archived invoices from list and counts**

Two changes needed so archived invoices don't appear in the UI:

**3a. Update `lib/invoices/queries.ts` -- `fetchInvoiceList`:**
When `status === "all"`, the query currently applies no status filter. Add an explicit exclusion:

After line `if (status !== "all") { query = query.eq("status", status); }`, add:
```typescript
// Always exclude archived invoices from the list
query = query.neq("status", "archived");
```

**3b. Update the `invoice_counts_by_status` RPC** to exclude archived:

Create migration: `supabase/migrations/[timestamp]_exclude_archived_from_counts.sql`

```sql
CREATE OR REPLACE FUNCTION invoice_counts_by_status()
RETURNS TABLE(status text, count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.status, count(*)::bigint
  FROM invoices i
  INNER JOIN org_memberships om ON om.org_id = i.org_id
  WHERE om.user_id = auth.uid()
    AND i.status != 'archived'
  GROUP BY i.status;
$$;
```

Run: `npx supabase db push`

- [ ] **Step 4: Commit backend changes**

```bash
git add app/api/invoices/\[id\]/delete/route.ts supabase/migrations/
git commit -m "feat: add soft-delete (archive) endpoint for invoices (DOC-114)"
```

### Task 2: Add delete button to invoice list UI

**Files:**
- Modify: `components/invoices/InvoiceList.tsx`

- [ ] **Step 1: Add delete confirmation state and handler**

Add these state variables and handler function inside the `InvoiceList` component, after the existing state declarations:

```typescript
// Delete confirmation state
const [deleteTarget, setDeleteTarget] = useState<{ id: string; fileName: string } | null>(null);
const [isDeleting, setIsDeleting] = useState(false);
const [deleteWarning, setDeleteWarning] = useState<string | null>(null);

async function handleDelete(invoiceId: string) {
  setIsDeleting(true);
  setDeleteWarning(null);
  try {
    const res = await fetch(`/api/invoices/${invoiceId}/delete`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      setDeleteWarning(json.error || "Failed to delete invoice.");
      setIsDeleting(false);
      return;
    }
    if (json.data?.warning) {
      setDeleteWarning(json.data.warning);
      // Still deleted successfully, just show warning briefly
      setTimeout(() => {
        setDeleteTarget(null);
        setDeleteWarning(null);
        router.refresh();
      }, 4000);
    } else {
      setDeleteTarget(null);
      router.refresh();
    }
  } catch {
    setDeleteWarning("An unexpected error occurred.");
  } finally {
    setIsDeleting(false);
  }
}
```

- [ ] **Step 2: Add delete button to each invoice row**

In the `renderDesktopInvoiceRow` function, add a delete button as the last `<td>` in each row. The button should stop event propagation (since the row is clickable) and open the confirmation dialog:

```tsx
<td className="py-3.5 px-3 text-right">
  <button
    onClick={(e) => {
      e.stopPropagation();
      setDeleteTarget({ id: invoice.id, fileName: invoice.file_name });
    }}
    className="p-1.5 rounded-md text-muted hover:text-error hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all duration-150"
    title="Delete invoice"
  >
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  </button>
</td>
```

Also add a matching `<th>` header for the new column (empty, narrow):
```tsx
<th className="w-12"></th>
```

- [ ] **Step 3: Add confirmation dialog**

Add this modal at the bottom of the InvoiceList component's return, before the closing `</div>`:

```tsx
{/* Delete confirmation dialog */}
{deleteTarget && (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="fixed inset-0 bg-black/50" onClick={() => !isDeleting && setDeleteTarget(null)} />
    <div className="relative bg-surface rounded-brand-lg shadow-xl p-6 max-w-md w-full mx-4">
      <h3 className="font-headings font-bold text-lg text-text mb-2">Delete Invoice</h3>
      <p className="text-sm text-muted mb-6">
        Are you sure you want to delete <span className="font-semibold text-text">{deleteTarget.fileName}</span>? This action will archive the invoice and remove it from your list.
      </p>
      {deleteWarning && (
        <div className="mb-4 p-3 rounded-brand-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
          {deleteWarning}
        </div>
      )}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => { setDeleteTarget(null); setDeleteWarning(null); }}
          disabled={isDeleting}
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={() => handleDelete(deleteTarget.id)}
          disabled={isDeleting}
        >
          {isDeleting ? "Deleting..." : "Delete"}
        </Button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Commit frontend changes**

```bash
git add components/invoices/InvoiceList.tsx
git commit -m "feat: add delete button with confirmation dialog to invoice list (DOC-114)"
```

### Task 3: Verify and test

- [ ] **Step 1: Run lint and type check**

```bash
npm run lint && npx tsc --noEmit
```

- [ ] **Step 2: Run existing tests to check for regressions**

```bash
npm run test
```

- [ ] **Step 3: Manual verification**

- Upload a test invoice
- Verify it appears in the invoice list
- Hover over the row and confirm the delete icon appears
- Click delete and verify confirmation dialog appears
- Confirm deletion and verify the invoice disappears from the list
- Check Supabase: verify the invoice status is now "archived"

- [ ] **Step 4: Final commit if any fixes needed**

---

## Part 2: DOC-122 -- In-App Feedback Form

### Task 4: Create feedback API route

**Files:**
- Create: `app/api/feedback/route.ts`
- Reference: `lib/email/send.ts` (existing Resend send helper)
- Reference: `lib/utils/errors.ts`

- [ ] **Step 1: Create the feedback API route**

```typescript
// app/api/feedback/route.ts
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/utils/logger";
import { authError, validationError, apiSuccess, internalError } from "@/lib/utils/errors";
import { getResend } from "@/lib/email/resend";

const FEEDBACK_RECIPIENT = "joe@dockett.app";
const MAX_MESSAGE_LENGTH = 5000;

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return authError();
    }

    let body: { message?: string; type?: string };
    try {
      body = await request.json();
    } catch {
      return validationError("Invalid JSON body.");
    }

    const message = body.message?.trim();
    const type = body.type === "bug" ? "Bug Report" : "Feature Request";

    if (!message || message.length === 0) {
      return validationError("Message is required.");
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return validationError(`Message must be under ${MAX_MESSAGE_LENGTH} characters.`);
    }

    // Send via Resend as plain text (no React template needed for internal feedback)
    const { error: sendError } = await getResend().emails.send({
      from: "Dockett Feedback <no-reply@dockett.app>",
      to: FEEDBACK_RECIPIENT,
      replyTo: user.email || undefined,
      subject: `[${type}] Feedback from ${user.email}`,
      text: [
        `Type: ${type}`,
        `From: ${user.email}`,
        `User ID: ${user.id}`,
        `Date: ${new Date().toISOString()}`,
        "",
        "Message:",
        message,
      ].join("\n"),
    });

    if (sendError) {
      logger.error("feedback.send_failed", {
        userId: user.id,
        error: sendError.message,
      });
      return internalError("Failed to send feedback. Please try again.");
    }

    logger.info("feedback.sent", {
      action: "send_feedback",
      userId: user.id,
      type,
      durationMs: Date.now() - startTime,
      status: "success",
    });

    return apiSuccess({ sent: true });
  } catch (error) {
    logger.error("feedback.unexpected_error", {
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - startTime,
    });
    return internalError("An unexpected error occurred.");
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/feedback/route.ts
git commit -m "feat: add feedback API route with Resend email delivery (DOC-122)"
```

### Task 5: Add feedback button and modal to sidebar

**Files:**
- Modify: `components/layout/Sidebar.tsx`

- [ ] **Step 1: Add feedback state and form to Sidebar**

Add these imports and state to the Sidebar component:

```typescript
import { useState } from 'react'
```

Add state variables inside the Sidebar component:

```typescript
const [showFeedback, setShowFeedback] = useState(false)
const [feedbackType, setFeedbackType] = useState<'feature' | 'bug'>('feature')
const [feedbackMessage, setFeedbackMessage] = useState('')
const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

async function handleSubmitFeedback() {
  if (!feedbackMessage.trim()) return
  setFeedbackStatus('sending')
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: feedbackMessage, type: feedbackType }),
    })
    if (res.ok) {
      setFeedbackStatus('sent')
      setFeedbackMessage('')
      setTimeout(() => {
        setShowFeedback(false)
        setFeedbackStatus('idle')
      }, 2000)
    } else {
      setFeedbackStatus('error')
    }
  } catch {
    setFeedbackStatus('error')
  }
}
```

- [ ] **Step 2: Add feedback button above the user badge section**

In the Sidebar component, add a feedback button just before the `{/* User badge + sign out */}` section:

```tsx
{/* Feedback button */}
<div className="px-3 pb-2">
  <button
    onClick={() => setShowFeedback(true)}
    className="flex w-full items-center gap-3 rounded-brand-md px-3 py-2.5 text-sm font-body text-muted hover:bg-background hover:text-text transition-all duration-150 ease-in-out"
  >
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
    </svg>
    Feedback
  </button>
</div>
```

- [ ] **Step 3: Add feedback modal**

Add this modal at the very end of the Sidebar component's return (after the mobile sidebar overlay closing tags):

```tsx
{/* Feedback modal */}
{showFeedback && (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="fixed inset-0 bg-black/50" onClick={() => feedbackStatus !== 'sending' && setShowFeedback(false)} />
    <div className="relative bg-surface rounded-brand-lg shadow-xl p-6 max-w-md w-full mx-4">
      <h3 className="font-headings font-bold text-lg text-text mb-1">Send Feedback</h3>
      <p className="text-sm text-muted mb-4">We read every message. Thanks for helping us improve!</p>

      {feedbackStatus === 'sent' ? (
        <div className="py-8 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-10 w-10 text-success mx-auto mb-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <p className="font-body font-semibold text-text">Thanks for your feedback!</p>
        </div>
      ) : (
        <>
          {/* Type toggle */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setFeedbackType('feature')}
              className={`flex-1 py-2 px-3 rounded-brand-md text-sm font-body font-medium transition-all duration-150 ${
                feedbackType === 'feature'
                  ? 'bg-primary text-white'
                  : 'bg-background text-muted hover:text-text'
              }`}
            >
              Feature Request
            </button>
            <button
              onClick={() => setFeedbackType('bug')}
              className={`flex-1 py-2 px-3 rounded-brand-md text-sm font-body font-medium transition-all duration-150 ${
                feedbackType === 'bug'
                  ? 'bg-error text-white'
                  : 'bg-background text-muted hover:text-text'
              }`}
            >
              Bug Report
            </button>
          </div>

          {/* Message */}
          <textarea
            value={feedbackMessage}
            onChange={(e) => setFeedbackMessage(e.target.value)}
            placeholder={feedbackType === 'bug' ? 'Describe the issue...' : 'What would make Dockett better?'}
            className="w-full h-32 rounded-brand-md border border-border px-3.5 py-3 font-body text-sm text-text resize-none transition-all duration-150 ease-in-out placeholder:text-muted focus:outline-none focus:ring-[3px] focus:ring-[#BFDBFE] focus:border-primary"
            maxLength={5000}
          />

          {feedbackStatus === 'error' && (
            <p className="text-sm text-error mt-2">Something went wrong. Please try again.</p>
          )}

          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={() => { setShowFeedback(false); setFeedbackStatus('idle'); }}
              disabled={feedbackStatus === 'sending'}
              className="inline-flex items-center justify-center h-11 px-5 rounded-brand-md font-body font-bold text-[15px] border border-border bg-transparent text-text hover:bg-background transition-all duration-150 ease-in-out disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitFeedback}
              disabled={feedbackStatus === 'sending' || !feedbackMessage.trim()}
              className="inline-flex items-center justify-center h-11 px-5 rounded-brand-md font-body font-bold text-[15px] bg-primary text-white hover:bg-primary-hover transition-all duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {feedbackStatus === 'sending' ? 'Sending...' : 'Send Feedback'}
            </button>
          </div>
        </>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add components/layout/Sidebar.tsx
git commit -m "feat: add feedback button and modal to sidebar (DOC-122)"
```

### Task 6: Verify and test

- [ ] **Step 1: Run lint and type check**

```bash
npm run lint && npx tsc --noEmit
```

- [ ] **Step 2: Run existing tests**

```bash
npm run test
```

- [ ] **Step 3: Manual verification**

- Log in to the app
- Verify the "Feedback" button appears in the sidebar above the user badge
- Click it and verify the modal opens
- Toggle between "Feature Request" and "Bug Report"
- Submit a message and verify it sends successfully
- Check the joe@dockett.app inbox to confirm the email arrived with correct formatting

- [ ] **Step 4: Final commit if any fixes needed**

---

## Completion Checklist

- [ ] `npm run lint` passes clean
- [ ] `npm run build` completes without errors
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run test` passes
- [ ] No `any` types in new code
- [ ] No `console.log` in production code
- [ ] Server-side secrets not exposed in client bundles
- [ ] Structured logging on all new API routes
