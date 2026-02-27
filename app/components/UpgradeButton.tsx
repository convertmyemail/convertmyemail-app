"use client";

import { useState } from "react";

export default function UpgradeButton() {
  const [loading, setLoading] = useState(false);

  const onUpgrade = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/create-checkout-session", { method: "POST" });
      const json = await res.json();
      if (json?.url) {
        window.location.href = json.url;
        return;
      }
      alert("Unable to start checkout. Please try again.");
      console.error(json);
    } catch (e) {
      console.error(e);
      alert("Unable to start checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={onUpgrade}
      disabled={loading}
      className="px-3 py-1 rounded-md border text-sm font-semibold hover:shadow-sm disabled:opacity-60"
    >
      {loading ? "Redirecting…" : "Upgrade"}
    </button>
  );
}