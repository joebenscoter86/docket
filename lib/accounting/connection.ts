import type { AccountingConnectionInfo, AccountingProviderType } from "./types";

type SupabaseAdminClient = ReturnType<
  typeof import("@/lib/supabase/admin").createAdminClient
>;

/**
 * Fetch the first active accounting connection for an organisation.
 * Returns null if no connection exists.
 *
 * Queries `accounting_connections` directly — no provider-specific imports.
 */
export async function getOrgConnection(
  supabase: SupabaseAdminClient,
  orgId: string
): Promise<AccountingConnectionInfo | null> {
  const { data, error } = await supabase
    .from("accounting_connections")
    .select("id, org_id, provider, company_id, company_name, connected_at")
    .eq("org_id", orgId)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id as string,
    orgId: data.org_id as string,
    provider: data.provider as AccountingProviderType,
    companyId: data.company_id as string,
    companyName: (data.company_name as string | undefined) ?? undefined,
    connectedAt: data.connected_at as string,
  };
}

/**
 * Returns true if the organisation has at least one accounting connection.
 */
export async function isOrgConnected(
  supabase: SupabaseAdminClient,
  orgId: string
): Promise<boolean> {
  const connection = await getOrgConnection(supabase, orgId);
  return connection !== null;
}

/**
 * Returns the provider type for the organisation's accounting connection,
 * or null if no connection exists.
 */
export async function getOrgProvider(
  supabase: SupabaseAdminClient,
  orgId: string
): Promise<AccountingProviderType | null> {
  const connection = await getOrgConnection(supabase, orgId);
  return connection?.provider ?? null;
}
