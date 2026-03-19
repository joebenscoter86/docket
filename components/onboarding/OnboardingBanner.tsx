'use client'

import { useState } from 'react'
import Link from 'next/link'

interface OnboardingBannerProps {
  hasConnection: boolean
  hasInvoices: boolean
}

export default function OnboardingBanner({ hasConnection, hasInvoices }: OnboardingBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  let message: string
  let href: string

  if (!hasConnection) {
    message = 'Complete setup: Connect QuickBooks'
    href = '/onboarding/connect'
  } else if (!hasInvoices) {
    message = 'Complete setup: Upload your first invoice'
    href = '/onboarding/upload'
  } else {
    return null
  }

  async function handleDismiss() {
    setDismissed(true)
    try {
      await fetch('/api/users/onboarding', { method: 'PATCH' })
    } catch {
      // Fail gracefully
    }
  }

  return (
    <div className="mb-4 flex items-center justify-between rounded-brand-md border border-primary/20 bg-primary/5 px-4 py-3">
      <div className="flex items-center gap-3">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5 text-primary">
          <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
        </svg>
        <Link href={href} className="text-sm font-body font-semibold text-primary hover:underline">
          {message} →
        </Link>
      </div>
      <button
        onClick={handleDismiss}
        className="rounded-md p-1 text-muted hover:text-text"
        title="Dismiss"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
