"use client";

import { useEffect, useState } from "react";

type UsageResp = {
  plan: "Free" | "Pro";
  used: number;
  remaining: number | null;
  free_limit: number;
};

export default function PlanBadge() {
  const [data, setData] = useState<UsageResp | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/usage")
      .then((r) => r.json())
      .then((d) => {
        if (mounted && !d?.error) setData(d);
      })
      .catch((e) => console.error("usage fetch error", e));
    return () => {
      mounted = false;
    };
  }, []);

  if (!data) return null;

  const isFree = data.plan === "Free";

  return (
    <div className="flex items-center gap-3">
      <span
        className={`px-2 py-1 text-xs font-semibold rounded-full ${
          isFree ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"
        }`}
      >
        {data.plan}
      </span>

      {isFree && (
        <div className="text-xs text-slate-500">
          <span className="font-medium">{data.used}</span>
          <span className="ml-1 text-[11px]">/ {data.free_limit} free</span>
        </div>
      )}
    </div>
  );
}