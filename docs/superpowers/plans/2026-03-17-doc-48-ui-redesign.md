# DOC-48: Precision Flow UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the entire Docket app from the current slate-800/gray design to the "Precision Flow" design system — new fonts, new colors, new shadows, new radii — across all existing screens without changing any functionality.

**Architecture:** Pure UI-only changes. No new API routes, no database changes, no new dependencies beyond fonts. The design source of truth is `UIdesign.md` and the reference mockup at `.superpowers/brainstorm/73139-1773693911/mockup-screens.html`. All hex values must flow through Tailwind config tokens — zero hard-coded values in `.tsx` files.

**Tech Stack:** Tailwind CSS v3, Cabinet Grotesk + Satoshi + JetBrains Mono (CDN), Next.js 14 App Router

**Reference files:**
- Design spec: `UIdesign.md`
- Reference mockup: `.superpowers/brainstorm/73139-1773693911/mockup-screens.html` (serve with `python3 -m http.server 8765 --directory .superpowers/brainstorm/73139-1773693911/`)
- DOC-48 Linear issue for acceptance criteria

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `tailwind.config.ts` | Modify | Add Precision Flow design tokens (colors, fonts, radii, shadows) |
| `app/layout.tsx` | Modify | Add font CDN links in `<head>` |
| `app/globals.css` | Modify | Add CSS custom properties for design tokens |
| `components/ui/Button.tsx` | Rewrite | Full button component with primary/outline/danger variants |
| `components/ui/Input.tsx` | Rewrite | Full input component with focus ring and error states |
| `components/layout/Sidebar.tsx` | Rewrite | White bg, logo image, nav with active states, user badge at bottom |
| `components/layout/AppShell.tsx` | Modify | Remove Header, sidebar-only shell, update bg color |
| `components/layout/Header.tsx` | Modify | Keep for mobile hamburger only, remove desktop content |
| `components/invoices/InvoiceStatusBadge.tsx` | Rewrite | Pill badges with leading dots, new color scheme |
| `components/invoices/InvoiceList.tsx` | Modify | Restyle table, tabs, pagination to Precision Flow |
| `app/(dashboard)/invoices/page.tsx` | Modify | New page header with Cabinet Grotesk title + Upload button |
| `components/invoices/UploadZone.tsx` | Modify | New dropzone dimensions, dashed border, drag-active state |
| `app/(dashboard)/upload/page.tsx` | Modify | New page title + subtitle styling |
| `components/settings/QBOConnectionCard.tsx` | Rewrite | New integration card design with hover-lift |
| `app/(dashboard)/settings/page.tsx` | Modify | New layout, section labels, account card, billing card placeholder |
| `components/invoices/InvoiceStatusBadge.test.tsx` | Modify | Update test assertions for new color classes |
| `components/layout/Header.tsx` | Delete | Inlined into AppShell; no longer imported |

**Secondary files (restyled in Task 9 audit — old Tailwind classes → new tokens):**

| File | Change |
|------|--------|
| `components/invoices/ExtractionForm.tsx` | Replace old color classes with design tokens |
| `components/invoices/ExtractionProgress.tsx` | Replace old color classes with design tokens |
| `components/invoices/ReviewLayout.tsx` | Replace old color classes with design tokens |
| `components/invoices/ApproveBar.tsx` | Replace old color classes with design tokens |
| `components/invoices/SyncBar.tsx` | Replace old color classes with design tokens |
| `components/invoices/SyncStatusPanel.tsx` | Replace old color classes with design tokens |
| `components/invoices/LineItemEditor.tsx` | Replace old color classes with design tokens |
| `components/invoices/PdfViewer.tsx` | Replace old color classes with design tokens |
| `components/invoices/VendorSelect.tsx` | Replace old color classes with design tokens |
| `components/invoices/GlAccountSelect.tsx` | Replace old color classes with design tokens |
| `components/ui/Badge.tsx` | Replace old color classes with design tokens |
| `components/ui/Select.tsx` | Replace old color classes with design tokens |
| `components/settings/SettingsAlert.tsx` | Replace old color classes with design tokens |
| `app/(dashboard)/invoices/[id]/review/page.tsx` | Replace old color classes with design tokens |
| `app/(auth)/login/page.tsx` | Replace old color classes with design tokens |
| `app/(auth)/signup/page.tsx` | Replace old color classes with design tokens |
| `app/(dashboard)/invoices/loading.tsx` | Replace old color classes with design tokens |

