'use client'

import Link from 'next/link'
import Image from 'next/image'

export default function ScrollHero() {
  return (
    <div className="relative">
      <div className="w-full overflow-hidden flex items-center justify-center" style={{ background: 'transparent' }}>
        {/* The pill card container */}
        <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-8 pt-32 pb-8">
          <div className="rounded-[40px] bg-gradient-to-br from-[#EAF4FF] via-[#F4F9FF] to-[#FAFBFF] shadow-2xl ring-1 ring-white/20 overflow-hidden">
            <div className="py-16 sm:py-20 px-6 sm:px-12">
              <div className="mx-auto grid max-w-[1300px] w-full grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-12 xl:gap-20 items-center">

                {/* LEFT COLUMN: Hero Copy & CTA */}
                <div className="flex flex-col justify-center text-center lg:text-left z-10 w-full min-w-0">
                  <h1 className="font-headings text-[40px] font-extrabold leading-[1.1] tracking-tight text-[#0F172A] sm:text-5xl lg:text-[48px] xl:text-[64px]">
                    From invoice to{' '}
                    <span className="bg-gradient-to-r from-[#00C6FF] to-[#0072FF] bg-clip-text text-transparent">
                      QuickBooks or Xero
                    </span>
                    <br />
                    in under a minute.
                  </h1>

                  <p className="mt-6 mx-auto lg:mx-0 max-w-lg text-[20px] sm:text-[22px] leading-relaxed text-[#475569]">
                    Upload your invoices. AI pulls out the details.
                    <br />
                    One click syncs to QuickBooks or Xero.
                  </p>

                  <div className="mt-8 sm:mt-10">
                    <Link
                      href="/signup"
                      className="group inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#00C6FF] to-[#00A3FF] px-8 py-4 sm:px-10 sm:py-5 text-lg sm:text-xl font-bold text-white shadow-[0_8px_32px_rgba(0,198,255,0.4)] transition-all hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,198,255,0.5)]"
                    >
                      Get Started Free
                    </Link>
                  </div>
                </div>

                {/* RIGHT COLUMN: Animated hero image */}
                <div className="w-full max-w-[640px] mx-auto lg:ml-auto flex-shrink-0">
                  <div className="relative">
                    {/* Glow effect behind image */}
                    <div
                      className="absolute inset-0 rounded-3xl opacity-40 blur-3xl"
                      style={{
                        background: 'radial-gradient(ellipse at center, rgba(0,198,255,0.4) 0%, rgba(0,114,255,0.2) 40%, transparent 70%)',
                        animation: 'heroGlow 4s ease-in-out infinite',
                      }}
                    />
                    {/* Floating animated image */}
                    <div
                      className="relative"
                      style={{ animation: 'heroFloat 6s ease-in-out infinite' }}
                    >
                      <Image
                        src="/images/hero_data_3d.png"
                        alt="Invoice data being extracted by AI into structured fields"
                        width={640}
                        height={640}
                        priority
                        className="w-full h-auto drop-shadow-2xl"
                      />
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes heroFloat {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-16px);
          }
        }
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
