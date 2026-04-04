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
    textColor: 'text-[#059669]',
    bgColor: 'bg-[#ECFDF5]',
  },
  approved: {
    label: 'Approved',
    textColor: 'text-[#2563EB]',
    bgColor: 'bg-[#EFF6FF]',
  },
  pending_review: {
    label: 'Review',
    textColor: 'text-[#EA580C]',
    bgColor: 'bg-[#FFF7ED]',
  },
  extracting: {
    label: 'Extracting',
    textColor: 'text-[#7C3AED]',
    bgColor: 'bg-[#EDE9FE]',
    dotAnimation: 'animate-pulse',
  },
  uploaded: {
    label: 'Uploaded',
    textColor: 'text-[#2563EB]',
    bgColor: 'bg-[#EFF6FF]',
    dotAnimation: 'animate-pulse',
  },
  uploading: {
    label: 'Uploading',
    textColor: 'text-[#EA580C]',
    bgColor: 'bg-[#FFF7ED]',
    dotAnimation: 'animate-pulse',
  },
  error: {
    label: 'Error',
    textColor: 'text-[#DC2626]',
    bgColor: 'bg-[#FEF2F2]',
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
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 font-body text-xs font-semibold ${config.textColor} ${config.bgColor}`}
    >
      {config.dotAnimation && (
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${config.dotAnimation}`}
          style={{ backgroundColor: 'currentColor' }}
        />
      )}
      {config.label}
    </span>
  )
}
