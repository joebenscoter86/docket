import type { Metadata } from "next";
import PostHogProvider from "@/components/providers/PostHogProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Docket",
  description: "Invoice processing for small businesses",
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
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@700,800&f[]=satoshi@400,500,700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased"><PostHogProvider>{children}</PostHogProvider></body>
    </html>
  );
}
