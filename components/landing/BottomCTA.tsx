import Link from 'next/link'
import { NewsletterSignup } from './NewsletterSignup'

export default function BottomCTA() {
  return (
    <section className="bg-gradient-to-br from-[#0F172A] to-[#1E293B] py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="font-headings text-3xl font-extrabold text-white sm:text-4xl md:text-5xl leading-tight">
          Spend your evening your way.<br />Not on invoices.
        </h2>
        <p className="mt-6 text-lg text-[#94A3B8]">
          Start free with 10 invoices. No credit card required.
        </p>
        <div className="mt-8">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#00C6FF] to-[#00A3FF] px-10 py-4 text-lg font-bold text-white shadow-[0_8px_32px_rgba(0,198,255,0.35)] transition-all hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,198,255,0.45)]"
          >
            Get Started Free
          </Link>
        </div>
        <div className="mt-12 pt-8 border-t border-white/10">
          <p className="text-sm text-[#94A3B8] mb-4">
            Not ready yet? Get product updates delivered to your inbox.
          </p>
          <NewsletterSignup />
        </div>
      </div>
    </section>
  )
}