---

## Important Notes

**Border radius strategy:** The Tailwind config uses **custom token names** (`rounded-brand-sm`, `rounded-brand-md`, `rounded-brand-lg`) to avoid overriding Tailwind's built-in `rounded-sm`/`rounded-md`/`rounded-lg` values. This prevents unintended global side effects on the 50+ existing usages of `rounded-md` across the codebase. All new Precision Flow components use the `brand-` prefixed versions.

**User name in sidebar:** The `users` table has no `name` column. The Sidebar's `userName` prop intentionally falls back to `orgName` via `userName || orgName` in AppShell. This is correct for MVP — all users see their org name in the sidebar. A display name field can be added later.

---

## Task 1: Tailwind Config + CSS Custom Properties + Fonts

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

This is the foundation — every subsequent task depends on these tokens being in place.

- [ ] **Step 1: Update `tailwind.config.ts` with Precision Flow tokens**

Replace the existing `colors` block and add `fontFamily`, `borderRadius`, and `boxShadow` extensions:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.5s ease-out forwards",
      },
      colors: {
        primary: {
          DEFAULT: "#3B82F6",
          hover: "#2563EB",
        },
        background: {
          DEFAULT: "#F8FAFC",
        },
        surface: {
          DEFAULT: "#FFFFFF",
        },
        text: {
          DEFAULT: "#0F172A",
        },
        muted: {
          DEFAULT: "#94A3B8",
        },
        accent: {
          DEFAULT: "#10B981",
        },
        warning: {
          DEFAULT: "#F59E0B",
        },
        error: {
          DEFAULT: "#DC2626",
        },
        border: {
          DEFAULT: "#E2E8F0",
        },
        "nav-active": {
          DEFAULT: "#EFF6FF",
        },
      },
      fontFamily: {
        headings: ["Cabinet Grotesk", "sans-serif"],
        body: ["Satoshi", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        "brand-sm": "8px",
        "brand-md": "12px",
        "brand-lg": "24px",
      },
      boxShadow: {
        soft: "0 12px 40px -8px rgba(15, 23, 42, 0.06)",
        float: "0 20px 60px -12px rgba(15, 23, 42, 0.12)",
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 2: Add CSS custom properties to `app/globals.css`**

Add the `:root` block with design tokens at the top of the file (before any existing styles). These are referenced by `UIdesign.md` and provide a fallback for any raw CSS usage:

```css
:root {
  --color-primary: #3B82F6;
  --color-background: #F8FAFC;
  --color-surface: #FFFFFF;
  --color-text: #0F172A;
  --color-muted: #94A3B8;
  --color-accent: #10B981;
  --color-warning: #F59E0B;
  --color-error: #DC2626;
  --color-border: #E2E8F0;
  --color-nav-active-bg: #EFF6FF;

  --font-headings: 'Cabinet Grotesk', sans-serif;
  --font-body: 'Satoshi', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  --radius-brand-sm: 8px;
  --radius-brand-md: 12px;
  --radius-brand-lg: 24px;

  --shadow-soft: 0 12px 40px -8px rgba(15, 23, 42, 0.06);
  --shadow-float: 0 20px 60px -12px rgba(15, 23, 42, 0.12);
}
```

- [ ] **Step 3: Add font CDN links to `app/layout.tsx`**

Add the font links inside `<head>` and set the default body font to Satoshi:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Docket",
  description: "Invoice processing for small businesses",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@700,800&f[]=satoshi@400,500,700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Verify fonts load and Tailwind tokens work**

Run: `npm run build`
Expected: Build succeeds. Open dev server and inspect — body text should render in Satoshi.

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts app/globals.css app/layout.tsx
git commit -m "feat: add Precision Flow design tokens, fonts, and CSS custom properties (DOC-48)"
```

---

## Task 2: Button Component

**Files:**
- Rewrite: `components/ui/Button.tsx`

Currently a stub that passes through props with no styling. Needs full implementation with primary/outline/danger variants per the Precision Flow spec.

- [ ] **Step 1: Rewrite `components/ui/Button.tsx`**

```tsx
import { forwardRef } from 'react'

type ButtonVariant = 'primary' | 'outline' | 'danger'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  children: React.ReactNode
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-white hover:bg-primary-hover focus-visible:ring-[3px] focus-visible:ring-[#BFDBFE] focus-visible:ring-offset-2',
  outline:
    'border border-border bg-transparent text-text hover:bg-background focus-visible:ring-[3px] focus-visible:ring-[#BFDBFE] focus-visible:ring-offset-2',
  danger:
    'bg-error text-white hover:bg-red-700 focus-visible:ring-[3px] focus-visible:ring-[#BFDBFE] focus-visible:ring-offset-2',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', className = '', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center h-11 px-5 rounded-brand-md font-body font-bold text-[15px] transition-all duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/ui/Button.tsx
git commit -m "feat: implement Button component with primary/outline/danger variants (DOC-48)"
```

**Note:** Inline button styles in other files (invoices page, settings, QBOConnectionCard, InvoiceList) will be migrated to use `<Button>` in Tasks 6, 7, 8 when those files are restyled. This avoids touching files twice.

---

## Task 3: Input Component

**Files:**
- Rewrite: `components/ui/Input.tsx`

Currently a stub. Needs 44px height, 12px radius, proper focus ring.

- [ ] **Step 1: Rewrite `components/ui/Input.tsx`**

```tsx
import { forwardRef } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`h-11 w-full rounded-brand-md border px-3.5 font-body text-sm text-text transition-all duration-150 ease-in-out placeholder:text-muted disabled:bg-gray-100 disabled:cursor-not-allowed focus:outline-none focus:ring-[3px] focus:ring-[#BFDBFE] focus:ring-offset-0 ${
          error
            ? 'border-error focus:border-error'
            : 'border-border focus:border-primary'
        } ${className}`}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'
export default Input
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/ui/Input.tsx
git commit -m "feat: implement Input component with focus ring and error state (DOC-48)"
```

---

## Task 4: Sidebar + AppShell + Header

**Files:**
- Rewrite: `components/layout/Sidebar.tsx`
- Modify: `components/layout/AppShell.tsx`
- Modify: `components/layout/Header.tsx`

The sidebar changes from dark slate-800 to white surface with blue active states. Header's desktop content is removed — sidebar handles all navigation identity. Header stays for mobile hamburger only.

- [ ] **Step 1: Rewrite `components/layout/Sidebar.tsx`**

Key changes:
- Background: `bg-surface` (white) with right border `border-border`
- Width: `md:w-[280px]` (was `md:w-64` = 256px)
- Top: Logo image from `public/dockett_logo.png` + "Automated Invoicing" subtitle
- Nav items: `text-muted` default, active = `bg-nav-active text-primary font-bold rounded-brand-md`
- Bottom: User badge with initials avatar circle (`bg-nav-active text-primary`), name + role
- Sign out moves into user badge section

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
  userName?: string
  userEmail?: string
}

export default function Sidebar({ isOpen, onClose, userName, userEmail }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Get initials for avatar
  const initials = userName
    ? userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : userEmail
      ? userEmail[0].toUpperCase()
      : '?'

  const sidebarContent = (
    <div className="flex h-full flex-col bg-surface border-r border-border">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-8">
        <img src="/dockett_logo.png" alt="Docket" className="h-8" />
        <div>
          <span className="block font-headings text-xl font-bold text-text">Docket</span>
          <span className="block font-body text-xs text-muted">Automated Invoicing</span>
        </div>
        {/* Close button - mobile only */}
        <button
          onClick={onClose}
          className="ml-auto rounded-md p-1 text-muted hover:text-text md:hidden"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-brand-md px-3 py-2.5 text-sm font-body transition-all duration-150 ease-in-out ${
                isActive
                  ? 'bg-nav-active text-primary font-bold'
                  : 'text-muted hover:bg-background hover:text-text'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User badge + sign out */}
      <div className="border-t border-border px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-nav-active text-primary font-body font-bold text-sm">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-body font-bold text-sm text-text truncate">
              {userName || userEmail || 'User'}
            </p>
            <p className="font-body text-xs text-muted truncate">
              Workspace Owner
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="rounded-md p-1.5 text-muted hover:text-text hover:bg-background transition-all duration-150 ease-in-out"
            title="Sign out"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar - static */}
      <aside className="hidden md:flex md:w-[280px] md:flex-shrink-0">
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
          className={`relative flex h-full w-[280px] flex-col transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          {sidebarContent}
        </aside>
      </div>
    </>
  )
}
```

Note: The `SidebarProps` interface now accepts `userName` and `userEmail`. AppShell must pass these through.

- [ ] **Step 2: Update `components/layout/AppShell.tsx`**

Remove the Header from desktop layout. Keep the mobile hamburger trigger. Update background to `bg-background`. Pass user info to Sidebar. Update main content padding to `p-8 lg:p-10`.

```tsx
'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'

