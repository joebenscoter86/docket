import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getComparison, getAllComparisonSlugs } from '@/lib/compare/data'
import LandingNav from '@/components/landing/LandingNav'
import Footer from '@/components/layout/Footer'
import ComparisonHero from '@/components/compare/ComparisonHero'
import FeatureTable from '@/components/compare/FeatureTable'
import KeyDifferences from '@/components/compare/KeyDifferences'
import HonestySection from '@/components/compare/HonestySection'
import ComparisonCTA from '@/components/compare/ComparisonCTA'

interface PageProps {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return getAllComparisonSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const data = getComparison(slug)
  if (!data) return {}

  return {
    title: data.meta.title,
    description: data.meta.description,
    alternates: {
      canonical: `/compare/${slug}`,
    },
    openGraph: {
      title: data.meta.title,
      description: data.meta.description,
      url: `https://dockett.app/compare/${slug}`,
      siteName: 'Docket',
      type: 'website',
      images: [
        {
          url: 'https://dockett.app/images/og-image.png',
          width: 1200,
          height: 630,
          alt: data.meta.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: data.meta.title,
      description: data.meta.description,
      images: ['https://dockett.app/images/og-image.png'],
    },
  }
}

export default async function ComparePage({ params }: PageProps) {
  const { slug } = await params
  const data = getComparison(slug)
  if (!data) notFound()

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://dockett.app' },
      { '@type': 'ListItem', position: 2, name: 'Compare', item: 'https://dockett.app/compare' },
      { '@type': 'ListItem', position: 3, name: `Docket vs ${data.competitorName}`, item: `https://dockett.app/compare/${slug}` },
    ],
  }

  return (
    <div className="flex min-h-screen flex-col relative selection:bg-[#00C6FF]/30 bg-[#1A1C20] scroll-smooth">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      {/* Fixed navigation overlay */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-auto max-w-[1400px] px-4 pt-4 sm:px-8 sm:pt-6">
          <div className="rounded-full bg-white/95 backdrop-blur-sm shadow-lg ring-1 ring-black/5">
            <LandingNav />
          </div>
        </div>
      </div>

      {/* Dark background with dotted pattern */}
      <div className="relative">
        <div
          className="absolute inset-0 z-0 pointer-events-none opacity-50"
          style={{ backgroundImage: 'radial-gradient(#ffffff 1.5px, transparent 1px)', backgroundSize: '32px 32px' }}
        />

        {/* Hero */}
        <div className="relative z-10">
          <ComparisonHero competitorName={data.competitorName} tagline={data.heroTagline} />
        </div>

        {/* Main content card */}
        <div className="relative z-10 w-full max-w-[1400px] mx-auto px-4 sm:px-8 pb-8 space-y-0">
          <div className="rounded-[40px] shadow-2xl overflow-hidden bg-white ring-1 ring-white/20">
            <FeatureTable features={data.features} competitorName={data.competitorName} />
            <KeyDifferences differences={data.keyDifferences} />
            <HonestySection heading={data.whoShouldChooseThem.heading} points={data.whoShouldChooseThem.points} />
            <ComparisonCTA text={data.ctaText} />
          </div>
        </div>

        <div className="relative z-10 rounded-t-[40px] bg-white overflow-hidden mt-12 max-w-[1400px] mx-auto w-full">
          <Footer />
        </div>
      </div>
    </div>
  )
}
