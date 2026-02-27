// app/how-to-save-eml/page.tsx
import Link from "next/link";
import SiteHeader from "@/app/components/siteheader";

export const dynamic = "force-dynamic";

export default function HowToSaveEmlPage() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <SiteHeader variant="marketing" />

      <section className="mx-auto max-w-4xl px-6 py-14">
        <h1 className="text-3xl font-semibold tracking-tight">How to save an .eml file</h1>
        <p className="mt-3 text-base leading-7 text-gray-600">
          .eml is a standard email message file. Use these quick steps, then upload the file in your
          dashboard.
        </p>

        <div className="mt-10 grid gap-4">
          <Card title="Gmail (web)">
            Open the email → click <span className="font-medium">More (⋮)</span> →{" "}
            <span className="font-medium">Download message</span>.
          </Card>

          <Card title="Outlook (desktop)">
            Open the email → <span className="font-medium">File</span> →{" "}
            <span className="font-medium">Save As</span> → choose{" "}
            <span className="font-medium">Outlook Message Format – Unicode (*.msg)</span> or{" "}
            <span className="font-medium">.eml</span> if available.
            <div className="mt-2 text-sm text-gray-600">
              If your Outlook only offers .msg, forward it to a mailbox that can export .eml (or use
              another client). We can add .msg support later.
            </div>
          </Card>

          <Card title="Apple Mail">
            Select the message → <span className="font-medium">File</span> →{" "}
            <span className="font-medium">Save As…</span> → choose{" "}
            <span className="font-medium">Raw Message Source</span> (or export).
          </Card>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white hover:bg-black"
          >
            Upload a file
          </Link>
          <Link
            href="/how-it-works"
            className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
          >
            Back to how it works
          </Link>
        </div>
      </section>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="text-sm font-semibold text-gray-900">{title}</div>
      <div className="mt-2 text-sm leading-6 text-gray-600">{children}</div>
    </div>
  );
}