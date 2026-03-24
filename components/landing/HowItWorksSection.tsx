const steps = [
  {
    number: '1',
    title: 'Upload Your Invoices',
    description: 'Drop up to 25 PDFs at once. Drag and drop or click to browse. We accept PDF, JPG, and PNG.',
    gradient: 'from-[#00C6FF] to-[#0072FF]',
    lineColor: 'from-blue-400 to-blue-200',
  },
  {
    number: '2',
    title: 'AI Extracts the Data',
    description: 'Our AI reads vendor names, line items, amounts, dates, and payment terms. Typically under 10 seconds per invoice.',
    gradient: 'from-[#8B5CF6] to-[#6D28D9]',
    lineColor: 'from-violet-300 to-violet-200',
  },
  {
    number: '3',
    title: 'Review & Approve',
    description: 'See the PDF side-by-side with extracted data. Edit anything that needs a tweak, then approve with one click.',
    gradient: 'from-[#10B981] to-[#059669]',
    lineColor: 'from-green-300 to-green-200',
  },
  {
    number: '4',
    title: 'Sync to QuickBooks or Xero',
    description: 'Create a bill, check, or cash expense with one click. AI suggests GL accounts. PDF gets attached automatically.',
    gradient: 'from-[#F59E0B] to-[#D97706]',
    lineColor: '',
  },
]

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="bg-[#FAFAFA] py-20 sm:py-24">
      <div className="mx-auto max-w-4xl px-8">
        <div className="text-center mb-16">
          <h2 className="font-headings text-4xl font-extrabold tracking-tight text-[#0F172A] sm:text-5xl">
            Simple 4-Step Process
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-[#475569]">
            From invoice to your accounting software in minutes, not hours.
          </p>
        </div>

        <div className="space-y-0">
          {steps.map((step, index) => {
            const isLast = index === steps.length - 1
            return (
              <div key={step.number} className="relative flex gap-6 pb-12 last:pb-0">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-12 h-12 rounded-full bg-gradient-to-br ${step.gradient} flex items-center justify-center text-white font-bold text-lg shadow-lg z-10 flex-shrink-0`}
                  >
                    {step.number}
                  </div>
                  {!isLast && (
                    <div className={`w-0.5 flex-1 bg-gradient-to-b ${step.lineColor} mt-3`} />
                  )}
                </div>
                <div className="pt-2 pb-2">
                  <h3 className="font-headings text-xl font-bold text-[#0F172A]">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-[#475569] leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
