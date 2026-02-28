import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const FREE_LIMIT = 3;

export type UsageInfo =
  | {
      plan: "Pro";
      isPaid: true;
      used: number | null;
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
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    // Not logged in; treat as Free with 0 used
    return {
      plan: "Free",
      isPaid: false,
      used: 0,
      remaining: FREE_LIMIT,
      limit: FREE_LIMIT,
      status: "free",
    };
  }

  // Latest subscription
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status, stripe_status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const subStatus = String(sub?.status || sub?.stripe_status || "").toLowerCase();
  const isPaid = subStatus === "active" || subStatus === "trialing";

  if (isPaid) {
    return {
      plan: "Pro",
      isPaid: true,
      used: null,
      remaining: null,
      limit: null,
      status: subStatus || "active",
    };
  }

  // Count conversions (fast)
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