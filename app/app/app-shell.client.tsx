"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/browser";

type Usage = {
  plan: "Free" | "Pro" | string;
  used: number;
  remaining: number | null;
  free_limit: number;

  // optional fields some endpoints may return
  limit?: number | null; // ✅ allow null (unlimited)
  status?: string;
  isPaid?: boolean;

  // ✅ subscription + billing fields for Billing page UX
  cancel_at_period_end?: boolean;
  current_period_start?: string | null;
  current_period_end?: string | null;

  // ✅ usage window fields (free month / paid billing cycle)
  window_start?: string | null;
  window_end?: string | null;
};

type AppShellCtx = {
  usage: Usage | null;
  usageLoading: boolean;
  isPro: boolean; // NOTE: kept name for minimal refactor; now means "paid (starter/pro/business)"
  isUnlimited: boolean; // ✅ new
  refreshUsage: () => Promise<void>;
  startCheckout: (priceKey?: "starter" | "pro" | "business") => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AppShellCtx | null>(null);

export function useAppShell() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppShell must be used within <AppShell />");
  return ctx;
}

type NavItem = { label: string; href: string };

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/app" },
  { label: "Conversions", href: "/app/conversions" },
  { label: "Billing", href: "/app/billing" },
  { label: "Account", href: "/app/account" },
];

const FALLBACK_FREE: Usage = {
  plan: "Free",
  used: 0,
  remaining: 3,
  free_limit: 3,
  limit: 3,
  cancel_at_period_end: false,
  current_period_start: null,
  current_period_end: null,
  window_start: null,
  window_end: null,
};

function normalizeUsage(input: unknown): Usage {
  if (!input || typeof input !== "object") return FALLBACK_FREE;

  const obj = input as Record<string, unknown>;

  const plan = String(obj.plan ?? "Free");

  const limit =
    obj.limit === null ? null : typeof obj.limit === "number" ? obj.limit : undefined;

  const free_limit =
    typeof obj.free_limit === "number"
      ? obj.free_limit
      : typeof obj.limit === "number"
      ? obj.limit
      : 3;

  const used = typeof obj.used === "number" ? obj.used : 0;

  const remaining =
    obj.remaining === null
      ? null
      : typeof obj.remaining === "number"
      ? obj.remaining
      : // If limit is null => unlimited
      limit === null
      ? null
      : Math.max(0, free_limit - used);

  return {
    plan,
    used,
    remaining,
    free_limit,
    limit,
    status: typeof obj.status === "string" ? obj.status : undefined,
    isPaid: typeof obj.isPaid === "boolean" ? obj.isPaid : undefined,

    // ✅ Billing fields
    cancel_at_period_end:
      typeof obj.cancel_at_period_end === "boolean" ? obj.cancel_at_period_end : undefined,
    current_period_start:
      typeof obj.current_period_start === "string" ? obj.current_period_start : null,
    current_period_end:
      typeof obj.current_period_end === "string" ? obj.current_period_end : null,

    // ✅ Window fields
    window_start: typeof obj.window_start === "string" ? obj.window_start : null,
    window_end: typeof obj.window_end === "string" ? obj.window_end : null,
  };
}

type PriceKey = "starter" | "pro" | "business";
function isPriceKey(x: string | null): x is PriceKey {
  return x === "starter" || x === "pro" || x === "business";
}

