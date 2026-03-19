# DOC-40: Settings Page Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add editable org name (inline edit), change password (Supabase reset email), and invoice usage display to the existing Settings page.

**Architecture:** Two new API routes (`PATCH /api/settings/organization`, `POST /api/settings/change-password`) handle mutations. A new `AccountCard` client component manages inline edit and password reset state. The server-side settings page fetches invoice count and passes it as a prop to the existing `BillingCard`.

**Tech Stack:** Next.js 14 App Router, Supabase Auth + Postgres, Tailwind CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-03-19-doc-40-settings-page-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `app/api/settings/organization/route.ts` | PATCH handler — update org name |
| `app/api/settings/organization/route.test.ts` | Tests for org name update |
| `app/api/settings/change-password/route.ts` | POST handler — trigger password reset email |
| `app/api/settings/change-password/route.test.ts` | Tests for password reset |
| `components/settings/AccountCard.tsx` | Client component — inline edit org name + change password link |
| `components/settings/AccountCard.test.tsx` | Component tests |
| `components/settings/BillingCard.tsx` | Modified — add `invoicesThisMonth` prop |
| `app/(dashboard)/settings/page.tsx` | Modified — add invoice count query, use AccountCard |

---

### Task 1: PATCH /api/settings/organization — Tests

**Files:**
- Create: `app/api/settings/organization/route.test.ts`

