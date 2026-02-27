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
      <body className="min-h-screen bg-white text-gray-900">{children}</body>
    </html>
  );
}