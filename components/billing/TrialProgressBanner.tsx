import Link from "next/link";

interface TrialProgressBannerProps {
  used: number;
  limit: number;
}

export function TrialProgressBanner({ used, limit }: TrialProgressBannerProps) {
  const remaining = Math.max(0, limit - used);
  const percentUsed = (used / limit) * 100;
  const isWarning = remaining <= 2 && remaining > 0;

  const bgColor = isWarning ? "bg-amber-50" : "bg-blue-50";
  const borderColor = isWarning ? "border-amber-200" : "border-blue-200";
  const textColor = isWarning ? "text-amber-800" : "text-blue-800";
  const subtextColor = isWarning ? "text-amber-700" : "text-blue-700";
  const barColor = isWarning ? "bg-amber-500" : "bg-blue-500";

  return (
    <div className={`rounded-brand-md border ${borderColor} ${bgColor} px-4 py-3`}>
      <div className="flex items-center justify-between">
        <p className={`text-sm font-medium ${textColor}`}>
          {isWarning
            ? `${remaining} trial invoice${remaining === 1 ? "" : "s"} remaining`
            : `${used} of ${limit} trial invoices used`}
        </p>
        <Link
          href="/pricing"
          className={`text-sm ${subtextColor} underline hover:no-underline`}
        >
          View plans
        </Link>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full ${barColor} transition-all`}
          style={{ width: `${Math.min(percentUsed, 100)}%` }}
        />
      </div>
    </div>
  );
}
