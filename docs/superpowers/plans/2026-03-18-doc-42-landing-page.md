# DOC-42: Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stub landing page at `/` with a full marketing page that communicates Docket's value to small business owners and bookkeepers.

**Architecture:** Single server component at `app/page.tsx` that checks auth (redirect to `/app/invoices` if logged in) and renders five landing-specific components. Components live in `components/landing/`. Page is fully static for unauthenticated users — no client interactivity except the mobile hamburger menu.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, Supabase Auth (server-side), next/image

**Spec:** `docs/superpowers/specs/2026-03-18-doc-42-landing-page-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `app/page.tsx` | Modify | Auth redirect + landing page composition |
| `components/landing/LandingNav.tsx` | Create | Sticky nav bar with logo, Log In, Get Started Free. Hamburger on mobile. |
| `components/landing/HeroSection.tsx` | Create | Headline, subheadline, CTA button, product screenshot |
| `components/landing/HowItWorksSection.tsx` | Create | 3-card step layout (Upload, Review, Sync) |
| `components/landing/FeaturesSection.tsx` | Create | 4 feature items with descriptions + screenshot |
| `components/landing/BottomCTA.tsx` | Create | Closing headline + CTA button |
| `components/landing/LandingNav.test.tsx` | Create | Nav rendering, link targets, hamburger toggle |
| `app/page.test.tsx` | Create | Auth redirect logic |
| `public/images/review-ui-screenshot.png` | Create | Placeholder screenshot (swap for real one before launch) |
| `public/images/og-image.png` | Create | 1200x630 OG image placeholder |

**Not modified:** `components/layout/Footer.tsx` (reused as-is), `tailwind.config.ts` (tokens already set), `app/globals.css` (no changes needed), `app/layout.tsx` (metadata moves to page-level).

---

### Task 1: Create placeholder image assets

**Files:**
- Create: `public/images/review-ui-screenshot.png`
- Create: `public/images/og-image.png`

- [ ] **Step 1: Create images directory**

```bash
mkdir -p public/images
```

- [ ] **Step 2: Create placeholder screenshot**

Generate a simple 1200x800 placeholder PNG for the product screenshot. This will be replaced with a real screenshot before launch.

```bash
# Create a minimal placeholder using ImageMagick (if available) or a 1x1 pixel PNG
# If ImageMagick not available, create a minimal valid PNG programmatically
node -e "
const { createCanvas } = require('canvas');
// If canvas not available, just create a minimal placeholder file
const fs = require('fs');
// 1x1 transparent PNG as placeholder
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
fs.writeFileSync('public/images/review-ui-screenshot.png', png);
fs.writeFileSync('public/images/og-image.png', png);
console.log('Created placeholder images');
"
```

If the above fails (no canvas), manually create minimal placeholder PNGs — any valid PNG file works. These are placeholders to unblock development.

- [ ] **Step 3: Commit**

```bash
git add public/images/
git commit -m "chore: add placeholder image assets for landing page (DOC-42)"
```

---

### Task 2: LandingNav component

**Files:**
- Create: `components/landing/LandingNav.tsx`
- Create: `components/landing/LandingNav.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// components/landing/LandingNav.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import LandingNav from './LandingNav'