interface AppShellProps {
  userEmail: string
  userName?: string
  orgName: string
  children: React.ReactNode
}

export default function AppShell({ userEmail, userName, orgName, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        userName={userName || orgName}
        userEmail={userEmail}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header - hamburger only */}
        <header className="flex h-14 items-center border-b border-border bg-surface px-4 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-muted hover:bg-background hover:text-text"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <span className="ml-3 font-headings text-lg font-bold text-text">Docket</span>
        </header>
        <main className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10">
          {children}
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Delete `components/layout/Header.tsx`**

The mobile header is now inlined into AppShell. Header.tsx is no longer imported anywhere. Delete it:

```bash
rm components/layout/Header.tsx
```

- [ ] **Step 4: Update the dashboard layout that renders AppShell**

Read `app/(dashboard)/layout.tsx` to see how `AppShell` is called. Pass `orgName` as the display name for the sidebar (the `users` table has no `name` column, so `orgName` is used as the user's display identity). The AppShell code falls back via `userName || orgName`.

- [ ] **Step 5: Verify the sidebar renders correctly**

Run: `npm run dev`
Check: Sidebar should be white with blue active states, logo image visible, user badge at bottom.

- [ ] **Step 6: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add components/layout/Sidebar.tsx components/layout/AppShell.tsx "app/(dashboard)/layout.tsx"
git rm components/layout/Header.tsx
git commit -m "feat: restyle Sidebar and AppShell to Precision Flow design (DOC-48)"
```

---

## Task 5: Invoice Status Badge

**Files:**
- Rewrite: `components/invoices/InvoiceStatusBadge.tsx`

New pill-shaped badges with 6px leading dots. New color scheme per DOC-48 spec.

- [ ] **Step 1: Rewrite `components/invoices/InvoiceStatusBadge.tsx`**

```tsx
import type { InvoiceStatus } from '@/lib/types/invoice'

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus
}

const statusConfig: Record<InvoiceStatus, {
  label: string
  textColor: string
  bgColor: string
  dotAnimation?: string
}> = {
  synced: {
    label: 'Synced',
    textColor: 'text-[#065F46]',
    bgColor: 'bg-[#D1FAE5]',
  },
  approved: {
    label: 'Approved',
    textColor: 'text-[#1D4ED8]',
    bgColor: 'bg-[#DBEAFE]',
  },
  pending_review: {
    label: 'Pending Review',
    textColor: 'text-[#92400E]',
    bgColor: 'bg-[#FEF3C7]',
    dotAnimation: 'animate-pulse',
  },
  extracting: {
    label: 'Extracting',
    textColor: 'text-[#5B21B6]',
    bgColor: 'bg-[#EDE9FE]',
    dotAnimation: 'animate-ping',
  },
  uploading: {
    label: 'Uploading',
    textColor: 'text-[#92400E]',
    bgColor: 'bg-[#FEF3C7]',
    dotAnimation: 'animate-pulse',
  },
  error: {
    label: 'Error',
    textColor: 'text-[#991B1B]',
    bgColor: 'bg-[#FEE2E2]',
  },
}

export default function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  const config = statusConfig[status]
  if (!config) return null

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-body text-xs font-medium ${config.textColor} ${config.bgColor}`}
    >
      {/* Leading dot */}
      <span className="relative flex h-1.5 w-1.5">
        {config.dotAnimation && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${config.dotAnimation}`}
            style={{ backgroundColor: 'currentColor' }}
          />
        )}
        <span
          className="relative inline-flex h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: 'currentColor' }}
        />
      </span>
      {config.label}
    </span>
  )
}
```

- [ ] **Step 2: Update `components/invoices/InvoiceStatusBadge.test.tsx`**

The existing tests assert old CSS class names (`bg-green`, `bg-red`, `bg-amber`, `bg-blue`) which no longer exist. Update:

- Keep the label rendering tests (lines 16-19) — these still pass as-is.
- Keep the `animate-ping` test for `extracting` (line 21-25) — still uses `animate-ping`.
- Update the "non-extracting statuses do not have animate-ping" test (line 27-39): remove `uploading` from the non-pulsing list since it now has `animate-pulse`. `animate-ping` is still only on `extracting`, so this test remains correct for `pending_review` (which uses `animate-pulse`, not `animate-ping`).
- Replace the color assertion tests (lines 42-76) with tests that check the new hex-based classes:

```tsx
it("synced status has green background", () => {
  const { container } = render(<InvoiceStatusBadge status="synced" />);
  const pill = container.firstChild as HTMLElement;
  expect(pill.className).toContain("bg-[#D1FAE5]");
});

