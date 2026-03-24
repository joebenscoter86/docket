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
  return false
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
