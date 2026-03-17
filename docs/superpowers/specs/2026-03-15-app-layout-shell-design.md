# DOC-5: App Layout Shell Design

## Overview

Build a responsive app layout shell with dark sidebar navigation, top header bar, main content area, and mobile hamburger menu. All authenticated dashboard pages render inside this shell.

## Layout Structure

- **Dark sidebar** (w-64 / 256px, bg-slate-800) — fixed left, full viewport height
  - Top: "Docket" logo text (text-lg font-semibold text-white)
  - Middle: Navigation links
  - Bottom: "Sign out" button (text-slate-400, hover highlight)
- **Top header bar** (bg-white, border-b border-gray-200) — spans the content area (right of sidebar)
  - Right-aligned: org name (font-medium text-slate-800) + user email (text-sm text-gray-500)
  - On mobile: hamburger button (left) + "Docket" text (center)
- **Main content area** — below header, fills remaining space, bg-gray-50, p-6

## Navigation Items

| Label | Route | Icon |
|-------|-------|------|
| Invoices | `/invoices` | Document icon (inline SVG) |
| Upload | `/upload` | Upload arrow icon (inline SVG) |
| Settings | `/settings` | Gear icon (inline SVG) |

### Active State

- Active: `bg-slate-700 text-white` with rounded-md
- Inactive: `text-slate-400 hover:bg-slate-700/50 hover:text-white` with rounded-md
- Detection: compare `usePathname()` against link href

## Mobile Behavior (< md breakpoint)

- Sidebar hidden by default
- Header bar becomes mobile top bar: hamburger button (left) + "Docket" text (center)
- Tapping hamburger slides sidebar in as fixed overlay (left-0, z-40)
- Semi-transparent backdrop behind sidebar (bg-black/50), click to close
- X close button in sidebar header on mobile
- Sidebar slides out with translate-x transition

## Components

### `components/layout/Sidebar.tsx` (client component)

- Props: `isOpen: boolean`, `onClose: () => void`
- Uses `usePathname()` for active nav highlighting
- Renders nav links and sign-out button in footer
- On mobile: fixed overlay with backdrop; on desktop: static in flex layout

### `components/layout/Header.tsx` (client component)

- Props: `userEmail: string`, `orgName: string`, `onMenuToggle: () => void`
- Displays org name and user email on desktop (right-aligned)
- Displays hamburger button + "Docket" on mobile
- Hamburger only visible below md breakpoint

### `components/layout/AppShell.tsx` (client component)

- Props: `userEmail: string`, `orgName: string`, `children: React.ReactNode`
- Manages `sidebarOpen` state for mobile toggle
- Renders Sidebar + Header + main content area

### `app/(dashboard)/layout.tsx` (server component)

- Auth check (existing: redirect to /login if no user)
- Fetches user email from Supabase session
- Fetches org name via `org_memberships` → `organizations` join
- Renders `<AppShell>` wrapping children
- Falls back to empty string for org name if no org exists yet

### Removed

- `app/(dashboard)/logout-button.tsx` — logout logic moves into Sidebar

## Placeholder Pages

The following pages already exist as stubs and will continue to work with the new layout:
- `app/(dashboard)/invoices/page.tsx`
- `app/(dashboard)/upload/page.tsx`
- `app/(dashboard)/settings/page.tsx`

## Icons

Inline SVGs only (no Heroicons dependency). Three simple 20x20 icons: document, upload arrow, gear. Defined as constants or small components within Sidebar.

## Design Tokens (from CLAUDE.md)

- Sidebar bg: `bg-slate-800` (primary)
- Active nav: `bg-slate-700`
- Header bg: `bg-white` with `border-b border-gray-200`
- Content bg: `bg-gray-50` (background)
- Text on sidebar: `text-white` (active), `text-slate-400` (inactive)
- Font: system font stack (already configured)

## Testing

- No unit tests required for layout components (pure presentational)
- Verify: `npm run build` passes, `npx tsc --noEmit` clean, `npm run lint` clean
- Manual verification: nav links work, active state highlights correctly, mobile toggle works
