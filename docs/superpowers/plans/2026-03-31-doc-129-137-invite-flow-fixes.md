# DOC-129 + DOC-137: Invite Flow Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inviter name to invite emails and handle auth mismatch gracefully on the invite accept page.

**Architecture:** Add `full_name` column to users, collect during signup via auth metadata, pass through to invite email template and invite accept page. Add a `mismatch` state to the invite page that detects when the logged-in user's email doesn't match the invite, with clear switch/create account buttons.

**Tech Stack:** Supabase (migration + trigger update), Next.js (signup form, API routes, invite page), React Email (template)

**Spec:** `docs/superpowers/specs/2026-03-31-doc-129-137-invite-flow-fixes-design.md`

---

### Task 1: Add `full_name` column and update trigger

**Files:**
- Create: `supabase/migrations/20260331000001_add_full_name_to_users.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add full_name column to users table
ALTER TABLE public.users ADD COLUMN full_name TEXT;

-- Update handle_new_user trigger to copy full_name from auth metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_user_id UUID;
  new_org_id UUID;
  org_name TEXT;
  email_domain TEXT;
BEGIN
  -- Extract domain from email for default org name
  email_domain := split_part(NEW.email, '@', 2);
  IF email_domain IS NOT NULL AND email_domain != '' THEN
    org_name := initcap(split_part(email_domain, '.', 1));
  ELSE
    org_name := 'My Organization';
  END IF;

  -- Create user row first (organizations.owner_id references users.id)
  INSERT INTO public.users (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  RETURNING id INTO new_user_id;

  -- Set design partner flag if invite code was provided
  IF NEW.raw_user_meta_data->>'invite_code' IS NOT NULL
     AND NEW.raw_user_meta_data->>'invite_code' != '' THEN
    UPDATE public.users SET is_design_partner = true WHERE id = new_user_id;
  END IF;

  -- Create default organization
  INSERT INTO public.organizations (name, owner_id)
  VALUES (org_name, new_user_id)
  RETURNING id INTO new_org_id;

  -- Set active_org_id on the user
  UPDATE public.users SET active_org_id = new_org_id WHERE id = new_user_id;

  -- Create org membership
  INSERT INTO public.org_memberships (user_id, org_id, role)
  VALUES (new_user_id, new_org_id, 'owner');

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't block auth signup
    RAISE WARNING 'handle_new_user trigger failed for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db push` (or apply via Supabase MCP `apply_migration`)
Expected: Migration applies successfully, `full_name` column exists on `users` table.

- [ ] **Step 3: Regenerate database types**

Run: `npx supabase gen types typescript --local > lib/supabase/database.types.ts`
Expected: `database.types.ts` now includes `full_name: string | null` in the users table Row/Insert/Update types.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260331000001_add_full_name_to_users.sql lib/supabase/database.types.ts
git commit -m "feat(db): add full_name column to users, update trigger to copy from metadata (DOC-129)"
```

---

### Task 2: Add Full Name field to signup form

**Files:**
- Modify: `app/(auth)/signup/page.tsx`

- [ ] **Step 1: Add `fullName` state**

In `SignupPage`, add state alongside the existing fields:

```typescript
const [fullName, setFullName] = useState('')
```

- [ ] **Step 2: Add validation for full name**

In `handleSubmit`, before the password length check, add:

```typescript
if (!fullName.trim()) {
  setError('Please enter your full name.')
  return
}
```

- [ ] **Step 3: Pass full_name in signUp metadata**

Change the `supabase.auth.signUp` call from:

```typescript
const { error: authError } = await supabase.auth.signUp({
  email,
  password,
  options: trimmedCode ? { data: { invite_code: trimmedCode } } : undefined,
})
```

To:

```typescript
const { error: authError } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: {
      full_name: fullName.trim(),
      ...(trimmedCode ? { invite_code: trimmedCode } : {}),
    },
  },
})
```

- [ ] **Step 4: Add the Full Name input field in the form JSX**

Insert this block as the first field in the form, before the Email Address field:

```tsx
<div>
  <label htmlFor="fullName" className="mb-1.5 block text-sm font-semibold text-text">
    Full Name
  </label>
  <input
    id="fullName"
    type="text"
    value={fullName}
    onChange={(e) => setFullName(e.target.value)}
    required
    autoComplete="name"
    className="block w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-text placeholder-muted transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
    placeholder="Jane Smith"
  />
