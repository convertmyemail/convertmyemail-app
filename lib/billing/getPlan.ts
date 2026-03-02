import { createSupabaseServerClient } from "@/lib/supabaseServer";

export type Plan =
  | { name: "PRO"; isPaid: true; status: string }
  | { name: "FREE"; isPaid: false; status: "free" | string };

export async function getPlanForUser(): Promise<Plan> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { name: "FREE", isPaid: false, status: "free" };
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.status) {
    return { name: "FREE", isPaid: false, status: "free" };
  }

  const status = String(data.status).toLowerCase();
  const paid = status === "active" || status === "trialing";

  if (paid) {
    return { name: "PRO", isPaid: true, status };
  }

  return { name: "FREE", isPaid: false, status };
}