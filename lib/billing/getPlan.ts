import { createSupabaseServerClient } from "@/lib/supabaseServer";

export type Plan =
  | { name: "PRO"; isPaid: true; status: string }
  | { name: "FREE"; isPaid: false; status: "free" };

export async function getPlanForUser() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) return { name: "FREE", isPaid: false, status: "free" } as Plan;

  const { data, error } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.status) return { name: "FREE", isPaid: false, status: "free" } as Plan;

  const paid = data.status === "active" || data.status === "trialing";
  return paid
    ? ({ name: "PRO", isPaid: true, status: data.status } as Plan)
    : ({ name: "FREE", isPaid: false, status: data.status } as Plan);
}