import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkInvoiceAccess } from "@/lib/billing/access";
import UploadFlow from "@/components/invoices/UploadFlow";
import UploadGate from "@/components/billing/UploadGate";

export default async function UploadPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const access = await checkInvoiceAccess(user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-headings font-bold text-[32px] text-text tracking-tight">Upload Invoices</h1>
      <p className="font-body text-[15px] text-muted mt-2">
        Drop your PDF or image files — AI will extract the data automatically.
      </p>
      <div className="mt-6">
        {access.allowed ? (
          <UploadFlow />
        ) : (
          <UploadGate
            subscriptionStatus={access.subscriptionStatus}
            trialExpired={access.trialExpired}
          />
        )}
      </div>
    </div>
  );
}
