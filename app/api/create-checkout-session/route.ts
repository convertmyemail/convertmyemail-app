// app/api/create-checkout-session/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import Stripe from "stripe";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia" as any,
});

type Plan = "starter" | "pro" | "business";

const PRICE_ID_BY_PLAN: Record<Plan, string> = {
  starter: process.env.STRIPE_STARTER_PRICE_ID!,
  pro: process.env.STRIPE_PRO_PRICE_ID!,
  business: process.env.STRIPE_BUSINESS_PRICE_ID!,
};

export async function POST(req: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "STRIPE_SECRET_KEY missing" }, { status: 500 });
    }

    const { plan } = (await req.json()) as { plan: Plan };

    if (!plan || !(plan in PRICE_ID_BY_PLAN)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const priceId = PRICE_ID_BY_PLAN[plan];
    if (!priceId) {
      return NextResponse.json({ error: `Missing price id for plan: ${plan}` }, { status: 500 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    // Ensure request cookies are available in this route context
    await cookies();

    // ✅ Your helper returns a Promise in this codebase
    const supabase = await createSupabaseServerClient();

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email ?? undefined;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: userEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/app?checkout=success`,
      cancel_url: `${siteUrl}/pricing?checkout=canceled`,
      metadata: {
        user_id: userId,
        price_key: plan, // helps webhook resolve plan
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("[create-checkout-session] error:", err);
    return NextResponse.json({ error: err?.message || "Stripe error" }, { status: 500 });
  }
}