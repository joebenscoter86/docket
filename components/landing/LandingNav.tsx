'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

export default function LandingNav() {
  const [menuOpen, setMenuOpen] = useState(false)

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
          sizes="150px"
          style={{ width: 'auto', height: '40px' }}
          priority
        />
      </Link>

      {/* Desktop nav */}
      <div className="hidden items-center gap-6 md:flex">
        {NAV_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="text-sm font-medium text-muted hover:text-text transition-colors"
          >
            {link.label}
          </a>
        ))}
      </div>

      <div className="hidden items-center gap-3 md:flex">
        <Link
          href="/login"
          className="text-sm font-medium text-muted hover:text-text"
        >
          Log In
        </Link>
        <Link
          href="/signup"
          className="rounded-full bg-gradient-to-r from-[#00C6FF] to-[#00A3FF] px-5 py-2.5 text-sm font-bold text-white shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5"
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
          className="absolute top-full left-0 right-0 border-t border-border/20 bg-white rounded-b-[40px] px-6 py-4 md:hidden shadow-lg"
        >
          <div className="flex flex-col gap-3">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted hover:text-text"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <hr className="border-border/20" />
            <Link
              href="/login"
              className="text-sm font-medium text-muted hover:text-text"
              onClick={() => setMenuOpen(false)}
            >
              Log In
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-gradient-to-r from-[#00C6FF] to-[#00A3FF] px-5 py-2.5 text-center text-sm font-bold text-white"
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
