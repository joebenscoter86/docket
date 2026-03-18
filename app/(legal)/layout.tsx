import Link from 'next/link'
import Footer from '@/components/layout/Footer'

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <Link href="/" className="font-headings text-lg font-bold text-text hover:text-accent">
            Docket
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        {children}
      </main>
      <Footer />
    </div>
  )
}
