"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/browser";

export const dynamic = "force-dynamic";

export default function BillingPage() {
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

      setMsg("✅ Subscription will cancel at period end. You’ll keep access until then.");
    } catch (e: any) {
      setMsg(e?.message || "Cancel failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <p className="mt-2 text-slate-600">
        Manage your subscription. Canceling keeps your plan active until the current billing period ends.
      </p>

      <div className="mt-6 rounded-xl border border-slate-200 p-4">
        <button
          onClick={cancelAtPeriodEnd}
          disabled={loading}
          className="rounded-lg bg-red-600 px-4 py-2 text-white font-medium disabled:opacity-60"
        >
          {loading ? "Canceling..." : "Cancel subscription"}
        </button>

        {msg ? <div className="mt-3 text-sm text-slate-700">{msg}</div> : null}
      </div>
    </div>
  );
}