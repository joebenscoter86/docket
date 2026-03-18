'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
    <div className="w-full max-w-sm">
      <div className="rounded-lg border border-border bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-primary">Sign in to Docket</h1>
          <p className="mt-1 text-sm text-muted">Enter your credentials to continue</p>
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
              autoComplete="current-password"
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
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-accent hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
