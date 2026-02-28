// app/app/page.tsx
import UploadPageClient from "./uploadpage.client";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const FREE_LIMIT_FALLBACK = 3;

type UsageInfo =
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

export default async function AppPage() {
  const supabase = createSupabaseServerClient();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    // If you have middleware redirecting, you may never hit this.
    // Still keep it safe.
    const usage: UsageInfo = {
      plan: "Free",
      isPaid: false,
      used: 0,
      remaining: FREE_LIMIT_FALLBACK,
      limit: FREE_LIMIT_FALLBACK,
      status: "free",
    };
    return <UploadPageClient usage={usage} />;
  }

  const userId = userData.user.id;

  // Subscription check (latest)
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status, stripe_status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const subStatus = String(sub?.status || sub?.stripe_status || "").toLowerCase();
  const hasPaidAccess = subStatus === "active" || subStatus === "trialing";

  if (hasPaidAccess) {
    const usage: UsageInfo = {
      plan: "Pro",
      isPaid: true,
      used: null,
      remaining: null,
      limit: null,
      status: subStatus || "active",
    };
    return <UploadPageClient usage={usage} />;
  }

  // Count conversions (efficient)
  const { count } = await supabase
    .from("conversions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const used = count ?? 0;
  const limit = FREE_LIMIT_FALLBACK;
  const remaining = Math.max(0, limit - used);

  const usage: UsageInfo = {
    plan: "Free",
    isPaid: false,
    used,
    remaining,
    limit,
    status: "free",
  };

  return <UploadPageClient usage={usage} />;
}