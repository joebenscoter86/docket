import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadConnection } from "@/lib/quickbooks/auth";
import { QBOConnectionCard } from "@/components/settings/QBOConnectionCard";
import { SettingsAlert } from "@/components/settings/SettingsAlert";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { qbo_success?: string; qbo_error?: string };
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

  // Check QBO connection status
  let qboConnection: {
    connected: boolean;
    companyId?: string;
    companyName?: string;
    connectedAt?: string;
  } = { connected: false };

  if (orgId) {
    const adminSupabase = createAdminClient();
    const connection = await loadConnection(adminSupabase, orgId);
    if (connection) {
      qboConnection = {
        connected: true,
        companyId: connection.company_id,
        companyName: connection.company_name ?? undefined,
        connectedAt: connection.connected_at,
      };
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
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

      {/* QuickBooks Connection */}
      <QBOConnectionCard connection={qboConnection} />

      {/* Account Info */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-800">Account</h2>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700">Email</label>
            <p className="mt-1 text-sm text-gray-900">{user?.email}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Organization</label>
            <p className="mt-1 text-sm text-gray-900">{orgName || "—"}</p>
          </div>
        </div>
      </div>

      {/* Billing (placeholder for Stripe) */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-800">Billing</h2>
        <p className="mt-2 text-sm text-gray-500">
          Billing management coming soon.
        </p>
      </div>
    </div>
  );
}
