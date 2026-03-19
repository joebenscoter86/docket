# DOC-38: Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 3-step onboarding wizard (Welcome → Connect QuickBooks → Upload First Invoice) that guides new users through setup after signup.

**Architecture:** Dedicated route group `app/(onboarding)/onboarding/` with its own layout containing a simplified sidebar. Reuses existing `UploadZone` and QBO connect logic. Completion tracked via `users.onboarding_completed` flag. OAuth callback modified to support `returnTo` parameter.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, Supabase (Auth + DB), existing QBO OAuth flow

**Spec:** `docs/superpowers/specs/2026-03-18-doc-38-onboarding-flow-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `components/onboarding/OnboardingSidebar.tsx` | Simplified sidebar: 3 nav items (Welcome/Connect/Upload) with active state, checkmarks for completed steps, progress badge |
| `components/onboarding/StepIndicator.tsx` | Step progress indicator with 3 variants: "labeled", "numbered", "bar" |
| `components/onboarding/FeatureCard.tsx` | Icon + heading + description card used on Welcome step |
| `components/onboarding/TrustBadges.tsx` | Trust badge row (AES-256 / Intuit Approved / Real-time Sync) |
| `components/onboarding/OnboardingBanner.tsx` | Dashboard banner nudging incomplete onboarding |
| `app/(onboarding)/onboarding/layout.tsx` | Auth gate, fetches completion state, renders OnboardingSidebar + top bar |
| `app/(onboarding)/onboarding/page.tsx` | Step 1: Welcome |
| `app/(onboarding)/onboarding/connect/page.tsx` | Step 2: Connect QuickBooks |
| `app/(onboarding)/onboarding/upload/page.tsx` | Step 3: Upload First Invoice |
| `app/(onboarding)/onboarding/OnboardingShell.tsx` | Client component wrapper with sidebar + top bar (used by layout) |
| `app/api/users/onboarding/route.ts` | PATCH endpoint to set `onboarding_completed = true` |

### Modified Files
| File | Change |
|------|--------|
| `app/(auth)/signup/page.tsx` | Change redirect from `/invoices` to `/onboarding` |
| `app/api/quickbooks/connect/route.ts` | Accept `returnTo` query param, pass through OAuth `state` cookie |
| `app/api/auth/callback/quickbooks/route.ts` | Read `returnTo` from cookie, redirect there instead of `/settings` |
| `app/(dashboard)/layout.tsx` | Fetch `onboarding_completed` + connection/invoice status, pass to AppShell for banner |

---

## Task 1: StepIndicator Component

**Files:**
- Create: `components/onboarding/StepIndicator.tsx`

- [ ] **Step 1: Create StepIndicator with three variants**

```tsx
// components/onboarding/StepIndicator.tsx
'use client'

interface StepIndicatorProps {
  currentStep: 1 | 2 | 3
  variant: 'labeled' | 'numbered' | 'bar'
}

const stepLabels = ['Welcome', 'Connect', 'Upload']
const stepSubtitles = ['Introduction to Docket tools', 'Sync your accounting software', 'Your first invoice analysis']