function BrandMark({ size = 36 }: { size?: number }) {
  // Uses public-root icons: /icon-light.png and /icon-dark.png
  return (
    <span
      className="inline-flex items-center justify-center overflow-hidden rounded-xl"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Image
        src="/icon-light.png"
        alt=""
        width={size}
        height={size}
        unoptimized
        priority
        className="block h-full w-full object-contain dark:hidden"
      />
      <Image
        src="/icon-dark.png"
        alt=""
        width={size}
        height={size}
        unoptimized
        priority
        className="hidden h-full w-full object-contain dark:block"
      />
    </span>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const checkoutStartedRef = useRef(false);

  const [usage, setUsage] = useState<Usage | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);

  const getAuthHeaders = async (): Promise<Record<string, string> | undefined> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) return undefined;
    return { Authorization: `Bearer ${session.access_token}` };
  };

  const refreshUsage = async () => {
    setUsageLoading(true);

    try {
      const authHeaders = await getAuthHeaders();

      const res = await fetch("/api/usage", {
        cache: "no-store",
        headers: {
          ...(authHeaders ?? {}),
        },
      });

      const json: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        console.warn("usage: non-OK response", res.status, json);
        setUsage(normalizeUsage(json));
        return;
      }

      setUsage(normalizeUsage(json));
    } catch (e: unknown) {
      console.warn("usage load error (fail-open)", e);
      setUsage(FALLBACK_FREE);
    } finally {
      setUsageLoading(false);
    }
  };

  useEffect(() => {
    refreshUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalizedPlan = String(usage?.plan || "Free").toLowerCase();

  // ✅ Paid flag (keep name isPro for minimal changes elsewhere)
  // Treat starter/pro/business as paid; free as not paid.
  const isPaidPlan = ["starter", "pro", "business"].includes(normalizedPlan);

  // Some endpoints may return isPaid/status; prefer them if present.
  const explicitIsPaid =
    usage?.isPaid === true ||
    (typeof usage?.status === "string" &&
      ["active", "trialing"].includes(usage.status.toLowerCase()));

  const isPro = explicitIsPaid || isPaidPlan;

  // ✅ Unlimited only when backend signals it:
  // - limit === null (ideal)
  // - remaining === null (back-compat)
  const isUnlimited = usage?.limit === null || usage?.remaining === null;

  const activeHref = useMemo(() => {
    const exact = NAV.find((n) => n.href === pathname)?.href;
    if (exact) return exact;

    const prefix = NAV.find((n) => n.href !== "/app" && pathname?.startsWith(n.href))?.href;
    return prefix || "/app";
  }, [pathname]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const startCheckout = async (priceKey: "starter" | "pro" | "business" = "pro") => {
    if (checkoutStartedRef.current) return;
    checkoutStartedRef.current = true;

    try {
      const authHeaders = await getAuthHeaders();

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeaders ?? {}),
        },
        body: JSON.stringify({ priceKey }),
      });

      const data: unknown = await res.json().catch(() => ({}));
      const obj = (data && typeof data === "object" ? (data as Record<string, unknown>) : {}) as Record<
        string,
        unknown
      >;

      if (!res.ok) {
        const errMsg = typeof obj.error === "string" ? obj.error : "Could not start checkout";
        throw new Error(errMsg);
      }

      if (typeof obj.url === "string" && obj.url) {
        refreshUsage().catch(() => {});
        window.location.href = obj.url;
        return;
      }

      throw new Error("Missing checkout URL");
    } catch (e: unknown) {
      checkoutStartedRef.current = false;
      console.error("checkout error", e);
    }
  };

  // ✅ Auto-start checkout when user lands on /app with ?plan=starter|pro|business
  useEffect(() => {
    if (typeof window === "undefined") return;

    const sp = new URLSearchParams(window.location.search);
    const plan = sp.get("plan");

    // Only kick off checkout if plan is valid and user isn't already paid
    if (!isPro && isPriceKey(plan)) {
      sp.delete("plan");
      const nextUrl =
        window.location.pathname +
        (sp.toString() ? `?${sp.toString()}` : "") +
        window.location.hash;

      window.history.replaceState({}, "", nextUrl);

      // Start checkout once
      startCheckout(plan);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPro]);

  const ctxValue: AppShellCtx = {
    usage,
    usageLoading,
    isPro,
    isUnlimited,
    refreshUsage,
    startCheckout,
    logout,
  };

  const title =
    activeHref === "/app"
      ? "Dashboard"
      : activeHref === "/app/conversions"
      ? "Conversions"
      : activeHref === "/app/billing"
      ? "Billing"
      : activeHref === "/app/account"
      ? "Account"
      : "Dashboard";

  const showUsage = !!usage && !usageLoading;

  // ✅ Show usage counts for any NON-unlimited plan (free/starter/pro)
  const showMeter = showUsage && !isUnlimited && usage?.remaining !== null;

  return (
    <Ctx.Provider value={ctxValue}>
      <div className="min-h-screen bg-white text-gray-900">
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="hidden w-64 border-r border-gray-200 bg-white md:flex md:flex-col">
            {/* Brand */}
            <div className="px-6 py-5">
              <Link
                href="/"
                className="flex items-center gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-300"
              >
                <BrandMark size={40} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold tracking-tight hover:opacity-90">
                    Convert My Email
                  </div>
                  <div className="mt-1 text-xs text-gray-500">Professional conversions</div>
                </div>
              </Link>
            </div>

            <nav className="space-y-1 px-3">
              {NAV.map((item) => (
                <SidebarItem key={item.href} href={item.href} active={activeHref === item.href}>
                  {item.label}
                </SidebarItem>
              ))}
            </nav>

            <div className="mt-auto p-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium text-gray-700">Output formats</div>
                <div className="mt-1 text-xs text-gray-600">Excel (.xlsx) • PDF</div>
              </div>

              <button
                className="mt-3 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
                onClick={logout}
                type="button"
              >
                Sign out
              </button>
            </div>
          </aside>

          {/* Main */}
          <div className="flex-1">
            {/* Topbar */}
            <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
              <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Mobile brand mark (shows even when sidebar hidden) */}
                    <div className="md:hidden">
                      <Link href="/" className="inline-flex items-center gap-2">
                        <BrandMark size={28} />
                      </Link>
                    </div>

                    <div className="text-sm font-semibold">{title}</div>

                    {showUsage && (
                      <span
                        className={[
                          "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold border",
                          isPro
                            ? "border-green-200 bg-green-50 text-green-800"
                            : "border-yellow-200 bg-yellow-50 text-yellow-800",
                        ].join(" ")}
                        title="Your current plan"
                      >
                        {String(usage?.plan || "Free")}
                      </span>
                    )}

                    {showMeter && (
                      <span className="text-xs text-gray-500">
                        {usage.used} used —{" "}
                        <span className="font-semibold text-gray-800">{usage.remaining} left</span>
                      </span>
                    )}

                    {showUsage && isUnlimited && (
                      <span className="text-xs text-gray-500">Unlimited conversions</span>
                    )}
                  </div>

                  <div className="mt-1 truncate text-xs text-gray-500">
                    Convert email files into clean records for storage or submission.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href="/"
                    className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
                  >
                    Home
                  </Link>

                  <Link
                    href="/pricing"
                    className="hidden sm:inline-flex rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
                  >
                    Pricing
                  </Link>

                  <Link
                    href="/help"
                    className="hidden sm:inline-flex rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
                  >
                    Help
                  </Link>

                  {!isPro && (
                    <button
                      className="hidden sm:inline-flex rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black"
                      onClick={() => startCheckout("pro")}
                      type="button"
                    >
                      Upgrade
                    </button>
                  )}

                  <button
                    className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 md:hidden"
                    onClick={logout}
                    type="button"
                  >
                    Sign out
                  </button>
                </div>
              </div>

              {/* Mobile nav */}
              <div className="border-t border-gray-200 md:hidden">
                <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-2">
                  {NAV.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={activeHref === item.href ? "page" : undefined}
                      className={[
                        "whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium border",
                        activeHref === item.href
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                      ].join(" ")}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </header>

            <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
          </div>
        </div>
      </div>
    </Ctx.Provider>
  );
}

function SidebarItem({
  children,
  href,
  active,
}: {
  children: React.ReactNode;
  href: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "flex items-center rounded-xl px-3 py-2 text-sm font-medium transition",
        active ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50 hover:text-gray-900",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}