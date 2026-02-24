"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase/browser";

export default function LoginClient() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [isSending, setIsSending] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  // Get redirect path (default to /app)
  const nextPath = searchParams.get("next") || "/app";

  // Determine correct base URL (production-safe)
  const getBaseURL = () => {
    if (process.env.NEXT_PUBLIC_SITE_URL) {
      return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
    }

    if (typeof window !== "undefined") {
      return window.location.origin;
    }

    return "http://localhost:3000";
  };

  // 🔐 Redirect if already logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.push(nextPath);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          router.push(nextPath);
        }
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [router, nextPath]);

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

    setMessage("");
    setIsSending(true);

    const baseURL = getBaseURL();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${baseURL}/auth/callback?next=${encodeURIComponent(
          nextPath
        )}`,
      },
    });

    setIsSending(false);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Check your email for the magic link!");
    }

    // 🔒 Start 45-second cooldown
    setCooldown(45);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black px-6">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-950 p-6 shadow">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Login
        </h1>

        <input
          className="mt-4 w-full rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black px-4 py-3 text-black dark:text-zinc-50"
          type="email"
          placeholder="you@domain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <button
          disabled={isSending || cooldown > 0}
          className="mt-4 w-full rounded-xl bg-black text-white dark:bg-white dark:text-black py-3 font-medium disabled:opacity-60"
          onClick={sendMagicLink}
        >
          {cooldown > 0
            ? `Try again in ${cooldown}s`
            : isSending
            ? "Sending..."
            : "Send Magic Link"}
        </button>

        {message && (
          <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}