it("error status has red background", () => {
  const { container } = render(<InvoiceStatusBadge status="error" />);
  const pill = container.firstChild as HTMLElement;
  expect(pill.className).toContain("bg-[#FEE2E2]");
});

it("pending_review status has amber background", () => {
  const { container } = render(<InvoiceStatusBadge status="pending_review" />);
  const pill = container.firstChild as HTMLElement;
  expect(pill.className).toContain("bg-[#FEF3C7]");
});

it("extracting status has purple background", () => {
  const { container } = render(<InvoiceStatusBadge status="extracting" />);
  const pill = container.firstChild as HTMLElement;
  expect(pill.className).toContain("bg-[#EDE9FE]");
});

it("approved status has blue background", () => {
  const { container } = render(<InvoiceStatusBadge status="approved" />);
  const pill = container.firstChild as HTMLElement;
  expect(pill.className).toContain("bg-[#DBEAFE]");
});
```

- [ ] **Step 3: Run tests to verify**

Run: `npm run test -- components/invoices/InvoiceStatusBadge.test.tsx`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add components/invoices/InvoiceStatusBadge.tsx components/invoices/InvoiceStatusBadge.test.tsx
git commit -m "feat: restyle InvoiceStatusBadge with pill design and leading dots (DOC-48)"
```

