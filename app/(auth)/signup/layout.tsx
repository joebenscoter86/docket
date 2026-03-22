import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign Up | Docket',
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
