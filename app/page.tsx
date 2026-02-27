// app/page.tsx
import Link from "next/link";
import SiteHeader from "@/app/components/siteheader";

type SP = { next?: string };

export default async function MarketingHome({
  searchParams,
}: {
  searchParams?: Promise<SP> | SP;
}) {
  const sp = (await Promise.resolve(searchParams)) || {};
  const next = sp?.next ? encodeURIComponent(sp.next) : "";
  const loginHref = next ? `/login?next=${next}` : "/login";

  return (
    <main className="min-h-screen bg-white text-gray-900">
      {/* Global header (Home + top navigation) */}
      <SiteHeader variant="marketing" />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-14 pb-12 md:pt-20">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <p className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
              Simple conversions for professional records
            </p>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
              Convert Email Files to Clean Records
            </h1>

            <p className="mt-4 text-base leading-7 text-gray-600 md:text-lg">
              Upload .eml files. Extract structured data. Download formatted Excel or professional
              PDFs — ready for storage, filing, or submission.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href={loginHref}
                className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-black"
              >
                Upload a file
              </Link>
              <Link
                href="/how-it-works"
                className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
              >
                How it works
              </Link>
            </div>

            <p className="mt-3 text-xs text-gray-500">
              Passwordless login. Designed for accountants, law firms, and compliance teams.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {["Structured output", "Excel + PDF", "Audit-friendly", "Court-ready formatting"].map(
                (t) => (
                  <span
                    key={t}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700"
                  >
                    {t}
                  </span>
                )
              )}
            </div>
          </div>

          {/* Preview card */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm" id="sample">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Sample conversion</div>
              <div className="text-xs text-gray-500">.eml → Excel / PDF</div>
            </div>

            <div className="mt-4 space-y-3">
              <PreviewRow label="From" value="client@example.com" />
              <PreviewRow label="To" value="you@firm.com" />
              <PreviewRow label="Date" value="2026-02-24 10:14 AM" />
              <PreviewRow label="Subject" value="Invoice approval & supporting docs" />

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium text-gray-700">Extracted fields</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600">
                  {["Message-ID", "Attachments", "Thread refs", "Body text"].map((x) => (
                    <div key={x} className="rounded-lg border border-gray-200 bg-white p-2">
                      {x}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-200 p-3">
                  <div className="text-xs font-medium text-gray-700">Excel</div>
                  <div className="mt-1 text-xs text-gray-500">Clean rows & columns</div>
                </div>
                <div className="rounded-xl border border-gray-200 p-3">
                  <div className="text-xs font-medium text-gray-700">PDF</div>
                  <div className="mt-1 text-xs text-gray-500">Court-ready format</div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3">
              <div className="text-xs text-gray-600">
                Conversion status: <span className="font-medium text-gray-900">Ready</span>
              </div>
              <div className="text-xs text-gray-500">~2 seconds</div>
            </div>
          </div>
        </div>
      </section>

      {/* Credibility */}
      <section className="mx-auto max-w-6xl px-6 pb-4">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
          <div className="grid gap-6 md:grid-cols-3">
            <Proof
              title="Designed for records"
              text="Standardized formatting for storage, review, and retrieval."
            />
            <Proof
              title="Built for compliance"
              text="Structured exports that support audit and legal workflows."
            />
            <Proof
              title="Simple to use"
              text="Upload → Convert → Download. No training required."
            />
          </div>
        </div>
      </section>

      {/* Simple “Explore” section replaces the busy in-page sections */}
      <section className="mx-auto max-w-6xl px-6 py-14">
        <h2 className="text-2xl font-semibold tracking-tight">
          Everything you need, clearly explained
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
          We moved details into dedicated pages so the homepage stays fast and focused.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <ExploreCard
            href="/how-it-works"
            title="How it works"
            text="Upload an .eml → we extract the thread → download Excel & PDF."
          />
          <ExploreCard
            href="/how-to-save-eml"
            title="How to save an .eml file"
            text="Quick steps for Gmail, Outlook, Apple Mail, and more."
          />
          <ExploreCard
            href="/pricing"
            title="Pricing"
            text="Start free, upgrade when you need unlimited conversions."
          />
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="rounded-2xl border border-gray-200 bg-gray-900 p-10 text-white">
          <h3 className="text-2xl font-semibold tracking-tight">
            Convert your first email record in minutes.
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-200">
            Upload .eml files and download clean Excel or court-ready PDFs with consistent formatting.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href={loginHref}
              className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-100"
            >
              Upload a file
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-xl border border-white/30 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              View pricing
            </Link>
          </div>
        </div>

        <footer className="mt-10 flex flex-col items-start justify-between gap-2 border-t border-gray-200 pt-6 text-xs text-gray-500 md:flex-row md:items-center">
          <div>© {new Date().getFullYear()} Convert My Email</div>
          <div className="flex gap-4">
            <Link href={loginHref} className="hover:text-gray-700">
              Sign in
            </Link>
            <Link href="/how-it-works" className="hover:text-gray-700">
              How it works
            </Link>
            <Link href="/pricing" className="hover:text-gray-700">
              Pricing
            </Link>
          </div>
        </footer>
      </section>
    </main>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-3">
      <div className="text-xs font-medium text-gray-700">{label}</div>
      <div className="text-xs text-gray-600 text-right">{value}</div>
    </div>
  );
}

function Proof({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div className="text-sm font-semibold text-gray-900">{title}</div>
      <div className="mt-1 text-sm leading-6 text-gray-600">{text}</div>
    </div>
  );
}

function ExploreCard({
  href,
  title,
  text,
}: {
  href: string;
  title: string;
  text: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-gray-300 hover:shadow"
    >
      <div className="text-sm font-semibold text-gray-900">{title}</div>
      <div className="mt-2 text-sm leading-6 text-gray-600">{text}</div>
      <div className="mt-4 text-sm font-semibold text-gray-900">
        Learn more <span className="transition group-hover:translate-x-0.5">→</span>
      </div>
    </Link>
  );
}