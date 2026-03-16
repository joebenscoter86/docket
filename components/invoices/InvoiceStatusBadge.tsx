import type { InvoiceStatus } from "@/lib/types/invoice";

interface StatusConfig {
  label: string;
  bgClass: string;
  textClass: string;
  dotClass: string;
  pulse: boolean;
}

const STATUS_CONFIG: Record<InvoiceStatus, StatusConfig> = {
  uploading: {
    label: "Uploading",
    bgClass: "bg-blue-50",
    textClass: "text-blue-700",
    dotClass: "bg-blue-500",
    pulse: false,
  },
  extracting: {
    label: "Extracting",
    bgClass: "bg-blue-50",
    textClass: "text-blue-700",
    dotClass: "bg-blue-500",
    pulse: true,
  },
  pending_review: {
    label: "Pending Review",
    bgClass: "bg-amber-50",
    textClass: "text-amber-700",
    dotClass: "bg-amber-500",
    pulse: false,
  },
  approved: {
    label: "Approved",
    bgClass: "bg-blue-50",
    textClass: "text-blue-700",
    dotClass: "bg-blue-500",
    pulse: false,
  },
  synced: {
    label: "Synced",
    bgClass: "bg-green-50",
    textClass: "text-green-700",
    dotClass: "bg-green-500",
    pulse: false,
  },
  error: {
    label: "Error",
    bgClass: "bg-red-50",
    textClass: "text-red-700",
    dotClass: "bg-red-500",
    pulse: false,
  },
};

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
}

export default function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  const { label, bgClass, textClass, dotClass, pulse } = STATUS_CONFIG[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${bgClass} ${textClass}`}
    >
      <span className="relative flex h-2 w-2">
        {pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dotClass}`}
          />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dotClass}`} />
      </span>
      {label}
    </span>
  );
}
