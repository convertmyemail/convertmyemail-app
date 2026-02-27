// app/app/account/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/browser";

export const dynamic = "force-dynamic";

type UserInfo = {
  id: string;
  email: string | null;
  created_at: string | null;
};

export default function AccountPage() {
  const router = useRouter();

  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data?.user) {
          setUser(null);
          return;
        }

        setUser({
          id: data.user.id,
          email: data.user.email ?? null,
          created_at: (data.user as any)?.created_at ?? null,
        });
      } catch (e) {
        console.error("account load error", e);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const signOut = async () => {
    setStatus("");
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`${label} copied`);
      setTimeout(() => setStatus(""), 1500);
    } catch {
      setStatus("Copy failed");
      setTimeout(() => setStatus(""), 1500);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Account</h1>
        <p className="mt-1 text-sm text-gray-600">
          View your account details and manage your session.
        </p>

        {loading ? (
          <p className="mt-6 text-sm text-gray-500">Loading account…</p>
        ) : !user ? (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <div className="text-sm font-medium text-gray-900">Not signed in</div>
            <div className="mt-1 text-sm text-gray-600">
              Please log in to view your account details.
            </div>

            <button
              className="mt-4 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
              onClick={() => router.push("/login")}
              type="button"
            >
              Go to login
            </button>
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 p-6">
                <div className="text-xs font-medium text-gray-500">Email</div>
                <div className="mt-1 text-sm font-semibold text-gray-900 break-all">
                  {user.email || "(no email)"}
                </div>

                {user.email && (
                  <button
                    className="mt-3 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50"
                    onClick={() => copy(user.email!, "Email")}
                    type="button"
                  >
                    Copy email
                  </button>
                )}
              </div>

              <div className="rounded-2xl border border-gray-200 p-6">
                <div className="text-xs font-medium text-gray-500">User ID</div>
                <div className="mt-1 text-sm font-semibold text-gray-900 break-all">
                  {user.id}
                </div>

                <button
                  className="mt-3 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50"
                  onClick={() => copy(user.id, "User ID")}
                  type="button"
                >
                  Copy user id
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50"
                onClick={() => router.push("/app")}
                type="button"
              >
                Back to dashboard
              </button>

              <button
                className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
                onClick={signOut}
                type="button"
              >
                Sign out
              </button>
            </div>

            {status && (
              <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                {status}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}