---

## Task 6: Invoices Page + InvoiceList

**Files:**
- Modify: `app/(dashboard)/invoices/page.tsx`
- Modify: `components/invoices/InvoiceList.tsx`

This is the largest single task. Key changes:
- Page title in Cabinet Grotesk 32px with "Upload New" primary button right-aligned
- Filter tabs restyled: active = blue border-b + bold, inactive = muted
- Count pills: active tab = `bg-[#DBEAFE] text-primary`, pending_review with count > 0 = `bg-primary text-white`
- Table rows: borderless, `border-b border-[#F1F5F9]`, hover = `bg-background`
- Column headers: `text-[11px] font-bold uppercase tracking-wider text-muted`
- Monospace for amounts, invoice numbers, dates
- Pagination: "Showing X–Y of Z invoices" left, Prev/Next buttons right

- [ ] **Step 1: Update `app/(dashboard)/invoices/page.tsx` page header**

Replace the page title and "Upload" link with:
- `h1` in `font-headings font-bold text-[32px] text-text tracking-tight` ("Invoices")
- Right-aligned "Upload New" primary Button with `+` icon

Read the current file first. The layout wrapper should look like:

```tsx
<div className="flex items-center justify-between mb-8">
  <h1 className="font-headings font-bold text-[32px] text-text tracking-tight">Invoices</h1>
  <Link href="/upload">
    <Button variant="primary">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4 mr-2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      Upload New
    </Button>
  </Link>
</div>
```

