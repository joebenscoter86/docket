import Link from "next/link";

interface UsageLimitBannerProps {
  used: number;
  limit: number | null;
  percentUsed: number | null;
  periodEnd: string; // ISO string
  variant?: "warning" | "limit-reached";
}

export function UsageLimitBanner({ used, limit, percentUsed, periodEnd, variant }: UsageLimitBannerProps) {
  // Auto-detect variant from usage if not explicitly set
  const effectiveVariant = variant ?? (
    percentUsed !== null && percentUsed >= 100 ? "limit-reached" :
    percentUsed !== null && percentUsed >= 80 ? "warning" :
    null
  );

  if (!effectiveVariant) return null;

  const resetDate = new Date(periodEnd).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });

  if (effectiveVariant === "limit-reached") {
    return (
      <div className="rounded-brand-md border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-sm font-medium text-red-800">
          You&apos;ve reached your monthly limit of {limit} invoices.
        </p>
        <p className="mt-1 text-sm text-red-700">
          Your limit resets on {resetDate}.{" "}
          <Link href="/app/settings" className="underline hover:no-underline">
            Manage billing
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-brand-md border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-medium text-amber-800">
        You&apos;ve used {used} of {limit} invoices this month.
      </p>
      <p className="mt-1 text-sm text-amber-700">
        Usage resets on {resetDate}.
      </p>
    </div>
  );
}
