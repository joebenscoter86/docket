import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadConnection } from "@/lib/quickbooks/auth";
import { QBOConnectionCard } from "@/components/settings/QBOConnectionCard";
import { SettingsAlert } from "@/components/settings/SettingsAlert";
import Button from "@/components/ui/Button";

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
        <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-6">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted block mb-1.5">
                Email
              </label>
              <div className="bg-background rounded-brand-md px-3.5 py-2.5 text-[14px] text-text">
                {user?.email}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted block mb-1.5">
                Organization
              </label>
              <div className="bg-background rounded-brand-md px-3.5 py-2.5 text-[14px] text-text">
                {orgName || "—"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Billing Section */}
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wider text-muted mb-3">
          Billing
        </p>
        <div className="bg-surface rounded-brand-lg shadow-soft px-6 py-6">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="font-headings font-bold text-xl text-text">
              Growth Plan
            </h3>
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#FEF3C7] text-[#92400E] text-xs font-medium">
              Design Partner
            </span>
          </div>
          <p className="font-body text-sm text-muted mb-5">
            You have free access to all MVP features as a design partner. Capped at 100 invoices/month.
          </p>
          <div className="flex justify-end">
            <Button variant="outline">Manage Billing</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
