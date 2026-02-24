"use client";

import { useEffect, useState } from "react";

type Conversion = {
  id: string;
  original_filename: string | null;
  created_at: string;
  csv_path: string | null;
};

export default function ConversionHistory() {
  const [items, setItems] = useState<Conversion[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/history", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load history");
      setItems(json.conversions || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load history");
    } finally {
      setLoading(false);
    }
  }

  async function downloadCsv(conversion: Conversion) {
    if (!conversion.csv_path) return;
    setDownloadingId(conversion.id);
    setError(null);
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: conversion.csv_path }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to create download link");
      window.location.href = json.url;
    } catch (e: any) {
      setError(e?.message || "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Conversion History</h2>
        <button onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ marginTop: 12, color: "crimson" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ marginTop: 12 }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ marginTop: 12 }}>No conversions yet.</div>
      ) : (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table cellPadding={10} style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #333" }}>
                <th>File</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid #222" }}>
                  <td>{c.original_filename || "(unnamed)"}</td>
                  <td>{new Date(c.created_at).toLocaleString()}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      onClick={() => downloadCsv(c)}
                      disabled={!c.csv_path || downloadingId === c.id}
                    >
                      {downloadingId === c.id ? "Preparing…" : "Download CSV"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}