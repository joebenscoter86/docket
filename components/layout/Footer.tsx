import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t border-border px-6 py-6 text-center text-sm text-muted">
      <div className="flex items-center justify-center gap-4 flex-wrap">
        <Link href="/privacy" className="hover:text-text hover:underline">Privacy Policy</Link>
        <span>·</span>
        <Link href="/terms" className="hover:text-text hover:underline">Terms of Service</Link>
        <span>·</span>
        <Link href="/compare/dext" className="hover:text-text hover:underline">Dockett vs Dext</Link>
        <span>·</span>
        <Link href="/compare/bill-com" className="hover:text-text hover:underline">Dockett vs Bill.com</Link>
      </div>
      <p className="mt-2">&copy; {new Date().getFullYear()} JB Technologies LLC</p>
    </footer>
  )
}
