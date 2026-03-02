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
  limit?: number;
  status?: string;
  isPaid?: boolean;
};

type AppShellCtx = {
  usage: Usage | null;
  usageLoading: boolean;
  isPro: boolean;
  refreshUsage: () => Promise<void>;
  startCheckout: (priceKey?: "starter" | "pro") => Promise<void>;
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
};

function normalizeUsage(input: any): Usage {
  if (!input || typeof input !== "object") return FALLBACK_FREE;

  const plan = String(input.plan ?? "Free");
  const free_limit =
    typeof input.free_limit === "number"
      ? input.free_limit
      : typeof input.limit === "number"
      ? input.limit
      : 3;

  const used = typeof input.used === "number" ? input.used : 0;

  const remaining =
    input.remaining === null
      ? null
      : typeof input.remaining === "number"
      ? input.remaining
      : Math.max(0, free_limit - used);

  return {
    plan,
    used,
    remaining,
    free_limit,
    limit: typeof input.limit === "number" ? input.limit : undefined,
    status: typeof input.status === "string" ? input.status : undefined,
    isPaid: typeof input.isPaid === "boolean" ? input.isPaid : undefined,
  };
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

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        console.warn("usage: non-OK response", res.status, json);
        setUsage(normalizeUsage(json) ?? FALLBACK_FREE);
        return;
      }

      setUsage(normalizeUsage(json));
    } catch (e) {
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

  const explicitIsPro =
    usage?.isPaid === true ||
    (typeof usage?.status === "string" &&
      ["active", "trialing"].includes(usage.status.toLowerCase()));

  const normalizedPlan = String(usage?.plan || "Free").toLowerCase();
  const isPro = explicitIsPro || normalizedPlan === "pro" || normalizedPlan === "starter";

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

  const startCheckout = async (priceKey: "starter" | "pro" = "pro") => {
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

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not start checkout");

      if (data?.url) {
        refreshUsage().catch(() => {});
        window.location.href = data.url;
        return;
      }

      throw new Error("Missing checkout URL");
    } catch (e) {
      checkoutStartedRef.current = false;
      console.error("checkout error", e);
    }
  };

  const ctxValue: AppShellCtx = {
    usage,
    usageLoading,
    isPro,
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

            <nav className="px-3 space-y-1">
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

                    {showUsage && !isPro && usage?.remaining !== null && (
                      <span className="text-xs text-gray-500">
                        {usage.used} used —{" "}
                        <span className="font-semibold text-gray-800">{usage.remaining} left</span>
                      </span>
                    )}

                    {showUsage && isPro && (
                      <span className="text-xs text-gray-500">Unlimited conversions</span>
                    )}
                  </div>

                  <div className="mt-1 text-xs text-gray-500 truncate">
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
              <div className="md:hidden border-t border-gray-200">
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