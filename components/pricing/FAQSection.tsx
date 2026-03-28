"use client";

import { useState } from "react";
import Link from "next/link";

interface FAQItem {
  question: string;
  answer: React.ReactNode;
}

const faqs: FAQItem[] = [
  {
    question: "How does the free trial work?",
    answer:
      "You get 10 invoices to process completely free, no credit card required. Upload, extract, review, and sync -- the full workflow. When you've used your 10 invoices, choose a plan to continue.",
  },
  {
    question: "Does Dockett work with Xero?",
    answer:
      "Yes. Dockett integrates with both QuickBooks Online and Xero on all plans, at no extra cost. Connect whichever accounting platform you use.",
  },
  {
    question: "What file types does Dockett support?",
    answer:
      "Dockett accepts PDF, JPEG, and PNG files. Most invoices arrive as PDFs, which give the best extraction accuracy. Photos of printed invoices work too.",
  },
  {
    question: "How accurate is the AI extraction?",
    answer:
      "For standard typed invoices (the kind you receive as PDFs from vendors), extraction accuracy is typically 90%+ on vendor, amounts, dates, and line items. Every correction you make teaches the AI to improve for future invoices.",
  },
  {
    question: "Can I switch plans later?",
    answer:
      "Yes. Upgrade or downgrade anytime from your Settings page. Changes take effect at the start of your next billing cycle.",
  },
  {
    question: "What happens if I exceed my invoice limit?",
    answer:
      "You'll see a notification when you're approaching your monthly limit. You can upgrade to a higher plan anytime to keep processing. We never delete your data.",
  },
  {
    question: "Can I create checks and cash expenses, not just bills?",
    answer:
      "Yes, on all plans. When syncing to QuickBooks, you can choose whether each invoice creates a Bill, Check, or Cash Expense. Xero supports bills and bank transactions.",
  },
  {
    question: "Is my data secure?",
    answer: (
      <>
        All data is encrypted in transit (TLS) and at rest. OAuth tokens for
        QuickBooks and Xero are encrypted with AES-256-GCM. We never store your
        accounting credentials. See our{" "}
        <Link
          href="/privacy"
          className="text-accent underline underline-offset-2 hover:text-accent/80 transition-colors"
        >
          Privacy Policy
        </Link>{" "}
        for details.
      </>
    ),
  },
];

function FAQItemRow({ item }: { item: FAQItem }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-gray-200">
      <button
        type="button"
        className="flex w-full items-center justify-between py-5 text-left"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="font-body font-medium text-gray-900 pr-4">
          {item.question}
        </span>
        <svg
          className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? "max-h-40 pb-5" : "max-h-0"
        }`}
      >
        <p className="font-body text-sm text-gray-600 leading-relaxed">
          {item.answer}
        </p>
      </div>
    </div>
  );
}

export default function FAQSection() {
  return (
    <section className="mt-20 mb-8">
      <h2 className="font-headings font-bold text-3xl text-text text-center mb-10">
        Frequently Asked Questions
      </h2>
      <div className="max-w-2xl mx-auto">
        {faqs.map((faq) => (
          <FAQItemRow key={faq.question} item={faq} />
        ))}
      </div>
    </section>
  );
}
