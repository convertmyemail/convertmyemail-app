import Stripe from "stripe";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia" as any,
});

async function rawBody(req: Request) {
  const ab = await req.arrayBuffer();
  return Buffer.from(ab);
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    console.error("[stripe:webhook] Missing stripe-signature header");
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      await rawBody(req),
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("[stripe:webhook] Signature verification failed:", err.message);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  console.log("[stripe:webhook] Event received:", event.type);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const { createClient } = await import("@supabase/supabase-js");

  const supabaseAdmin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  try {
    // =========================================================
    // CHECKOUT COMPLETED
    // =========================================================
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const userId = session.metadata?.user_id;
      const plan = session.metadata?.price_key || "free";

      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id;

      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      console.log("[stripe:webhook] checkout.session.completed:", {
        userId,
        plan,
        customerId,
        subscriptionId,
        metadata: session.metadata,
      });

      if (userId && subscriptionId) {
        const { error } = await supabaseAdmin.from("subscriptions").upsert({
          user_id: userId,
          stripe_customer_id: customerId ?? null,
          stripe_subscription_id: subscriptionId,
          plan,
          status: "active",
          current_period_end: null,
          updated_at: new Date().toISOString(),
        });

        if (error) {
          console.error("[stripe:webhook] Upsert FAILED:", error);
          throw new Error(error.message);
        }

        console.log("[stripe:webhook] Upsert SUCCESS");
      } else {
        console.warn("[stripe:webhook] Missing userId or subscriptionId. Nothing inserted.");
      }
    }

    // =========================================================
    // SUBSCRIPTION LIFECYCLE EVENTS
    // =========================================================
    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;

      const subscriptionId = (sub as any).id;
      const customerId =
        typeof (sub as any).customer === "string"
          ? (sub as any).customer
          : (sub as any).customer?.id;

      console.log("[stripe:webhook] Subscription lifecycle event:", {
        subscriptionId,
        customerId,
        status: (sub as any).status,
      });

      const { data: row, error: selectError } = await supabaseAdmin
        .from("subscriptions")
        .select("user_id, plan")
        .or(
          `stripe_subscription_id.eq.${subscriptionId},stripe_customer_id.eq.${customerId}`
        )
        .maybeSingle();

      if (selectError) {
        console.error("[stripe:webhook] Select FAILED:", selectError);
        throw new Error(selectError.message);
      }

      if (row?.user_id) {
        const status = (sub as any).status;
        const isActive = status === "active" || status === "trialing";
        const periodEndUnix = (sub as any).current_period_end as number | undefined;

        const { error: updateError } = await supabaseAdmin
          .from("subscriptions")
          .upsert({
            user_id: row.user_id,
            stripe_customer_id: customerId ?? null,
            stripe_subscription_id: subscriptionId,
            status,
            plan: isActive ? row.plan : "free",
            current_period_end: periodEndUnix
              ? new Date(periodEndUnix * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          });

        if (updateError) {
          console.error("[stripe:webhook] Subscription update FAILED:", updateError);
          throw new Error(updateError.message);
        }

        console.log("[stripe:webhook] Subscription update SUCCESS");
      } else {
        console.warn("[stripe:webhook] No existing subscription row found.");
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error("[stripe:webhook] Handler FAILED:", e);
    return NextResponse.json(
      { error: e?.message ?? "Webhook handler failed" },
      { status: 500 }
    );
  }
}