import Link from 'next/link'
import { getAllComparisonSlugs, getComparison } from '@/lib/compare/data'

export default function CompareSection() {
  const slugs = getAllComparisonSlugs()

  return (
    <section className="bg-[#F8FAFC] py-16 sm:py-20 px-6 sm:px-12">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="font-headings text-2xl font-extrabold text-[#0F172A] sm:text-3xl">
          Switching from another tool?
        </h2>
        <p className="mt-4 text-[#475569] text-base sm:text-lg">
          See how Dockett compares to the tools you already know.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          {slugs.map((slug) => {
            const data = getComparison(slug)
            if (!data) return null
            return (
              <Link
                key={slug}
                href={`/compare/${slug}`}
                className="inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-6 py-3 text-sm font-medium text-[#0F172A] shadow-sm transition-all hover:shadow-md hover:border-[#00C6FF]/40 hover:-translate-y-0.5"
              >
                Dockett vs {data.competitorName}
                <svg className="w-4 h-4 text-[#94A3B8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
