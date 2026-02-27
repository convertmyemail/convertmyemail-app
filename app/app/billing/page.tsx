"use client";

import { useAppShell } from "../app-shell.client";

export const dynamic = "force-dynamic";

export default function BillingPage() {
  const { usage, usageLoading, isPro, startCheckout } = useAppShell();

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold">Billing</h1>
      <p className="mt-1 text-sm text-gray-600">Manage your subscription and plan.</p>

      {usageLoading ? (
        <p className="mt-6 text-sm text-gray-500">Loading plan details…</p>
      ) : (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold">Free Plan</h2>
            <p className="mt-1 text-sm text-gray-600">{usage?.free_limit ?? 3} lifetime conversions</p>

            {!isPro && usage && (
              <div className="mt-3 text-sm text-gray-700">
                {usage.used} used —{" "}
                <span className="font-semibold">{usage.remaining} remaining</span>
              </div>
            )}
          </div>

          <div
            className={[
              "rounded-2xl border p-6",
              isPro ? "border-green-200 bg-green-50" : "border-gray-200",
            ].join(" ")}
          >
            <h2 className="text-sm font-semibold">Pro Plan</h2>
            <p className="mt-1 text-sm text-gray-600">Unlimited conversions</p>

            {isPro ? (
              <div className="mt-3 text-sm font-semibold text-green-700">Your current plan</div>
            ) : (
              <button
                className="mt-4 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
                onClick={() => startCheckout("pro")}
                type="button"
              >
                Upgrade to Pro
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}