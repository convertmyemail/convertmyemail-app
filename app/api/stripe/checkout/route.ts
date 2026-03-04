import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { cookies } from "next/headers";

export const runtime = "nodejs";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
  apiVersion: "2024-12-18.acacia" as any,
});

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

type PriceKey = "starter" | "pro" | "business";

const PRICE_ID_BY_KEY: Record<PriceKey, string> = {
  starter: process.env.STRIPE_STARTER_PRICE_ID || "",
  pro: process.env.STRIPE_PRO_PRICE_ID || "",
  business: process.env.STRIPE_BUSINESS_PRICE_ID || "",
};

function isPriceKey(x: any): x is PriceKey {
  return x === "starter" || x === "pro" || x === "business";
}

export async function POST(req: Request) {
  try {
    // Some clients may send { plan } instead of { priceKey }
    const body = (await req.json().catch(() => ({}))) as {
      priceKey?: string;
      plan?: string;
    };

    const raw = body.priceKey ?? body.plan;
    const key = typeof raw === "string" ? raw.toLowerCase().trim() : raw;

    if (!isPriceKey(key)) {
      return NextResponse.json({ error: "Invalid priceKey", received: raw }, { status: 400 });
    }

    const priceId = PRICE_ID_BY_KEY[key];
    if (!priceId) {
      return NextResponse.json({ error: `Missing Stripe price env var for ${key}`, key }, { status: 500 });
    }

    // ✅ Support BOTH cookie auth (browser) and Authorization Bearer (API callers)
    // ✅ Bearer path uses service-role verification to avoid SSR/cookie/header quirks
    const authHeader = req.headers.get("authorization") || "";
    const isBearer = authHeader.toLowerCase().startsWith("bearer ");
    const jwt = isBearer ? authHeader.slice("bearer ".length).trim() : "";

    let user: any = null;
    let supabase: any = null;

    if (jwt) {
      const { createClient } = await import("@supabase/supabase-js");

      const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
      const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

      // Admin client for JWT validation
      const supabaseAdmin = createClient(supabaseUrl, serviceRole, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      const { data, error } = await supabaseAdmin.auth.getUser(jwt);
      if (error || !data?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      user = data.user;

      // Reuse the admin client for DB reads/writes in this request
      supabase = supabaseAdmin;
    } else {
      // Cookie-based auth (normal browser flow)
      await cookies();
      supabase = await createSupabaseServerClient();

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      user = authData.user;
    }

    const { data: subRow, error: subErr } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subErr) {
      return NextResponse.json({ error: subErr.message }, { status: 500 });
    }

    // ✅ Ensure we have a Stripe Customer AND it has metadata.user_id
    // This makes customer.subscription.updated events resolvable back to your user.
    let customerId = subRow?.stripe_customer_id || null;

    async function createAndPersistCustomer() {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;

      const { error: upsertErr } = await supabase.from("subscriptions").upsert(
        {
          user_id: user.id,
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (upsertErr) {
        throw new Error(upsertErr.message);
      }
    }

    if (!customerId) {
      await createAndPersistCustomer();
    } else {
      // Keep metadata up to date; if customer id is stale (test/live mismatch), recreate
      try {
        await stripe.customers.update(customerId, {
          email: user.email ?? undefined,
          metadata: { user_id: user.id },
        });
      } catch (e: any) {
        const msg = String(e?.raw?.message || e?.message || "");
        console.warn("[api/stripe/checkout] customer update failed, recreating customer:", msg);
        await createAndPersistCustomer();
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer: customerId,

      // ✅ Put user_id onto the Subscription itself (best for webhook mapping)
      subscription_data: {
        metadata: { user_id: user.id },
      },

      // Email optional now since we always have customer
      customer_email: undefined,

      success_url: `${siteUrl()}/app?billing=success`,
      cancel_url: `${siteUrl()}/app?billing=cancelled`,

      // Keep session metadata too (helpful for checkout.session.completed handler)
      metadata: { user_id: user.id, price_key: key },
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    const message = e?.raw?.message || e?.message || "Stripe error";

    console.error("[api/stripe/checkout] error:", {
      message,
      type: e?.type,
      code: e?.code,
      rawType: e?.raw?.type,
    });

    return NextResponse.json(
      {
        error: message,
        hint: message.includes("No such price")
          ? "Your STRIPE_*_PRICE_ID env vars do not match the Stripe mode/account of STRIPE_SECRET_KEY (test vs live, or wrong account)."
          : undefined,
      },
      { status: 500 }
    );
  }
}