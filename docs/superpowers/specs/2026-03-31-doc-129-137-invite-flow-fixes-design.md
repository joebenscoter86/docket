# DOC-129 + DOC-137: Invite Flow Fixes

**Date:** 2026-03-31
**Source:** Design partner feedback (Rick Smith, Broadcast Blinds / JDR Windows)
**Linear issues:** DOC-129, DOC-137

## Problem

Two related issues with the team invite flow:

1. **Invite email shows raw email, not a name (DOC-129).** When Rick received an invite email, it said "joe@dockett.app invited you to join..." instead of "Joe Benscoter invited you..." This looks impersonal and spammy, especially for businesses onboarding multiple team members where trust matters.

2. **Invite accept page is a dead end for mismatched sessions (DOC-137).** If you're logged in as `userA@example.com` and click an invite link sent to `userB@example.com`, the page either shows a confusing error or no actionable next step. The user has no way to switch accounts or sign up as the correct email from that screen.

## Out of Scope

- Comma-separated multi-email invites (Rick mentioned this, but adds validation complexity not needed at MVP scale)

## Design

### Part 1: Add `full_name` to users

**Database migration:**
- `ALTER TABLE users ADD COLUMN full_name TEXT` (nullable -- existing users will have null)

**Signup form:**
- Add a "Full Name" text input above the email field on the signup page (`app/(auth)/signup/page.tsx`)
- Required field (non-empty after trim)
- Pass `full_name` in `options.data` during `supabase.auth.signUp()` so it lands in auth `user_metadata`
- Update the `on_auth_user_created` trigger to copy `raw_user_meta_data->>'full_name'` into `users.full_name`
- This keeps it atomic -- the trigger handles everything, no second update needed

### Part 2: Include inviter name in invite email (DOC-129)

**Invite API route (`app/api/team/invite/route.ts`):**
- Query inviter's `full_name` from `users` table (already have `user.id`)
- Pass `inviterName` (in addition to `inviterEmail`) to `sendTeamInviteEmail`

**Email trigger (`lib/email/triggers.ts`):**
- `sendTeamInviteEmail` accepts new `inviterName: string | null` parameter
- Subject line: `"Joe Benscoter invited you to join Org on Dockett"` (falls back to email if name is null)

**Email template (`lib/email/templates/team-invite.tsx`):**
- Accept `inviterName: string | null` prop
- Display: `"Joe Benscoter (joe@dockett.app) invited you to join Org on Dockett"`
- Fallback: `"joe@dockett.app invited you to join Org on Dockett"` (same as today when name is null)

**Invite validate endpoint (`app/api/team/invite/[token]/route.ts`):**
- Return `inviterName` alongside `inviterEmail` in the response

**Invite accept page (`app/invite/[token]/page.tsx`):**
- Display inviter name when available: "Joe Benscoter invited you to join Org on Dockett"
- Fallback to email display when name is null

### Part 3: Auth mismatch handling on invite accept (DOC-137)

**Current flow when logged in:**
1. Invite page detects user is logged in via `supabase.auth.getUser()`
2. Shows "Accept Invite" button
3. User clicks, POST to accept endpoint
4. Accept endpoint checks email match, returns 403 if mismatch
5. User sees error with no clear next step

**New flow when logged in with wrong account:**
1. Invite page fetches current user's email during auth check
2. Compares `currentUserEmail` with `invite.invitedEmail` (case-insensitive)
3. If mismatch, renders a new `mismatch` state instead of the accept button:
   - Message: "You're signed in as **joebenscoter@gmail.com**, but this invite was sent to **joe@newstandardlabs.com**."
   - "Switch Account" button: calls `supabase.auth.signOut()`, then redirects to `/login?redirect=/invite/{token}`
   - "Create Account" button: calls `supabase.auth.signOut()`, then redirects to `/signup?redirect=/invite/{token}`
4. After login/signup as the correct email, the redirect brings them back to the invite page where they can accept normally

**State machine for invite page:**
- `loading` -- fetching invite data and auth state
- `invalid` -- token not found or revoked
- `expired` -- invite past expiration date
- `accepted` -- already accepted
- `mismatch` -- logged in as wrong email (NEW)
- `pending` -- valid invite, ready to accept (logged in as correct email OR not logged in)

### Part 4: Redirect handling after login/signup

The login and signup pages already support `?redirect=/invite/{token}` and redirect back after auth. No changes needed here -- the existing implementation handles this correctly.

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/YYYYMMDD_add_full_name.sql` | Add `full_name TEXT` column to users, update trigger |
| `app/(auth)/signup/page.tsx` | Add "Full Name" input field, pass to signUp metadata |
| `lib/email/triggers.ts` | Add `inviterName` param to `sendTeamInviteEmail` |
| `lib/email/templates/team-invite.tsx` | Show inviter name with email fallback |
| `app/api/team/invite/route.ts` | Query inviter's full_name, pass to email |
| `app/api/team/invite/[token]/route.ts` | Return inviterName in response |
| `app/invite/[token]/page.tsx` | Add mismatch state, show inviter name |
| `lib/supabase/database.types.ts` | Regenerate after migration |

## Testing

- Invite email shows inviter name when available, email when null
- Invite accept page shows inviter name when available
- Logged in as wrong email: mismatch state shown with switch/create buttons
- Switch Account logs out and redirects to login with invite redirect
- Create Account logs out and redirects to signup with invite redirect
- After login/signup as correct email, invite accept works normally
- Existing users with null full_name: email fallback works in all contexts
