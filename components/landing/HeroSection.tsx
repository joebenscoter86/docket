'use client'

import Link from 'next/link'
import HeroAnimation from './HeroAnimation'

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#EAF4FF] via-[#F4F9FF] to-[#FAFBFF] py-20 px-6 sm:px-12">
      <div className="mx-auto grid max-w-[1300px] w-full grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-12 xl:gap-20 items-center">
        
        {/* LEFT COLUMN: Hero Copy & CTA */}
        <div className="flex flex-col justify-center text-center lg:text-left z-10 w-full min-w-0 pb-8 lg:pb-0">
          <h2 className="font-headings text-[40px] font-extrabold leading-[1.1] tracking-tight text-[#0F172A] sm:text-5xl lg:text-[48px] xl:text-[64px]">
            From invoice to QuickBooks
            <br />
            in under a minute.
          </h2>
          
          <p className="mt-6 mx-auto lg:mx-0 max-w-lg text-[20px] sm:text-[22px] leading-relaxed text-[#475569]">
            Upload your invoices. AI pulls out the details.
            <br />
            You review, approve, and sync. Done.
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

        {/* RIGHT COLUMN: Hero Animation */}
        <div className="w-full mt-12 sm:mt-16 lg:mt-0 max-w-[640px] mx-auto lg:ml-auto lg:-mr-12 scale-100 sm:scale-110 lg:scale-110 transform-gpu flex-shrink-0">
          <HeroAnimation />
        </div>
        
      </div>
    </section>
  )
}
