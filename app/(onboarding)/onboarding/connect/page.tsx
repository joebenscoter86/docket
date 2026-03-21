'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import StepIndicator from '@/components/onboarding/StepIndicator'
import TrustBadges from '@/components/onboarding/TrustBadges'

export default function OnboardingConnectPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl animate-pulse space-y-8"><div className="h-64 rounded-brand-lg bg-background" /></div>}>
      <ConnectContent />
    </Suspense>
  )
}

function ConnectContent() {
  const searchParams = useSearchParams()
  const qboSuccess = searchParams.get('qbo_success')
  const xeroSuccess = searchParams.get('xero_success')
  const qboError = searchParams.get('qbo_error')
  const xeroError = searchParams.get('xero_error')

  const success = qboSuccess || xeroSuccess
  const error = qboError || xeroError

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Step indicator */}
      <StepIndicator currentStep={2} variant="numbered" />

      {/* Main card */}
      <div className="rounded-brand-lg bg-surface p-10 shadow-soft text-center">
        <div className="relative">
          {/* Icon */}
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-brand-md bg-background">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8 text-primary">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </div>

          <h1 className="font-headings text-2xl font-bold text-text">Connect your business.</h1>
          <p className="mt-3 font-body text-base text-muted">
            Link your accounting software to automatically sync your verified invoices. No more manual data entry.
          </p>

          {/* Success message */}
          {success && (
            <div className="mt-4 rounded-brand-md border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-accent">
              {success}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mt-4 rounded-brand-md border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">
              {error}
            </div>
          )}

          {/* Connect buttons */}
          {!success && (
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <a
                href="/api/quickbooks/connect?returnTo=/onboarding/connect"
                className="inline-flex items-center gap-2 rounded-brand-md bg-[#2CA01C] px-6 py-3 text-sm font-bold text-white hover:bg-[#238a15] transition-colors"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                  <rect width="24" height="24" rx="4" fill="white" />
                  <path d="M12 4C7.58 4 4 7.58 4 12s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm3.5 10.5h-2v2c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5v-2h-2c-.83 0-1.5-.67-1.5-1.5S7.67 9 8.5 9h2V7c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v2h2c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" fill="#2CA01C" />
                </svg>
                Connect QuickBooks
              </a>
              <a
                href="/api/xero/connect?returnTo=/onboarding/connect"
                className="inline-flex items-center gap-2 rounded-brand-md bg-[#13B5EA] px-6 py-3 text-sm font-bold text-white hover:bg-[#0fa3d4] transition-colors"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="white">
                  <path d="M4.21 11.97l3.75-3.75a.75.75 0 000-1.06L4.21 3.41M8.54 11.97l-3.75 3.75a.75.75 0 010-1.06l3.75-3.75M10.5 7.5l1.5 4.5 1.5-4.5M16.5 7.5v9M19.79 11.97l-3.75-3.75a.75.75 0 010-1.06l3.75 3.75" />
                </svg>
                Connect Xero
              </a>
            </div>
          )}

          {/* Skip / Continue */}
          <div className="mt-4">
            {success ? (
              <Link
                href="/onboarding/upload"
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                Continue to Upload
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            ) : (
              <Link
                href="/onboarding/upload"
                className="text-sm font-body text-muted hover:text-text"
              >
                Skip for now
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Trust badges */}
      <TrustBadges />
    </div>
  )
}
