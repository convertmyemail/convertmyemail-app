// app/layout.tsx
import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Convert EML Files to Excel, CSV or PDF | ConvertMyEmail",
  description: "Convert .eml files to clean Excel and court-ready PDFs.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Google Search Console verification */}
        <meta
          name="google-site-verification"
          content="29EFtUv1daprJNeB0w5XK_-nxTYodB4dFF6hvi8JOrY"
        />

        {/* Light/Dark favicons */}
        <link rel="icon" href="/favicon-light.ico" media="(prefers-color-scheme: light)" />
        <link rel="icon" href="/favicon-dark.ico" media="(prefers-color-scheme: dark)" />

        {/* Apple touch icon */}
        <link rel="apple-touch-icon" href="/apple-icon.png" />
      </head>

      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {children}

        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-J4BFEE5NND"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-J4BFEE5NND');
          `}
        </Script>
      </body>
    </html>
  );
}