'use client'

import { useState } from 'react'

const faqs = [
  {
    question: 'Is my financial data secure?',
    answer:
      'Absolutely. All data is encrypted at rest with AES-256-GCM, the same standard used by banks. OAuth tokens for QuickBooks and Xero are encrypted before storage and never logged. Your invoice files are stored in isolated, encrypted cloud storage.',
  },
  {
    question: 'What file formats do you support?',
    answer:
      'Dockett accepts PDF, JPG, and PNG files. Most invoices arrive as PDFs, and our AI handles both digital PDFs and scanned documents. Maximum file size is 10MB per file.',
  },
  {
    question: 'How accurate is the AI extraction?',
    answer:
      'Our AI achieves high accuracy on typed invoices and improves over time as it learns from your corrections. Every extraction includes a confidence score so you know exactly what to review. You always have the final say before anything syncs.',
  },
  {
    question: 'Do you support both QuickBooks and Xero?',
    answer:
      'Yes, both are included on every plan at no extra charge. You can even connect both platforms simultaneously if you need to. Sync as a bill, check, or cash expense -- whatever your books need.',
  },
  {
    question: 'What happens if the AI gets something wrong?',
    answer:
      'You always review and approve before anything syncs. If the AI misreads something, just edit the field in the review UI. Your correction is saved and teaches the AI to be more accurate next time for similar invoices.',
  },
  {
    question: 'Can I try it before committing to a plan?',
    answer:
      'Yes! Start with 10 free invoices -- no credit card required. Process real invoices with all features unlocked during your trial. Pick a plan only when you\'re ready to continue.',
  },
]

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="rounded-xl border border-[#E2E8F0] overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-[#F8FAFC] transition-colors"
      >
        <span className="text-base font-semibold text-[#0F172A] pr-4">{question}</span>
        <svg
          className={`w-5 h-5 text-[#94A3B8] flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-60' : 'max-h-0'}`}
      >
        <p className="px-6 pb-5 text-sm text-[#475569] leading-relaxed">{answer}</p>
      </div>
    </div>
  )
}

export default function FAQSection() {
  return (
    <section id="faq" className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-8">
        <h2 className="font-headings text-center text-4xl font-extrabold tracking-tight text-[#0F172A] sm:text-5xl">
          Frequently Asked Questions
        </h2>
        <p className="text-center mx-auto mt-4 max-w-2xl text-lg text-[#475569]">
          Everything you need to know about Dockett.
        </p>

        <div className="mt-12 space-y-3">
          {faqs.map((faq) => (
            <FAQItem key={faq.question} question={faq.question} answer={faq.answer} />
          ))}
        </div>
      </div>
    </section>
  )
}
