"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase/browser";

export default function LoginClient() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get redirect path (default to /app)
  const nextPath = searchParams.get("next") || "/app";

  // 🔐 Redirect if already logged in
  useEffect(() => {
    // Check existing session
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.push(nextPath);
      }
    });

    // Listen for login event (after magic link click)
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

  const sendMagicLink = async () => {
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // preserve ?next= all the way through callback
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          nextPath
        )}`,
      },
    });

    setMessage(error ? error.message : "Check your email for the magic link!");
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
          className="mt-4 w-full rounded-xl bg-black text-white dark:bg-white dark:text-black py-3 font-medium"
          onClick={sendMagicLink}
        >
          Send Magic Link
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