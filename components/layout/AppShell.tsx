'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'
import Footer from './Footer'

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
        <Footer />
      </div>
    </div>
  )
}
