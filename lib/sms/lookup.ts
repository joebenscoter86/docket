import { createAdminClient } from "@/lib/supabase/admin";

interface SmsUserLookup {
  userId: string;
  orgId: string;
}

export async function getUserByPhone(phoneNumber: string): Promise<SmsUserLookup | null> {
  const admin = createAdminClient();

  const { data: user, error } = await admin
    .from("users")
    .select("id")
    .eq("phone_number", phoneNumber)
    .single();

  if (error || !user) {
    return null;
  }

  const { data: membership } = await admin
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!membership) {
    return null;
  }

  return { userId: user.id, orgId: membership.org_id };
}
