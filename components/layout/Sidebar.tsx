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

function getInitials(userName?: string, userEmail?: string): string {
  if (userName) {
    const words = userName.trim().split(/\s+/)
    return words.map((w) => w[0]).join('').toUpperCase().slice(0, 2)
  }
  if (userEmail) {
    return userEmail[0].toUpperCase()
  }
  return '?'
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

  const initials = getInitials(userName, userEmail)
  const displayName = userName || userEmail || 'User'

  const sidebarContent = (
    <div className="flex h-full flex-col bg-surface border-r border-border">
      {/* Logo */}
      <div className="flex items-center px-5 pt-6 pb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/dockett_logo.png"
          alt="Docket"
          className="h-10 w-auto"
        />
        {/* Close button - mobile only */}
        <button
          onClick={onClose}
          className="ml-auto rounded-md p-1.5 text-muted hover:text-text hover:bg-background md:hidden"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted px-3 mb-3">Menu</p>
        <div className="space-y-1">
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
        </div>
      </nav>

      {/* User badge + sign out */}
      <div className="border-t border-border px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-nav-active text-primary font-body font-bold text-sm">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-body font-semibold text-text">{displayName}</p>
            {userName && userEmail && (
              <p className="truncate text-xs font-body text-muted">{userEmail}</p>
            )}
          </div>
          <button
            onClick={handleSignOut}
            className="rounded-md p-1.5 text-muted hover:text-text hover:bg-background"
            title="Sign out"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
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
