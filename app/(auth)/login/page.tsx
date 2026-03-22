'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setLoading(false)
      if (authError.message.includes('Invalid login credentials')) {
        setError('Invalid email or password.')
      } else if (authError.message.includes('rate limit') || authError.message.includes('too many requests')) {
        setError('Too many attempts. Please wait a few minutes and try again.')
      } else if (authError.message.includes('Failed to fetch') || authError.message.includes('fetch')) {
        setError('Unable to reach the server. Please check your connection and try again.')
      } else {
        setError(authError.message)
      }
      return
    }

    router.push('/invoices')
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
            priority
          />
        </div>

        {/* Heading */}
        <div className="mb-8 text-center">
          <h1 className="font-headings text-2xl font-bold text-text">Welcome back</h1>
          <p className="mt-2 text-sm text-muted">
            Please enter your details to access your dashboard.
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
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-semibold text-text">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-primary hover:text-primary-hover"
                tabIndex={-1}
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="block w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-text placeholder-muted transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="••••••••"
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
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        {/* Sign up link */}
        <p className="mt-6 text-center text-sm text-muted">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-semibold text-primary hover:text-primary-hover">
            Sign up
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
