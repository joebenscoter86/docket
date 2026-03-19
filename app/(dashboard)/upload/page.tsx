import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkInvoiceAccess } from "@/lib/billing/access";
import { getUsageThisPeriod } from "@/lib/billing/usage";
import UploadFlow from "@/components/invoices/UploadFlow";
import UploadGate from "@/components/billing/UploadGate";
import { UsageLimitBanner } from "@/components/settings/UsageLimitBanner";

export default async function UploadPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const access = await checkInvoiceAccess(user.id);

  if (!access.allowed) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="font-headings font-bold text-[32px] text-text tracking-tight">Upload Invoices</h1>
        <p className="font-body text-[15px] text-muted mt-2">
          Drop your PDF or image files — AI will extract the data automatically.
        </p>
        <div className="mt-6">
          <UploadGate
            subscriptionStatus={access.subscriptionStatus}
            trialExpired={access.trialExpired}
          />
        </div>
      </div>
    );
  }

  // Fetch org for usage check
  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  const orgId = membership?.org_id;
  let usageInfo: Awaited<ReturnType<typeof getUsageThisPeriod>> | null = null;

  if (orgId) {
    try {
      usageInfo = await getUsageThisPeriod(orgId, user.id);
    } catch {
      // Fail-open: if usage check fails, allow upload
    }
  }

  const isAtLimit = usageInfo?.limit !== null &&
    usageInfo !== null &&
    usageInfo.used >= (usageInfo.limit ?? Infinity);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-headings font-bold text-[32px] text-text tracking-tight">Upload Invoices</h1>
      <p className="font-body text-[15px] text-muted mt-2">
        Drop your PDF or image files — AI will extract the data automatically.
      </p>
      <div className="mt-6 space-y-4">
        {usageInfo && usageInfo.limit !== null && (
          <UsageLimitBanner
            used={usageInfo.used}
            limit={usageInfo.limit}
            percentUsed={usageInfo.percentUsed}
            periodEnd={usageInfo.periodEnd.toISOString()}
          />
        )}
        {isAtLimit ? (
          <UploadGate
            subscriptionStatus="usage_limit"
            trialExpired={false}
          />
        ) : (
          <UploadFlow />
        )}
      </div>
    </div>
  );
}
