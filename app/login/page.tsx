"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/browser";

function safeNextPath(nextRaw: string | null) {
  if (!nextRaw) return "/app";
  if (!nextRaw.startsWith("/")) return "/app";
  if (nextRaw.startsWith("//")) return "/app";
  return nextRaw;
}

function cleanBaseUrl(url: string) {
  return (url || "").trim().replace(/\/$/, "");
}

const COOLDOWN_SECONDS = 60;
const COOLDOWN_KEY = "cme_magiclink_cooldown_until";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [nextPath, setNextPath] = useState("/app");

  // Cooldown state
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const [now, setNow] = useState<number>(Date.now());

  // ✅ Canonical base URL for magic-link callbacks (fixes PKCE host mismatch)
  const baseUrl = useMemo(() => {
    const env = cleanBaseUrl(process.env.NEXT_PUBLIC_SITE_URL || "");
    if (env) return env;
    // fallback for local dev / missing env
    if (typeof window !== "undefined") return cleanBaseUrl(window.location.origin);
    return "";
  }, []);

  // Read ?next= from the URL on the client (avoids build/prerender issues)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const n = params.get("next");
      setNextPath(safeNextPath(n));

      const err = params.get("error");
      const reason = params.get("reason");
      if (err) {
        setStatus(reason ? `Login error: ${reason}` : `Login error: ${err}`);
      }
    } catch {
      // ignore
    }
  }, []);

  // If already logged in, bounce to app
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.push(nextPath);
    });
  }, [router, nextPath]);

  // Load cooldown from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COOLDOWN_KEY);
      const until = raw ? Number(raw) : 0;
      if (Number.isFinite(until)) setCooldownUntil(until);
    } catch {
      // ignore
    }
  }, []);

  // Tick for countdown display (keeps UI updated)
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const secondsLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const isCooldownActive = secondsLeft > 0;

  const startCooldown = (seconds: number) => {
    const until = Date.now() + seconds * 1000;
    setCooldownUntil(until);
    try {
      localStorage.setItem(COOLDOWN_KEY, String(until));
    } catch {
      // ignore
    }
  };

  const sendMagicLink = async () => {
    setStatus("");

    if (isCooldownActive) {
      setStatus(`Please wait ${secondsLeft}s before requesting another link.`);
      return;
    }

    const trimmed = email.trim();

    if (!trimmed) {
      setStatus("Please enter your email address.");
      return;
    }

    setLoading(true);
    try {
      // ✅ Always redirect to canonical domain if configured
      const origin = baseUrl || window.location.origin;

      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) throw error;

      setStatus("Magic link sent. Check your email to sign in.");
      startCooldown(COOLDOWN_SECONDS);
    } catch (e: any) {
      const msg = e?.message || "Failed to send magic link.";
      setStatus(msg);

      // If something rate-limit-ish happens, back off a bit longer
      if (/rate limit|too many|429/i.test(msg)) {
        startCooldown(120);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <div className="text-sm font-semibold tracking-tight">Convert My Email</div>
            <div className="mt-1 text-xs text-gray-500">Professional conversions</div>
          </div>
          <div className="text-xs text-gray-500">Secure sign-in</div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 md:flex-row md:items-start">
        <section className="w-full md:w-1/2">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h1 className="text-lg font-semibold">Sign in</h1>
            <p className="mt-1 text-sm text-gray-600">
              Get a magic link to access your dashboard and conversion history.
            </p>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-sm font-medium text-gray-900">What you’ll get</div>
                <ul className="mt-2 space-y-2 text-sm text-gray-700">
                  <li className="flex gap-2">
                    <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-gray-400" />
                    Court-ready Excel exports (.xlsx)
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-gray-400" />
                    PDF record bundles with clean formatting
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-gray-400" />
                    Stored history + re-download anytime
                  </li>
                </ul>
              </div>

              <p className="text-xs text-gray-500">
                Redirect after login:{" "}
                <span className="font-medium text-gray-700">{nextPath}</span>
              </p>

              {/* Optional: helpful debug line (remove anytime) */}
              <p className="text-[10px] text-gray-400">
                Callback base:{" "}
                <span className="font-medium">{baseUrl || "(window origin)"}</span>
              </p>
            </div>
          </div>
        </section>

        <section className="w-full md:w-1/2">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div>
              <div className="text-sm font-semibold">Magic link</div>
              <div className="mt-1 text-xs text-gray-500">
                We’ll email you a secure sign-in link.
              </div>
            </div>

            <div className="mt-5">
              <label className="text-xs font-medium text-gray-700">Email</label>
              <input
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-gray-900"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                inputMode="email"
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <button
              className="mt-4 w-full rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
              onClick={sendMagicLink}
              disabled={loading || isCooldownActive}
              type="button"
            >
              {loading
                ? "Sending…"
                : isCooldownActive
                ? `Resend in ${secondsLeft}s`
                : "Send magic link"}
            </button>

            {isCooldownActive && !loading && (
              <p className="mt-2 text-xs text-gray-500">
                Please wait for the timer before requesting another link.
              </p>
            )}

            {status && (
              <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3">
                <p className="text-sm text-gray-700">{status}</p>
              </div>
            )}

            <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-medium text-gray-700">Trouble?</div>
              <p className="mt-1 text-xs text-gray-600">
                If you don’t see the email, check spam/junk and try again. Some providers delay
                delivery briefly. Also make sure you open the magic link in the same browser you
                used to request it.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-gray-500">
          © {new Date().getFullYear()} ConvertMyEmail • Secure authentication powered by Supabase
        </div>
      </footer>
    </div>
  );
}