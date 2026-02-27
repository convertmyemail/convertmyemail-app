// app/how-it-works/page.tsx
import Link from "next/link";
import SiteHeader from "@/app/components/siteheader";

export const dynamic = "force-dynamic";

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <SiteHeader variant="marketing" />

      <section className="mx-auto max-w-4xl px-6 py-14">
        <h1 className="text-3xl font-semibold tracking-tight">How it works</h1>
        <p className="mt-3 text-base leading-7 text-gray-600">
          ConvertMyEmail turns email files into clean, structured records for storage, filing, or
          submission.
        </p>

        <div className="mt-10 grid gap-4">
          <Step n="1" title="Save an email as .eml">
            Export from Gmail / Outlook / Apple Mail.{" "}
            <Link href="/how-to-save-eml" className="font-semibold text-gray-900 hover:underline">
              See instructions →
            </Link>
          </Step>

          <Step n="2" title="Upload the file">
            Upload one or more .eml files to your dashboard. We parse headers + body and split out
            thread messages when available.
          </Step>

          <Step n="3" title="Download Excel and PDF">
            Export a clean Excel sheet (rows/columns) and a professional PDF (record-style layout).
          </Step>
        </div>

        <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 p-6">
          <div className="text-sm font-semibold text-gray-900">What we extract</div>
          <ul className="mt-3 grid list-disc gap-2 pl-5 text-sm text-gray-700 md:grid-cols-2">
            <li>From / To</li>
            <li>Date</li>
            <li>Subject</li>
            <li>Body text</li>
            <li>Thread messages (when present)</li>
            <li>Consistent formatting</li>
          </ul>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-black"
          >
            Upload a file
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
          >
            View pricing
          </Link>
        </div>
      </section>
    </main>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
          {n}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <div className="mt-1 text-sm leading-6 text-gray-600">{children}</div>
        </div>
      </div>
    </div>
  );
}