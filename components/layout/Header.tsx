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
