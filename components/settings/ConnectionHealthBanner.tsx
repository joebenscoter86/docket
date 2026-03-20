"use client";

interface ConnectionHealthBannerProps {
  provider: "quickbooks" | "xero";
  status?: "active" | "expired" | "error";
  refreshTokenExpiresAt?: string | null;
  companyName?: string;
}

export function ConnectionHealthBanner({
  provider,
  status,
  refreshTokenExpiresAt,
  companyName,
}: ConnectionHealthBannerProps) {
  const providerLabel = provider === "quickbooks" ? "QuickBooks" : "Xero";
  const connectUrl =
    provider === "quickbooks" ? "/api/quickbooks/connect" : "/api/xero/connect";

  // Expired or error status — show reconnect prompt
  if (status === "expired" || status === "error") {
    const message =
      status === "expired"
        ? `Your ${providerLabel} connection has expired.${companyName ? ` Reconnect to ${companyName}.` : " Please reconnect to continue syncing."}`
        : `There's a problem with your ${providerLabel} connection.${companyName ? ` Reconnect to ${companyName}.` : " Please reconnect."}`;

    return (
      <div className="rounded-brand-md bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 flex items-center justify-between gap-3">
        <p className="font-body text-[13px] text-[#991B1B]">{message}</p>
        <a
          href={connectUrl}
          className="px-3 py-1.5 rounded-brand-md bg-[#DC2626] text-white text-[13px] font-medium hover:bg-[#B91C1C] transition-colors inline-block"
        >
          Reconnect
        </a>
      </div>
    );
  }

  // Check refresh token expiry
  if (refreshTokenExpiresAt) {
    const expiresAt = new Date(refreshTokenExpiresAt);
    const now = new Date();
    const daysRemaining = Math.ceil(
      (expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );

    // Past expiry but status not yet updated — treat as expired
    if (daysRemaining <= 0) {
      const expiredMessage = `Your ${providerLabel} connection has expired.${companyName ? ` Reconnect to ${companyName}.` : " Please reconnect to continue syncing."}`;
      return (
        <div className="rounded-brand-md bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 flex items-center justify-between gap-3">
          <p className="font-body text-[13px] text-[#991B1B]">{expiredMessage}</p>
          <a
            href={connectUrl}
            className="px-3 py-1.5 rounded-brand-md bg-[#DC2626] text-white text-[13px] font-medium hover:bg-[#B91C1C] transition-colors inline-block"
          >
            Reconnect
          </a>
        </div>
      );
    }

    if (daysRemaining <= 7) {
      return (
        <div className="rounded-brand-md bg-[#FFFBEB] border border-[#FDE68A] px-4 py-3 flex items-center justify-between gap-3">
          <p className="font-body text-[13px] text-[#92400E]">
            Your {providerLabel} connection expires in {daysRemaining} day
            {daysRemaining !== 1 ? "s" : ""}. Reconnect now to avoid
            interruption.
          </p>
          <a
            href={connectUrl}
            className="px-3 py-1.5 rounded-brand-md bg-[#D97706] text-white text-[13px] font-medium hover:bg-[#B45309] transition-colors inline-block"
          >
            Reconnect
          </a>
        </div>
      );
    }
  }

  // No warning needed
  return null;
}
