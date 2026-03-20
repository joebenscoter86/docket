import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgConnection } from "@/lib/accounting";
import { QBOConnectionCard } from "@/components/settings/QBOConnectionCard";
import { SettingsAlert } from "@/components/settings/SettingsAlert";
import { BillingCard } from "@/components/settings/BillingCard";
import { AccountCard } from "@/components/settings/AccountCard";
import { getUsageThisPeriod } from "@/lib/billing/usage";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { qbo_success?: string; qbo_error?: string; subscribed?: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Get org membership
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id, organizations(name)")
    .eq("user_id", user!.id)
    .limit(1)
    .single();

  const orgId = membership?.org_id ?? "";
  const orgNameData = membership?.organizations as { name: string }[] | { name: string } | null;
  const orgName = Array.isArray(orgNameData) ? orgNameData[0]?.name ?? "" : orgNameData?.name ?? "";

  // Fetch user billing data
  const { data: userData } = await supabase
    .from("users")
    .select("id, stripe_customer_id, subscription_status, is_design_partner")
    .eq("id", user!.id)
    .single();

  const billingUser = {
    id: user!.id,
    email: user!.email!,
    stripe_customer_id: userData?.stripe_customer_id ?? null,
    subscription_status: userData?.subscription_status ?? null,
    is_design_partner: userData?.is_design_partner ?? false,
  };

  // Check QBO connection status
  let qboConnection: {
    connected: boolean;
    companyId?: string;
    companyName?: string;
    connectedAt?: string;
  } = { connected: false };

  if (orgId) {
    const adminSupabase = createAdminClient();
    const connection = await getOrgConnection(adminSupabase, orgId);
    if (connection) {
      qboConnection = {
        connected: true,
        companyId: connection.companyId,
        companyName: connection.companyName ?? undefined,
        connectedAt: connection.connectedAt,
      };
    }
  }

  // Get usage info
  let usage = { used: 0, limit: null as number | null, percentUsed: null as number | null, periodEnd: new Date().toISOString() };
  if (orgId) {
    try {
      const usageInfo = await getUsageThisPeriod(orgId, user!.id);
      usage = {
        used: usageInfo.used,
        limit: usageInfo.limit,
        percentUsed: usageInfo.percentUsed,
        periodEnd: usageInfo.periodEnd.toISOString(),
      };
    } catch {
      // Fail-open: show 0 usage if query fails
    }
  }

  return (
    <div className="max-w-[600px] mx-auto space-y-9">
      <div>
        <h1 className="font-headings font-bold text-[32px] text-text tracking-tight">
          Settings
        </h1>
        <p className="mt-1 font-body text-[15px] text-muted">
          Manage your account, connections, and billing.
        </p>
      </div>

      {/* OAuth result alerts */}
      {searchParams.qbo_success && (
        <SettingsAlert type="success" message={searchParams.qbo_success} />
      )}
      {searchParams.qbo_error && (
        <SettingsAlert type="error" message={searchParams.qbo_error} />
      )}
      {searchParams.subscribed === "true" && (
        <SettingsAlert type="success" message="Subscription activated! You're on the Growth plan." />
      )}

      {/* Connections Section */}
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wider text-muted mb-3">
          Connections
        </p>
        <QBOConnectionCard connection={qboConnection} />
      </div>

      {/* Account Section */}
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wider text-muted mb-3">
          Account
        </p>
        <AccountCard email={user?.email ?? ""} orgName={orgName} orgId={orgId} />
      </div>

      {/* Billing Section */}
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wider text-muted mb-3">
          Billing
        </p>
        <BillingCard user={billingUser} usage={usage} />
      </div>
    </div>
  );
}
