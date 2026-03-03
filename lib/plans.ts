export type PlanKey = "free" | "starter" | "pro" | "business";

export const PLAN_LIMITS: Record<PlanKey, number | null> = {
  free: 3,
  starter: 20,
  pro: 75,
  business: null, // unlimited
};

export const PLAN_PRICES: Record<Exclude<PlanKey, "free">, number> = {
  starter: 9,
  pro: 19,
  business: 39,
};

export function isUnlimited(plan: PlanKey) {
  return PLAN_LIMITS[plan] === null;
}