"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase/browser";

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export default function LoginClient() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [isSending, setIsSending] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  // Get redirect path (default to /app)
  const nextPath = searchParams.get("next") || "/app";

  // Surface callback errors from /login?error=...
  const callbackError = searchParams.get("error");

  const baseURL = useMemo(() => {
    // Prefer browser origin in client-side code (least error-prone).
    // Only fall back to env if window is unavailable (rare here).
    if (typeof window !== "undefined") return window.location.origin;

    const env = process.env.NEXT_PUBLIC_SITE_URL;
    if (env) return env.replace(/\/$/, "");

    return "http://localhost:3000";
  }, []);

  // 🔐 Redirect if already logged in (with self-heal)
  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;

        if (data.session) {
          router.push(nextPath);
          return;
        }
      } catch (e: any) {
        // If refresh token is missing/stale, reset local auth state
        const msg = String(e?.message || "");
        if (msg.toLowerCase().includes("refresh token")) {
          await supabase.auth.signOut();
        }
      }
    };

    run();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.push(nextPath);
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [router, nextPath]);

  // Show callback error once
  useEffect(() => {
    if (!callbackError) return;

    // Map common errors to friendlier messaging
    if (callbackError === "auth_callback_failed") {
      setMessage(
        "Login link could not be verified. Please request a new magic link."
      );
    } else {
      setMessage(`Login error: ${callbackError}`);
    }
  }, [callbackError]);

  // ⏳ Countdown timer effect
  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  const sendMagicLink = async () => {
    if (isSending || cooldown > 0) return;

    const trimmed = email.trim();

    if (!isValidEmail(trimmed)) {
      setMessage("Please enter a valid email address.");
      return;
    }

    setMessage("");
    setIsSending(true);

    const emailRedirectTo = `${baseURL}/auth/callback?next=${encodeURIComponent(
      nextPath
    )}`;

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo },
    });

    setIsSending(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Check your email for a secure login link.");
    setCooldown(45);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black px-6">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-950 p-6 shadow">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Secure login
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Passwordless access. We’ll email you a secure link.
        </p>

        <label className="mt-5 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          Email
        </label>
        <input
          className="mt-2 w-full rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black px-4 py-3 text-black dark:text-zinc-50 outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10"
          type="email"
          placeholder="you@domain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />

        <button
          disabled={isSending || cooldown > 0}
          className="mt-4 w-full rounded-xl bg-black text-white dark:bg-white dark:text-black py-3 font-medium disabled:opacity-60"
          onClick={sendMagicLink}
          type="button"
        >
          {cooldown > 0
            ? `Try again in ${cooldown}s`
            : isSending
            ? "Sending…"
            : "Send secure login link"}
        </button>

        {message && (
          <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">
            {message}
          </p>
        )}

        <p className="mt-4 text-xs text-zinc-500">
          Having trouble? Request a new link and try again.
        </p>
      </div>
    </div>
  );
}