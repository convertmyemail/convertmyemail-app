import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const FREE_LIMIT = 3;

export type UsageInfo =
  | {
      plan: "business";
      isPaid: true;
      used: null;
      remaining: null;
      limit: null;
      status: string;
    }
  | {
      plan: "starter" | "pro";
      isPaid: true;
      used: number;
      remaining: number;
      limit: number;
      status: string;
    }
  | {
      plan: "free";
      isPaid: false;
      used: number;
      remaining: number;
      limit: number;
      status: "free";
    };

function normalizePlan(raw: any): "free" | "starter" | "pro" | "business" {
  const p = String(raw || "").toLowerCase();
  if (p === "starter" || p === "pro" || p === "business" || p === "free") return p;
  return "free";
}

function limitForPlan(plan: "free" | "starter" | "pro" | "business"): number | null {
  switch (plan) {
    case "free":
      return FREE_LIMIT;
    case "starter":
      return 20;
    case "pro":
      return 75;
    case "business":
      return null; // unlimited
  }
}

export async function getUsageForCurrentUser(): Promise<UsageInfo> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return {
      plan: "free",
      isPaid: false,
      used: 0,
      remaining: FREE_LIMIT,
      limit: FREE_LIMIT,
      status: "free",
    };
  }

  // Latest subscription snapshot
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan, status, current_period_end, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const status = String(sub?.status || "").toLowerCase();
  const isActive = status === "active" || status === "trialing";

  const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end) : null;
  const notExpired = !periodEnd || periodEnd.getTime() > Date.now();

  const plan = normalizePlan((sub as any)?.plan);
  const isPaid = isActive && notExpired && plan !== "free";

  // NOTE: this is still all-time conversions. If you want monthly enforcement,
  // we should filter by current_period_start/end.
  const { count } = await supabase
    .from("conversions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const used = count ?? 0;

  if (isPaid) {
    // ✅ Narrow Business explicitly first
    if (plan === "business") {
      return {
        plan: "business",
        isPaid: true,
        used: null,
        remaining: null,
        limit: null,
        status: status || "active",
      };
    }

    // plan is now "starter" | "pro"
    const limit = limitForPlan(plan);
    const numericLimit = typeof limit === "number" ? limit : 0;

    return {
      plan, // "starter" | "pro"
      isPaid: true,
      used,
      remaining: Math.max(0, numericLimit - used),
      limit: numericLimit,
      status: status || "active",
    };
  }

  // Free lifetime usage
  const remaining = Math.max(0, FREE_LIMIT - used);

  return {
    plan: "free",
    isPaid: false,
    used,
    remaining,
    limit: FREE_LIMIT,
    status: "free",
  };
}