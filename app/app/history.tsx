"use client";

import { useEffect, useState } from "react";

type Conversion = {
  id: string;
  original_filename: string | null;
  created_at: string;
  csv_path: string | null;
};

type HistoryResponse = {
  conversions: Conversion[];
};

type DownloadResponse = {
  url: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

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
      const json: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const msg =
          isRecord(json) && typeof json.error === "string"
            ? json.error
            : "Failed to load history";
        throw new Error(msg);
      }

      const payload = (isRecord(json) ? (json as Partial<HistoryResponse>) : null) ?? null;
      const conversions = Array.isArray(payload?.conversions) ? payload!.conversions : [];

      setItems(conversions);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load history";
      setError(msg);
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

      const json: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const msg =
          isRecord(json) && typeof json.error === "string"
            ? json.error
            : "Failed to create download link";
        throw new Error(msg);
      }

      const url =
        isRecord(json) && typeof json.url === "string"
          ? json.url
          : (isRecord(json) &&
              isRecord((json as Record<string, unknown>)["data"]) &&
              typeof ((json as Record<string, unknown>)["data"] as Record<string, unknown>)["url"] ===
                "string"
            ? (((json as Record<string, unknown>)["data"] as Record<string, unknown>)["url"] as string)
            : null);

      if (!url) throw new Error("Missing download URL");

      window.location.href = (json as DownloadResponse).url ?? url;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Download failed";
      setError(msg);
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

      {error && <div style={{ marginTop: 12, color: "crimson" }}>{error}</div>}

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