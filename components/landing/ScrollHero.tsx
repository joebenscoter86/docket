'use client'

import Link from 'next/link'

export default function ScrollHero() {
  return (
    <div className="relative">
      <div className="w-full overflow-hidden flex items-center justify-center" style={{ background: 'transparent' }}>
        <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-8 pt-32 pb-8">
          <div className="rounded-[40px] bg-gradient-to-br from-[#EAF4FF] via-[#F4F9FF] to-[#FAFBFF] shadow-2xl ring-1 ring-white/20 overflow-hidden">
            <div className="py-16 sm:py-20 px-6 sm:px-12">
              <div className="mx-auto grid max-w-[1300px] w-full grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

                {/* LEFT COLUMN: Hero Copy & CTA */}
                <div className="flex flex-col justify-center text-center lg:text-left z-10 w-full min-w-0">
                  <h1 className="font-headings text-[40px] font-extrabold leading-[1.05] tracking-tight text-[#0F172A] sm:text-[52px] lg:text-[60px]">
                    From invoice to{' '}
                    <span className="bg-gradient-to-r from-[#00C6FF] to-[#0072FF] bg-clip-text text-transparent">
                      QuickBooks or Xero
                    </span>
                    <br />
                    in under a minute.
                  </h1>

                  <p className="mt-6 mx-auto lg:mx-0 max-w-lg text-[18px] sm:text-[20px] leading-relaxed text-[#475569]">
                    Upload your invoices. AI pulls out the details.
                    <br />
                    One click syncs to QuickBooks or Xero.
                  </p>

                  <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
                    <Link
                      href="/signup"
                      className="group inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#00C6FF] to-[#00A3FF] px-8 py-4 sm:px-10 sm:py-5 text-lg sm:text-xl font-bold text-white shadow-[0_8px_32px_rgba(0,198,255,0.35)] transition-all hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,198,255,0.45)]"
                    >
                      Get Started Free
                    </Link>
                    <a
                      href="#how-it-works"
                      className="inline-flex items-center gap-2 text-[#475569] hover:text-[#0F172A] font-medium transition-colors"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"/></svg>
                      See How It Works
                    </a>
                  </div>
                </div>

                {/* RIGHT COLUMN: Product Demo Video */}
                <div className="w-full max-w-[580px] mx-auto lg:ml-auto flex-shrink-0">
                  <div className="relative">
                    {/* Glow effect */}
                    <div
                      className="absolute inset-0 rounded-3xl opacity-30 blur-3xl"
                      style={{
                        background: 'radial-gradient(ellipse at center, rgba(0,198,255,0.4) 0%, rgba(0,114,255,0.2) 40%, transparent 70%)',
                        animation: 'heroGlow 4s ease-in-out infinite',
                      }}
                    />
                    <div className="relative rounded-2xl bg-white/80 p-3 shadow-2xl ring-1 ring-black/5 overflow-hidden">
                      <video
                        autoPlay
                        loop
                        muted
                        playsInline
                        poster="/images/review-ui-screenshot.png"
                        className="w-full h-auto rounded-xl"
                      >
                        <source src="/videos/docket-demo.mp4" type="video/mp4" />
                      </video>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes heroGlow {
          0%, 100% {
            opacity: 0.3;
            transform: scale(0.95);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.05);
          }
        }
      `}</style>
    </div>
  )
}