describe('LandingNav', () => {
  it('renders logo linking to home', () => {
    render(<LandingNav />)
    const logo = screen.getByAltText('Docket')
    expect(logo.closest('a')).toHaveAttribute('href', '/')
  })

  it('renders Log In link to /login', () => {
    render(<LandingNav />)
    const loginLink = screen.getByRole('link', { name: /log in/i })
    expect(loginLink).toHaveAttribute('href', '/login')
  })

  it('renders Get Started Free button linking to /signup', () => {
    render(<LandingNav />)
    const cta = screen.getByRole('link', { name: /get started free/i })
    expect(cta).toHaveAttribute('href', '/signup')
  })

  it('toggles mobile menu on hamburger click', () => {
    render(<LandingNav />)
    const hamburger = screen.getByRole('button', { name: /menu/i })

    // Menu hidden initially
    expect(screen.queryByTestId('mobile-menu')).not.toBeInTheDocument()

    // Click opens menu
    fireEvent.click(hamburger)
    expect(screen.getByTestId('mobile-menu')).toBeInTheDocument()

    // Click again closes menu
    fireEvent.click(hamburger)
    expect(screen.queryByTestId('mobile-menu')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- components/landing/LandingNav.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the component**

```tsx
// components/landing/LandingNav.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function LandingNav() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/">
          <Image
            src="/dockett_logo.png"
            alt="Docket"
            width={120}
            height={32}
            className="h-8 w-auto"
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
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          data-testid="mobile-menu"
          className="border-t border-border bg-surface px-6 py-4 shadow-soft md:hidden"
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- components/landing/LandingNav.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add components/landing/LandingNav.tsx components/landing/LandingNav.test.tsx
git commit -m "feat: add LandingNav component with mobile hamburger (DOC-42)"
```

---

### Task 3: HeroSection component

**Files:**
- Create: `components/landing/HeroSection.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/landing/HeroSection.tsx
import Link from 'next/link'
import Image from 'next/image'

export default function HeroSection() {
  return (
    <section className="mx-auto flex max-w-6xl flex-col items-center gap-12 px-6 py-20 lg:flex-row lg:gap-16 lg:py-32">
      {/* Text */}
      <div className="flex-1 text-center lg:text-left">
        <h1 className="font-headings text-4xl font-bold leading-tight text-text md:text-5xl">
          From invoice to QuickBooks in under a minute.
        </h1>
        <p className="mt-6 text-lg text-muted">
          Upload your invoices. AI pulls out the details. You review, approve,
          and sync — done.
        </p>
        <div className="mt-8">
          <Link
            href="/signup"
            className="inline-block rounded-brand-md bg-primary px-8 py-3.5 text-base font-bold text-white hover:bg-primary-hover"
          >
            Get Started Free
          </Link>
        </div>
      </div>

      {/* Screenshot */}
      <div className="flex-1">
        <div className="overflow-hidden rounded-brand-lg shadow-float">
          <Image
            src="/images/review-ui-screenshot.png"
            alt="Docket review interface showing a PDF invoice side-by-side with extracted data fields"
            width={1200}
            height={800}
            className="h-auto w-full"
            priority
          />
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add components/landing/HeroSection.tsx
git commit -m "feat: add HeroSection component (DOC-42)"
```

---

### Task 4: HowItWorksSection component

**Files:**
- Create: `components/landing/HowItWorksSection.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/landing/HowItWorksSection.tsx

const steps = [
  {
    number: '1',
    title: 'Upload',
    description:
      'Drop your PDFs — one or a whole batch. We take it from there.',
    icon: (
      <svg className="h-8 w-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    ),
  },
  {
    number: '2',
    title: 'Review',
    description:
      'AI extracts vendor, line items, and totals. You check the work.',
    icon: (
      <svg className="h-8 w-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
    ),
  },
  {
    number: '3',
    title: 'Sync',
    description:
      'One click creates a bill or cuts a check in QuickBooks.',
    icon: (
      <svg className="h-8 w-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.5 12a7.5 7.5 0 0015 0m-15 0a7.5 7.5 0 1115 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.457 3.077l1.41-.513m14.095-5.13l1.41-.513M5.106 17.785l1.15-.964m11.49-9.642l1.149-.964M7.501 19.795l.75-1.3m7.5-12.99l.75-1.3m-6.063 16.658l.26-1.477m2.605-14.772l.26-1.477m0 17.726l-.26-1.477M10.698 4.614l-.26-1.477M16.5 19.794l-.75-1.299M7.5 4.205L12 12" />
      </svg>
    ),
  },
]

export default function HowItWorksSection() {
  return (
    <section className="bg-background py-20">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <h2 className="font-headings text-3xl font-bold text-text">
          How It Works
        </h2>
        <p className="mt-3 text-muted">
          Your invoices go from paper to ledger in three steps.
        </p>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.number}
              className="rounded-brand-md bg-surface p-8 shadow-soft"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-background">
                {step.icon}
              </div>
              <p className="mt-2 text-xs font-bold uppercase tracking-wider text-muted">
                Step {step.number}
              </p>
              <h3 className="mt-3 font-headings text-xl font-bold text-text">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-muted">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add components/landing/HowItWorksSection.tsx
git commit -m "feat: add HowItWorksSection component (DOC-42)"
```

---

### Task 5: FeaturesSection component

**Files:**
- Create: `components/landing/FeaturesSection.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/landing/FeaturesSection.tsx
import Image from 'next/image'

const features = [
  {
    title: 'Batch upload',
    description:
      'Process a whole stack of invoices at once — no more one at a time.',
    icon: (
      <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    title: 'Bill or check',
    description:
      'Create a bill in QuickBooks, or skip straight to cutting a check.',
    icon: (
      <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
  },
  {
    title: 'AI extraction',
    description:
      'Our AI reads your invoices so you don\'t have to type a thing.',
    icon: (
      <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
  },
  {
    title: 'Side-by-side review',
    description:
      'See the original document right next to the extracted data. Fix anything the AI missed.',
    icon: (
      <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
  },
]

export default function FeaturesSection() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-16">
          {/* Feature list */}
          <div className="flex-1">
            <h2 className="font-headings text-3xl font-bold text-text">
              Built for how you actually work
            </h2>

            <div className="mt-10 space-y-8">
              {features.map((feature) => (
                <div key={feature.title} className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-brand-sm bg-background">
                    {feature.icon}
                  </div>
                  <div>
                    <h3 className="font-headings text-base font-bold text-text">
                      {feature.title}
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Screenshot */}
          <div className="flex-1">
            <div className="overflow-hidden rounded-brand-lg shadow-float">
              <Image
                src="/images/review-ui-screenshot.png"
                alt="Docket extraction form showing extracted invoice data with editable fields"
                width={1200}
                height={800}
                className="h-auto w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add components/landing/FeaturesSection.tsx
git commit -m "feat: add FeaturesSection component (DOC-42)"
```

---

### Task 6: BottomCTA component

**Files:**
- Create: `components/landing/BottomCTA.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/landing/BottomCTA.tsx
import Link from 'next/link'

export default function BottomCTA() {
  return (
    <section className="bg-background py-20">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="font-headings text-3xl font-bold text-text md:text-4xl">
          Spend your evening, your way — not on invoices.
        </h2>
        <div className="mt-8">
          <Link
            href="/signup"
            className="inline-block rounded-brand-md bg-primary px-8 py-3.5 text-base font-bold text-white hover:bg-primary-hover"
          >
            Get Started Free
          </Link>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add components/landing/BottomCTA.tsx
git commit -m "feat: add BottomCTA component (DOC-42)"
```

---

### Task 7: Compose landing page and add auth redirect

**Files:**
- Modify: `app/page.tsx`
- Create: `app/page.test.tsx`

- [ ] **Step 1: Write the failing test for auth redirect**

```tsx
// app/page.test.tsx
import { describe, it, expect, vi } from 'vitest'

// Mock next/navigation
const mockRedirect = vi.fn()
vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

// Mock supabase server client
const mockGetUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}))

describe('Landing page', () => {
  it('redirects authenticated users to /app/invoices', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'test-user-id' } },
    })

    // Dynamic import to pick up mocks
    const { default: Home } = await import('./page')
    await Home()

    expect(mockRedirect).toHaveBeenCalledWith('/app/invoices')
  })

  it('does not redirect unauthenticated users', async () => {
    mockRedirect.mockClear()
    mockGetUser.mockResolvedValue({
      data: { user: null },
    })

    const { default: Home } = await import('./page')
    const result = await Home()

    expect(mockRedirect).not.toHaveBeenCalled()
    expect(result).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- app/page.test.tsx`
Expected: FAIL — current page.tsx has no auth logic

- [ ] **Step 3: Write the landing page**

```tsx
// app/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import LandingNav from '@/components/landing/LandingNav'
import HeroSection from '@/components/landing/HeroSection'
import HowItWorksSection from '@/components/landing/HowItWorksSection'
import FeaturesSection from '@/components/landing/FeaturesSection'
import BottomCTA from '@/components/landing/BottomCTA'
import Footer from '@/components/layout/Footer'

export const metadata: Metadata = {
  title: 'Docket — Invoice to QuickBooks in Under a Minute',
  description:
    'Upload invoices, AI extracts the data, sync to QuickBooks with one click. Built for small businesses and bookkeepers.',
  openGraph: {
    title: 'Docket — Invoice to QuickBooks in Under a Minute',
    description:
      'Upload invoices, AI extracts the data, sync to QuickBooks with one click.',
    url: 'https://dockett.app',
    siteName: 'Docket',
    type: 'website',
    images: [
      {
        url: 'https://dockett.app/images/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Docket — Invoice to QuickBooks in Under a Minute',
      },
    ],
  },
}

export default async function Home() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/app/invoices')
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <LandingNav />
      <main>
        <HeroSection />
        <HowItWorksSection />
        <FeaturesSection />
        <BottomCTA />
      </main>
      <Footer />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- app/page.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Run full verification**

```bash
npm run lint && npx tsc --noEmit && npm run test && npm run build
```

Expected: All pass clean.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/page.test.tsx
git commit -m "feat: build landing page with auth redirect (DOC-42)"
```

---

### Task 8: Visual QA and polish

**Files:**
- Modify: Any landing component that needs tweaks

- [ ] **Step 1: Start dev server and visually verify**

```bash
npm run dev -- --port 3000
```

Open `http://localhost:3000` in browser (logged out). Verify:
- Nav bar is sticky, logo renders, links work
- Hero section: headline readable, CTA links to `/signup`, screenshot renders
- How It Works: 3 cards display correctly, responsive stacking on narrow viewport
- Features: 4 items with icons, screenshot renders
- Bottom CTA: headline and button display, background differentiated
- Footer: privacy/terms links work, copyright shows
- Mobile: resize to <768px — hamburger appears, sections stack, menu opens/closes

- [ ] **Step 2: Verify auth redirect**

Log in to the app, then visit `http://localhost:3000`. Should redirect to `/app/invoices`.

- [ ] **Step 3: Fix any visual issues found**

Address spacing, alignment, or responsive issues. Each fix should be minimal.

- [ ] **Step 4: Run final verification**

```bash
npm run lint && npx tsc --noEmit && npm run test && npm run build
```

- [ ] **Step 5: Commit any polish changes**

```bash
git add -A
git commit -m "fix: landing page visual polish (DOC-42)"
```

---

### Task 9: Final PR

- [ ] **Step 1: Push branch and create PR**

```bash
git push -u origin feature/BIL-8-landing-page
gh pr create --title "DOC-42: Landing page" --body "$(cat <<'EOF'
## Summary
- Full landing page at `/` replacing the stub
- Sections: nav, hero, how it works, features, bottom CTA, footer
- Auth redirect: logged-in users go to `/app/invoices`
- Responsive: mobile hamburger nav, stacking layouts
- SEO: title, description, Open Graph metadata
- Placeholder screenshots (swap for real ones before launch)

## Test plan
- [ ] Visit `/` logged out — landing page renders
- [ ] Visit `/` logged in — redirects to `/app/invoices`
- [ ] All nav links work (Log In → /login, Get Started Free → /signup)
- [ ] Mobile: hamburger menu opens/closes, links work
- [ ] Footer: Privacy Policy and Terms links work
- [ ] `npm run test` passes
- [ ] `npm run build` passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Deliver status report**

```
STATUS REPORT - DOC-42: Landing Page

1. FILES CHANGED
   app/page.tsx - Replaced stub with full landing page (auth redirect + section composition)
   app/page.test.tsx - Auth redirect tests
   components/landing/LandingNav.tsx - Sticky nav with mobile hamburger
   components/landing/LandingNav.test.tsx - Nav rendering and hamburger toggle tests
   components/landing/HeroSection.tsx - Headline, subheadline, CTA, product screenshot
   components/landing/HowItWorksSection.tsx - 3-step card layout
   components/landing/FeaturesSection.tsx - 4 feature items with screenshot
   components/landing/BottomCTA.tsx - Closing CTA section
   public/images/review-ui-screenshot.png - Placeholder screenshot
   public/images/og-image.png - Placeholder OG image

2. DEPENDENCIES
   None added.

3. ACCEPTANCE CRITERIA CHECK
   ✅ Hero section with headline, sub-headline, CTA button
   ✅ How it works: 3-step visual (Upload, Review, Sync)
   ✅ Features: key benefits with icons
   ✅ Footer: Privacy, Terms, copyright
   ✅ Responsive: desktop and mobile
   ✅ Auth redirect: logged-in users → /app/invoices
   ✅ SEO: title, meta description, Open Graph tags
   ✅ Tailwind only, no component libraries
   ⚠️ Screenshots are placeholders — need real product screenshots before launch

4. SELF-REVIEW
   a) Screenshot placeholders need to be replaced with real product screenshots
   b) No TypeScript errors suppressed
   c) OG image is a placeholder — needs a branded 1200x630 image
   d) No files touched outside this issue's scope
   e) Confidence: High — straightforward static page

5. NEXT STEPS
   - Capture real product screenshot for hero and features sections
   - Create branded OG image (1200x630)
   - Workshop final copy with Joe (headlines, descriptions may evolve)
```
