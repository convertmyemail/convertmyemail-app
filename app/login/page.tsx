import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black px-6">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-950 p-6 shadow">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">Loading…</p>
          </div>
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}