import Link from 'next/link'

export default function BottomCTA() {
  return (
    <section className="bg-background py-20">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="font-headings text-3xl font-bold text-text md:text-4xl">
          Spend your evening your way. Not on invoices.
        </h2>
        <div className="mt-8">
          <Link
            href="/signup"
            className="inline-block rounded-brand-md bg-primary px-8 py-3.5 text-base font-bold text-white hover:bg-primary-hover"
          >
            Get Started Free
          </Link>
        </div>
      </div>
    </section>
  )
}
