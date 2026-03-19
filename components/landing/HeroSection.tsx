import Link from 'next/link'
import Image from 'next/image'

export default function HeroSection() {
  return (
    <section className="mx-auto flex max-w-6xl flex-col items-center gap-12 px-6 py-20 lg:min-h-[calc(100vh-73px)] lg:flex-row lg:gap-16 lg:py-32">
      {/* Text */}
      <div className="flex-1 text-center lg:text-left">
        <h1 className="font-headings text-4xl font-bold leading-tight text-text md:text-5xl">
          From invoice to QuickBooks in under a minute.
        </h1>
        <p className="mt-6 text-lg text-muted">
          Upload your invoices. AI pulls out the details. You review, approve,
          and sync — done.
        </p>
        <div className="mt-8">
          <Link
            href="/signup"
            className="inline-block rounded-brand-md bg-primary px-8 py-3.5 text-base font-bold text-white hover:bg-primary-hover"
          >
            Get Started Free
          </Link>
        </div>
      </div>

      {/* Screenshot */}
      <div className="flex-1">
        <div className="overflow-hidden rounded-brand-lg shadow-float">
          <Image
            src="/images/review-ui-screenshot.png"
            alt="Docket review interface showing a PDF invoice side-by-side with extracted data fields"
            width={1200}
            height={800}
            className="h-auto w-full"
            priority
          />
        </div>
      </div>
    </section>
  )
}
