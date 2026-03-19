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
    redirect('/app/invoices')
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <LandingNav />
      <main>
        <HeroSection />
        <HowItWorksSection />
        <FeaturesSection />
        <BottomCTA />
      </main>
      <Footer />
    </div>
  )
}