</div>
```

- [ ] **Step 5: Verify locally**

Run: `npm run dev`
Navigate to `/signup`. Confirm:
- Full Name field appears above Email Address
- Submitting without a name shows "Please enter your full name."
- Successful signup stores `full_name` in auth metadata and users table

- [ ] **Step 6: Commit**

```bash
git add "app/(auth)/signup/page.tsx"
git commit -m "feat(auth): add Full Name field to signup form (DOC-129)"
```

---

### Task 3: Pass inviter name to invite email

**Files:**
- Modify: `app/api/team/invite/route.ts`
- Modify: `lib/email/triggers.ts`
- Modify: `lib/email/templates/team-invite.tsx`

- [ ] **Step 1: Query inviter's full_name in the invite API route**

In `app/api/team/invite/route.ts`, after line 84 where the org name is queried, also query the inviter's full name. Replace the org query block:

```typescript
// Get org name for the email
const { data: org } = await adminSupabase
  .from("organizations")
  .select("name")
  .eq("id", orgWithRole.orgId)
  .single();
```

With:

```typescript
// Get org name and inviter name for the email
const { data: org } = await adminSupabase
  .from("organizations")
  .select("name")
  .eq("id", orgWithRole.orgId)
  .single();

const { data: inviterUser } = await adminSupabase
  .from("users")
  .select("full_name")
  .eq("id", user.id)
  .single();
```

- [ ] **Step 2: Pass inviterName to sendTeamInviteEmail**

Change the `sendTeamInviteEmail` call from:

```typescript
sendTeamInviteEmail(
  user.email!,
  email,
  org?.name ?? "your organization",
  invite.token,
  invite.expires_at
)
```

To:

```typescript
sendTeamInviteEmail(
  user.email!,
  email,
  org?.name ?? "your organization",
  invite.token,
  invite.expires_at,
  inviterUser?.full_name ?? null
)
```

- [ ] **Step 3: Update sendTeamInviteEmail in triggers.ts**

In `lib/email/triggers.ts`, change the function signature and body:

```typescript
export async function sendTeamInviteEmail(
  inviterEmail: string,
  invitedEmail: string,
  orgName: string,
  token: string,
  expiresAt: string,
  inviterName: string | null
): Promise<void> {
  const inviteUrl = `https://dockett.app/invite/${token}`;
  const inviterDisplay = inviterName || inviterEmail;
  const subject = `${inviterDisplay} invited you to join ${orgName} on Dockett`;

  await sendEmail({
    to: invitedEmail,
    subject,
    react: TeamInviteEmail({ inviterEmail, inviterName, orgName, inviteUrl, expiresAt }),
  });

  logger.info("team_invite_email_sent", {
    inviterEmail,
    invitedEmail,
    orgName,
  });
}
```

- [ ] **Step 4: Update the email template**

Replace the full content of `lib/email/templates/team-invite.tsx`:

```tsx
import { Text } from "@react-email/components";
import { EmailLayout, PrimaryButton, styles } from "./layout";

interface TeamInviteEmailProps {
  inviterEmail: string;
  inviterName: string | null;
  orgName: string;
  inviteUrl: string;
  expiresAt: string;
}

