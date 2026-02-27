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

export async function POST(req: Request) {
  try {
    const { priceKey } = (await req.json()) as { priceKey: "starter" | "pro" };

    const priceId =
      priceKey === "starter"
        ? process.env.STRIPE_PRICE_STARTER
        : process.env.STRIPE_PRICE_PRO;

    if (!priceId) return NextResponse.json({ error: "Missing price id" }, { status: 500 });

    const cookieStore = await Promise.resolve(cookies() as any);
    const supabase = createSupabaseServerClient(cookieStore);

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = authData.user;

    const { data: subRow } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      ...(subRow?.stripe_customer_id ? { customer: subRow.stripe_customer_id } : {}),
      customer_email: subRow?.stripe_customer_id ? undefined : user.email ?? undefined,
      success_url: `${siteUrl()}/app?billing=success`,
      cancel_url: `${siteUrl()}/app?billing=cancelled`,
      metadata: { user_id: user.id, price_key: priceKey },
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Stripe error" }, { status: 500 });
  }
}