import Link from 'next/link'

interface ComparisonCTAProps {
  text: string
}

export default function ComparisonCTA({ text }: ComparisonCTAProps) {
  return (
    <section className="bg-gradient-to-br from-[#0F172A] to-[#1E293B] py-20 sm:py-24 rounded-b-[40px]">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="font-headings text-3xl font-extrabold text-white sm:text-4xl leading-tight">
          Ready to try a smarter way to process invoices?
        </h2>
        <p className="mt-6 text-lg text-[#94A3B8]">
          Start free with 10 invoices. No credit card required.
        </p>
        <div className="mt-8">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#00C6FF] to-[#00A3FF] px-10 py-4 text-lg font-bold text-white shadow-[0_8px_32px_rgba(0,198,255,0.35)] transition-all hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,198,255,0.45)]"
          >
            {text}
          </Link>
        </div>
      </div>
    </section>
  )
}
