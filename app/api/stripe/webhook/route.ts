import Stripe from "stripe";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia" as any,
});

type Plan = "free" | "starter" | "pro" | "business";

// ✅ Live price_id → plan mapping (env-driven)
const STRIPE_STARTER_PRICE_ID = process.env.STRIPE_STARTER_PRICE_ID!;
const STRIPE_PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID!;
const STRIPE_BUSINESS_PRICE_ID = process.env.STRIPE_BUSINESS_PRICE_ID!;

if (!STRIPE_STARTER_PRICE_ID || !STRIPE_PRO_PRICE_ID || !STRIPE_BUSINESS_PRICE_ID) {
  console.warn(
    "[stripe:webhook] Missing STRIPE_*_PRICE_ID env vars. Plan mapping may default to free."
  );
}

const PRICE_ID_TO_PLAN: Record<string, Plan> = {
  [STRIPE_STARTER_PRICE_ID]: "starter",
  [STRIPE_PRO_PRICE_ID]: "pro",
  [STRIPE_BUSINESS_PRICE_ID]: "business",
};

function planFromPriceId(priceId?: string | null): Plan {
  if (!priceId) return "free";
  return PRICE_ID_TO_PLAN[priceId] ?? "free";
}

// ✅ If multiple subscription items exist, pick the first item that matches a known price id
function derivePlanFromSubscriptionItems(items: any[] | undefined | null): Plan {
  const arr = Array.isArray(items) ? items : [];
  const matchedPriceId =
    arr
      .map((i: any) => i?.price?.id)
      .find((id: any) => typeof id === "string" && PRICE_ID_TO_PLAN[id]) ?? null;

  return planFromPriceId(matchedPriceId);
}

async function rawBody(req: Request) {
  const ab = await req.arrayBuffer();
  return Buffer.from(ab);
}

async function resolvePlanFromSubscription(subscriptionId?: string | null): Promise<Plan> {
  if (!subscriptionId) return "free";
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["items.data.price"],
    });

    return derivePlanFromSubscriptionItems((sub as any)?.items?.data);
  } catch (e: any) {
    console.warn("[stripe:webhook] Could not retrieve subscription for plan:", e?.message);
    return "free";
  }
}

function shouldDemoteToFree(status?: string): boolean {
  // Stripe statuses can include:
  // incomplete, incomplete_expired, trialing, active, past_due, canceled, unpaid, paused
  //
  // Per your request: cut access immediately when not paid.
  return (
    status === "canceled" ||
    status === "incomplete_expired" ||
    status === "paused" ||
    status === "unpaid" ||
    status === "past_due"
  );
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

      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id;

      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      // Prefer metadata if you set it, otherwise derive from subscription items (more reliable)
      const metadataPlan = (session.metadata?.price_key as Plan | undefined) ?? undefined;
      const plan: Plan =
        metadataPlan && metadataPlan !== "free"
          ? metadataPlan
          : await resolvePlanFromSubscription(subscriptionId ?? null);

      // ✅ For billing-cycle usage windows, pull period start/end from the subscription now
      let periodStartIso: string | null = null;
      let periodEndIso: string | null = null;
      try {
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const ps = (sub as any).current_period_start as number | undefined;
          const pe = (sub as any).current_period_end as number | undefined;
          periodStartIso = ps ? new Date(ps * 1000).toISOString() : null;
          periodEndIso = pe ? new Date(pe * 1000).toISOString() : null;
        }
      } catch (e: any) {
        console.warn("[stripe:webhook] Could not retrieve subscription period window:", e?.message);
      }

      console.log("[stripe:webhook] checkout.session.completed:", {
        userId,
        plan,
        customerId,
        subscriptionId,
        metadata: session.metadata,
        periodStartIso,
        periodEndIso,
      });

      if (userId && subscriptionId) {
        const { error } = await supabaseAdmin.from("subscriptions").upsert({
          user_id: userId,
          stripe_customer_id: customerId ?? null,
          stripe_subscription_id: subscriptionId,
          plan,
          status: "active",
          current_period_start: periodStartIso,
          current_period_end: periodEndIso,
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

      const subscriptionId = sub.id;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

      // typings-safe reads
      const status = (sub as any).status as string | undefined;

      // ✅ Derive plan from subscription items (handles multiple items)
      const derivedPlan = derivePlanFromSubscriptionItems((sub as any)?.items?.data);

      // ✅ Billing-cycle window (store BOTH start & end)
      const periodStartUnix = (sub as any).current_period_start as number | undefined;
      const periodEndUnix = (sub as any).current_period_end as number | undefined;

      const cancelAtPeriodEnd = (sub as any).cancel_at_period_end as boolean | undefined;
      const endedAtUnix = (sub as any).ended_at as number | undefined;

      // Optional: log a "matched" price id for debugging
      const debugMatchedPriceId =
        ((sub as any)?.items?.data ?? [])
          .map((i: any) => i?.price?.id)
          .find((id: any) => typeof id === "string" && PRICE_ID_TO_PLAN[id]) ?? null;

      console.log("[stripe:webhook] Subscription lifecycle event:", {
        subscriptionId,
        customerId,
        status,
        priceId: debugMatchedPriceId,
        derivedPlan,
        periodStartUnix,
        periodEndUnix,
        cancelAtPeriodEnd,
        endedAtUnix,
      });

      const { data: row, error: selectError } = await supabaseAdmin
        .from("subscriptions")
        .select("user_id, plan")
        .or(`stripe_subscription_id.eq.${subscriptionId},stripe_customer_id.eq.${customerId}`)
        .maybeSingle();

      if (selectError) {
        console.error("[stripe:webhook] Select FAILED:", selectError);
        throw new Error(selectError.message);
      }

      if (row?.user_id) {
        // If not paid / ended, demote to free. Otherwise keep entitlement.
        const demote = shouldDemoteToFree(status);
        const planToPersist: Plan = demote ? "free" : derivedPlan;

        const { error: updateError } = await supabaseAdmin.from("subscriptions").upsert({
          user_id: row.user_id,
          stripe_customer_id: customerId ?? null,
          stripe_subscription_id: subscriptionId,
          status: status ?? "unknown",
          plan: planToPersist,
          current_period_start: periodStartUnix
            ? new Date(periodStartUnix * 1000).toISOString()
            : null,
          current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
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
    return NextResponse.json({ error: e?.message ?? "Webhook handler failed" }, { status: 500 });
  }
}