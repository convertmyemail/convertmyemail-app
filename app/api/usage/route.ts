// app/api/usage/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FREE_LIMIT = 3;

function asDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

export async function GET() {
  try {
    const cookieStore = await Promise.resolve(cookies() as any);
    const supabase = createSupabaseServerClient(cookieStore);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1) Pull conversions used
    const { count, error: countErr } = await supabase
      .from("conversions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (countErr) {
      console.error("usage: count conversions failed", countErr);
      return NextResponse.json({
        plan: "Free",
        used: 0,
        remaining: FREE_LIMIT,
        free_limit: FREE_LIMIT,
        status: "unknown",
        isPaid: false,
      });
    }

    const used = count ?? 0;

    // 2) Subscription check (fail-open)
    let isPro = false;
    let status = "free";
    let plan: string = "Free";

    try {
      // ✅ Match your real columns:
      // user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, updated_at
      const { data: sub, error: subErr } = await supabase
        .from("subscriptions")
        .select("status, plan, current_period_end, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subErr) {
        console.warn("usage: subscription lookup error (fail-open):", subErr);
      } else if (sub) {
        const rawStatus = String((sub as any).status ?? "").toLowerCase();
        const rawPlan = String((sub as any).plan ?? "").toLowerCase();

        const periodEnd = asDate((sub as any).current_period_end);

        const active = rawStatus === "active" || rawStatus === "trialing";

        // ✅ If period end is missing but status is active/trialing, treat as Pro (fail-open)
        const notExpired = !periodEnd || periodEnd.getTime() > Date.now();

        isPro = active && notExpired;
        status = rawStatus || (isPro ? "active" : "free");

        // Prefer plan value if present, otherwise derive from isPro
        if (rawPlan) {
          plan = rawPlan === "pro" || rawPlan === "starter" ? "Pro" : rawPlan;
        } else {
          plan = isPro ? "Pro" : "Free";
        }
      }
    } catch (e) {
      console.warn("usage: subscription verify threw (fail-open):", e);
      isPro = false;
      status = "free";
      plan = "Free";
    }

    const remaining = isPro ? null : Math.max(0, FREE_LIMIT - used);

    return NextResponse.json({
      plan,
      used,
      remaining,
      free_limit: FREE_LIMIT,
      status,
      isPaid: isPro,
    });
  } catch (err) {
    console.error("usage route failed (fail-open):", err);
    return NextResponse.json({
      plan: "Free",
      used: 0,
      remaining: FREE_LIMIT,
      free_limit: FREE_LIMIT,
      status: "unknown",
      isPaid: false,
    });
  }
}