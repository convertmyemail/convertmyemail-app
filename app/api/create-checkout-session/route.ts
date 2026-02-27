// app/api/create-checkout-session/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import Stripe from "stripe";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "STRIPE_SECRET_KEY missing" }, { status: 500 });
    }

    const PRICE_ID = process.env.PRICE_ID_PRO;
    const APP_URL = process.env.APP_URL;

    if (!PRICE_ID) {
      return NextResponse.json({ error: "PRICE_ID_PRO missing" }, { status: 500 });
    }
    if (!APP_URL) {
      return NextResponse.json({ error: "APP_URL missing" }, { status: 500 });
    }

    // ✅ Get authenticated user
    const cookieStore = await cookies();
    const supabase = createSupabaseServerClient(cookieStore);

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email ?? undefined;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: userEmail,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: `${APP_URL}/app?checkout=success`,
      cancel_url: `${APP_URL}/app`,
      metadata: { user_id: userId }, // 🔥 link back in webhook
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("stripe checkout session error", err);
    return NextResponse.json({ error: err?.message || "Stripe error" }, { status: 500 });
  }
}