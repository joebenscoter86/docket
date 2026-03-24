export default function StatsBar() {
  return (
    <section className="relative z-10 w-full max-w-[1400px] mx-auto px-4 sm:px-8 py-6">
      <div className="rounded-[24px] bg-white/90 backdrop-blur-sm shadow-lg ring-1 ring-black/5 py-8 px-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-3xl mx-auto text-center">
          <div>
            <div className="text-3xl sm:text-4xl font-extrabold text-[#0F172A] font-headings">
              20 min{' '}
              <span className="bg-gradient-to-r from-[#00C6FF] to-[#0072FF] bg-clip-text text-transparent">
                &rarr;
              </span>{' '}
              60s
            </div>
            <p className="mt-2 text-sm font-medium text-[#64748B]">Per Invoice Processing</p>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-extrabold text-[#0F172A] font-headings">
              One-Click
            </div>
            <p className="mt-2 text-sm font-medium text-[#64748B]">Sync to QBO + Xero</p>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-extrabold text-[#0F172A] font-headings">
              AES-256
            </div>
            <p className="mt-2 text-sm font-medium text-[#64748B]">Bank-Grade Encryption</p>
          </div>
        </div>
      </div>
    </section>
  )
}