- [ ] **Step 2: Restyle filter tabs in `InvoiceList.tsx`**

Read the current `InvoiceList.tsx` file. Find the tab/filter section and update classes:
- Tab container: keep existing structure
- Active tab: `text-primary border-b-2 border-primary font-bold`
- Inactive tab: `text-muted hover:text-text border-b-2 border-transparent`
- Count pill on active tab: `bg-[#DBEAFE] text-primary`
- Count pill on pending_review (count > 0): `bg-primary text-white`
- All other count pills: `bg-[#F1F5F9] text-muted`

- [ ] **Step 3: Restyle table headers and rows in `InvoiceList.tsx`**

- Remove outer card/border wrapper if present
- `th`: `text-[11px] font-bold uppercase tracking-wider text-muted py-2.5 px-3`
- `td`: `py-3.5 px-3 text-[14px]`
- Row: `border-b border-[#F1F5F9] transition-all duration-150 ease-in-out hover:bg-background group`
- Amount column: right-aligned, `font-mono`
- Invoice # and date columns: `font-mono text-[13px] text-[#475569]`
- Vendor: `font-medium text-text`
- Add `group-hover:opacity-100 opacity-0` to action button/link in last column

- [ ] **Step 4: Restyle pagination**

- Left: "Showing X–Y of Z invoices" in `text-[13px] text-muted`
- Right: Prev/Next as `<Button variant="outline">` components

- [ ] **Step 5: Update empty state styling**

- Use the new design tokens: `text-muted` for description text
- CTA button should use `<Button variant="primary">`

- [ ] **Step 6: Verify no TypeScript errors and build**

