import type { ComparisonData } from './types'

export const comparisons: Record<string, ComparisonData> = {
  dext: {
    slug: 'dext',
    competitorName: 'Dext',
    meta: {
      title: 'Docket vs Dext: AI Invoice Processing Compared',
      description:
        'Compare Docket and Dext for invoice processing. See how AI-native extraction, pricing, and QuickBooks/Xero integration stack up side by side.',
    },
    heroTagline:
      'Dext has been the go-to for receipt and invoice capture since 2010. Docket is a modern alternative built on AI-native extraction, not legacy OCR.',
    features: [
      { feature: 'AI Extraction', docket: 'AI-native (Claude Vision)', competitor: 'OCR-based' },
      { feature: 'QuickBooks Integration', docket: true, competitor: true },
      { feature: 'Xero Integration', docket: true, competitor: true },
      { feature: 'Batch Upload', docket: true, competitor: true },
      { feature: 'Email Forwarding', docket: true, competitor: true },
      { feature: 'Tracking Categories (Xero)', docket: true, competitor: true },
      { feature: 'Bill + Check + Cash Expenses', docket: true, competitor: 'Bills only' },
      { feature: 'Starting Price', docket: '$19/mo (75 invoices)', competitor: '$31.50/mo (50 docs)' },
      { feature: 'Free Trial', docket: '10 invoices, no time limit', competitor: '14-day trial' },
    ],
    keyDifferences: [
      'Docket uses AI-native extraction (Claude Vision) instead of traditional OCR, delivering higher accuracy on complex invoices with handwriting, multi-column layouts, and non-standard formats.',
      'Docket starts at $19/mo for 75 invoices. Dext starts at $31.50/mo for 50 documents, making Docket 40% cheaper per document.',
      'Docket supports Bill, Check, and Cash expense types for QuickBooks sync. Dext creates bills only.',
      'Docket offers a usage-based free trial (10 invoices, no time limit) so you can test at your own pace instead of racing a 14-day clock.',
    ],
    whoShouldChooseThem: {
      heading: 'Who Should Choose Dext',
      points: [
        'You need integrations beyond QuickBooks and Xero (Sage, MYOB, FreeAgent, or others).',
        'You want a tool with a decade-long track record and large user community.',
        'You need expense management features like mileage tracking and bank statement imports.',
      ],
    },
    ctaText: 'Try Docket Free',
  },
  'bill-com': {
    slug: 'bill-com',
    competitorName: 'Bill.com',
    meta: {
      title: 'Docket vs Bill.com: Invoice Automation Compared',
      description:
        'Compare Docket and Bill.com for invoice processing. See how AI extraction, pricing, and accounting integration differ between the two platforms.',
    },
    heroTagline:
      'Bill.com is a full accounts payable and receivable platform. Docket is purpose-built for one thing: getting invoices into your accounting software faster with AI.',
    features: [
      { feature: 'AI Extraction', docket: 'AI-native (Claude Vision)', competitor: 'AI-assisted (higher tiers)' },
      { feature: 'QuickBooks Integration', docket: true, competitor: true },
      { feature: 'Xero Integration', docket: true, competitor: true },
      { feature: 'Batch Upload', docket: true, competitor: true },
      { feature: 'Email Forwarding', docket: true, competitor: true },
      { feature: 'Tracking Categories (Xero)', docket: true, competitor: false },
      { feature: 'Bill + Check + Cash Expenses', docket: true, competitor: 'Bills + payments' },
      { feature: 'Starting Price', docket: '$19/mo (75 invoices)', competitor: '$45/user/mo' },
      { feature: 'Free Trial', docket: '10 invoices, no time limit', competitor: 'Demo only' },
    ],
    keyDifferences: [
      'Docket includes AI extraction on every plan starting at $19/mo. Bill.com charges $45/user/mo and reserves AI features for higher tiers.',
      'Docket is purpose-built for invoice-to-bill workflows. No extra complexity from payment processing, AP approval chains, or AR features you may not need.',
      'Docket pricing is per-organization, not per-user. A bookkeeper managing multiple clients pays one flat rate, not a per-seat fee.',
      'Docket supports Xero tracking categories out of the box for granular cost allocation. Bill.com does not map tracking categories.',
    ],
    whoShouldChooseThem: {
      heading: 'Who Should Choose Bill.com',
      points: [
        'You need a full AP/AR platform with payment processing, approval workflows, and vendor payments.',
        'You have a larger team that needs multi-level approval chains and role-based access.',
        'You want to pay vendors directly from the same platform where you process invoices.',
      ],
    },
    ctaText: 'Try Docket Free',
  },
}

export function getComparison(slug: string): ComparisonData | undefined {
  return comparisons[slug]
}

export function getAllComparisonSlugs(): string[] {
  return Object.keys(comparisons)
}
