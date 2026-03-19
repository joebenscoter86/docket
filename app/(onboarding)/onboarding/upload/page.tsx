'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import UploadZone from '@/components/invoices/UploadZone'
import StepIndicator from '@/components/onboarding/StepIndicator'
import Button from '@/components/ui/Button'

export default function OnboardingUploadPage() {
  const router = useRouter()
  const [uploadComplete, setUploadComplete] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const handleUploadComplete = useCallback(() => {
    setUploadComplete(true)
  }, [])

  async function handleFinish() {
    setFinishing(true)
    try {
      await fetch('/api/users/onboarding', { method: 'PATCH' })
    } catch {
      // Fail gracefully — banner will reappear on next load
    }
    router.push('/invoices')
  }

  async function handleSkip() {
    try {
      await fetch('/api/users/onboarding', { method: 'PATCH' })
    } catch {
      // Fail gracefully
    }
    router.push('/invoices')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Progress bar */}
      <StepIndicator currentStep={3} variant="bar" />

      {/* Heading */}
      <div className="text-center">
        <h1 className="font-headings text-3xl font-bold text-text">Ready for the magic?</h1>
        <p className="mt-3 font-body text-base text-muted">
          Upload your first invoice to see how Docket automatically extracts everything for you.
        </p>
      </div>

      {/* Upload zone */}
      <UploadZone onUploadComplete={handleUploadComplete} />

      {/* Feature pills */}
      <div className="flex flex-wrap items-center justify-center gap-8 text-sm">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5 text-primary">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
          <div>
            <p className="font-bold text-text">Secure Storage</p>
            <p className="text-xs text-muted">256-bit encryption for every document.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5 text-primary">
            <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
          </svg>
          <div>
            <p className="font-bold text-text">Instant Extraction</p>
            <p className="text-xs text-muted">AI analyzes your data in seconds.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5 text-primary">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
          <div>
            <p className="font-bold text-text">Auto-Sync</p>
            <p className="text-xs text-muted">Connects to your existing accounting tools.</p>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between border-t border-border pt-6">
        <button
          onClick={handleSkip}
          className="text-sm font-body text-primary hover:underline"
        >
          Skip for now
        </button>
        <Button
          variant="primary"
          disabled={!uploadComplete || finishing}
          onClick={handleFinish}
        >
          {finishing ? 'Finishing...' : 'Finish Setup'}
        </Button>
      </div>
    </div>
  )
}
