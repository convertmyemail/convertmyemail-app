import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const FREE_LIMIT = 3;

export type UsageInfo =
  | {
      plan: "Pro";
      isPaid: true;
      used: null;
      remaining: null;
      limit: null;
      status: string;
    }
  | {
      plan: "Free";
      isPaid: false;
      used: number;
      remaining: number;
      limit: number;
      status: "free";
    };

export async function getUsageForCurrentUser(): Promise<UsageInfo> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return {
      plan: "Free",
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
    .select("status, current_period_end, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const status = String(sub?.status || "").toLowerCase();
  const isActive = status === "active" || status === "trialing";

  const periodEnd = sub?.current_period_end
    ? new Date(sub.current_period_end)
    : null;

  const notExpired = !periodEnd || periodEnd.getTime() > Date.now();
  const isPaid = isActive && notExpired;

  if (isPaid) {
    return {
      plan: "Pro",
      isPaid: true,
      used: null,
      remaining: null,
      limit: null,
      status: status || "active",
    };
  }

  // Free lifetime usage
  const { count } = await supabase
    .from("conversions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const used = count ?? 0;
  const remaining = Math.max(0, FREE_LIMIT - used);

  return {
    plan: "Free",
    isPaid: false,
    used,
    remaining,
    limit: FREE_LIMIT,
    status: "free",
  };
}