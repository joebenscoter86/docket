import type { Metadata } from "next";
import PostHogProvider from "@/components/providers/PostHogProvider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL('https://dockett.app'),
  title: "Dockett",
  description: "AI-powered invoice processing for small businesses. Upload, extract, and sync to QuickBooks or Xero.",
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/images/docket-icon-96.png', sizes: '96x96', type: 'image/png' },
      { url: '/images/docket-icon-256.png', sizes: '256x256', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
};

const organizationSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://dockett.app/#organization',
      name: 'Dockett',
      legalName: 'JB Technologies LLC',
      url: 'https://dockett.app',
      logo: {
        '@type': 'ImageObject',
        url: 'https://dockett.app/dockett_logo.png',
      },
      description:
        'AI-powered invoice processing for small businesses. Upload invoices, extract data with AI, sync to QuickBooks or Xero.',
      contactPoint: {
        '@type': 'ContactPoint',
        email: 'support@dockett.app',
        contactType: 'customer support',
      },
      foundingDate: '2026',
    },
    {
      '@type': 'WebSite',
      '@id': 'https://dockett.app/#website',
      name: 'Dockett',
      url: 'https://dockett.app',
      publisher: { '@id': 'https://dockett.app/#organization' },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@700,800&f[]=satoshi@400,500,600,700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased">
        <PostHogProvider>{children}</PostHogProvider>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
      </body>
    </html>
  );
}
