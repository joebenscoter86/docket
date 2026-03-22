import Link from "next/link";

interface UpgradePromptProps {
  featureName: string;
  requiredTier: "pro" | "growth";
  variant?: "inline" | "banner";
}

const TIER_NAMES: Record<string, string> = {
  pro: "Pro",
  growth: "Growth",
};

export default function UpgradePrompt({
  featureName,
  requiredTier,
  variant = "inline",
}: UpgradePromptProps) {
  const tierName = TIER_NAMES[requiredTier] ?? requiredTier;

  if (variant === "banner") {
    return (
      <div
        data-testid="upgrade-prompt"
        className="flex items-center gap-3 rounded-brand-md border border-blue-200 bg-blue-50 px-4 py-3"
      >
        <svg
          className="h-5 w-5 flex-shrink-0 text-blue-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-blue-900">
            {featureName} is available on {tierName} and above.
          </p>
        </div>
        <Link
          href="/pricing"
          className="flex-shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Upgrade
        </Link>
      </div>
    );
  }

  // Inline variant (compact, for inside forms/selectors)
  return (
    <div
      data-testid="upgrade-prompt"
      className="flex items-center gap-2 text-sm text-muted"
    >
      <svg
        className="h-4 w-4 flex-shrink-0 text-blue-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
      <span>
        {featureName} is available on{" "}
        <span className="font-medium text-text">{tierName}+</span>.{" "}
        <Link
          href="/pricing"
          className="text-primary hover:text-primary-hover underline"
        >
          Upgrade
        </Link>
      </span>
    </div>
  );
}
