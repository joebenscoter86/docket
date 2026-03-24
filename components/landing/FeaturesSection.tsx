const features = [
  {
    title: 'Upload or Email',
    description: 'Drop up to 25 PDFs at once or forward invoices by email.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
  },
  {
    title: 'AI Extraction',
    description: 'AI instantly reads vendor, line items, dates, and totals from any invoice.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
    ),
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
  },
  {
    title: 'Review & Approve',
    description: 'Side-by-side view of the PDF and extracted data. One click to approve.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    iconBg: 'bg-green-50',
    iconColor: 'text-green-600',
  },
  {
    title: 'Smart GL Coding',
    description: 'AI suggests GL accounts and learns from your corrections over time.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
      </svg>
    ),
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
  },
  {
    title: 'Bank-Grade Security',
    description: 'AES-256-GCM encryption. Your data is encrypted and never shared.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-600',
  },
  {
    title: 'QBO + Xero Sync',
    description: 'Both platforms included. Sync as a bill, check, or cash expense.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
  },
]

export default function FeaturesSection() {
  return (
    <section id="features" className="bg-[#FAFAFA] py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-8 text-center">
        <h2 className="font-headings text-4xl font-extrabold tracking-tight text-[#0F172A] sm:text-5xl">
          Everything You Need
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-[#475569]">
          Powerful features without the complexity. Invoice automation that actually works.
        </p>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-2xl border border-gray-100 bg-white p-8 text-left shadow-sm hover:shadow-md hover:border-blue-100 transition-all"
            >
              <div className={`w-12 h-12 rounded-xl ${feature.iconBg} flex items-center justify-center mb-5`}>
                <span className={feature.iconColor}>{feature.icon}</span>
              </div>
              <h3 className="font-headings text-lg font-bold text-[#0F172A]">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm text-[#475569] leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
