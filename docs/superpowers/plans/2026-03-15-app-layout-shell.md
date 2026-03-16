# App Layout Shell Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive app layout shell with dark sidebar navigation, top header bar, and mobile hamburger menu for all authenticated dashboard pages.

**Architecture:** Three layout components (Sidebar, Header, AppShell) composed in the dashboard layout. Sidebar is dark (slate-800) with nav links and sign-out. Header shows org name and user email. AppShell manages mobile sidebar toggle state. Dashboard layout.tsx is a server component that fetches auth + org data and passes it down.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, Supabase (auth + DB queries)

**Spec:** `docs/superpowers/specs/2026-03-15-app-layout-shell-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `components/layout/Sidebar.tsx` | Rewrite | Dark sidebar with nav links, active state, sign-out button, mobile overlay |
| `components/layout/Header.tsx` | Rewrite | Top bar with org name, user email (desktop) and hamburger menu (mobile) |
| `components/layout/AppShell.tsx` | Rewrite | Composes Sidebar + Header + main content, manages mobile sidebar state |
| `app/(dashboard)/layout.tsx` | Modify | Add org name fetch, pass props to AppShell, remove inline layout markup |
| `app/(dashboard)/logout-button.tsx` | Delete | Logout logic moves into Sidebar |

---

## Task 1: Build Sidebar component

**Files:**
- Rewrite: `components/layout/Sidebar.tsx`

- [ ] **Step 1: Implement Sidebar with nav links, active state, sign-out, and mobile overlay**

```tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  {
    label: 'Invoices',
    href: '/invoices',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
  },
  {
    label: 'Upload',
    href: '/upload',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
      </svg>
    ),
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.272 1.39l-1.004.827c-.292.24-.437.613-.43.992a7.723 7.723 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.272 1.39l-1.296 2.247a1.125 1.125 0 0 1-1.37.491l-1.216-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .272-1.39l1.004-.828c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.272-1.39l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
  },
]

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-800">
      {/* Logo */}
      <div className="flex h-14 items-center justify-between border-b border-slate-700 px-4">
        <span className="text-lg font-semibold text-white">Docket</span>
        {/* Close button - mobile only */}
        <button
          onClick={onClose}
          className="rounded-md p-1 text-slate-400 hover:text-white md:hidden"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Sign out */}
      <div className="border-t border-slate-700 px-3 py-4">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-700/50 hover:text-white transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
          </svg>
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar - static */}
      <aside className="hidden md:flex md:w-64 md:flex-shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar - overlay with slide transition */}
      <div
        className={`fixed inset-0 z-40 md:hidden ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        {/* Backdrop */}
        <div
          className={`fixed inset-0 bg-black/50 transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={onClose}
        />
        {/* Sidebar panel */}
        <aside
          className={`relative flex h-full w-64 flex-col transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          {sidebarContent}
        </aside>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: Clean output, no errors.

---

## Task 2: Build Header component

**Files:**
- Rewrite: `components/layout/Header.tsx`

- [ ] **Step 1: Implement Header with org name, user email, and mobile hamburger**

```tsx
'use client'

interface HeaderProps {
  userEmail: string
  orgName: string
  onMenuToggle: () => void
}

export default function Header({ userEmail, orgName, onMenuToggle }: HeaderProps) {
  return (
    <header className="flex h-14 items-center border-b border-gray-200 bg-white px-4 md:px-6">
      {/* Mobile: hamburger + logo */}
      <button
        onClick={onMenuToggle}
        className="rounded-md p-1.5 text-slate-600 hover:bg-gray-100 md:hidden"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>
      <span className="ml-3 text-lg font-semibold text-slate-800 md:hidden">Docket</span>

      {/* Desktop: org name + user email (right-aligned) */}
      <div className="ml-auto hidden items-center gap-4 md:flex">
        {orgName && (
          <span className="text-sm font-medium text-slate-800">{orgName}</span>
        )}
        <span className="text-sm text-gray-500">{userEmail}</span>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: Clean output.

---

## Task 3: Build AppShell component

**Files:**
- Rewrite: `components/layout/AppShell.tsx`

- [ ] **Step 1: Implement AppShell composing Sidebar + Header + content**

```tsx
'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'

interface AppShellProps {
  userEmail: string
  orgName: string
  children: React.ReactNode
}

export default function AppShell({ userEmail, orgName, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          userEmail={userEmail}
          orgName={orgName}
          onMenuToggle={() => setSidebarOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: Clean output.

---

## Task 4: Update dashboard layout and clean up

**Files:**
- Modify: `app/(dashboard)/layout.tsx`
- Delete: `app/(dashboard)/logout-button.tsx`

- [ ] **Step 1: Update dashboard layout to fetch org name and render AppShell**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch org name via org_memberships → organizations
  const { data: membership } = await supabase
    .from('org_memberships')
    .select('organizations(name)')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  const orgName = (membership?.organizations as { name: string } | null)?.name ?? ''

  return (
    <AppShell userEmail={user.email ?? ''} orgName={orgName}>
      {children}
    </AppShell>
  )
}
```

- [ ] **Step 2: Delete logout-button.tsx**

Run: `rm app/(dashboard)/logout-button.tsx`

The logout logic now lives in `Sidebar.tsx`.

- [ ] **Step 3: Run full verification**

Run these in sequence:
```bash
npx tsc --noEmit
npm run lint
npm run build
```
Expected: All three pass clean.

- [ ] **Step 4: Commit all changes**

```bash
git add components/layout/Sidebar.tsx components/layout/Header.tsx components/layout/AppShell.tsx "app/(dashboard)/layout.tsx" "app/(dashboard)/logout-button.tsx"
git commit -m "feat: build app layout shell with sidebar nav, header, mobile menu (DOC-5)"
```