export function TeamInviteEmail({
  inviterEmail,
  inviterName,
  orgName,
  inviteUrl,
  expiresAt,
}: TeamInviteEmailProps) {
  const expiryDate = new Date(expiresAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const inviterDisplay = inviterName
    ? `${inviterName} (${inviterEmail})`
    : inviterEmail;

  return (
    <EmailLayout preview={`${inviterName || inviterEmail} invited you to join ${orgName} on Dockett`}>
      <Text style={styles.heading}>You&apos;re invited to {orgName}</Text>
      <Text style={styles.paragraph}>
        {inviterDisplay} invited you to join <strong>{orgName}</strong> on
        Dockett. You&apos;ll be able to upload invoices, review AI-extracted
        data, and sync bills to your accounting software.
      </Text>

      <PrimaryButton href={inviteUrl}>Accept Invite</PrimaryButton>

      <Text style={styles.mutedText}>
        This invite expires on {expiryDate}. If you don&apos;t have an account
        yet, you&apos;ll be able to create one when you accept.
      </Text>
    </EmailLayout>
  );
}

export default TeamInviteEmail;
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/team/invite/route.ts lib/email/triggers.ts lib/email/templates/team-invite.tsx
git commit -m "feat(email): include inviter name in team invite emails (DOC-129)"
```

---

### Task 4: Return inviter name from invite validate endpoint

**Files:**
- Modify: `app/api/team/invite/[token]/route.ts`

- [ ] **Step 1: Add full_name to the invite query**

In `app/api/team/invite/[token]/route.ts`, change the select query from:

```typescript
.select("id, org_id, invited_email, expires_at, accepted_at, organizations(name), users!org_invites_invited_by_fkey(email)")
```

To:

```typescript
.select("id, org_id, invited_email, expires_at, accepted_at, organizations(name), users!org_invites_invited_by_fkey(email, full_name)")
```

- [ ] **Step 2: Update the type cast and response**

Change the inviter data extraction from:

```typescript
const inviterData = invite.users as unknown as { email: string };

return apiSuccess({
  status: "pending",
  inviteId: invite.id,
  orgName: (invite.organizations as unknown as { name: string })?.name ?? "",
  invitedEmail: invite.invited_email,
  inviterEmail: inviterData?.email ?? "",
  expiresAt: invite.expires_at,
});
```

To:

```typescript
const inviterData = invite.users as unknown as { email: string; full_name: string | null };

return apiSuccess({
  status: "pending",
  inviteId: invite.id,
  orgName: (invite.organizations as unknown as { name: string })?.name ?? "",
  invitedEmail: invite.invited_email,
  inviterEmail: inviterData?.email ?? "",
  inviterName: inviterData?.full_name ?? null,
  expiresAt: invite.expires_at,
});
```

- [ ] **Step 3: Commit**

```bash
git add "app/api/team/invite/[token]/route.ts"
git commit -m "feat(api): return inviter name from invite validate endpoint (DOC-129)"
```

---

### Task 5: Add mismatch state and inviter name to invite accept page

**Files:**
- Modify: `app/invite/[token]/page.tsx`

- [ ] **Step 1: Add mismatch to the status type and add currentUserEmail state**

Change the type and add state:

```typescript
type InviteStatus = "loading" | "pending" | "expired" | "accepted" | "invalid" | "mismatch";
```

Add `inviterName` to the `InviteData` interface:

```typescript
interface InviteData {
  orgName: string;
  inviterEmail: string;
  inviterName: string | null;
  invitedEmail: string;
  expiresAt: string;
}
```

Add state for the current user's email:

```typescript
const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
```

- [ ] **Step 2: Capture current user's email in the auth check**

Change the `checkAuth` useEffect from:

```typescript
useEffect(() => {
  async function checkAuth() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setIsLoggedIn(!!user);
  }
  checkAuth();
}, []);
```

To:

```typescript
useEffect(() => {
  async function checkAuth() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setIsLoggedIn(!!user);
    setCurrentUserEmail(user?.email ?? null);
  }
  checkAuth();
}, []);
```

- [ ] **Step 3: Store inviterName from API response and detect mismatch**

In the `validateInvite` useEffect, update the pending state handler. Change:

```typescript
setStatus("pending");
setInvite({
  orgName: data.orgName,
  inviterEmail: data.inviterEmail,
  invitedEmail: data.invitedEmail,
  expiresAt: data.expiresAt,
});
```

To:

```typescript
setInvite({
  orgName: data.orgName,
  inviterEmail: data.inviterEmail,
  inviterName: data.inviterName ?? null,
  invitedEmail: data.invitedEmail,
  expiresAt: data.expiresAt,
});
setStatus("pending");
```

Also update the expired and accepted states to include `inviterName: null`:

```typescript
if (data.status === "expired") {
  setStatus("expired");
  setInvite({ orgName: data.orgName, inviterEmail: "", inviterName: null, invitedEmail: "", expiresAt: "" });
  return;
}
if (data.status === "accepted") {
  setStatus("accepted");
  setInvite({ orgName: data.orgName, inviterEmail: "", inviterName: null, invitedEmail: "", expiresAt: "" });
  return;
}
```

- [ ] **Step 4: Add a useEffect to detect email mismatch once both invite and auth data are loaded**

After the existing useEffects, add:

```typescript
useEffect(() => {
  if (
    status === "pending" &&
    isLoggedIn &&
    currentUserEmail &&
    invite?.invitedEmail &&
    currentUserEmail.toLowerCase() !== invite.invitedEmail.toLowerCase()
  ) {
    setStatus("mismatch");
  }
}, [status, isLoggedIn, currentUserEmail, invite]);
```

- [ ] **Step 5: Update the inviter display in the pending state**

In the pending invite JSX, change:

```tsx
<p className="text-sm text-muted mb-6">
  <strong>{invite.inviterEmail}</strong> invited you to join{" "}
  <strong>{invite.orgName}</strong> on Dockett.