- [ ] **Step 1: Write test file with all cases**

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { PATCH } from "./route";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const mockGetUser = vi.fn();
const mockSelectOrgMembership = vi.fn();
const mockUpdateOrg = vi.fn();

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/settings/organization", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/settings/organization", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    mockSelectOrgMembership.mockResolvedValue({
      data: { org_id: "org-456" },
      error: null,
    });

    mockUpdateOrg.mockResolvedValue({
      data: { name: "New Org Name" },
      error: null,
    });

    (createClient as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: { getUser: mockGetUser },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              single: mockSelectOrgMembership,
            }),
          }),
        }),
      }),
    });

    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: mockUpdateOrg,
            }),
          }),
        }),
      }),
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "not authenticated" },
    });

    const res = await PATCH(makeRequest({ name: "Test" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is empty", async () => {
    const res = await PATCH(makeRequest({ name: "   " }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when name exceeds 100 characters", async () => {
    const res = await PATCH(makeRequest({ name: "a".repeat(101) }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when user has no org membership", async () => {
    mockSelectOrgMembership.mockResolvedValue({
      data: null,
      error: { message: "not found" },
    });

    const res = await PATCH(makeRequest({ name: "Test" }));
    expect(res.status).toBe(404);
  });

  it("returns 200 and updated name on success", async () => {
    const res = await PATCH(makeRequest({ name: "New Org Name" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("New Org Name");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/settings/organization/route.test.ts`
Expected: FAIL — `./route` module not found

- [ ] **Step 3: Commit**

```bash
git add app/api/settings/organization/route.test.ts
git commit -m "test: add PATCH /api/settings/organization tests (DOC-40)"
```

---

### Task 2: PATCH /api/settings/organization — Implementation

**Files:**
- Create: `app/api/settings/organization/route.ts`

- [ ] **Step 1: Implement the route handler**

```typescript
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiSuccess, authError, validationError, notFound, internalError } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { revalidatePath } from "next/cache";

export async function PATCH(request: Request) {
  const start = Date.now();
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    logger.warn("settings.update_org_name", { error: "Not authenticated" });
    return authError();
  }

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return validationError("Invalid JSON body.");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return validationError("Organization name is required.");
  }

  if (name.length > 100) {
    return validationError("Organization name must be 100 characters or fewer.");
  }

  // Look up org from membership — never accept org_id from request body
  const { data: membership, error: membershipErr } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (membershipErr || !membership) {
    logger.warn("settings.update_org_name", { userId: user.id, error: "No org membership found" });
    return notFound("Organization not found.");
  }

  const orgId = membership.org_id;

  // Update via admin client (RLS doesn't cover org table writes from user context)
  const admin = createAdminClient();
  const { data: updated, error: updateErr } = await admin
    .from("organizations")
    .update({ name })
    .eq("id", orgId)
    .select("name")
    .single();

  if (updateErr || !updated) {
    logger.error("settings.update_org_name", { userId: user.id, orgId, error: updateErr?.message });
    return internalError("Failed to update organization name.");
  }

  revalidatePath("/settings");

  logger.info("settings.update_org_name", {
    userId: user.id,
    orgId,
    durationMs: Date.now() - start,
    status: "success",
  });

  return apiSuccess({ name: updated.name });
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run app/api/settings/organization/route.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add app/api/settings/organization/route.ts
git commit -m "feat: add PATCH /api/settings/organization route (DOC-40)"
```

---

### Task 3: POST /api/settings/change-password — Tests

**Files:**
- Create: `app/api/settings/change-password/route.test.ts`

- [ ] **Step 1: Write test file with all cases**

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { POST } from "./route";
import { createClient } from "@/lib/supabase/server";

const mockGetUser = vi.fn();
const mockResetPassword = vi.fn();

function makeRequest() {
  return new Request("http://localhost:3000/api/settings/change-password", {
    method: "POST",
    headers: { origin: "http://localhost:3000" },
  });
}

describe("POST /api/settings/change-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123", email: "test@example.com" } },
      error: null,
    });

    mockResetPassword.mockResolvedValue({
      data: {},
      error: null,
    });

    (createClient as ReturnType<typeof vi.fn>).mockReturnValue({
      auth: {
        getUser: mockGetUser,
        resetPasswordForEmail: mockResetPassword,
      },
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "not authenticated" },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 200 and triggers reset email on success", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.message).toBe("Password reset email sent.");
    expect(mockResetPassword).toHaveBeenCalledWith("test@example.com", expect.objectContaining({
      redirectTo: expect.stringContaining("/settings"),
    }));
  });

  it("returns 500 when Supabase reset fails", async () => {
    mockResetPassword.mockResolvedValue({
      data: null,
      error: { message: "rate limited" },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/settings/change-password/route.test.ts`
Expected: FAIL — `./route` module not found

- [ ] **Step 3: Commit**

```bash
git add app/api/settings/change-password/route.test.ts
git commit -m "test: add POST /api/settings/change-password tests (DOC-40)"
```

---

### Task 4: POST /api/settings/change-password — Implementation

**Files:**
- Create: `app/api/settings/change-password/route.ts`

- [ ] **Step 1: Implement the route handler**

```typescript
import { createClient } from "@/lib/supabase/server";
import { apiSuccess, authError, internalError } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";

export async function POST(request: Request) {
  const start = Date.now();
  const supabase = createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    logger.warn("settings.change_password", { error: "Not authenticated" });
    return authError();
  }

  const origin = request.headers.get("origin") || request.headers.get("referer")?.replace(/\/[^/]*$/, "") || "http://localhost:3000";

  const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
    user.email!,
    { redirectTo: `${origin}/settings` }
  );

  if (resetErr) {
    logger.error("settings.change_password", {
      userId: user.id,
      error: resetErr.message,
      durationMs: Date.now() - start,
    });
    return internalError("Failed to send password reset email.");
  }

  logger.info("settings.change_password", {
    userId: user.id,
    durationMs: Date.now() - start,
    status: "success",
  });

  return apiSuccess({ message: "Password reset email sent." });
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run app/api/settings/change-password/route.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 3: Commit**

```bash
git add app/api/settings/change-password/route.ts
git commit -m "feat: add POST /api/settings/change-password route (DOC-40)"
```

---

### Task 5: AccountCard Component

**Files:**
- Create: `components/settings/AccountCard.tsx`

- [ ] **Step 1: Build the AccountCard client component**

```typescript
"use client";

import { useState, useRef, useEffect } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

interface AccountCardProps {
  email: string;
  orgName: string;
  orgId: string;
}

export function AccountCard({ email, orgName, orgId }: AccountCardProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(orgName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [passwordSending, setPasswordSending] = useState(false);
  const [passwordSent, setPasswordSent] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [saved]);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Organization name is required.");
      return;
    }
    if (trimmed.length > 100) {
      setError("Organization name must be 100 characters or fewer.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/settings/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Failed to update organization name.");
        return;
      }

      setName(body.data.name);
      setEditing(false);
      setSaved(true);
    } catch {
      setError("Failed to update organization name.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setName(orgName);
    setEditing(false);
    setError(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  }

  async function handleChangePassword() {
    setPasswordSending(true);
    setPasswordError(null);

    try {
      const res = await fetch("/api/settings/change-password", {
        method: "POST",
      });
      const body = await res.json();

      if (!res.ok) {
        setPasswordError(body.error || "Failed to send reset email.");
        return;
      }

      setPasswordSent(true);
    } catch {
      setPasswordError("Failed to send reset email.");
    } finally {
      setPasswordSending(false);
    }
  }

  return (
    <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-6">
      <div className="space-y-4">
        {/* Email (read-only) */}
        <div>
          <label className="text-sm font-medium text-muted block mb-1.5">
            Email
          </label>
          <div className="bg-background rounded-brand-md px-3.5 py-2.5 text-[14px] text-text">
            {email}
          </div>
        </div>

        {/* Organization (inline edit) */}
        <div>
          <label className="text-sm font-medium text-muted block mb-1.5">
            Organization
          </label>
          {editing ? (
            <div>
              <Input
                ref={inputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={100}
                error={!!error}
                disabled={saving}
              />
              {error && (
                <p className="text-sm text-error mt-1.5">{error}</p>
              )}
              <div className="flex justify-end gap-2 mt-2">
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={saving}
                  className="h-9 px-3 text-[13px]"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSave}
                  disabled={saving}
                  className="h-9 px-3 text-[13px]"
                >
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <div
              className={`bg-background rounded-brand-md px-3.5 py-2.5 text-[14px] text-text flex items-center justify-between${orgId ? " cursor-pointer group hover:border hover:border-primary/30" : ""}`}
              onClick={orgId ? () => setEditing(true) : undefined}
              role={orgId ? "button" : undefined}
              tabIndex={orgId ? 0 : undefined}
              onKeyDown={orgId ? (e) => { if (e.key === "Enter") setEditing(true); } : undefined}
            >
              <span>{name || "—"}</span>
              {orgId && (
                <svg className="h-4 w-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                </svg>
              )}
              {saved && (
                <span className="text-accent text-[13px] font-medium">Saved</span>
              )}
            </div>
          )}
        </div>

        {/* Change Password */}
        <div className="pt-1">
          {passwordSent ? (
            <p className="text-sm text-accent">
              Password reset email sent to {email}.
            </p>
          ) : (
            <>
              <button
                onClick={handleChangePassword}
                disabled={passwordSending}
                className="text-sm text-primary hover:text-primary-hover underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {passwordSending ? "Sending..." : "Change password"}
              </button>
              {passwordError && (
                <p className="text-sm text-error mt-1">{passwordError}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/settings/AccountCard.tsx
git commit -m "feat: add AccountCard component with inline edit and password reset (DOC-40)"
```

---

### Task 6: Update BillingCard — Add Usage Display

**Files:**
- Modify: `components/settings/BillingCard.tsx`

- [ ] **Step 1: Add `invoicesThisMonth` prop to interface and destructure it**

Change the interface (line 6-14) to add the prop:
```typescript
interface BillingCardProps {
  user: {
    id: string;
    email: string;
    stripe_customer_id: string | null;
    subscription_status: string | null;
    is_design_partner: boolean;
  };
  invoicesThisMonth: number;
}
```

Change the destructuring (line 16) to:
```typescript
export function BillingCard({ user, invoicesThisMonth }: BillingCardProps) {
```

- [ ] **Step 2: Add usage line to Design Partner state (after line 75)**

After the `<p>` ending with "at 100 invoices/month." and before the closing `</div>`, insert:
```tsx
        <p className="font-body text-sm text-muted mt-1">
          {invoicesThisMonth} / 100 invoices this month
        </p>
```

- [ ] **Step 3: Add usage line to Active state (after line 95)**

Change the description `<p>` from `mb-5` to `mb-1`, then add after it:
```tsx
        <p className="font-body text-sm text-muted mb-5">
          {invoicesThisMonth} invoices this month
        </p>
```

- [ ] **Step 4: Add usage line to Cancelled state (after line 127)**

Change the description `<p>` from `mb-5` to `mb-1`, then add after it:
```tsx
        <p className="font-body text-sm text-muted mb-5">
          {invoicesThisMonth} invoices this month
        </p>
```

- [ ] **Step 5: Add usage line to No Subscription state (after line 161, after `</ul>` closing tag)**

Add inside the `<div className="mb-4">` block, after the `</ul>`:
```tsx
        <p className="font-body text-sm text-muted mt-2">
          {invoicesThisMonth} invoices this month
        </p>
```

- [ ] **Step 6: Verify the component compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: There will be a type error in `settings/page.tsx` because it doesn't pass `invoicesThisMonth` yet — that's expected and fixed in Task 7. The BillingCard file itself should have no errors.

- [ ] **Step 3: Commit**

```bash
git add components/settings/BillingCard.tsx
git commit -m "feat: add invoice usage display to BillingCard (DOC-40)"
```

---

### Task 7: Update Settings Page — Wire Everything Together

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Add invoice count query and swap AccountCard**

Replace the inline Account section markup with the new `AccountCard` component. Add a query to count invoices for the current month. Pass `invoicesThisMonth` to `BillingCard`.

The updated settings page should:

1. Add import for `AccountCard`:
```typescript
import { AccountCard } from "@/components/settings/AccountCard";
```

2. After the existing `qboConnection` fetch block, add the invoice count query:
```typescript
// Count invoices this month
let invoicesThisMonth = 0;
if (orgId) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { count } = await supabase
    .from("invoices")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("uploaded_at", startOfMonth);
  invoicesThisMonth = count ?? 0;
}
```

3. Replace the inline Account `<div>` section (the one with Email and Organization fields) with:
```tsx
<AccountCard email={user?.email ?? ""} orgName={orgName} orgId={orgId} />
```

4. Update the `BillingCard` usage to pass the new prop:
```tsx
<BillingCard user={billingUser} invoicesThisMonth={invoicesThisMonth} />
```

- [ ] **Step 2: Run type check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: Both pass with no errors

- [ ] **Step 3: Run all tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/settings/page.tsx
git commit -m "feat: wire AccountCard and invoice usage into settings page (DOC-40)"
```

---

### Task 8: Component Tests for AccountCard

**Files:**
- Create: `components/settings/AccountCard.test.tsx`

- [ ] **Step 1: Write component tests**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AccountCard } from "./AccountCard";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("AccountCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders email and org name in read-only mode", () => {
    render(<AccountCard email="test@example.com" orgName="Acme Inc" orgId="org-1" />);
    expect(screen.getByText("test@example.com")).toBeTruthy();
    expect(screen.getByText("Acme Inc")).toBeTruthy();
  });

  it("enters edit mode when org name is clicked", () => {
    render(<AccountCard email="test@example.com" orgName="Acme Inc" orgId="org-1" />);
    fireEvent.click(screen.getByText("Acme Inc"));
    expect(screen.getByDisplayValue("Acme Inc")).toBeTruthy();
    expect(screen.getByText("Save")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("cancels edit mode without API call", () => {
    render(<AccountCard email="test@example.com" orgName="Acme Inc" orgId="org-1" />);
    fireEvent.click(screen.getByText("Acme Inc"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("Acme Inc")).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("saves org name and returns to read-only on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { name: "New Name" } }),
    });

    render(<AccountCard email="test@example.com" orgName="Acme Inc" orgId="org-1" />);
    fireEvent.click(screen.getByText("Acme Inc"));

    const input = screen.getByDisplayValue("Acme Inc");
    fireEvent.change(input, { target: { value: "New Name" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(screen.getByText("New Name")).toBeTruthy();
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/settings/organization", expect.objectContaining({
      method: "PATCH",
    }));
  });

  it("triggers password reset and shows success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { message: "Password reset email sent." } }),
    });

    render(<AccountCard email="test@example.com" orgName="Acme Inc" orgId="org-1" />);
    fireEvent.click(screen.getByText("Change password"));

    await waitFor(() => {
      expect(screen.getByText("Password reset email sent to test@example.com.")).toBeTruthy();
    });
  });

  it("saves on Enter key", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { name: "Enter Name" } }),
    });

    render(<AccountCard email="test@example.com" orgName="Acme Inc" orgId="org-1" />);
    fireEvent.click(screen.getByText("Acme Inc"));

    const input = screen.getByDisplayValue("Acme Inc");
    fireEvent.change(input, { target: { value: "Enter Name" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Enter Name")).toBeTruthy();
    });
  });

  it("cancels on Escape key", () => {
    render(<AccountCard email="test@example.com" orgName="Acme Inc" orgId="org-1" />);
    fireEvent.click(screen.getByText("Acme Inc"));

    const input = screen.getByDisplayValue("Acme Inc");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.getByText("Acme Inc")).toBeTruthy();
    expect(screen.queryByDisplayValue("Acme Inc")).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not show edit affordance when no orgId", () => {
    render(<AccountCard email="test@example.com" orgName="" orgId="" />);
    expect(screen.getByText("—")).toBeTruthy();
    // The dash element should not have role="button"
    const dashElement = screen.getByText("—").closest("div");
    expect(dashElement?.getAttribute("role")).toBeNull();
  });
});
```

- [ ] **Step 2: Run component tests**

Run: `npx vitest run components/settings/AccountCard.test.tsx`
Expected: All 8 tests PASS

- [ ] **Step 3: Commit**

```bash
git add components/settings/AccountCard.test.tsx
git commit -m "test: add AccountCard component tests (DOC-40)"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: Zero warnings, zero errors

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Build completes successfully

- [ ] **Step 5: Verify no `console.log` in new files**

Run: `grep -r "console.log" app/api/settings/ components/settings/AccountCard.tsx`
Expected: No matches

---

## Acceptance Criteria Checklist

- [ ] Settings page has Account section with email (read-only) and editable org name
- [ ] Org name uses inline edit pattern (click to edit, Enter/Escape keyboard support)
- [ ] Change password link sends Supabase reset email with feedback
- [ ] Billing section shows "X invoices this month" (with /100 cap for design partners)
- [ ] All state changes save immediately with visual feedback
- [ ] API routes use structured logging and consistent error responses
- [ ] All tests pass (API routes + component)
- [ ] Lint, typecheck, and build pass clean
