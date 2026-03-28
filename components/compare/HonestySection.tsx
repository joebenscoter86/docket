interface HonestySectionProps {
  heading: string
  points: string[]
}

export default function HonestySection({ heading, points }: HonestySectionProps) {
  return (
    <section className="py-16 sm:py-20 px-6 sm:px-12">
      <div className="max-w-3xl mx-auto">
        <h2 className="font-headings text-2xl font-extrabold text-[#0F172A] sm:text-3xl text-center mb-4">
          {heading}
        </h2>
        <p className="text-center text-[#94A3B8] text-sm mb-10">
          We believe in being upfront. Here is where the other option might be a better fit.
        </p>
        <ul className="space-y-4">
          {points.map((point, i) => (
            <li key={i} className="flex gap-3 items-start">
              <span className="mt-1 flex-shrink-0 text-[#94A3B8]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </span>
              <p className="text-[#475569] text-base leading-relaxed">{point}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
