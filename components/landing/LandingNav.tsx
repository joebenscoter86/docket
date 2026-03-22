'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function LandingNav() {
  const [menuOpen, setMenuOpen] = useState(false)

  // Close menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && menuOpen) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen])

  return (
    <nav className="flex items-center justify-between px-6 py-3">
        <Link href="/">
          <Image
            src="/dockett_logo.png"
            alt="Docket"
            width={150}
            height={40}
            style={{ width: 'auto', height: '40px' }}
            priority
          />
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-4 md:flex">
          <Link
            href="/login"
            className="text-sm font-medium text-muted hover:text-text"
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className="rounded-brand-md bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-hover"
          >
            Get Started Free
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menu"
        >
          <svg
            className="h-6 w-6 text-text"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          data-testid="mobile-menu"
          className="border-t border-border/20 px-6 py-4 md:hidden"
        >
          <div className="flex flex-col gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-muted hover:text-text"
              onClick={() => setMenuOpen(false)}
            >
              Log In
            </Link>
            <Link
              href="/signup"
              className="rounded-brand-md bg-primary px-5 py-2.5 text-center text-sm font-bold text-white hover:bg-primary-hover"
              onClick={() => setMenuOpen(false)}
            >
              Get Started Free
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
