// app/layout.tsx
import "./globals.css";

export const metadata = {
  title: "Convert My Email",
  description: "Convert .eml files to clean Excel and court-ready PDFs.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Light/Dark favicons */}
        <link
          rel="icon"
          href="/favicon-light.ico"
          media="(prefers-color-scheme: light)"
        />
        <link
          rel="icon"
          href="/favicon-dark.ico"
          media="(prefers-color-scheme: dark)"
        />

        {/* Apple touch icon */}
        <link rel="apple-touch-icon" href="/apple-icon.png" />
      </head>
      <body className="min-h-screen bg-white text-gray-900">{children}</body>
    </html>
  );
}