const reasons = [
  {
    title: 'AI that learns from your corrections',
    description:
      'Every edit teaches Dockett\'s AI to be more accurate next time.',
  },
  {
    title: 'QuickBooks + Xero, both included',
    description:
      'No extra charge for either integration. Connect both if you need to.',
  },
  {
    title: 'Bills, checks, or cash expenses',
    description:
      'Not just bills. Sync as the transaction type your books actually need.',
  },
  {
    title: 'No lock-in',
    description:
      'Your data stays yours. Export anytime. Cancel anytime.',
  },
]

export default function WhyDocketSection() {
  return (
    <section className="bg-[#FAFAFA] py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-8">
        <h2 className="font-headings text-center text-4xl font-extrabold tracking-tight text-[#0F172A] sm:text-5xl">
          Why Dockett
        </h2>

        <div className="mt-16 grid gap-8 sm:grid-cols-2">
          {reasons.map((reason) => (
            <div key={reason.title} className="px-2">
              <h3 className="font-headings text-xl font-bold text-[#0F172A]">
                {reason.title}
              </h3>
              <p className="mt-2 text-base leading-relaxed text-[#475569]">
                {reason.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
