// app/pricing/page.tsx
import Link from "next/link";
import SiteHeader from "@/app/components/siteheader";

export const dynamic = "force-dynamic";

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <SiteHeader variant="marketing" />

      <section className="mx-auto max-w-6xl px-6 py-14">
        <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-gray-600">
          Start free. Upgrade when you need unlimited conversions.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Plan
            title="Free"
            price="$0"
            subtitle="Great for trying it out"
            bullets={[
              "3 lifetime conversions",
              "Excel + PDF exports",
              "Thread message extraction",
              "Download history",
            ]}
            cta={{ label: "Get started", href: "/login" }}
          />

          <Plan
            title="Pro"
            price="Unlimited"
            subtitle="For ongoing work"
            highlight
            bullets={[
              "Unlimited conversions",
              "Excel + PDF exports",
              "Thread message extraction",
              "Priority improvements",
            ]}
            cta={{ label: "Upgrade in dashboard", href: "/app?plan=pro" }}
          />
        </div>

        <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 p-6">
          <div className="text-sm font-semibold text-gray-900">Need help?</div>
          <p className="mt-2 text-sm text-gray-600">
            Start with Free and upgrade only when you hit the limit.
          </p>
          <div className="mt-4">
            <Link href="/how-it-works" className="text-sm font-semibold text-gray-900 hover:underline">
              See how it works →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function Plan({
  title,
  price,
  subtitle,
  bullets,
  cta,
  highlight,
}: {
  title: string;
  price: string;
  subtitle: string;
  bullets: string[];
  cta: { label: string; href: string };
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-2xl border p-8 shadow-sm",
        highlight ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={["text-sm font-semibold", highlight ? "text-white" : "text-gray-900"].join(" ")}>
            {title}
          </div>
          <div className={["mt-1 text-sm", highlight ? "text-gray-200" : "text-gray-600"].join(" ")}>
            {subtitle}
          </div>
        </div>
        {highlight && (
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
            Most popular
          </span>
        )}
      </div>

      <div className="mt-6">
        <div className={["text-3xl font-semibold tracking-tight", highlight ? "text-white" : "text-gray-900"].join(" ")}>
          {price}
        </div>
      </div>

      <ul className={["mt-6 space-y-2 text-sm", highlight ? "text-gray-200" : "text-gray-700"].join(" ")}>
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="mt-1">•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <Link
        href={cta.href}
        className={[
          "mt-8 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold",
          highlight
            ? "bg-white text-gray-900 hover:bg-gray-100"
            : "bg-gray-900 text-white hover:bg-black",
        ].join(" ")}
      >
        {cta.label}
      </Link>
    </div>
  );
}