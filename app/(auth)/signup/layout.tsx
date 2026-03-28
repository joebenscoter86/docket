import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign Up Free | Dockett',
  description: 'Create your Dockett account and process your first 10 invoices free. AI extraction with QuickBooks and Xero sync.',
  alternates: {
    canonical: '/signup',
  },
}

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
