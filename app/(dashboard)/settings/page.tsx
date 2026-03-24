import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgConnection } from "@/lib/accounting";
import { QBOConnectionCard } from "@/components/settings/QBOConnectionCard";
import { XeroConnectionCard } from "@/components/settings/XeroConnectionCard";
import { ConnectionHealthBanner } from "@/components/settings/ConnectionHealthBanner";
import { SettingsAlert } from "@/components/settings/SettingsAlert";
import { BillingCard } from "@/components/settings/BillingCard";
import { AccountCard } from "@/components/settings/AccountCard";
import { EmailPreferencesCard } from "@/components/settings/EmailPreferencesCard";
import { EmailIngestionCard } from "@/components/settings/EmailIngestionCard";
import { getUsageThisPeriod } from "@/lib/billing/usage";
import type { SubscriptionTier } from "@/lib/billing/tiers";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { qbo_success?: string; qbo_error?: string; xero_success?: string; xero_error?: string; subscribed?: string };
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
    .select("id, stripe_customer_id, subscription_status, subscription_tier, is_design_partner")
    .eq("id", user!.id)
    .single();

  const billingUser = {
    id: user!.id,
    email: user!.email!,
    stripe_customer_id: userData?.stripe_customer_id ?? null,
    subscription_status: userData?.subscription_status ?? null,
    subscription_tier: (userData?.subscription_tier as SubscriptionTier) ?? null,
    is_design_partner: userData?.is_design_partner ?? false,
  };

  // Check connection status
  let connectionData: {
    connected: boolean;
    provider?: "quickbooks" | "xero";
    companyId?: string;
    companyName?: string;
    connectedAt?: string;
    status?: "active" | "expired" | "error";
    refreshTokenExpiresAt?: string | null;
  } = { connected: false };

  if (orgId) {
    const adminSupabase = createAdminClient();
    const connection = await getOrgConnection(adminSupabase, orgId);
    if (connection) {
      connectionData = {
        connected: true,
        provider: connection.provider,
        companyId: connection.companyId,
        companyName: connection.companyName ?? undefined,
        connectedAt: connection.connectedAt,
        status: connection.status,
        refreshTokenExpiresAt: connection.refreshTokenExpiresAt,
      };
    }
  }

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

  // Get usage info
  let usage = {
    used: 0,
    limit: null as number | null,
    percentUsed: null as number | null,
    periodEnd: new Date().toISOString(),
    isTrial: false,
    trialInvoicesUsed: 0,
    trialLimit: 10,
  };
  if (orgId) {
    try {
      const usageInfo = await getUsageThisPeriod(orgId, user!.id);
      usage = {
        used: usageInfo.used,
        limit: usageInfo.limit,
        percentUsed: usageInfo.percentUsed,
        periodEnd: usageInfo.periodEnd.toISOString(),
        isTrial: usageInfo.isTrial,
        trialInvoicesUsed: usageInfo.trialInvoicesUsed,
        trialLimit: usageInfo.trialLimit,
      };
    } catch {
      // Fail-open: show 0 usage if query fails
    }
  }

  const tierLabel = billingUser.subscription_tier
    ? { starter: "Starter", pro: "Pro", growth: "Growth" }[billingUser.subscription_tier]
    : null;

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
      {searchParams.xero_success && (
        <SettingsAlert type="success" message={searchParams.xero_success} />
      )}
      {searchParams.xero_error && (
        <SettingsAlert type="error" message={searchParams.xero_error} />
      )}
      {searchParams.subscribed === "true" && tierLabel && (
        <SettingsAlert type="success" message={`Subscription activated! You're on the ${tierLabel} plan.`} />
      )}
      {searchParams.subscribed === "true" && !tierLabel && (
        <SettingsAlert type="success" message="Subscription activated!" />
      )}

      {/* Connections Section */}
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wider text-muted mb-3">
          Connections
        </p>
        {connectionData.connected && connectionData.provider && (
          <div className="mb-3">
            <ConnectionHealthBanner
              provider={connectionData.provider}
              status={connectionData.status}
              refreshTokenExpiresAt={connectionData.refreshTokenExpiresAt}
              companyName={connectionData.companyName}
            />
          </div>
        )}
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
      </div>

      {/* Email Forwarding Section */}
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wider text-muted mb-3">
          Email Forwarding
        </p>
        <EmailIngestionCard />
      </div>

      {/* Account Section */}
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wider text-muted mb-3">
          Account
        </p>
        <AccountCard email={user?.email ?? ""} orgName={orgName} orgId={orgId} />
      </div>

      {/* Email Notifications Section */}
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wider text-muted mb-3">
          Email Notifications
        </p>
        <EmailPreferencesCard />
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
