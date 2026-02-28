// app/api/stripe/portal/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

// ✅ Let Stripe use your account's default API version
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get most recent subscription row (where you stored stripe_customer_id)
    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, customer_id, stripe_customer")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subErr) {
      return NextResponse.json({ error: "Failed to load subscription" }, { status: 500 });
    }

    const customerId =
      (sub as any)?.stripe_customer_id ||
      (sub as any)?.customer_id ||
      (sub as any)?.stripe_customer;

    if (!customerId) {
      return NextResponse.json({ error: "No Stripe customer found" }, { status: 400 });
    }

    const origin = new URL(req.url).origin;
    const return_url = `${origin}/app/billing`;

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to create portal session" },
      { status: 500 }
    );
  }
}