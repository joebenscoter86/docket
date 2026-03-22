const personas = [
  {
    title: 'Small Business Owners',
    description:
      'You handle your own books. Docket turns a 20-minute invoice into a 60-second task.',
  },
  {
    title: 'Bookkeepers',
    description:
      'You manage invoices for multiple clients. Batch upload, AI extraction, and one-click sync keep you moving.',
  },
  {
    title: 'Accountants',
    description:
      'Your clients send you stacks of invoices. Docket extracts the data so you can focus on advisory.',
  },
]

export default function WhoItsForSection() {
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-8 text-center">
        <h2 className="font-headings text-4xl font-extrabold tracking-tight text-[#0F172A] sm:text-5xl">
          Built for the people who do the work
        </h2>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {personas.map((persona) => (
            <div
              key={persona.title}
              className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm"
            >
              <h3 className="font-headings text-xl font-bold text-[#0F172A]">
                {persona.title}
              </h3>
              <p className="mt-3 text-base leading-relaxed text-[#475569]">
                {persona.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
