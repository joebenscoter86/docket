'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

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
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    })

    setLoading(false)

    if (updateError) {
      if (updateError.message.includes('session') || updateError.message.includes('token') || updateError.message.includes('expired')) {
        setError('This reset link has expired. Please request a new one.')
      } else if (updateError.message.includes('same password') || updateError.message.includes('different password')) {
        setError('Please choose a different password than your current one.')
      } else if (updateError.message.includes('Failed to fetch') || updateError.message.includes('fetch')) {
        setError('Unable to reach the server. Please check your connection and try again.')
      } else {
        setError(updateError.message)
      }
      return
    }

    setSuccess(true)
    // Sign out so the user logs in fresh with their new password
    await supabase.auth.signOut()
    setTimeout(() => {
      router.push('/login')
    }, 2000)
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
          <h1 className="font-headings text-2xl font-bold text-text">Set your new password</h1>
          <p className="mt-2 text-sm text-muted">
            {success
              ? 'Your password has been updated. Redirecting to login...'
              : 'Choose a strong password for your account.'}
          </p>
        </div>

        {success ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              Password updated successfully. You&apos;ll be redirected to login shortly.
            </div>
            <Link
              href="/login"
              className="block w-full rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3.5 text-center text-base font-semibold text-white shadow-md transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-lg"
            >
              Go to Login
            </Link>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-text">
                New Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                autoFocus
                minLength={8}
                className="block w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-text placeholder-muted transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Minimum 8 characters"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-semibold text-text">
                Confirm New Password
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
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
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
