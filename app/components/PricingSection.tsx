import Link from "next/link";

export default function PricingSection({ loginHref }: { loginHref: string }) {
  const starterRaw = process.env.NEXT_PUBLIC_STARTER_PRICE_DISPLAY || "9";
  const proRaw = process.env.NEXT_PUBLIC_PRO_PRICE_DISPLAY || "19";
  const businessRaw = process.env.NEXT_PUBLIC_BUSINESS_PRICE_DISPLAY || "39";

  const starterPrice = starterRaw.startsWith("$") ? starterRaw : `$${starterRaw}`;
  const proPrice = proRaw.startsWith("$") ? proRaw : `$${proRaw}`;
  const businessPrice = businessRaw.startsWith("$") ? businessRaw : `$${businessRaw}`;

  const withPlan = (plan: string) =>
    `${loginHref}${loginHref.includes("?") ? "&" : "?"}plan=${encodeURIComponent(plan)}`;

  return (
    <section className="mx-auto max-w-6xl px-6 py-16" id="pricing">
      <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Pricing</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
            Start free. Upgrade when you need more conversions.
          </p>
        </div>

        <div className="text-xs text-gray-500">Monthly plans • Cancel anytime</div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {/* Free */}
        <PlanCard
          name="Free"
          price="$0"
          period=""
          description="Try ConvertMyEmail with a small free allowance."
          features={[
            "3 lifetime conversions",
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

        {/* Starter */}
        <PlanCard
          name="Starter"
          price={starterPrice}
          period="/mo"
          description="For occasional use."
          badge="Popular"
          emphasized
          features={[
            "20 conversions / month",
            "Excel + PDF + CSV exports",
            "Conversion history",
            "Priority improvements",
          ]}
          cta={{
            label: "Choose Starter",
            href: withPlan("starter"),
            variant: "primary",
          }}
        />

        {/* Pro */}
        <PlanCard
          name="Pro"
          price={proPrice}
          period="/mo"
          description="For ongoing work."
          features={[
            "75 conversions / month",
            "Excel + PDF + CSV exports",
            "Conversion history",
            "Priority improvements",
          ]}
          cta={{
            label: "Choose Pro",
            href: withPlan("pro"),
            variant: "secondary",
          }}
        />

        {/* Business */}
        <PlanCard
          name="Business"
          price={businessPrice}
          period="/mo"
          description="For high volume."
          features={[
            "Unlimited conversions",
            "Excel + PDF + CSV exports",
            "Conversion history",
            "Priority improvements",
          ]}
          cta={{
            label: "Choose Business",
            href: withPlan("business"),
            variant: "secondary",
          }}
        />
      </div>

      <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-700">
        <span className="font-semibold text-gray-900">Note:</span> You can upgrade any time from
        your dashboard.
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
            {period ? <div className="text-sm text-gray-500">{period}</div> : null}
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