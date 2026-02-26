import Link from "next/link";

export default function PricingSection({ loginHref }: { loginHref: string }) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16" id="pricing">
      <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Pricing</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
            Start free. Upgrade when you need more conversions and longer history.
          </p>
        </div>

        <div className="text-xs text-gray-500">
          Monthly plans • Cancel anytime
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {/* Free */}
        <PlanCard
          name="Free"
          price="$0"
          period="/mo"
          description="Try Convert My Email with a small free allowance."
          features={[
            "3 conversions total (free)",
            "Excel + PDF exports",
            "Thread splitting included",
            "Basic history",
          ]}
          cta={{
            label: "Start free",
            href: loginHref,
            variant: "secondary",
          }}
        />

        {/* Starter (Most Popular) */}
        <PlanCard
          name="Starter"
          price="$9"
          period="/mo"
          description="Best for professionals who convert regularly."
          badge="Most Popular"
          emphasized
          features={[
            "100 conversions / month",
            "Excel + PDF + CSV exports",
            "Conversion history: 30 days",
            "Priority processing",
          ]}
          cta={{
            label: "Upgrade to Starter",
            href: `${loginHref}${loginHref.includes("?") ? "&" : "?"}plan=starter`,
            variant: "primary",
          }}
        />

        {/* Pro */}
        <PlanCard
          name="Pro"
          price="$19"
          period="/mo"
          description="For heavy usage and longer retention."
          features={[
            "500 conversions / month",
            "Excel + PDF + CSV exports",
            "Conversion history: 1 year",
            "Priority support",
          ]}
          cta={{
            label: "Upgrade to Pro",
            href: `${loginHref}${loginHref.includes("?") ? "&" : "?"}plan=pro`,
            variant: "secondary",
          }}
        />
      </div>

      <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-700">
        <span className="font-semibold text-gray-900">Note:</span> You can upgrade any time.
        We’ll wire these buttons to Stripe Checkout next.
      </div>
    </section>
  );
}

function PlanCard({
  name,
  price,
  period,
  description,
  features,
  cta,
  badge,
  emphasized,
}: {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: { label: string; href: string; variant: "primary" | "secondary" };
  badge?: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={[
        "relative rounded-2xl border bg-white p-6 shadow-sm",
        emphasized ? "border-gray-900" : "border-gray-200",
      ].join(" ")}
    >
      {badge ? (
        <div className="absolute -top-3 left-6 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-900 shadow-sm">
          {badge}
        </div>
      ) : null}

      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900">{name}</div>
          <div className="mt-2 flex items-baseline gap-1">
            <div className="text-3xl font-semibold tracking-tight">{price}</div>
            <div className="text-sm text-gray-500">{period}</div>
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-gray-600">{description}</p>

      <ul className="mt-5 space-y-3 text-sm text-gray-700">
        {features.map((f) => (
          <li key={f} className="flex gap-3">
            <span className="mt-1 inline-block h-2 w-2 rounded-full bg-gray-900" />
            <span className="leading-6">{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <Link
          href={cta.href}
          className={[
            "inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold",
            cta.variant === "primary"
              ? "bg-gray-900 text-white hover:bg-black"
              : "border border-gray-300 bg-white text-gray-900 hover:bg-gray-50",
          ].join(" ")}
        >
          {cta.label}
        </Link>
      </div>
    </div>
  );
}