// app/pricing/page.tsx
import Link from "next/link";
import SiteHeader from "@/app/components/siteheader";

type SP = { next?: string };

function Price({
  amount,
  period = "/mo",
}: {
  amount: string;
  period?: string;
}) {
  return (
    <div className="mt-3 flex items-end gap-2">
      <div className="text-4xl font-semibold tracking-tight">{amount}</div>
      {period ? <div className="pb-1 text-sm text-gray-500">{period}</div> : null}
    </div>
  );
}

function TierCard({
  name,
  tagline,
  price,
  period,
  bullets,
  ctaHref,
  ctaLabel,
  featured,
  badge,
}: {
  name: string;
  tagline: string;
  price: string;
  period?: string;
  bullets: string[];
  ctaHref: string;
  ctaLabel: string;
  featured?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={[
        "rounded-2xl border bg-white p-6 shadow-sm",
        featured ? "border-gray-900 shadow" : "border-gray-200",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">{name}</div>
          <div className="mt-1 text-sm text-gray-600">{tagline}</div>
        </div>

        {badge ? (
          <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-800">
            {badge}
          </span>
        ) : null}
      </div>

      <Price amount={price} period={period} />

      <ul className="mt-5 space-y-2 text-sm text-gray-700">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-gray-400" />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <Link
          href={ctaHref}
          className={[
            "inline-flex w-full items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold",
            featured
              ? "bg-gray-900 text-white hover:bg-black"
              : "border border-gray-300 bg-white text-gray-900 hover:bg-gray-50",
          ].join(" ")}
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams?: Promise<SP> | SP;
}) {
  const sp = (await Promise.resolve(searchParams)) || {};
  const next = sp?.next ? encodeURIComponent(sp.next) : "";
  const loginHref = next ? `/login?next=${next}` : "/login";

  // You can control display text via envs (optional).
  // If you already know the exact amounts, set these in Vercel env:
  // NEXT_PUBLIC_STARTER_PRICE_DISPLAY="$9"
  // NEXT_PUBLIC_PRO_PRICE_DISPLAY="$19"
  const starterPrice = process.env.NEXT_PUBLIC_STARTER_PRICE_DISPLAY || "$9";
  const proPrice = process.env.NEXT_PUBLIC_PRO_PRICE_DISPLAY || "$19";

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <SiteHeader variant="marketing" />

      <section className="mx-auto max-w-6xl px-6 pt-14 pb-10 md:pt-20">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Pricing</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Start free. Upgrade when you need more conversions or ongoing work.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <TierCard
            name="Free"
            tagline="Great for trying it out"
            price="$0"
            period=""
            bullets={[
              "3 lifetime conversions",
              "Excel + PDF exports",
              "Thread message extraction",
              "Download history",
            ]}
            ctaHref={loginHref}
            ctaLabel="Get started"
          />

          <TierCard
            name="Starter"
            tagline="For occasional use"
            price={starterPrice}
            period="/mo"
            bullets={[
              "50 conversions / month",
              "Excel + PDF exports",
              "Thread message extraction",
              "Download history",
            ]}
            ctaHref="/app?plan=starter"
            ctaLabel="Choose Starter"
          />

          <TierCard
            name="Pro"
            tagline="For ongoing work"
            price={proPrice}
            period="/mo"
            bullets={[
              "Unlimited conversions",
              "Excel + PDF exports",
              "Thread message extraction",
              "Priority improvements",
            ]}
            ctaHref="/app?plan=pro"
            ctaLabel="Choose Pro"
            featured
            badge="Most popular"
          />
        </div>

        <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 p-6">
          <div className="text-sm font-semibold text-gray-900">Need help?</div>
          <p className="mt-1 text-sm text-gray-600">
            Start with Free and upgrade only when you hit the limit. You can manage upgrades inside
            your dashboard.
          </p>
          <div className="mt-3">
            <Link href="/how-it-works" className="text-sm font-semibold text-gray-900">
              See how it works <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}