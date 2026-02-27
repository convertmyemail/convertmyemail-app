// app/api/usage/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies(); // ✅ cookies() is async in your setup
  const supabase = createSupabaseServerClient(cookieStore);

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = userData.user.id;

  const { data: subs, error: subErr } = await supabase
    .from("subscriptions")
    .select("id, status, stripe_status")
    .eq("user_id", userId)
    .limit(1);

  if (subErr) {
    console.error("subscription lookup error", subErr);
    return NextResponse.json(
      { error: "Unable to verify subscription" },
      { status: 500 }
    );
  }

  const firstSub = subs?.[0];
  const subStatus = String(firstSub?.status || firstSub?.stripe_status || "").toLowerCase();
  const hasActiveSub = subStatus === "active";

  const { data: rows, error: rowsErr } = await supabase
    .from("conversions")
    .select("id")
    .eq("user_id", userId);

  if (rowsErr) {
    console.error("usage rows error", rowsErr);
    return NextResponse.json({ error: "Unable to check usage" }, { status: 500 });
  }

  const used = (rows || []).length;
  const FREE_LIMIT = 3;

  return NextResponse.json({
    plan: hasActiveSub ? "Pro" : "Free",
    used,
    remaining: hasActiveSub ? null : Math.max(0, FREE_LIMIT - used),
    free_limit: FREE_LIMIT,
  });
}