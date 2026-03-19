'use client'

const CheckIcon = () => (
  <svg className="h-3 w-3 text-accent" viewBox="0 0 24 24" fill="currentColor">
    <path d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" />
  </svg>
)

const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" fill="#3B82F6" className="h-full w-full">
    <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
  </svg>
)

export default function HeroAnimation() {
  return (
    <div className="relative mx-auto h-[360px] w-full max-w-[520px]">
      {/* Invoice card */}
      <div className="animate-hero-slide-in absolute left-0 top-[30px] w-[220px] rounded-brand-md border border-border bg-surface p-6 shadow-soft">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
          Invoice
        </p>
        <p className="mt-3 text-base font-bold text-text">Martinez Plumbing</p>
        <p className="mt-1 text-[11px] text-muted">
          INV-2026-0156 · Mar 10, 2026
        </p>

        <div className="mt-4 space-y-0">
          {[
            ['Pipe repair (3 hrs)', '$375.00'],
            ['PVC 2-inch (10 ft)', '$37.00'],
            ['Fittings & connectors', '$38.00'],
            ['Putty and sealant', '$12.99'],
            ['Service call fee', '$75.00'],
          ].map(([desc, amount]) => (
            <div
              key={desc}
              className="flex justify-between border-b border-background py-[5px] text-[10px] text-muted"
            >
              <span>{desc}</span>
              <span>{amount}</span>
            </div>
          ))}
        </div>

        <div className="mt-2 flex justify-between border-t-2 border-border pt-2.5 text-[13px] font-bold text-text">
          <span>Total</span>
          <span>$582.37</span>
        </div>
      </div>

      {/* Scan line */}
      <div className="animate-hero-scan absolute left-0 top-[40px] z-10 h-1 w-[220px] rounded-full bg-gradient-to-r from-transparent via-primary to-transparent" />

      {/* Sparkles */}
      {[
        { className: 'left-[230px] top-[100px] animate-hero-sparkle-1' },
        { className: 'left-[250px] top-[180px] animate-hero-sparkle-2' },
        { className: 'left-[235px] top-[260px] animate-hero-sparkle-3' },
      ].map((s, i) => (
        <div key={i} className={`absolute h-2 w-2 ${s.className}`}>
          <SparkleIcon />
        </div>
      ))}

      {/* Connecting dots */}
      <div className="absolute left-[235px] top-[30px] flex h-[300px] w-[50px] flex-col items-center justify-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <div
            key={n}
            className={`h-1 w-1 rounded-full bg-primary animate-hero-dot-${n}`}
          />
        ))}
      </div>

      {/* Extracted data card */}
      <div className="animate-hero-data-appear absolute right-0 top-[30px] w-[230px] rounded-brand-md border border-border bg-surface p-6 shadow-soft">
        <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
          Extracted Data
        </p>

        {[
          { label: 'Vendor', value: 'Martinez Plumbing', delay: 'animate-hero-field-1' },
          { label: 'Invoice #', value: 'INV-2026-0156', delay: 'animate-hero-field-2' },
          { label: 'Date', value: 'Mar 10, 2026', delay: 'animate-hero-field-3' },
          { label: 'Total', value: '$582.37', delay: 'animate-hero-field-4', mono: true },
          { label: 'Status', value: 'Ready to sync', delay: 'animate-hero-field-5', status: true },
        ].map((field) => (
          <div key={field.label} className={`mt-3.5 ${field.delay}`}>
            <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-muted">
              <CheckIcon />
              {field.label}
            </div>
            <div
              className={`mt-1 rounded-md border px-2.5 py-1.5 text-[13px] font-semibold ${
                field.status
                  ? 'border-accent/30 bg-accent/5 text-accent'
                  : 'border-border bg-background text-text'
              } ${field.mono ? 'font-mono' : ''}`}
            >
              {field.value}
            </div>
          </div>
        ))}
      </div>

      {/* Done checkmark */}
      <div className="animate-hero-check absolute bottom-[10px] right-[90px] flex h-10 w-10 items-center justify-center rounded-full bg-accent">
        <svg
          className="h-[22px] w-[22px] text-white"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
          />
        </svg>
      </div>
    </div>
  )
}
