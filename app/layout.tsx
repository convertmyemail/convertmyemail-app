// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Convert My Email",
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
        {/* Light/Dark favicons */}
        <link rel="icon" href="/favicon-light.ico" media="(prefers-color-scheme: light)" />
        <link rel="icon" href="/favicon-dark.ico" media="(prefers-color-scheme: dark)" />

        {/* Apple touch icon */}
        <link rel="apple-touch-icon" href="/apple-icon.png" />
      </head>
      <body className="min-h-screen bg-white text-gray-900 antialiased">{children}</body>
    </html>
  );
}