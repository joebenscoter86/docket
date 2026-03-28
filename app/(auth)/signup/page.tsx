'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import posthog from "posthog-js";
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [showInviteField, setShowInviteField] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    // Validate invite code server-side before signup
    const trimmedCode = inviteCode.trim()
    if (trimmedCode) {
      try {
        const res = await fetch('/api/auth/validate-invite-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: trimmedCode }),
        })
        const result = await res.json()
        if (!res.ok) {
          setLoading(false)
          setError(result.error || 'Invalid invite code.')
          return
        }
      } catch {
        setLoading(false)
        setError('Unable to validate invite code. Please try again.')
        return
      }
    }

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: trimmedCode ? { data: { invite_code: trimmedCode } } : undefined,
    })

    if (authError) {
      setLoading(false)
      if (authError.message.includes('already registered')) {
        setError('An account with this email already exists.')
      } else if (authError.message.includes('valid email') || authError.message.includes('email_address_invalid')) {
        setError('Please enter a valid email address.')
      } else if (authError.message.includes('rate limit') || authError.message.includes('too many requests')) {
        setError('Too many attempts. Please wait a few minutes and try again.')
      } else if (authError.message.includes('Failed to fetch') || authError.message.includes('fetch')) {
        setError('Unable to reach the server. Please check your connection and try again.')
      } else {
        setError(authError.message)
      }
      return
    }

    posthog.capture("signup");

    // Fire-and-forget: send welcome + admin notification emails
    fetch('/api/auth/signup-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(function noop() { /* non-critical */ })

    router.push('/onboarding')
    router.refresh()
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
            sizes="240px"
            priority
          />
        </div>

        {/* Heading */}
        <div className="mb-8 text-center">
          <h1 className="font-headings text-2xl font-bold text-text">Create your account</h1>
          <p className="mt-2 text-sm text-muted">
            Start processing invoices in minutes.
          </p>
        </div>

        {/* Form */}
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
              className="block w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-text placeholder-muted transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="name@company.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-text">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
              className="block w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-text placeholder-muted transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Minimum 8 characters"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-semibold text-text">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
              className="block w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-text placeholder-muted transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Re-enter your password"
            />
          </div>

          {/* Invite code */}
          <div>
            {!showInviteField ? (
              <button
                type="button"
                onClick={() => setShowInviteField(true)}
                className="text-sm font-medium text-primary hover:text-primary-hover transition-colors"
              >
                Have an invite code?
              </button>
            ) : (
              <div>
                <label htmlFor="inviteCode" className="mb-1.5 block text-sm font-semibold text-text">
                  Invite Code
                </label>
                <input
                  id="inviteCode"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  autoComplete="off"
                  className="block w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-text placeholder-muted transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Enter your invite code"
                />
                <p className="mt-1.5 text-xs text-muted">
                  Design partners get free access to all features.
                </p>
              </div>
            )}
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
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        {/* Terms notice */}
        <p className="mt-4 text-center text-xs text-muted">
          By creating an account, you agree to our{' '}
          <Link href="/terms" className="font-medium text-primary hover:text-primary-hover">Terms of Service</Link>
          {' '}and{' '}
          <Link href="/privacy" className="font-medium text-primary hover:text-primary-hover">Privacy Policy</Link>.
        </p>

        {/* Login link */}
        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-primary hover:text-primary-hover">
            Log in
          </Link>
        </p>

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
