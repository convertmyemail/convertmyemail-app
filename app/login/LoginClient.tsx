"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/browser";

function friendlyCallbackError(err: string | null): string | null {
  if (!err) return null;
  if (err === "auth_callback_failed") {
    return "Login link could not be verified. Please request a new magic link.";
  }
  return "Login failed. Please request a new magic link.";
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const callbackError = searchParams.get("error");
  const callbackMessage = useMemo(
    () => friendlyCallbackError(callbackError),
    [callbackError]
  );

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string>("");

  const effectiveMessage = callbackMessage ?? message;

  const sendMagicLink = async () => {
    setMessage("");

    const trimmed = email.trim();
    if (!trimmed) {
      setMessage("Please enter your email.");
      return;
    }

    const next = searchParams.get("next") || "/app";
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Check your email for the login link.");
  };

  const goToApp = () => router.push("/app");

  return (
    <div className="mx-auto max-w-md px-6 py-10">
      <h1 className="text-xl font-semibold text-gray-900">Log in</h1>
      <p className="mt-1 text-sm text-gray-600">We’ll email you a magic link.</p>

      <div className="mt-6 space-y-3">
        <label className="block text-sm font-medium text-gray-700" htmlFor="email">
          Email
        </label>

        <input
          id="email"
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@domain.com"
          type="email"
          autoComplete="email"
        />

        <button
          className="w-full rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
          onClick={sendMagicLink}
          type="button"
        >
          Send magic link
        </button>

        <button
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          onClick={goToApp}
          type="button"
        >
          Go to app
        </button>

        {effectiveMessage && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            {effectiveMessage}
          </div>
        )}
      </div>
    </div>
  );
}