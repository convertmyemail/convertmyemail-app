"use client";

import { useEffect, useState } from "react";

type UsageResp = {
  plan: "Free" | "Pro";
  used: number;
  remaining: number | null;
  free_limit: number;
};

export default function UsageCounter() {
  const [data, setData] = useState<UsageResp | null>(null);

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => r.json())
      .then((d) => {
        if (!d?.error) setData(d);
      })
      .catch(() => {});
  }, []);

  if (!data) return null;

  if (data.remaining === null) {
    return <div className="text-sm text-slate-500">Unlimited conversions</div>;
  }

  return (
    <div className="text-sm text-slate-500">
      {data.used} used — <span className="font-semibold">{data.remaining} left</span>
    </div>
  );
}