</p>
```

To:

```tsx
<p className="text-sm text-muted mb-6">
  <strong>{invite.inviterName || invite.inviterEmail}</strong> invited you to join{" "}
  <strong>{invite.orgName}</strong> on Dockett.
</p>
```

- [ ] **Step 6: Add the mismatch state JSX**

Add this block after the `{/* Already accepted */}` section and before the `{/* Valid pending invite */}` section:

```tsx
{/* Email mismatch -- logged in as wrong account */}
{status === "mismatch" && invite && (
  <div className="text-center">
    <h1 className="font-headings text-xl font-bold text-text mb-3">
      Wrong Account
    </h1>
    <p className="text-sm text-muted mb-2">
      You&apos;re signed in as <strong>{currentUserEmail}</strong>, but
      this invite was sent to <strong>{invite.invitedEmail}</strong>.
    </p>
    <p className="text-sm text-muted mb-6">
      Sign in or create an account with that email to accept.
    </p>

    <div className="space-y-3">
      <button
        onClick={async () => {
          const supabase = createClient();
          await supabase.auth.signOut();
          router.push(`/login?redirect=/invite/${token}`);
        }}
        className="block w-full rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3.5 text-center text-base font-semibold text-white shadow-md transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-lg"
      >
        Switch Account
      </button>
      <button
        onClick={async () => {
          const supabase = createClient();
          await supabase.auth.signOut();
          router.push(`/signup?redirect=/invite/${token}`);
        }}
        className="block w-full rounded-2xl border border-border px-4 py-3.5 text-center text-base font-semibold text-text transition-all hover:bg-gray-50"
      >
        Create Account
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 7: Verify locally**

Run: `npm run dev`
Test scenarios:
1. Not logged in + valid invite: see "Log In to Accept" / "Create an Account" (unchanged)
2. Logged in as correct email + valid invite: see "Accept Invite" button (unchanged)
3. Logged in as wrong email + valid invite: see "Wrong Account" mismatch state with Switch/Create buttons
4. Inviter name shows instead of email when available

- [ ] **Step 8: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add "app/invite/[token]/page.tsx"
git commit -m "feat(invite): show inviter name, handle auth mismatch gracefully (DOC-129, DOC-137)"
```

---

### Task 6: Lint, build, and final verification

- [ ] **Step 1: Run full checks**

```bash
npm run lint && npx tsc --noEmit && npm run build
```

Expected: All pass clean.

- [ ] **Step 2: Run tests**

```bash
npm run test
```

Expected: All existing tests pass. No regressions.

- [ ] **Step 3: Push branch and create PR**

```bash
git push -u origin HEAD
gh pr create --title "feat: invite flow fixes -- inviter name + auth mismatch handling (DOC-129, DOC-137)" --body "$(cat <<'EOF'
## Summary
- Add `full_name` column to users table, collected during signup
- Invite emails now show inviter's name instead of raw email address
- Invite accept page detects when logged-in user's email doesn't match the invite and shows clear Switch Account / Create Account options instead of a dead end

## Linear Issues
- DOC-129: Invite email doesn't say who sent the invitation
- DOC-137: Invite accept flow hits dead-end page

## Test plan
- [ ] Sign up with full name, verify it appears in users table
- [ ] Send invite, verify email shows inviter name
- [ ] Send invite when inviter has no name (existing user), verify email falls back to email
- [ ] Click invite link while logged in as wrong email -- see mismatch state
- [ ] Click Switch Account -- logs out, redirects to login with invite redirect
- [ ] Click Create Account -- logs out, redirects to signup with invite redirect
- [ ] After login/signup as correct email, accept invite works normally

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
