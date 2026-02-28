"use client";

import { useAppShell } from "../app/app-shell.client";

export default function UsageCounter() {
  const { usage, usageLoading, isPro } = useAppShell();

  if (usageLoading || !usage) return null;

  if (isPro || usage.remaining === null) {
    return (
      <div className="text-sm text-slate-500">
        Unlimited conversions
      </div>
    );
  }

  return (
    <div className="text-sm text-slate-500">
      {usage.used} used —{" "}
      <span className="font-semibold">{usage.remaining} left</span>
    </div>
  );
}