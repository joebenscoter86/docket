'use client'

import Image from 'next/image'

const steps = [
  {
    title: 'Upload',
    description: 'Drop up to 25 PDFs at once. We take it from there.',
    iconPath: '/images/icon-upload.png',
  },
  {
    title: 'Review',
    description: 'AI extracts vendor, line items, and totals. You check the work.',
    iconPath: '/images/icon-review.png',
  },
  {
    title: 'Sync',
    description: 'Create a bill, check, or cash expense in QuickBooks with one click.',
    iconPath: '/images/icon-sync.png',
  },
]

export default function HowItWorksSection() {
  return (
    <section className="bg-[#FAFAFA] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-8 text-center">
        <h2 className="font-headings text-4xl font-extrabold tracking-tight text-[#0F172A] sm:text-5xl">
          How It Works
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-[#475569]">
          Your invoices go from paper to ledger in three steps.
        </p>

        <div className="mt-20 grid gap-12 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((step) => (
            <div key={step.title} className="flex flex-col items-center">
              
              <div className="relative h-32 w-32 mb-6">
                <Image
                  src={step.iconPath}
                  alt={step.title}
                  fill
                  className="object-contain drop-shadow-xl hover:scale-105 transition-transform"
                />
              </div>

              <h3 className="font-headings text-2xl font-bold text-[#0F172A]">
                {step.title}
              </h3>
              <p className="mt-3 text-base text-[#475569] leading-relaxed max-w-[280px]">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
