export interface FeatureRow {
  feature: string
  docket: string | boolean
  competitor: string | boolean
}

export interface ComparisonData {
  slug: string
  competitorName: string
  meta: {
    title: string
    description: string
  }
  heroTagline: string
  features: FeatureRow[]
  keyDifferences: string[]
  whoShouldChooseThem: {
    heading: string
    points: string[]
  }
  ctaText: string
}
