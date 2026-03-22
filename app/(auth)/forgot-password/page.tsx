'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: `${window.location.origin}/api/auth/confirm?next=/reset-password`,
      }
    )

    setLoading(false)

    if (resetError) {
      if (resetError.message.includes('rate limit') || resetError.message.includes('too many requests')) {
        setError('Too many attempts. Please wait a few minutes and try again.')
        return
      }
      if (resetError.message.includes('Failed to fetch') || resetError.message.includes('fetch')) {
        setError('Unable to reach the server. Please check your connection and try again.')
        return
      }
      // Show success regardless to prevent email enumeration
    }

    setSubmitted(true)
  }

  return (
    <div className="w-full max-w-md px-4">
      <div className="rounded-3xl bg-white p-8 shadow-float sm:p-10">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Image
            src="/dockett_logo.png"
            alt="Docket logo"
            width={240}
            height={240}
            priority
          />
        </div>

        {/* Heading */}
        <div className="mb-8 text-center">
          <h1 className="font-headings text-2xl font-bold text-text">Reset your password</h1>
          <p className="mt-2 text-sm text-muted">
            {submitted
              ? 'Check your email for a reset link.'
              : 'Enter your email and we\'ll send you a link to reset your password.'}
          </p>
        </div>

        {submitted ? (
          <div className="space-y-6">
            {/* Success state */}
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              If an account exists with that email, you&apos;ll receive a password reset link shortly.
            </div>
            <Link
              href="/login"
              className="block w-full rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3.5 text-center text-base font-semibold text-white shadow-md transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-lg"
            >
              Back to Login
            </Link>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-text">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                className="block w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-text placeholder-muted transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="name@company.com"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3.5 text-base font-semibold text-white shadow-md transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}

        {/* Back to login link */}
        {!submitted && (
          <p className="mt-6 text-center text-sm text-muted">
            Remember your password?{' '}
            <Link href="/login" className="font-semibold text-primary hover:text-primary-hover">
              Log in
            </Link>
          </p>
        )}

        {/* Security badge */}
        <div className="mt-8 flex items-start gap-3 rounded-xl bg-gray-50 px-4 py-3">
          <div className="mt-0.5 flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-muted">
              <path d="M10 1L3 5v4c0 4.42 2.99 8.56 7 9.61C14.01 17.56 17 13.42 17 9V5l-7-4z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            Your data is protected by 256-bit SSL encryption and enterprise-grade security protocols.
          </p>
        </div>
      </div>

      {/* Footer links */}
      <div className="mt-6 flex items-center justify-center gap-6 text-xs font-medium uppercase tracking-wider text-muted">
        <Link href="/privacy" className="hover:text-text transition-colors">
          Privacy Policy
        </Link>
        <Link href="/terms" className="hover:text-text transition-colors">
          Terms of Service
        </Link>
        <Link href="mailto:support@dockett.app" className="hover:text-text transition-colors">
          Support
        </Link>
      </div>
    </div>
  )
}
