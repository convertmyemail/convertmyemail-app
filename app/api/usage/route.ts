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

function getUtcMonthWindow(d = new Date()) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0));
  return { start, end };
}

type PlanKey = "free" | "starter" | "pro" | "business";

function normalizePlan(raw: any): PlanKey {
  const p = String(raw || "").toLowerCase();
  if (p === "starter" || p === "pro" || p === "business" || p === "free") return p;
  return "free";
}

function displayPlan(plan: PlanKey): "Free" | "Starter" | "Pro" | "Business" {
  switch (plan) {
    case "starter":
      return "Starter";
    case "pro":
      return "Pro";
    case "business":
      return "Business";
    default:
      return "Free";
  }
}

function limitFor(plan: PlanKey): number | null {
  switch (plan) {
    case "free":
      return FREE_LIMIT; // ✅ per month (UTC)
    case "starter":
      return 20; // ✅ per billing cycle
    case "pro":
      return 75; // ✅ per billing cycle
    case "business":
      return null; // unlimited
  }
}

export async function GET() {
  try {
    // Bind cookies to request context (cookie-based auth)
    await cookies();

    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1) Subscription snapshot (fail-open to Free)
    let planKey: PlanKey = "free";
    let status = "free";
    let isPaid = false;

    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;

    // ✅ NEW
    let cancelAtPeriodEnd = false;

    try {
      const { data: sub, error: subErr } = await supabase
        .from("subscriptions")
        .select("status, plan, cancel_at_period_end, current_period_start, current_period_end, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subErr) {
        console.warn("usage: subscription lookup error (fail-open):", subErr);
      } else if (sub) {
        const rawStatus = String((sub as any).status ?? "").toLowerCase();
        const rawPlan = normalizePlan((sub as any).plan);

        // ✅ NEW
        cancelAtPeriodEnd = Boolean((sub as any).cancel_at_period_end);

        periodStart = asDate((sub as any).current_period_start);
        periodEnd = asDate((sub as any).current_period_end);

        const active = rawStatus === "active" || rawStatus === "trialing";
        const notExpired = !periodEnd || periodEnd.getTime() > Date.now();

        isPaid = active && notExpired && rawPlan !== "free";
        status = rawStatus || (isPaid ? "active" : "free");

        planKey = isPaid ? rawPlan : "free";
      }
    } catch (e) {
      console.warn("usage: subscription verify threw (fail-open):", e);
      planKey = "free";
      status = "free";
      isPaid = false;
      periodStart = null;
      periodEnd = null;
      cancelAtPeriodEnd = false; // ✅ NEW
    }

    // 2) Decide counting window
    // - Free: current UTC month
    // - Paid: current billing cycle (periodStart/periodEnd); fallback to UTC month start if missing
    let windowStart: Date | null = null;
    let windowEnd: Date | null = null;

    if (!isPaid) {
      const { start, end } = getUtcMonthWindow();
      windowStart = start;
      windowEnd = end;
    } else {
      if (periodStart) {
        windowStart = periodStart;
      } else {
        const { start } = getUtcMonthWindow();
        windowStart = start;
        console.warn("[usage] Missing current_period_start; falling back to UTC month start", {
          userId: user.id,
          planKey,
        });
      }
      windowEnd = periodEnd ?? null;
    }

    // 3) Count conversions used in window
    let used = 0;

    try {
      let q = supabase
        .from("conversions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (windowStart) q = q.gte("created_at", windowStart.toISOString());
      if (windowEnd) q = q.lt("created_at", windowEnd.toISOString());

      const { count, error: countErr } = await q;

      if (countErr) {
        console.error("usage: count conversions failed", countErr);
        used = 0; // fail-open
      } else {
        used = count ?? 0;
      }
    } catch (e) {
      console.error("usage: count threw", e);
      used = 0;
    }

    const limit = limitFor(planKey);
    const remaining = limit === null ? null : Math.max(0, limit - used);

    return NextResponse.json({
      plan: displayPlan(planKey),
      used,
      remaining, // ✅ only null for Business
      free_limit: FREE_LIMIT,
      limit, // ✅ Starter=50, Pro=250, Business=null, Free=3
      status,
      isPaid,

      // ✅ NEW: for Billing UI
      cancel_at_period_end: cancelAtPeriodEnd,

      window_start: windowStart ? windowStart.toISOString() : null,
      window_end: windowEnd ? windowEnd.toISOString() : null,

      // still return these for debug/UI if you want them
      current_period_start: periodStart ? periodStart.toISOString() : null,
      current_period_end: periodEnd ? periodEnd.toISOString() : null,
    });
  } catch (err) {
    console.error("usage route failed (fail-open):", err);
    return NextResponse.json({
      plan: "Free",
      used: 0,
      remaining: FREE_LIMIT,
      free_limit: FREE_LIMIT,
      limit: FREE_LIMIT,
      status: "unknown",
      isPaid: false,
      cancel_at_period_end: false, // ✅ NEW
      window_start: null,
      window_end: null,
      current_period_start: null,
      current_period_end: null,
    });
  }
}