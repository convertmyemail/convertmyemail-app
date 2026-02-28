"use client";

import Link from "next/link";
import { useAppShell } from "../app/app-shell.client";

export default function PlanBadge() {
  const { usage, usageLoading, isPro } = useAppShell();

  const showUsage = !!usage && !usageLoading;

  if (!showUsage) {
    return (
      <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-700">
        …
      </span>
    );
  }

  const plan = String(usage?.plan || "Free");
  const remaining = usage?.remaining;

  return (
    <Link
      href="/app/billing"
      title="View billing & plan"
      className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-900 hover:bg-gray-50"
    >
      <span
        className={[
          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border",
          isPro
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-yellow-200 bg-yellow-50 text-yellow-800",
        ].join(" ")}
      >
        {plan.toUpperCase()}
      </span>

      {!isPro && typeof remaining === "number" && (
        <span className="text-xs text-gray-700">
          {remaining} left
        </span>
      )}

      {isPro && <span className="text-xs text-gray-500">Unlimited</span>}
    </Link>
  );
}