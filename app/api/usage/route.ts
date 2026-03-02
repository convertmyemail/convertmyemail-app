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
      return FREE_LIMIT; // lifetime
    case "starter":
      return 20; // per billing cycle
    case "pro":
      return 75; // per billing cycle
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

    // 1) Get latest subscription snapshot (fail-open to Free)
    let planKey: PlanKey = "free";
    let status = "free";
    let isPaid = false;

    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;

    try {
      const { data: sub, error: subErr } = await supabase
        .from("subscriptions")
        .select("status, plan, current_period_start, current_period_end, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subErr) {
        console.warn("usage: subscription lookup error (fail-open):", subErr);
      } else if (sub) {
        const rawStatus = String((sub as any).status ?? "").toLowerCase();
        const rawPlan = normalizePlan((sub as any).plan);

        periodStart = asDate((sub as any).current_period_start);
        periodEnd = asDate((sub as any).current_period_end);

        const active = rawStatus === "active" || rawStatus === "trialing";
        const notExpired = !periodEnd || periodEnd.getTime() > Date.now();

        // paid only if active + not expired + not free
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
    }

    // 2) Count conversions used
    // Free: lifetime count
    // Paid: count within billing window if we have a periodStart; otherwise fail-open to lifetime (still okay for UI)
    let used = 0;

    try {
      let q = supabase.from("conversions").select("id", { count: "exact", head: true }).eq("user_id", user.id);

      if (isPaid && periodStart) {
        // conversions.created_at is assumed to be ISO timestamp
        q = q.gte("created_at", periodStart.toISOString());
        if (periodEnd) q = q.lt("created_at", periodEnd.toISOString());
      }

      const { count, error: countErr } = await q;

      if (countErr) {
        console.error("usage: count conversions failed", countErr);
        // fail-open
        used = 0;
      } else {
        used = count ?? 0;
      }
    } catch (e) {
      console.error("usage: count threw", e);
      used = 0;
    }

    const limit = limitFor(planKey);

    const remaining =
      limit === null ? null : Math.max(0, limit - used);

    return NextResponse.json({
      plan: displayPlan(planKey),     // "Free" | "Starter" | "Pro" | "Business"
      used,                           // number used in window (paid) or lifetime (free)
      remaining,                      // null for unlimited, number otherwise
      free_limit: FREE_LIMIT,
      limit,                          // helpful for UI/debug
      status,
      isPaid,                         // true for starter/pro/business when active
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
      current_period_start: null,
      current_period_end: null,
    });
  }
}