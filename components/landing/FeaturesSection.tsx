import Image from 'next/image'

const features = [
  {
    title: 'Batch upload',
    description:
      'Process a whole stack of invoices at once — no more one at a time.',
    icon: (
      <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    title: 'Bill or check',
    description:
      'Create a bill in QuickBooks, or skip straight to cutting a check.',
    icon: (
      <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
  },
  {
    title: 'AI extraction',
    description:
      'Our AI reads your invoices so you don\'t have to type a thing.',
    icon: (
      <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
  },
  {
    title: 'Side-by-side review',
    description:
      'See the original document right next to the extracted data. Fix anything the AI missed.',
    icon: (
      <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
  },
]

export default function FeaturesSection() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-16">
          {/* Feature list */}
          <div className="flex-1">
            <h2 className="font-headings text-3xl font-bold text-text">
              Built for how you actually work
            </h2>

            <div className="mt-10 space-y-8">
              {features.map((feature) => (
                <div key={feature.title} className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-brand-sm bg-background">
                    {feature.icon}
                  </div>
                  <div>
                    <h3 className="font-headings text-base font-bold text-text">
                      {feature.title}
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Screenshot */}
          <div className="flex-1">
            <div className="overflow-hidden rounded-brand-lg shadow-float">
              <Image
                src="/images/review-ui-screenshot.png"
                alt="Docket extraction form showing extracted invoice data with editable fields"
                width={1200}
                height={800}
                className="h-auto w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
