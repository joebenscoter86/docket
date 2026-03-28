import type { InvoiceStatus } from '@/lib/types/invoice'

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus
}

const statusConfig: Record<InvoiceStatus, {
  label: string
  textColor: string
  bgColor: string
  dotAnimation?: string
}> = {
  synced: {
    label: 'Synced',
    textColor: 'text-[#065F46]',
    bgColor: 'bg-[#D1FAE5]',
  },
  approved: {
    label: 'Approved',
    textColor: 'text-[#1D4ED8]',
    bgColor: 'bg-[#DBEAFE]',
  },
  pending_review: {
    label: 'Pending Review',
    textColor: 'text-[#92400E]',
    bgColor: 'bg-[#FEF3C7]',
    dotAnimation: 'animate-pulse',
  },
  extracting: {
    label: 'Extracting',
    textColor: 'text-[#5B21B6]',
    bgColor: 'bg-[#EDE9FE]',
    dotAnimation: 'animate-ping',
  },
  uploaded: {
    label: 'Uploaded',
    textColor: 'text-[#1E40AF]',
    bgColor: 'bg-[#DBEAFE]',
    dotAnimation: 'animate-pulse',
  },
  uploading: {
    label: 'Uploading',
    textColor: 'text-[#92400E]',
    bgColor: 'bg-[#FEF3C7]',
    dotAnimation: 'animate-pulse',
  },
  error: {
    label: 'Error',
    textColor: 'text-[#991B1B]',
    bgColor: 'bg-[#FEE2E2]',
  },
  archived: {
    label: 'Archived',
    textColor: 'text-[#6B7280]',
    bgColor: 'bg-[#F3F4F6]',
  },
}

export default function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  const config = statusConfig[status]
  if (!config) return null

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-body text-xs font-medium ${config.textColor} ${config.bgColor}`}
    >
      {/* Leading dot */}
      <span className="relative flex h-1.5 w-1.5">
        {config.dotAnimation && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${config.dotAnimation}`}
            style={{ backgroundColor: 'currentColor' }}
          />
        )}
        <span
          className="relative inline-flex h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: 'currentColor' }}
        />
      </span>
      {config.label}
    </span>
  )
}