Run: `npx tsc --noEmit && npm run build`
Expected: Both pass

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/invoices/page.tsx" components/invoices/InvoiceList.tsx
git commit -m "feat: restyle Invoices page and InvoiceList to Precision Flow (DOC-48)"
```

---

## Task 7: Upload Page + UploadZone

**Files:**
- Modify: `app/(dashboard)/upload/page.tsx`
- Modify: `components/invoices/UploadZone.tsx`

- [ ] **Step 1: Update `app/(dashboard)/upload/page.tsx`**

Read the current file. Update to:
- Page title: `font-headings font-bold text-[32px] text-text tracking-tight` ("Upload Invoices")
- Subtitle: `font-body text-[15px] text-muted mt-2` ("Drop your PDF or image files — AI will extract the data automatically.")

- [ ] **Step 2: Restyle `UploadZone.tsx` dropzone**

Read the current file. Key changes to the idle/default state:
- Container: `w-[80%] mx-auto min-h-[360px]`
- Background: `bg-surface`
- Border: `border-2 border-dashed border-[#CBD5E1] rounded-brand-lg` (24px radius)
- Shadow: `shadow-soft`
- Upload icon: 56px size, `text-muted`
- Heading: `font-headings font-bold text-2xl text-text` ("Drag & drop invoices here")
- Subtext: `font-body text-sm text-muted` ("PDF, PNG, JPG up to 10MB")
- "Browse Files" button: `<Button variant="primary">`

Drag-active state:
- `border-primary border-solid bg-[#EFF6FF] scale-[1.02]`
- Transition: `transition-all duration-150 ease-in-out`

- [ ] **Step 3: Restyle processing queue / ExtractionProgress styling**

If `ExtractionProgress.tsx` is rendered inside the upload page, update its row styling:
- Section label: `text-[11px] font-bold uppercase tracking-wider text-muted`
- Each row: `h-16 bg-surface rounded-brand-md shadow-soft px-4`
- Progress bar: `h-1 bg-primary` (complete → `bg-accent`)
- "View Result →" link: `text-primary font-bold text-[13px]`

- [ ] **Step 4: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/upload/page.tsx" components/invoices/UploadZone.tsx
git commit -m "feat: restyle Upload page and UploadZone to Precision Flow (DOC-48)"
```

---

## Task 8: Settings Page + QBO Connection Card

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`
- Rewrite: `components/settings/QBOConnectionCard.tsx`

- [ ] **Step 1: Restyle `app/(dashboard)/settings/page.tsx`**

Read the current file. Update to:
- Layout: `max-w-[600px] mx-auto space-y-9`
- Page title: `font-headings font-bold text-[32px] text-text tracking-tight` ("Settings")
- Subtitle: `font-body text-[15px] text-muted` ("Manage your account, connections, and billing.")
- Section labels: `text-[13px] font-bold uppercase tracking-wider text-muted mb-3`
- Account card: `bg-surface rounded-brand-lg shadow-soft px-6 py-6`
  - Read-only fields (email, org): `bg-background rounded-brand-md px-3.5 py-2.5 text-[14px]`
  - Editable fields: use `<Input>` component
  - "Save Changes" button: `<Button variant="primary">` right-aligned
- Billing card: `bg-surface rounded-brand-lg shadow-soft px-6 py-6`
  - Show "Design Partner" badge: amber pill
  - Plan name in `font-headings font-bold text-xl`
  - "Manage Billing" as `<Button variant="outline">`

- [ ] **Step 2: Rewrite `components/settings/QBOConnectionCard.tsx`**

Read the current file. Restyle to:
- Card: `bg-surface rounded-brand-lg shadow-soft px-6 py-5 flex items-center gap-5 transition-all duration-150 ease-in-out hover:-translate-y-0.5 hover:shadow-float`
- Logo: 44x44px colored rounded square (`bg-[#2CA01C]` for QB with white "QB" text or icon)
- Name: `font-body font-bold text-[15px]`, description: `font-body text-[13px] text-muted`
- Right side: status badge + action button
  - Connected: `bg-[#D1FAE5] text-[#065F46]` pill + "Disconnect" `<Button variant="outline">` with `text-error border-[#FECACA]`
  - Not connected: `bg-[#F1F5F9] text-muted` pill + "Connect" `<Button variant="outline">`

- [ ] **Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/settings/page.tsx" components/settings/QBOConnectionCard.tsx
git commit -m "feat: restyle Settings page and QBOConnectionCard to Precision Flow (DOC-48)"
```

---

## Task 9: Global Audit + Cleanup

**Files:**
- All `.tsx` files touched in previous tasks
- Any other components that may have stale inline styles

- [ ] **Step 1: Search for hard-coded hex values in `.tsx` files**

Run: `grep -rn '#[0-9a-fA-F]\{6\}' --include='*.tsx' components/ app/ | grep -v node_modules | grep -v '.test.'`

Review each match. The ONLY acceptable hard-coded hex values are those in the status badge config (which are intentional one-off colors per the spec, like `#065F46`, `#D1FAE5`, etc.). All other hex values should use Tailwind tokens.

- [ ] **Step 2: Search for old color classes that should be updated**

Run: `grep -rn 'bg-slate-\|text-slate-\|border-slate-\|bg-gray-50\b\|text-gray-500\b\|text-gray-700\b\|bg-blue-600\b\|bg-red-600\b' --include='*.tsx' components/ app/ | grep -v node_modules | grep -v '.test.'`

Map old classes to new ones:
- `bg-slate-800` → `bg-surface` (sidebar) or `bg-text` (if intentional dark)
- `text-slate-400` → `text-muted`
- `text-gray-500` → `text-muted`
- `text-gray-700` → `text-text`
- `bg-gray-50` → `bg-background`
- `bg-blue-600` → `bg-primary`
- `bg-red-600` → `bg-error`
- `border-gray-200` → `border-border`

Fix ALL remaining instances. The following files are confirmed to use old classes and MUST be updated (read each file, apply the class mapping above):

**Invoice components:**
- `components/invoices/ExtractionForm.tsx`
- `components/invoices/ExtractionProgress.tsx`
- `components/invoices/ReviewLayout.tsx`
- `components/invoices/ApproveBar.tsx`
- `components/invoices/SyncBar.tsx`
- `components/invoices/SyncStatusPanel.tsx`
- `components/invoices/LineItemEditor.tsx`
- `components/invoices/PdfViewer.tsx`
- `components/invoices/VendorSelect.tsx`
- `components/invoices/GlAccountSelect.tsx`

**UI components:**
- `components/ui/Badge.tsx`
- `components/ui/Select.tsx`

**Settings:**
- `components/settings/SettingsAlert.tsx`

**Pages:**
- `app/(dashboard)/invoices/[id]/review/page.tsx`
- `app/(dashboard)/invoices/loading.tsx`
- `app/(auth)/login/page.tsx`
- `app/(auth)/signup/page.tsx`

For each file: read it, find old color classes, replace with token equivalents. Do not change layout or functionality.

- [ ] **Step 3: Verify monospace on all financial data**

Search for amount/currency rendering patterns and ensure they use `font-mono`:
- `grep -rn 'total_amount\|subtotal\|tax_amount\|amount\|invoice_number\|invoice_date\|due_date' --include='*.tsx' components/ | grep -v '.test.'`

Ensure any component rendering these fields applies `font-mono` class.

- [ ] **Step 4: Verify all interactive elements have focus rings**

Check that buttons, links acting as buttons, and inputs all have `focus-visible:ring-[3px] focus-visible:ring-[#BFDBFE]` or use the Button/Input components which include it.

- [ ] **Step 5: Run full verification suite**

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

All four must pass.

- [ ] **Step 6: Commit any cleanup changes**

```bash
git add -A
git commit -m "chore: audit and clean up stale styles, enforce Precision Flow tokens (DOC-48)"
```

---

## Task 10: Final Verification + PR

- [ ] **Step 1: Visual verification**

Run `npm run dev` and manually verify each screen matches the reference mockup:
1. Sidebar: white bg, logo, active blue state, user badge
2. Invoices: page title, tabs, table rows, pagination
3. Upload: dropzone size, fonts, drag state
4. Settings: section layout, QBO card hover-lift
5. Review page (side-by-side): ensure it hasn't broken

- [ ] **Step 2: Run completion self-check**

Per CLAUDE.md:
1. `npm run lint` passes clean
2. `npm run build` completes without errors
3. `npx tsc --noEmit` passes with no type errors
4. `npm run test` passes with no failures
5. No `any` types in new code
6. No uncommented `console.log`
7. Server-side secrets not exposed
8. Status report delivered

- [ ] **Step 3: Push branch and create PR**

```bash
git push -u origin feature/BIL-48-ui-redesign
gh pr create --title "DOC-48: Precision Flow UI redesign" --body "$(cat <<'EOF'
## Summary
- Implements Precision Flow design system across all existing screens
- New fonts: Cabinet Grotesk (headings), Satoshi (body), JetBrains Mono (data)
- New color tokens, border radii, shadows per UIdesign.md
- Restyled: Sidebar, Button, Input, InvoiceStatusBadge, InvoiceList, UploadZone, Settings, QBOConnectionCard
- No functional changes — pure visual uplift

## Test plan
- [ ] Sidebar renders white with blue active states and logo
- [ ] Invoices page: tabs, table, pagination match mockup
- [ ] Upload page: dropzone 80% width, drag state works
- [ ] Settings page: card hover-lift, section labels
- [ ] Review page: not broken by design changes
- [ ] All fonts render correctly
- [ ] `npm run lint`, `tsc`, `test`, `build` all pass

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Deliver status report**

```
STATUS REPORT - DOC-48: UI Redesign (Precision Flow)

1. FILES CHANGED
   [list all files and changes]

2. DEPENDENCIES
   None added (fonts loaded via CDN)

3. ACCEPTANCE CRITERIA CHECK
   [check each from DOC-48 Linear issue]

4. SELF-REVIEW
   [complete self-review]

5. NEXT STEPS
   - DOC-36: Subscription flow (next in Phase 5 sequence)
```
