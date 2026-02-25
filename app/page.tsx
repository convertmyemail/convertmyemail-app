// app/page.tsx
import Link from "next/link";

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
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-semibold tracking-tight">
            Convert My Email
          </Link>

          <nav className="flex items-center gap-3">
            <Link
              href="#how"
              className="hidden text-sm text-gray-600 hover:text-gray-900 md:block"
            >
              How it works
            </Link>
            <Link
              href="#who"
              className="hidden text-sm text-gray-600 hover:text-gray-900 md:block"
            >
              Who it’s for
            </Link>

            <Link
              href={loginHref}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-14 pb-10 md:pt-20">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <p className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
              Simple conversions for professional records
            </p>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
              Convert Email Files to Clean Records or Court-Ready Documents
            </h1>

            <p className="mt-4 text-base leading-7 text-gray-600 md:text-lg">
              Upload .eml files. Extract structured data. Download formatted Excel or
              professional PDFs — ready for storage, filing, or submission.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href={loginHref}
                className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-black"
              >
                Upload a file
              </Link>
              <Link
                href="#sample"
                className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
              >
                View sample output
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

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 py-14" id="how">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
          A straightforward process that produces consistent, professional output.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Step n="01" title="Upload your .eml file" text="Drag and drop or select your email file." />
          <Step n="02" title="We extract structured data" text="Sender, recipient, date, subject, body, and more." />
          <Step n="03" title="Download Excel or PDF" text="Ready for storage, filing, or submission." />
        </div>
      </section>

      {/* Who it's for */}
      <section className="mx-auto max-w-6xl px-6 pb-14" id="who">
        <div className="rounded-2xl border border-gray-200 bg-white p-8">
          <h2 className="text-2xl font-semibold tracking-tight">Built for professionals</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
            Convert email records into clean, standardized documents for downstream workflows.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <Audience title="Accountants" text="Organize client communications and supporting documentation." />
            <Audience title="Law firms" text="Prepare evidence and standardize email records." />
            <Audience title="Courts" text="Create consistent submissions and review-friendly documents." />
            <Audience title="Compliance & audit teams" text="Maintain structured records for review and retention." />
          </div>
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
              href={loginHref}
              className="inline-flex items-center justify-center rounded-xl border border-white/30 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              Sign in
            </Link>
          </div>
        </div>

        <footer className="mt-10 flex flex-col items-start justify-between gap-2 border-t border-gray-200 pt-6 text-xs text-gray-500 md:flex-row md:items-center">
          <div>© {new Date().getFullYear()} Convert My Email</div>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-gray-700">
              Login
            </Link>
            <a href="#" className="hover:text-gray-700">
              Privacy
            </a>
            <a href="#" className="hover:text-gray-700">
              Terms
            </a>
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

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="text-xs font-semibold text-gray-500">{n}</div>
      <div className="mt-2 text-sm font-semibold text-gray-900">{title}</div>
      <div className="mt-2 text-sm leading-6 text-gray-600">{text}</div>
    </div>
  );
}

function Audience({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
      <div className="text-sm font-semibold text-gray-900">{title}</div>
      <div className="mt-1 text-sm leading-6 text-gray-600">{text}</div>
    </div>
  );
}