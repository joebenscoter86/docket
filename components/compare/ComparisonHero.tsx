interface ComparisonHeroProps {
  competitorName: string
  tagline: string
}

export default function ComparisonHero({ competitorName, tagline }: ComparisonHeroProps) {
  return (
    <section className="w-full max-w-[1400px] mx-auto px-4 sm:px-8 pt-32 pb-8">
      <div className="rounded-[40px] bg-gradient-to-br from-[#EAF4FF] via-[#F4F9FF] to-[#FAFBFF] shadow-2xl ring-1 ring-white/20 overflow-hidden">
        <div className="py-16 sm:py-20 px-6 sm:px-12 text-center">
          <h1 className="font-headings text-[36px] font-extrabold leading-[1.1] tracking-tight text-[#0F172A] sm:text-[48px] lg:text-[56px]">
            Dockett vs{' '}
            <span className="bg-gradient-to-r from-[#00C6FF] to-[#0072FF] bg-clip-text text-transparent">
              {competitorName}
            </span>
          </h1>
          <p className="mt-6 mx-auto max-w-2xl text-[18px] sm:text-[20px] leading-relaxed text-[#475569]">
            {tagline}
          </p>
        </div>
      </div>
    </section>
  )
}
