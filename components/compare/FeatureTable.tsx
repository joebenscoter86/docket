import type { FeatureRow } from '@/lib/compare/types'

interface FeatureTableProps {
  features: FeatureRow[]
  competitorName: string
}

function CellValue({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-100 text-green-600">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    )
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-100 text-red-500">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </span>
    )
  }
  return <span className="text-[#475569] text-sm">{value}</span>
}

export default function FeatureTable({ features, competitorName }: FeatureTableProps) {
  return (
    <section className="py-16 sm:py-20 px-6 sm:px-12">
      <h2 className="font-headings text-2xl font-extrabold text-[#0F172A] sm:text-3xl text-center mb-12">
        Feature Comparison
      </h2>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full max-w-3xl mx-auto">
          <thead>
            <tr className="border-b-2 border-[#E2E8F0]">
              <th className="py-3 pr-4 text-left text-sm font-semibold text-[#94A3B8] uppercase tracking-wide">Feature</th>
              <th className="py-3 px-4 text-center text-sm font-semibold text-[#0F172A] uppercase tracking-wide">Docket</th>
              <th className="py-3 pl-4 text-center text-sm font-semibold text-[#94A3B8] uppercase tracking-wide">{competitorName}</th>
            </tr>
          </thead>
          <tbody>
            {features.map((row) => (
              <tr key={row.feature} className="border-b border-[#F1F5F9]">
                <td className="py-4 pr-4 text-sm font-medium text-[#0F172A]">{row.feature}</td>
                <td className="py-4 px-4 text-center">
                  <CellValue value={row.docket} />
                </td>
                <td className="py-4 pl-4 text-center">
                  <CellValue value={row.competitor} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <div className="sm:hidden space-y-4">
        {features.map((row) => (
          <div key={row.feature} className="rounded-2xl bg-[#F8FAFC] p-4">
            <p className="text-sm font-semibold text-[#0F172A] mb-3">{row.feature}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-xs font-semibold text-[#94A3B8] uppercase mb-1">Docket</p>
                <CellValue value={row.docket} />
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold text-[#94A3B8] uppercase mb-1">{competitorName}</p>
                <CellValue value={row.competitor} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
