'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
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

    router.push('/onboarding')
    router.refresh()
  }

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-lg border border-border bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-primary">Create your account</h1>
          <p className="mt-1 text-sm text-muted">Start processing invoices in minutes</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm placeholder-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-text">
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
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm placeholder-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="Minimum 8 characters"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-text">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
              className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm placeholder-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {error && (
            <div className="rounded-md border border-error/20 bg-error/5 px-3 py-2 text-sm text-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="mt-3 text-center text-xs text-muted">
          By creating an account, you agree to our{' '}
          <Link href="/terms" className="text-accent hover:underline">Terms of Service</Link>
          {' '}and{' '}
          <Link href="/privacy" className="text-accent hover:underline">Privacy Policy</Link>.
        </p>

        <p className="mt-4 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
