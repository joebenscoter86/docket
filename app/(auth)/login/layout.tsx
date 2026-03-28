import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Log In | Dockett',
  description: 'Log in to your Dockett account. AI-powered invoice processing for QuickBooks and Xero.',
  alternates: {
    canonical: '/login',
  },
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