export default function StepIndicator({ currentStep, variant }: StepIndicatorProps) {
  if (variant === 'bar') {
    return (
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((step) => (
          <div
            key={step}
            className={`h-1 flex-1 rounded-full ${
              step <= currentStep ? 'bg-primary' : 'bg-border'
            }`}
          />
        ))}
      </div>
    )
  }

  if (variant === 'numbered') {
    return (
      <div className="flex items-center justify-center gap-8">
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            className={`font-body text-xs tracking-widest uppercase ${
              step === currentStep
                ? 'text-primary font-bold border-b-2 border-primary pb-1'
                : 'text-muted'
            }`}
          >
            Step {String(step).padStart(2, '0')}
          </span>
        ))}
      </div>
    )
  }

  // variant === 'labeled'
  return (
    <div className="flex items-center justify-center gap-2">
      {[1, 2, 3].map((step, i) => (
        <div
          key={step}
          className={`flex items-center gap-3 rounded-brand-md px-4 py-3 ${
            step === currentStep
              ? 'bg-surface shadow-soft border border-border'
              : ''
          }`}
        >
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              step === currentStep
                ? 'bg-primary text-white'
                : 'bg-background text-muted'
            }`}
          >
            {step}
          </span>
          <div>
            <p className={`text-sm font-bold ${step === currentStep ? 'text-text' : 'text-muted'}`}>
              {stepLabels[i]}
            </p>
            <p className={`text-xs ${step === currentStep ? 'text-muted' : 'text-muted/60'}`}>
              {stepSubtitles[i]}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to StepIndicator

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/StepIndicator.tsx
git commit -m "feat: add StepIndicator component with 3 variants (DOC-38)"
```

---

## Task 2: FeatureCard and TrustBadges Components

**Files:**
- Create: `components/onboarding/FeatureCard.tsx`
- Create: `components/onboarding/TrustBadges.tsx`

- [ ] **Step 1: Create FeatureCard**

```tsx
// components/onboarding/FeatureCard.tsx
interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
}

export default function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="flex items-start gap-4 rounded-brand-lg bg-surface p-5 shadow-soft">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-brand-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <h3 className="font-headings text-base font-bold text-text">{title}</h3>
        <p className="mt-1 font-body text-sm text-muted">{description}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create TrustBadges**

```tsx
// components/onboarding/TrustBadges.tsx
export default function TrustBadges() {
  return (
    <div className="flex items-center justify-center gap-6 text-xs font-body tracking-wider uppercase text-muted">
      <div className="flex items-center gap-1.5">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
        <span>AES-256 Encryption</span>
      </div>
      <span className="text-border">•</span>
      <div className="flex items-center gap-1.5">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.745 3.745 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
        </svg>
        <span>Intuit Approved App</span>
      </div>
      <span className="text-border">•</span>
      <div className="flex items-center gap-1.5">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
        <span>Real-time Sync</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify both compile**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add components/onboarding/FeatureCard.tsx components/onboarding/TrustBadges.tsx
git commit -m "feat: add FeatureCard and TrustBadges components (DOC-38)"
```

---

## Task 3: OnboardingSidebar Component

**Files:**
- Create: `components/onboarding/OnboardingSidebar.tsx`

- [ ] **Step 1: Create OnboardingSidebar**

Model after the existing `components/layout/Sidebar.tsx` (280px width, same styling patterns) but with 3 onboarding nav items instead of dashboard nav, and a progress badge at bottom instead of user badge.

```tsx
// components/onboarding/OnboardingSidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface OnboardingSidebarProps {
  isOpen: boolean
  onClose: () => void
  completedSteps: { connect: boolean; upload: boolean }
}

const navItems = [
  {
    label: 'Welcome',
    href: '/onboarding',
    step: 1,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
      </svg>
    ),
  },
  {
    label: 'Connect',
    href: '/onboarding/connect',
    step: 2,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
  },
  {
    label: 'Upload',
    href: '/onboarding/upload',
    step: 3,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
  },
]

function getCurrentStep(pathname: string): number {
  if (pathname === '/onboarding') return 1
  if (pathname.startsWith('/onboarding/connect')) return 2
  if (pathname.startsWith('/onboarding/upload')) return 3
  return 1
}

function isStepComplete(step: number, completedSteps: { connect: boolean; upload: boolean }): boolean {
  if (step === 2) return completedSteps.connect
  if (step === 3) return completedSteps.upload
  return false // Step 1 (Welcome) has no completion state
}

export default function OnboardingSidebar({ isOpen, onClose, completedSteps }: OnboardingSidebarProps) {
  const pathname = usePathname()
  const currentStep = getCurrentStep(pathname)

  const sidebarContent = (
    <div className="flex h-full flex-col bg-surface border-r border-border">
      {/* Logo */}
      <div className="flex items-center px-4 pt-6 pb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/dockett_logo.png" alt="Docket" className="w-[75%]" />
        <button
          onClick={onClose}
          className="ml-auto rounded-md p-1.5 text-muted hover:text-text hover:bg-background md:hidden"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ONBOARDING label */}
      <div className="px-6 pb-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Onboarding</p>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = item.step === currentStep
            const isComplete = isStepComplete(item.step, completedSteps)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-brand-md px-3 py-2.5 text-sm font-body transition-all duration-150 ease-in-out ${
                  isActive
                    ? 'bg-nav-active text-primary font-bold border-l-[3px] border-primary'
                    : 'text-muted hover:bg-background hover:text-text'
                }`}
              >
                {isComplete ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5 text-accent">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                ) : (
                  item.icon
                )}
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Progress badge */}
      <div className="border-t border-border px-4 py-4">
        <div className="rounded-brand-md bg-background p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Precision Flow</p>
          </div>
          <p className="text-xs font-body text-muted mb-2">Step {currentStep} of 3</p>
          <div className="flex gap-1">
            {[1, 2, 3].map((step) => (
              <div
                key={step}
                className={`h-1 flex-1 rounded-full ${
                  step <= currentStep ? 'bg-primary' : 'bg-border'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-[280px] md:flex-shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar - overlay */}
      <div className={`fixed inset-0 z-40 md:hidden ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <div
          className={`fixed inset-0 bg-black/50 transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={onClose}
        />
        <aside className={`relative flex h-full w-[280px] flex-col transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {sidebarContent}
        </aside>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/OnboardingSidebar.tsx
git commit -m "feat: add OnboardingSidebar component (DOC-38)"
```

---

## Task 4: Onboarding Layout

**Files:**
- Create: `app/(onboarding)/onboarding/layout.tsx`

- [ ] **Step 1: Create the onboarding layout**

This layout mirrors the pattern from `app/(dashboard)/layout.tsx` (auth gate, data fetching) but uses `OnboardingSidebar` instead of `AppShell`. It fetches completion state for the sidebar checkmarks.

```tsx
// app/(onboarding)/onboarding/layout.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import OnboardingShell from './OnboardingShell'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch org membership
  const { data: membership } = await supabase
    .from('org_memberships')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  const orgId = membership?.org_id

  // Derive step completion from existing data
  let connectComplete = false
  let uploadComplete = false

  if (orgId) {
    const [{ count: connectionCount }, { count: invoiceCount }] = await Promise.all([
      supabase
        .from('accounting_connections')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('provider', 'quickbooks'),
      supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId),
    ])

    connectComplete = (connectionCount ?? 0) > 0
    uploadComplete = (invoiceCount ?? 0) > 0
  }

  return (
    <OnboardingShell completedSteps={{ connect: connectComplete, upload: uploadComplete }}>
      {children}
    </OnboardingShell>
  )
}
```

- [ ] **Step 2: Create OnboardingShell client component**

```tsx
// app/(onboarding)/onboarding/OnboardingShell.tsx
'use client'

import { useState } from 'react'
import OnboardingSidebar from '@/components/onboarding/OnboardingSidebar'

interface OnboardingShellProps {
  completedSteps: { connect: boolean; upload: boolean }
  children: React.ReactNode
}

export default function OnboardingShell({ completedSteps, children }: OnboardingShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-background">
      <OnboardingSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        completedSteps={completedSteps}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center border-b border-border bg-surface px-4">
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-muted hover:bg-background hover:text-text md:hidden"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          {/* Centered title */}
          <div className="flex-1 text-center">
            <span className="font-body text-sm font-semibold text-primary">Onboarding</span>
          </div>
          {/* Right icons */}
          <div className="flex items-center gap-2">
            <button className="rounded-full p-1.5 text-muted hover:bg-background hover:text-text">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
              </svg>
            </button>
            <button className="rounded-full p-1.5 text-muted hover:bg-background hover:text-text">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10">
          {children}
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify both compile**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add "app/(onboarding)/onboarding/layout.tsx" "app/(onboarding)/onboarding/OnboardingShell.tsx"
git commit -m "feat: add onboarding layout with auth gate and completion state (DOC-38)"
```

---

## Task 5: Welcome Page (Step 1)

**Files:**
- Create: `app/(onboarding)/onboarding/page.tsx`

- [ ] **Step 1: Create the Welcome page**

```tsx
// app/(onboarding)/onboarding/page.tsx
import Link from 'next/link'
import Button from '@/components/ui/Button'
import StepIndicator from '@/components/onboarding/StepIndicator'
import FeatureCard from '@/components/onboarding/FeatureCard'

export default function OnboardingWelcomePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Hero section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: copy */}
        <div className="rounded-brand-lg bg-surface p-8 shadow-soft">
          <div className="mb-6 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-brand-sm bg-primary/10">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5 text-primary">
                <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
              </svg>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">Getting Started</span>
          </div>
          <h1 className="font-headings text-3xl font-bold leading-tight text-text lg:text-4xl">
            Welcome to Docket. Let AI handle the paperwork while you focus on your business.
          </h1>
          <p className="mt-4 font-body text-base text-muted">
            Automatically extract data from invoices and sync to QuickBooks in seconds. Save hours every week.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Link href="/onboarding/connect">
              <Button variant="primary">
                Let&apos;s get started
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="ml-2 h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Button>
            </Link>
          </div>
        </div>

        {/* Right: Turbo Extraction card */}
        <div className="rounded-brand-lg bg-primary p-8 text-white">
          <div className="mb-4 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-7 w-7">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
              </svg>
            </div>
          </div>
          <h2 className="text-center font-headings text-xl font-bold">Turbo Extraction</h2>
          <p className="mt-2 text-center text-sm text-white/80">
            Process multiple documents in minutes. Upload a batch and let AI do the rest.
          </p>
          {/* Decorative file list */}
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3 rounded-brand-md bg-white/10 px-4 py-2.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white text-xs">✓</span>
              <span className="text-sm">Invoice_A12.pdf</span>
            </div>
            <div className="flex items-center gap-3 rounded-brand-md bg-white/10 px-4 py-2.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white text-xs">✓</span>
              <span className="text-sm">Supplier_Receipt.png</span>
            </div>
            <div className="flex items-center gap-3 rounded-brand-md bg-white/10 px-4 py-2.5 opacity-60">
              <span className="flex h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span className="text-sm">Syncing to QB...</span>
            </div>
          </div>
        </div>
      </div>

      {/* Step indicator */}
      <StepIndicator currentStep={1} variant="labeled" />

      {/* Feature cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FeatureCard
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
            </svg>
          }
          title="AI-Powered Extraction"
          description="Our AI engine reads invoices — typed, scanned, or handwritten — and pulls out the data automatically."
        />
        <FeatureCard
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          }
          title="Review & Validate"
          description="See your invoice side-by-side with extracted data. Correct anything the AI missed before syncing."
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add "app/(onboarding)/onboarding/page.tsx"
git commit -m "feat: add Welcome page for onboarding step 1 (DOC-38)"
```

---

## Task 6: Connect Page (Step 2)

**Files:**
- Create: `app/(onboarding)/onboarding/connect/page.tsx`

- [ ] **Step 1: Create the Connect page**

The "Connect QuickBooks" button links to `/api/quickbooks/connect?returnTo=/onboarding/connect` so the OAuth callback returns here.

```tsx
// app/(onboarding)/onboarding/connect/page.tsx
'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import StepIndicator from '@/components/onboarding/StepIndicator'
import TrustBadges from '@/components/onboarding/TrustBadges'

// Wrapper to handle Suspense boundary required by useSearchParams in Next.js 14
export default function OnboardingConnectPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl animate-pulse space-y-8"><div className="h-64 rounded-brand-lg bg-background" /></div>}>
      <ConnectContent />
    </Suspense>
  )
}

function ConnectContent() {
  const searchParams = useSearchParams()
  const success = searchParams.get('qbo_success')
  const error = searchParams.get('qbo_error')

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Step indicator */}
      <StepIndicator currentStep={2} variant="numbered" />

      {/* Main card */}
      <div className="rounded-brand-lg bg-surface p-10 shadow-soft text-center">
        {/* Background decoration */}
        <div className="relative">
          {/* Icon */}
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-brand-md bg-background">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8 text-primary">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </div>

          <h1 className="font-headings text-2xl font-bold text-text">Connect your business.</h1>
          <p className="mt-3 font-body text-base text-muted">
            Link your QuickBooks account to automatically sync your verified invoices. No more manual data entry.
          </p>

          {/* Success message */}
          {success && (
            <div className="mt-4 rounded-brand-md border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-accent">
              {success}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mt-4 rounded-brand-md border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">
              {error}
            </div>
          )}

          {/* Connect button */}
          {!success && (
            <div className="mt-8">
              <a
                href="/api/quickbooks/connect?returnTo=/onboarding/connect"
                className="inline-flex items-center gap-2 rounded-brand-md bg-[#2CA01C] px-6 py-3 text-sm font-bold text-white hover:bg-[#238a15] transition-colors"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                  <rect width="24" height="24" rx="4" fill="white" />
                  <path d="M12 4C7.58 4 4 7.58 4 12s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm3.5 10.5h-2v2c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5v-2h-2c-.83 0-1.5-.67-1.5-1.5S7.67 9 8.5 9h2V7c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v2h2c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" fill="#2CA01C" />
                </svg>
                Connect QuickBooks
              </a>
            </div>
          )}

          {/* Skip / Continue */}
          <div className="mt-4">
            {success ? (
              <Link
                href="/onboarding/upload"
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                Continue to Upload
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            ) : (
              <Link
                href="/onboarding/upload"
                className="text-sm font-body text-muted hover:text-text"
              >
                Skip for now
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Trust badges */}
      <TrustBadges />
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add "app/(onboarding)/onboarding/connect/page.tsx"
git commit -m "feat: add Connect page for onboarding step 2 (DOC-38)"
```

---

## Task 7: Upload Page (Step 3)

**Files:**
- Create: `app/(onboarding)/onboarding/upload/page.tsx`

- [ ] **Step 1: Create the Upload page**

Uses `UploadZone` directly. After successful upload, enables the "Finish Setup" button which calls the onboarding completion endpoint.

```tsx
// app/(onboarding)/onboarding/upload/page.tsx
'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import UploadZone from '@/components/invoices/UploadZone'
import StepIndicator from '@/components/onboarding/StepIndicator'
import Button from '@/components/ui/Button'

export default function OnboardingUploadPage() {
  const router = useRouter()
  const [uploadComplete, setUploadComplete] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const handleUploadComplete = useCallback((invoiceId: string) => {
    setUploadComplete(true)
  }, [])

  async function handleFinish() {
    setFinishing(true)
    try {
      await fetch('/api/users/onboarding', { method: 'PATCH' })
    } catch {
      // Fail gracefully — banner will reappear on next load
    }
    router.push('/invoices')
  }

  async function handleSkip() {
    try {
      await fetch('/api/users/onboarding', { method: 'PATCH' })
    } catch {
      // Fail gracefully
    }
    router.push('/invoices')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Progress bar */}
      <StepIndicator currentStep={3} variant="bar" />

      {/* Heading */}
      <div className="text-center">
        <h1 className="font-headings text-3xl font-bold text-text">Ready for the magic?</h1>
        <p className="mt-3 font-body text-base text-muted">
          Upload your first invoice to see how Docket automatically extracts everything for you.
        </p>
      </div>

      {/* Upload zone */}
      <UploadZone onUploadComplete={handleUploadComplete} />

      {/* Feature pills */}
      <div className="flex flex-wrap items-center justify-center gap-8 text-sm">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5 text-primary">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
          <div>
            <p className="font-bold text-text">Secure Storage</p>
            <p className="text-xs text-muted">256-bit encryption for every document.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5 text-primary">
            <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
          </svg>
          <div>
            <p className="font-bold text-text">Instant Extraction</p>
            <p className="text-xs text-muted">AI analyzes your data in seconds.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5 text-primary">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
          <div>
            <p className="font-bold text-text">Auto-Sync</p>
            <p className="text-xs text-muted">Connects to your existing accounting tools.</p>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between border-t border-border pt-6">
        <button
          onClick={handleSkip}
          className="text-sm font-body text-primary hover:underline"
        >
          Skip for now
        </button>
        <Button
          variant="primary"
          disabled={!uploadComplete || finishing}
          onClick={handleFinish}
        >
          {finishing ? 'Finishing...' : 'Finish Setup'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add "app/(onboarding)/onboarding/upload/page.tsx"
git commit -m "feat: add Upload page for onboarding step 3 (DOC-38)"
```

---

## Task 8: Onboarding Completion API Endpoint

**Files:**
- Create: `app/api/users/onboarding/route.ts`

- [ ] **Step 1: Create the PATCH endpoint**

Uses admin client to bypass RLS on the `users` table.

```tsx
// app/api/users/onboarding/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { authError, internalError } from '@/lib/utils/errors'

export async function PATCH() {
  const startTime = Date.now()

  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return authError('You must be logged in.')
    }

    const adminSupabase = createAdminClient()
    const { error } = await adminSupabase
      .from('users')
      .update({ onboarding_completed: true })
      .eq('id', user.id)

    if (error) {
      logger.error('users.onboarding_update_failed', {
        userId: user.id,
        error: error.message,
        durationMs: Date.now() - startTime,
      })
      return internalError('Failed to update onboarding status.')
    }

    logger.info('users.onboarding_completed', {
      userId: user.id,
      durationMs: Date.now() - startTime,
    })

    return NextResponse.json({ data: { onboarding_completed: true } })
  } catch (err) {
    logger.error('users.onboarding_unexpected_error', {
      error: err instanceof Error ? err.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    })
    return internalError('Failed to update onboarding status.')
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add app/api/users/onboarding/route.ts
git commit -m "feat: add PATCH /api/users/onboarding endpoint (DOC-38)"
```

---

## Task 9: OAuth ReturnTo Support

**Files:**
- Modify: `app/api/quickbooks/connect/route.ts`
- Modify: `app/api/auth/callback/quickbooks/route.ts`

- [ ] **Step 1: Update connect route to accept and store returnTo**

In `app/api/quickbooks/connect/route.ts`, read the `returnTo` query param, validate it against an allowlist, and store it in a separate httpOnly cookie alongside the CSRF state cookie. (Note: the spec suggested passing `returnTo` through the OAuth `state` parameter, but a separate cookie is simpler — it avoids encoding/decoding state and the CSRF protection already covers the state parameter.)

Find this code in the connect route:

```ts
    response.cookies.set("qbo_oauth_state", state, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      maxAge: 600, // 10 minutes — plenty for OAuth flow
      path: "/",
    });
```

Add after it:

```ts
    // Store returnTo for post-OAuth redirect (validated against allowlist)
    const returnTo = request.nextUrl.searchParams.get("returnTo");
    const ALLOWED_RETURN_PATHS = ["/settings", "/onboarding/connect"];
    if (returnTo && ALLOWED_RETURN_PATHS.includes(returnTo)) {
      response.cookies.set("qbo_oauth_return_to", returnTo, {
        httpOnly: true,
        secure: request.nextUrl.protocol === "https:",
        sameSite: "lax",
        maxAge: 600,
        path: "/",
      });
    }
```

- [ ] **Step 2: Update callback route to read returnTo and redirect there**

In `app/api/auth/callback/quickbooks/route.ts`, replace all hard-coded `/settings` redirects with a dynamic redirect based on the `returnTo` cookie.

Add this helper at the top of the GET function (after `const baseUrl`):

```ts
  // Read returnTo cookie for post-OAuth redirect destination
  const returnToCookie = request.cookies.get("qbo_oauth_return_to")?.value;
  const ALLOWED_RETURN_PATHS = ["/settings", "/onboarding/connect"];
  const returnTo = returnToCookie && ALLOWED_RETURN_PATHS.includes(returnToCookie)
    ? returnToCookie
    : "/settings";
```

Then replace every instance of `` `${baseUrl}/settings?qbo_error=` `` with `` `${baseUrl}${returnTo}?qbo_error=` `` and `` `${baseUrl}/settings?qbo_success=` `` with `` `${baseUrl}${returnTo}?qbo_success=` ``.

Also clear the returnTo cookie in the success response:

```ts
    response.cookies.delete("qbo_oauth_return_to");
```

Add the same `cookies.delete("qbo_oauth_return_to")` to error responses as well.

- [ ] **Step 3: Verify both compile**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Test the flow manually**

1. Navigate to `/onboarding/connect`
2. Click "Connect QuickBooks" — should redirect to Intuit with returnTo stored in cookie
3. After authorization, should redirect back to `/onboarding/connect?qbo_success=...`
4. Verify the existing `/settings` flow still works (no returnTo param → defaults to `/settings`)

- [ ] **Step 5: Commit**

```bash
git add app/api/quickbooks/connect/route.ts app/api/auth/callback/quickbooks/route.ts
git commit -m "feat: add returnTo support to QBO OAuth flow (DOC-38)"
```

---

## Task 10: Signup Redirect Change

**Files:**
- Modify: `app/(auth)/signup/page.tsx`

- [ ] **Step 1: Change the redirect**

In `app/(auth)/signup/page.tsx` line 54, change:

```ts
    router.push('/invoices')
```

to:

```ts
    router.push('/onboarding')
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add "app/(auth)/signup/page.tsx"
git commit -m "feat: redirect new signups to onboarding flow (DOC-38)"
```

---

## Task 11: Dashboard Onboarding Banner

**Files:**
- Create: `components/onboarding/OnboardingBanner.tsx`
- Modify: `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Create the OnboardingBanner component**

```tsx
// components/onboarding/OnboardingBanner.tsx
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

  // Determine which message to show (prioritize QBO connection)
  let message: string
  let href: string

  if (!hasConnection) {
    message = 'Complete setup: Connect QuickBooks'
    href = '/onboarding/connect'
  } else if (!hasInvoices) {
    message = 'Complete setup: Upload your first invoice'
    href = '/onboarding/upload'
  } else {
    return null // Everything complete
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
```

- [ ] **Step 2: Update dashboard layout to pass onboarding state**

In `app/(dashboard)/layout.tsx`, first update the existing membership query to also select `org_id`:

Change the existing select from:
```ts
.select('organizations(name)')
```
to:
```ts
.select('org_id, organizations(name)')
```

Then add after the `orgName` extraction:

```tsx
  // Fetch onboarding state for banner
  const { data: userData } = await supabase
    .from('users')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single()

  const onboardingCompleted = userData?.onboarding_completed ?? false

  let hasConnection = false
  let hasInvoices = false

  const orgId = (membership as { org_id?: string } | null)?.org_id

  if (!onboardingCompleted && orgId) {
      const [{ count: connCount }, { count: invCount }] = await Promise.all([
        supabase
          .from('accounting_connections')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('provider', 'quickbooks'),
        supabase
          .from('invoices')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', orgId),
      ])
      hasConnection = (connCount ?? 0) > 0
      hasInvoices = (invCount ?? 0) > 0
    }
  }
```

Then update the return to include the banner. Import `OnboardingBanner` and wrap children:

```tsx
import OnboardingBanner from '@/components/onboarding/OnboardingBanner'

// In the return:
  return (
    <AppShell userEmail={user.email ?? ''} orgName={orgName}>
      {!onboardingCompleted && (
        <OnboardingBanner hasConnection={hasConnection} hasInvoices={hasInvoices} />
      )}
      {children}
    </AppShell>
  )
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add components/onboarding/OnboardingBanner.tsx "app/(dashboard)/layout.tsx"
git commit -m "feat: add onboarding banner to dashboard for incomplete setup (DOC-38)"
```

---

## Task 12: Build Verification and Lint

**Files:** None (verification only)

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: Zero warnings, zero errors

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Successful production build

- [ ] **Step 4: Run tests**

Run: `npm run test`
Expected: All existing tests pass (no regressions)

- [ ] **Step 5: Fix any issues found, then re-run all checks**

- [ ] **Step 6: Final commit if any fixes were needed**

Stage only the files that were changed to fix the issues, then commit:

```bash
git commit -m "fix: address lint/build issues from onboarding implementation (DOC-38)"
```

---

## Task 13: Manual Smoke Test

- [ ] **Step 1: Start dev server**

Run: `npm run dev -- --port 3000`

- [ ] **Step 2: Test signup → onboarding redirect**

1. Create a new account at `/signup`
2. Verify redirect goes to `/onboarding` (Welcome page)
3. Verify the onboarding sidebar shows Welcome/Connect/Upload
4. Verify the progress badge shows "Step 1 of 3"

- [ ] **Step 3: Test step navigation**

1. Click "Let's get started" → should go to `/onboarding/connect`
2. Click sidebar nav items → should navigate between all 3 steps freely
3. Verify active state highlights correctly for each step

- [ ] **Step 4: Test QBO connect flow (if sandbox available)**

1. On step 2, click "Connect QuickBooks"
2. Complete OAuth in sandbox
3. Verify redirect back to `/onboarding/connect?qbo_success=...`
4. Verify sidebar shows checkmark on Connect step

- [ ] **Step 5: Test upload flow**

1. On step 3, upload a test PDF
2. Verify "Finish Setup" button enables after successful upload
3. Click "Finish Setup"
4. Verify redirect to `/invoices`
5. Verify no onboarding banner appears (onboarding_completed should be true)

- [ ] **Step 6: Test skip flows**

1. Create another test account
2. Click "Skip for now" on step 2 → should go to step 3
3. Click "Skip for now" on step 3 → should redirect to `/invoices`
4. Verify dashboard banner appears nudging to complete setup
5. Dismiss banner → verify it disappears and doesn't come back on refresh

- [ ] **Step 7: Test existing /settings QBO flow (regression)**

1. Go to `/settings`
2. Click "Connect QuickBooks" (no returnTo param)
3. Verify it still redirects back to `/settings` after OAuth
