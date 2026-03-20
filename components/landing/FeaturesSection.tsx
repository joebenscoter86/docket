import Image from 'next/image'

export default function FeaturesSection() {
  return (
    <section className="bg-white py-24 sm:py-32 overflow-hidden">
      <div className="mx-auto max-w-7xl px-8">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-24">
          {/* Text Content */}
          <div className="flex-1 lg:max-w-lg">
            <h2 className="font-headings text-4xl font-extrabold tracking-tight text-[#0F172A] sm:text-5xl">
              Built for how you actually work
            </h2>
            <p className="mt-6 text-lg text-[#475569] leading-relaxed">
              Process a whole stack of invoices at once — no more one at a time.
            </p>
          </div>

          {/* Screenshot Graphic */}
          <div className="flex-1 relative">
            <div className="relative rounded-2xl bg-[#F8FAFC] p-4 shadow-[0_32px_80px_rgba(15,23,42,0.1)] ring-1 ring-[#E2E8F0]">
              <Image
                src="/images/review-ui-screenshot.png"
                alt="Docket Dashboard"
                width={1200}
                height={800}
                className="h-auto w-full rounded-xl shadow-sm"
              />
              {/* Decorative gradient behind screenshot to add a vibrant pop */}
              <div className="absolute -bottom-10 -right-10 -z-10 h-[300px] w-[300px] rounded-full bg-gradient-to-tr from-[#00C6FF]/20 to-[#0072FF]/20 blur-[80px]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
