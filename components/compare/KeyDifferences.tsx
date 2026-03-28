interface KeyDifferencesProps {
  differences: string[]
}

export default function KeyDifferences({ differences }: KeyDifferencesProps) {
  return (
    <section className="py-16 sm:py-20 px-6 sm:px-12 bg-gradient-to-br from-[#F0F9FF] to-[#F8FAFC]">
      <div className="max-w-3xl mx-auto">
        <h2 className="font-headings text-2xl font-extrabold text-[#0F172A] sm:text-3xl text-center mb-10">
          Key Differences
        </h2>
        <ul className="space-y-6">
          {differences.map((point, i) => (
            <li key={i} className="flex gap-4">
              <span className="mt-1 flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-r from-[#00C6FF] to-[#0072FF] text-white text-sm font-bold">
                {i + 1}
              </span>
              <p className="text-[#475569] text-base leading-relaxed">{point}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
