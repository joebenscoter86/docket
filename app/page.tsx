// app/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import LandingNav from '@/components/landing/LandingNav'
import HeroSection from '@/components/landing/HeroSection'
import HowItWorksSection from '@/components/landing/HowItWorksSection'
import FeaturesSection from '@/components/landing/FeaturesSection'
import BottomCTA from '@/components/landing/BottomCTA'
import Footer from '@/components/layout/Footer'

export const metadata: Metadata = {
  title: 'Docket — Invoice to QuickBooks in Under a Minute',
  description:
    'Upload invoices, AI extracts the data, sync to QuickBooks with one click. Built for small businesses and bookkeepers.',
  openGraph: {
    title: 'Docket — Invoice to QuickBooks in Under a Minute',
    description:
      'Upload invoices, AI extracts the data, sync to QuickBooks with one click.',
    url: 'https://dockett.app',
    siteName: 'Docket',
    type: 'website',
    images: [
      {
        url: 'https://dockett.app/images/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Docket — Invoice to QuickBooks in Under a Minute',
      },
    ],
  },
}

export default async function Home() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/invoices')
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#1A1C20] relative selection:bg-[#00C6FF]/30">
      {/* Stitch Dotted Canvas Background */}
      <div 
        className="fixed inset-0 z-0 pointer-events-none opacity-50"
        style={{ backgroundImage: 'radial-gradient(#ffffff 1.5px, transparent 1px)', backgroundSize: '32px 32px' }}
      />
      
      <div className="relative z-10 w-full max-w-[1400px] mx-auto p-4 sm:p-8 space-y-8 lg:space-y-12 pb-24">
        
        {/* Navigation Floating Header */}
        <div className="rounded-[40px] bg-white shadow-xl overflow-hidden">
          <LandingNav />
        </div>

        {/* Exact Stitch Card 1: Hero V1 */}
        <div className="rounded-[40px] shadow-2xl overflow-hidden ring-1 ring-white/20">
          <HeroSection />
        </div>

        {/* Exact Stitch Card 2: Features V2 Flow */}
        <div className="rounded-[40px] shadow-2xl overflow-hidden bg-white ring-1 ring-white/20">
          <HowItWorksSection />
          <FeaturesSection />
          <BottomCTA />
        </div>

      </div>
      
      <div className="relative z-10 rounded-t-[40px] bg-white overflow-hidden mt-12 max-w-[1400px] mx-auto w-full">
        <Footer />
      </div>
    </div>
  )
}
