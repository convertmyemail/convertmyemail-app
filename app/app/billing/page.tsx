"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { useAppShell } from "../app-shell.client";

export const dynamic = "force-dynamic";

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function BillingPage() {
  const { usage, usageLoading, refreshUsage, isUnlimited, isPro } = useAppShell();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const cancelAtPeriodEnd = async () => {
    setMsg("");
    setLoading(true);

    try {
      const {
        data: { session },
        error: sessErr,
      } = await supabase.auth.getSession();

      if (sessErr || !session?.access_token) {
        setMsg("You must be logged in to manage billing.");
        return;
      }

      const res = await fetch("/api/stripe/cancel", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data?.message || data?.error || "Cancel failed.");
        return;
      }

      setMsg("✅ Cancellation scheduled. You’ll keep access until the end of your billing period.");
      await refreshUsage();
    } catch (e: any) {
      setMsg(e?.message || "Cancel failed.");
    } finally {
      setLoading(false);
    }
  };

  const planLabel = String(usage?.plan ?? "Free");
  const isFreePlan = planLabel.toLowerCase() === "free";

  // ✅ Typed fields from Usage
  const cancelAtEnd = Boolean(usage?.cancel_at_period_end);
  const periodEndIso = usage?.current_period_end ?? null;

  const statusLine = useMemo(() => {
    if (usageLoading || !usage) return null;

    if (isFreePlan) {
      return "You’re on the Free plan.";
    }

    if (cancelAtEnd && periodEndIso) {
      return `Cancellation scheduled • Cancels on ${formatDate(periodEndIso)}`;
    }

    if (cancelAtEnd && !periodEndIso) {
      return "Cancellation scheduled • You’ll keep access until your billing period ends.";
    }

    if (periodEndIso) {
      return `Renews on ${formatDate(periodEndIso)}`;
    }

    return "Subscription active";
  }, [usageLoading, usage, isFreePlan, cancelAtEnd, periodEndIso]);

  const showCancelButton = isPro && !isFreePlan;

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <p className="mt-2 text-slate-600">
        Manage your subscription. Canceling keeps your plan active until the current billing period ends.
      </p>

      <div className="mt-6 rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              Current plan: <span className="capitalize">{planLabel}</span>
            </div>

            {statusLine ? <div className="mt-1 text-sm text-slate-600">{statusLine}</div> : null}

            {!usageLoading && usage && !isUnlimited && usage.remaining !== null ? (
              <div className="mt-2 text-sm text-slate-600">
                {usage.used} used — <span className="font-semibold">{usage.remaining} left</span>
              </div>
            ) : null}

            {!usageLoading && usage && isUnlimited ? (
              <div className="mt-2 text-sm text-slate-600">Unlimited conversions</div>
            ) : null}
          </div>

          {showCancelButton ? (
            <button
              onClick={cancelAtPeriodEnd}
              disabled={loading || cancelAtEnd}
              className="rounded-lg bg-red-600 px-4 py-2 text-white font-medium disabled:opacity-60"
            >
              {cancelAtEnd ? "Cancellation scheduled" : loading ? "Canceling..." : "Cancel subscription"}
            </button>
          ) : null}
        </div>

        {msg ? <div className="mt-3 text-sm text-slate-700">{msg}</div> : null}

        {isFreePlan ? (
          <div className="mt-4 text-sm text-slate-600">
            Want more conversions? Visit{" "}
            <a href="/pricing" className="font-semibold underline">
              Pricing
            </a>{" "}
            to upgrade.
          </div>
        ) : null}
      </div>
    </div>
  );
}