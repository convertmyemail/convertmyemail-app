import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function createSupabaseWithAuth(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const authHeader = req.headers.get("authorization") || "";

  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
  });
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const supabase = createSupabaseWithAuth(req);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    // Find latest subscription row for this user
    const { data: subRow, error: subErr } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ stripe_subscription_id: string | null }>();

    if (subErr) {
      console.error("[stripe:cancel] subscription lookup error", subErr);
      return NextResponse.json({ error: "Unable to find subscription." }, { status: 500 });
    }

    const stripeSubscriptionId = subRow?.stripe_subscription_id;
    if (!stripeSubscriptionId) {
      return NextResponse.json({ error: "No subscription found." }, { status: 400 });
    }

    // ✅ Set cancel at period end
    const updated = await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // ✅ Mirror minimal fields now; webhook will sync period start/end + final status
    await supabase
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
        status: (updated as any)?.status ?? "active",
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_subscription_id", stripeSubscriptionId);

    return NextResponse.json({
      ok: true,
      message: "Subscription will cancel at period end.",
      cancel_at_period_end: true,
      status: (updated as any)?.status ?? "active",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ [stripe:cancel] failed:", message);
    return NextResponse.json({ error: "Cancel failed.", message }, { status: 500 });
  }
}