import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia" as any,
});

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

type PriceKey = "starter" | "pro" | "business";

const PRICE_ID_BY_KEY: Record<PriceKey, string> = {
  starter: process.env.STRIPE_STARTER_PRICE_ID!,
  pro: process.env.STRIPE_PRO_PRICE_ID!,
  business: process.env.STRIPE_BUSINESS_PRICE_ID!,
};

export async function POST(req: Request) {
  try {
    const { priceKey } = (await req.json()) as { priceKey: PriceKey };

    if (!priceKey || !(priceKey in PRICE_ID_BY_KEY)) {
      return NextResponse.json({ error: "Invalid priceKey" }, { status: 400 });
    }

    const priceId = PRICE_ID_BY_KEY[priceKey];
    if (!priceId) {
      return NextResponse.json(
        { error: `Missing price id for ${priceKey}` },
        { status: 500 }
      );
    }

    // Bind cookies to request context (and support cookie-based auth)
    await cookies();

    // ✅ Your helper returns a Promise and takes 0 args in this codebase
    const supabase = await createSupabaseServerClient();

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = authData.user;

    const { data: subRow, error: subErr } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subErr) {
      return NextResponse.json({ error: subErr.message }, { status: 500 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      ...(subRow?.stripe_customer_id ? { customer: subRow.stripe_customer_id } : {}),
      customer_email: subRow?.stripe_customer_id ? undefined : user.email ?? undefined,
      success_url: `${siteUrl()}/app?billing=success`,
      cancel_url: `${siteUrl()}/app?billing=cancelled`,
      metadata: { user_id: user.id, price_key: priceKey },
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("[api/stripe/checkout] error:", e);
    return NextResponse.json({ error: e?.message ?? "Stripe error" }, { status: 500 });
  }
}