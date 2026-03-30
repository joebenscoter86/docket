import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Get the active org ID for a user.
 * Reads from users.active_org_id (set during signup and invite acceptance).
 */
export async function getActiveOrgId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("users")
    .select("active_org_id")
    .eq("id", userId)
    .single();

  if (error || !data) return null;
  return data.active_org_id;
}

/**
 * Get the active org ID and the user's role in that org.
 * Used by routes that need permission checks (e.g., owner-only operations).
 */
export async function getActiveOrgWithRole(
  supabase: SupabaseClient,
  userId: string
): Promise<{ orgId: string; role: string } | null> {
  const { data: userData } = await supabase
    .from("users")
    .select("active_org_id")
    .eq("id", userId)
    .single();

  if (!userData?.active_org_id) return null;

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", userData.active_org_id)
    .single();

  if (!membership) return null;

  return { orgId: userData.active_org_id, role: membership.role };
}
