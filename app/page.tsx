// app/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { getAllTiers } from '@/lib/billing/tiers'
import LandingNav from '@/components/landing/LandingNav'
import ScrollHero from '@/components/landing/ScrollHero'
import HowItWorksSection from '@/components/landing/HowItWorksSection'
import FeaturesSection from '@/components/landing/FeaturesSection'
import PricingSection from '@/components/landing/PricingSection'
import DefinitionSection from '@/components/landing/DefinitionSection'
import WhoItsForSection from '@/components/landing/WhoItsForSection'
import WhyDocketSection from '@/components/landing/WhyDocketSection'
import BottomCTA from '@/components/landing/BottomCTA'
import Footer from '@/components/layout/Footer'

export const metadata: Metadata = {
  title: 'Docket - AI Invoice Processing for QuickBooks & Xero',
  description:
    'Upload invoices, AI extracts the data, sync to QuickBooks or Xero with one click. Start free with 10 invoices. Built for small businesses and bookkeepers.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Docket - AI Invoice Processing for QuickBooks & Xero',
    description:
      'Upload invoices, AI extracts the data, sync to QuickBooks or Xero with one click. Start free with 10 invoices. Built for small businesses and bookkeepers.',
    url: 'https://dockett.app',
    siteName: 'Docket',
    type: 'website',
    images: [
      {
        url: 'https://dockett.app/images/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Docket - AI Invoice Processing for QuickBooks & Xero',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Docket - AI Invoice Processing for QuickBooks & Xero',
    description:
      'Upload invoices, AI extracts the data, sync to QuickBooks or Xero with one click. Start free with 10 invoices. Built for small businesses and bookkeepers.',
    images: ['https://dockett.app/images/og-image.png'],
  },
}

const softwareSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': 'https://dockett.app/#application',
  name: 'Docket',
  url: 'https://dockett.app',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'Docket is AI-powered invoice processing software that extracts data from PDFs and syncs directly to QuickBooks Online and Xero. Built for small businesses and bookkeepers.',
  provider: { '@id': 'https://dockett.app/#organization' },
  offers: [
    {
      '@type': 'Offer',
      name: 'Starter',
      price: '29.00',
      priceCurrency: 'USD',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: '29.00',
        priceCurrency: 'USD',
        billingDuration: 'P1M',
        unitText: 'month',
      },
      description:
        '75 invoices/month. AI extraction, review UI, confidence scoring, vendor auto-matching, QuickBooks + Xero.',
      url: 'https://dockett.app/pricing',
    },
    {
      '@type': 'Offer',
      name: 'Pro',
      price: '59.00',
      priceCurrency: 'USD',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: '59.00',
        priceCurrency: 'USD',
        billingDuration: 'P1M',
        unitText: 'month',
      },
      description:
        '200 invoices/month. Everything in Starter plus batch upload, bill-to-check toggle, priority email support.',
      url: 'https://dockett.app/pricing',
    },
    {
      '@type': 'Offer',
      name: 'Growth',
      price: '99.00',
      priceCurrency: 'USD',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: '99.00',
        priceCurrency: 'USD',
        billingDuration: 'P1M',
        unitText: 'month',
      },
      description:
        '500 invoices/month. Everything in Pro plus priority support with onboarding call.',
      url: 'https://dockett.app/pricing',
    },
  ],
};

export default async function Home() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/invoices')
  }

  return (
    <div className="flex min-h-screen flex-col relative selection:bg-[#00C6FF]/30 bg-[#1A1C20]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
      />
      {/* Fixed navigation overlay */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-auto max-w-[1400px] px-4 pt-4 sm:px-8 sm:pt-6">
          <div className="rounded-[40px] bg-white shadow-2xl ring-1 ring-white/20">
            <LandingNav />
          </div>
        </div>
      </div>

      {/* Dark background with dotted pattern -- covers entire page */}
      <div className="relative">
        {/* Stitch Dotted Canvas Background */}
        <div
          className="absolute inset-0 z-0 pointer-events-none opacity-50"
          style={{ backgroundImage: 'radial-gradient(#ffffff 1.5px, transparent 1px)', backgroundSize: '32px 32px' }}
        />

        {/* Scroll-driven hero animation -- pill card over dark bg */}
        <div className="relative z-10">
          <ScrollHero />
        </div>

        {/* Content sections */}
        <div className="relative z-10 w-full max-w-[1400px] mx-auto px-4 sm:px-8 py-8 lg:py-12 space-y-8 lg:space-y-12">
          {/* Features Card */}
          <div className="rounded-[40px] shadow-2xl overflow-hidden bg-white ring-1 ring-white/20">
            <DefinitionSection />
            <HowItWorksSection />
            <WhoItsForSection />
            <FeaturesSection />
            <WhyDocketSection />
            <PricingSection tiers={getAllTiers()} />
            <BottomCTA />
          </div>
        </div>

        <div className="relative z-10 rounded-t-[40px] bg-white overflow-hidden mt-12 max-w-[1400px] mx-auto w-full">
          <Footer />
        </div>
      </div>
    </div>
  )
}
