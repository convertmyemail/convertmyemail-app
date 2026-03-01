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

  // ISO string
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  // unix seconds / ms
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

    // 2) Subscription check (FAIL-OPEN)
    let isPro = false;
    let status: string = "free";

    try {
      // Select a wider set of possible column names (harmless if they exist; if not, Supabase may error)
      // If your table is strict and errors on unknown columns, we catch and fail-open.
      const { data: sub, error: subErr } = await supabase
        .from("subscriptions")
        .select(
          "status, current_period_end, current_period_end_at, period_end, stripe_current_period_end, plan"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subErr) {
        console.warn("usage: subscription lookup error (fail-open):", subErr);
      } else if (sub) {
        const rawStatus = String((sub as any).status ?? "").toLowerCase();
        const periodEnd =
          asDate((sub as any).current_period_end) ||
          asDate((sub as any).current_period_end_at) ||
          asDate((sub as any).period_end) ||
          asDate((sub as any).stripe_current_period_end);

        const active = rawStatus === "active" || rawStatus === "trialing";
        const notExpired = !periodEnd || periodEnd.getTime() > Date.now();

        isPro = active && notExpired;
        status = rawStatus || (isPro ? "active" : "free");
      }
    } catch (e) {
      console.warn("usage: subscription verify threw (fail-open):", e);
      isPro = false;
      status = "free";
    }

    const remaining = isPro ? null : Math.max(0, FREE_LIMIT - used);

    return NextResponse.json({
      plan: isPro ? "Pro" : "Free",
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