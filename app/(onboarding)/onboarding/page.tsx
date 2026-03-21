import Link from 'next/link'
import Button from '@/components/ui/Button'
import StepIndicator from '@/components/onboarding/StepIndicator'
import FeatureCard from '@/components/onboarding/FeatureCard'

export default function OnboardingWelcomePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Hero section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: copy */}
        <div className="rounded-brand-lg bg-surface p-8 shadow-soft">
          <div className="mb-6 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-brand-sm bg-primary/10">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5 text-primary">
                <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
              </svg>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">Getting Started</span>
          </div>
          <h1 className="font-headings text-3xl font-bold leading-tight text-text lg:text-4xl">
            Welcome to Docket. Let AI handle the paperwork while you focus on your business.
          </h1>
          <p className="mt-4 font-body text-base text-muted">
            Automatically extract data from invoices and sync to your accounting software in seconds. Save hours every week.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Link href="/onboarding/connect">
              <Button variant="primary">
                Let&apos;s get started
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="ml-2 h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Button>
            </Link>
          </div>
        </div>

        {/* Right: Turbo Extraction card */}
        <div className="rounded-brand-lg bg-primary p-8 text-white">
          <div className="mb-4 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-7 w-7">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
              </svg>
            </div>
          </div>
          <h2 className="text-center font-headings text-xl font-bold">Turbo Extraction</h2>
          <p className="mt-2 text-center text-sm text-white/80">
            Process multiple documents in minutes. Upload a batch and let AI do the rest.
          </p>
          {/* Decorative file list */}
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3 rounded-brand-md bg-white/10 px-4 py-2.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white text-xs">✓</span>
              <span className="text-sm">Invoice_A12.pdf</span>
            </div>
            <div className="flex items-center gap-3 rounded-brand-md bg-white/10 px-4 py-2.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white text-xs">✓</span>
              <span className="text-sm">Supplier_Receipt.png</span>
            </div>
            <div className="flex items-center gap-3 rounded-brand-md bg-white/10 px-4 py-2.5 opacity-60">
              <span className="flex h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span className="text-sm">Syncing to QB...</span>
            </div>
          </div>
        </div>
      </div>

      {/* Step indicator */}
      <StepIndicator currentStep={1} variant="labeled" />

      {/* Feature cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FeatureCard
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
            </svg>
          }
          title="AI-Powered Extraction"
          description="Our AI engine reads invoices — typed, scanned, or handwritten — and pulls out the data automatically."
        />
        <FeatureCard
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          }
          title="Review & Validate"
          description="See your invoice side-by-side with extracted data. Correct anything the AI missed before syncing."
        />
      </div>
    </div>
  )
}
