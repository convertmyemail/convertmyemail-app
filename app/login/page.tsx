"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = useMemo(() => {
    const n = searchParams?.get("next");
    // keep it simple + safe: only allow relative next
    if (!n || !n.startsWith("/")) return "/app";
    return n;
  }, [searchParams]);

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // If already logged in, bounce to app
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.push(nextPath);
    });
  }, [router, nextPath]);

  const sendMagicLink = async () => {
    setStatus("");
    const trimmed = email.trim();

    if (!trimmed) {
      setStatus("Please enter your email address.");
      return;
    }

    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
        nextPath
      )}`;

      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) throw error;

      setStatus("Magic link sent. Check your email to sign in.");
    } catch (e: any) {
      setStatus(e?.message || "Failed to send magic link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Top bar (matches your app vibe) */}
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
        {/* Left “brand” panel */}
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
                Tip: Use the same email each time — we’ll keep your history under one account.
              </p>
            </div>
          </div>
        </section>

        {/* Right sign-in card */}
        <section className="w-full md:w-1/2">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold">Magic link</div>
                <div className="mt-1 text-xs text-gray-500">
                  We’ll email you a secure sign-in link.
                </div>
              </div>

              <div className="hidden rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 md:block">
                Redirect after login: <span className="font-medium text-gray-700">{nextPath}</span>
              </div>
            </div>

            <div className="mt-5">
              <label className="text-xs font-medium text-gray-700">Email</label>
              <input
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none ring-0 placeholder:text-gray-400 focus:border-gray-900"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                inputMode="email"
                autoComplete="email"
              />
            </div>

            <button
              className="mt-4 w-full rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
              onClick={sendMagicLink}
              disabled={loading}
              type="button"
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>

            {status && (
              <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3">
                <p className="text-sm text-gray-700">{status}</p>
              </div>
            )}

            <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-medium text-gray-700">Trouble?</div>
              <p className="mt-1 text-xs text-gray-600">
                If you don’t see the email, check spam/junk and try again. Some providers delay
                delivery by a minute or two.
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