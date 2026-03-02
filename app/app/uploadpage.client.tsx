"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { useAppShell } from "./app-shell.client";

const FREE_LIMIT_FALLBACK = 3;

type Conversion = {
  id: string;
  original_filename: string | null;
  created_at: string;
  xlsx_path: string | null;
  csv_path: string | null;
  pdf_path: string | null;
  sheet_path: string | null; // preferred xlsx, fallback csv
  message_count?: number | null;
};

type UsageInfo =
  | {
      plan: "Pro";
      isPaid: true;
      used: number | null;
      remaining: null;
      limit: null;
      status: string;
    }
  | {
      plan: "Free";
      isPaid: false;
      used: number;
      remaining: number;
      limit: number;
      status: "free";
    };

type LimitModalState = {
  open: boolean;
  used?: number;
  limit?: number;
  message?: string;
};

export default function UploadPageClient({ usage }: { usage: UsageInfo }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // App shell (client-side usage + checkout helpers)
  const { usage: shellUsage, usageLoading, isPro, refreshUsage, startCheckout } = useAppShell();

  // Prefer freshest usage from shell once it loads; fallback to server-passed usage
  const effectiveUsage = shellUsage ?? usage;

  // Normalize usage fields (app shell type vs server type)
  const usageUsed =
    (effectiveUsage as any)?.used ??
    (effectiveUsage as any)?.usage_used ??
    (effectiveUsage as any)?.used_count ??
    0;

  const usageRemaining =
    (effectiveUsage as any)?.remaining ??
    (effectiveUsage as any)?.usage_remaining ??
    (effectiveUsage as any)?.remaining_count ??
    0;

  const usageLimit =
    (effectiveUsage as any)?.limit ??
    (effectiveUsage as any)?.free_limit ??
    (effectiveUsage as any)?.freeLimit ??
    FREE_LIMIT_FALLBACK;

  const [files, setFiles] = useState<FileList | null>(null);
  const [status, setStatus] = useState<string>("");

  // Upgrade modal
  const [limitModal, setLimitModal] = useState<LimitModalState>({ open: false });

  const openLimitModal = (opts?: Partial<LimitModalState>) => {
    setLimitModal({
      open: true,
      used: opts?.used ?? usageUsed,
      limit: opts?.limit ?? usageLimit,
      message:
        opts?.message ?? "You’ve reached the free plan limit. Upgrade to Pro to keep converting.",
    });
  };

  const closeLimitModal = () => setLimitModal({ open: false });

  // History
  const [history, setHistory] = useState<Conversion[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(true);
  const [historyError, setHistoryError] = useState<string>("");
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const pickFiles = () => fileInputRef.current?.click();

  const loadHistory = async () => {
    setHistoryLoading(true);
    setHistoryError("");

    try {
      const res = await fetch("/api/history", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load history");
      setHistory(Array.isArray(json?.conversions) ? json.conversions : []);
    } catch (e: any) {
      setHistoryError(e?.message || "Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  };

  // ✅ Download without leaving the site (same-origin blob)
  const downloadConversionFile = async (id: string, kind: "pdf" | "sheet" | "xlsx" | "csv") => {
    const key = `${id}:${kind}`;
    setDownloadingKey(key);
    setHistoryError("");

    try {
      const res = await fetch(
        `/api/download?id=${encodeURIComponent(id)}&kind=${encodeURIComponent(kind)}`,
        { method: "GET" }
      );

      if (!res.ok) {
        let msg = "Download failed";
        try {
          const j = await res.json();
          msg = j?.error || msg;
        } catch {}
        throw new Error(msg);
      }

      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename =
        match?.[1] ||
        (kind === "pdf"
          ? "email-records.pdf"
          : kind === "csv"
          ? "converted-emails.csv"
          : "converted-emails.xlsx");

      const blob = await res.blob();
      const objectUrl = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;

      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(objectUrl);
    } catch (e: any) {
      setHistoryError(e?.message || "Download failed");
    } finally {
      setDownloadingKey(null);
    }
  };

  // Load history on mount
  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-start checkout on /app?plan=pro (deep-link)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const planKey = (sp.get("plan") || "").trim().toLowerCase();
    if (planKey !== "starter" && planKey !== "pro") return;
    startCheckout(planKey as "starter" | "pro");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close modal with Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLimitModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const upload = async (format: "xlsx" | "pdf") => {
    if (!files || files.length === 0) {
      setStatus("Please select one or more .eml files.");
      return;
    }

    setStatus(`Uploading and converting to ${format.toUpperCase()}…`);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setStatus("Error: Not logged in. Please log in again.");
      return;
    }

    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));

    const res = await fetch(`/api/convert-eml?output=${format}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: formData,
    });

    if (!res.ok) {
      let msg = "Conversion failed.";
      let usedFromServer: number | undefined;
      let limitFromServer: number | undefined;

      try {
        const maybeJson = await res.json();

        // 402 + FREE_LIMIT_REACHED => open modal
        const isLimit =
          res.status === 402 &&
          (maybeJson?.code === "FREE_LIMIT_REACHED" ||
            /limit/i.test(String(maybeJson?.error || "")));

        if (isLimit) {
          usedFromServer = typeof maybeJson?.used === "number" ? maybeJson.used : undefined;
          limitFromServer =
            typeof maybeJson?.free_limit === "number"
              ? maybeJson.free_limit
              : typeof maybeJson?.limit === "number"
              ? maybeJson.limit
              : undefined;

          openLimitModal({
            used: usedFromServer,
            limit: limitFromServer,
            message: maybeJson?.message || maybeJson?.error,
          });

          msg =
            `Free limit reached. ` +
            (typeof usedFromServer === "number" && typeof limitFromServer === "number"
              ? `You’ve used ${usedFromServer}/${limitFromServer} free conversions. `
              : "") +
            `Upgrade to continue.`;
        } else if (maybeJson?.error) {
          msg = maybeJson.error;
        } else {
          msg = JSON.stringify(maybeJson);
        }
      } catch {
        const text = await res.text().catch(() => "");
        if (text) msg = text;
      }

      setStatus(`Error: ${msg}`);
      await refreshUsage();
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = format === "pdf" ? "email-records.pdf" : "converted-emails.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    setStatus(`Done. Converted ${files.length} file(s).`);

    await Promise.all([loadHistory(), refreshUsage()]);
  };

  const showUsage = !!effectiveUsage && !usageLoading;
  const limitHit = !isPro && typeof usageRemaining === "number" && usageRemaining <= 0;

  return (
    <>
      {/* Upgrade Modal */}
      {limitModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Upgrade required"
        >
          <button
            className="absolute inset-0 bg-black/40"
            onClick={closeLimitModal}
            aria-label="Close modal"
            type="button"
          />

          <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">Upgrade to keep converting</div>
                <div className="mt-1 text-sm text-gray-600">
                  {limitModal.message ||
                    "You’ve reached the free plan limit. Upgrade to Pro to keep converting."}
                </div>
              </div>

              <button
                className="rounded-xl border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
                onClick={closeLimitModal}
                type="button"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm text-gray-700">
                Free usage:{" "}
                <span className="font-semibold">
                  {typeof limitModal.used === "number" ? limitModal.used : usageUsed} /{" "}
                  {typeof limitModal.limit === "number" ? limitModal.limit : usageLimit}
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full border border-gray-200 bg-white">
                <div
                  className="h-full bg-gray-900"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        (((typeof limitModal.used === "number" ? limitModal.used : usageUsed) as number) /
                          Math.max(
                            1,
                            (typeof limitModal.limit === "number"
                              ? limitModal.limit
                              : usageLimit) as number
                          )) *
                          100
                      )
                    )}%`,
                  }}
                />
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
                onClick={closeLimitModal}
                type="button"
              >
                Not now
              </button>

              <button
                className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
                onClick={() => startCheckout("pro")}
                type="button"
              >
                Upgrade to Pro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload card */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold">Upload email files</h1>

              <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-900">
                {usageLoading ? "…" : isPro ? "PRO" : "FREE"}
              </span>

              {!usageLoading && !isPro && showUsage && usageRemaining !== null && (
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700">
                  {usageRemaining} / {usageLimit} left
                </span>
              )}

              {!usageLoading && isPro && (
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700">
                  Unlimited
                </span>
              )}
            </div>

            <p className="mt-1 text-sm text-gray-600">
              Select one or more <span className="font-medium">.eml</span> files. We’ll extract
              structured fields and generate downloadable records.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
              onClick={pickFiles}
              type="button"
            >
              Choose files
            </button>

            {/* ✅ Convert to Excel — NOW MATCHES PDF */}
            <button
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
              onClick={() => {
                if (limitHit) {
                  openLimitModal();
                  return;
                }
                upload("xlsx");
              }}
              disabled={!files || files.length === 0}
              type="button"
              title={limitHit ? "Free limit reached. Click to upgrade." : undefined}
            >
              Convert to Excel
            </button>

            {/* Convert to PDF */}
            <button
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
              onClick={() => {
                if (limitHit) {
                  openLimitModal();
                  return;
                }
                upload("pdf");
              }}
              disabled={!files || files.length === 0}
              type="button"
              title={limitHit ? "Free limit reached. Click to upgrade." : undefined}
            >
              Convert to PDF
            </button>
          </div>
        </div>

        {!isPro && showUsage && usageRemaining !== null && (
          <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900">Free plan usage</div>
                <div className="mt-1 text-sm text-gray-600">
                  {usageUsed} of {usageLimit} conversions used{" "}
                  <span className="font-medium">({usageRemaining} left)</span>
                </div>
              </div>

              <button
                className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black"
                onClick={() => startCheckout("pro")}
                type="button"
              >
                Upgrade
              </button>
            </div>

            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white border border-gray-200">
              <div
                className="h-full bg-gray-900"
                style={{
                  width: `${Math.min(100, Math.round((usageUsed / Math.max(1, usageLimit)) * 100))}%`,
                }}
              />
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept=".eml,message/rfc822"
          multiple
          onChange={(e) => setFiles(e.target.files)}
        />

        <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          {!files || files.length === 0 ? (
            <div className="flex flex-col gap-1">
              <div className="text-sm font-medium text-gray-900">No files selected</div>
              <div className="text-sm text-gray-600">
                Choose one or more .eml files to convert into structured records.
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-gray-900">{files.length} file(s) selected</div>
                <button
                  className="text-sm font-medium text-gray-700 hover:text-gray-900"
                  onClick={() => setFiles(null)}
                  type="button"
                >
                  Clear
                </button>
              </div>

              <div className="mt-3 max-h-44 overflow-y-auto rounded-xl border border-gray-200 bg-white p-3">
                {Array.from(files).map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                    className="flex items-center justify-between gap-3 border-b border-gray-100 py-2 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm text-gray-900" title={file.name}>
                        {file.name}
                      </div>
                      <div className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB</div>
                    </div>
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600">
                      .eml
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {status && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-700">{status}</p>

              {!isPro && /limit reached/i.test(status) && (
                <button
                  className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black"
                  onClick={() => startCheckout("pro")}
                  type="button"
                >
                  Upgrade
                </button>
              )}
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-gray-500">
          Tip: This is designed for clean storage, audit trails, and review workflows.
        </p>
      </section>

      {/* History */}
      <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Conversion history</h2>
            <p className="mt-1 text-sm text-gray-600">Download previously generated files.</p>
          </div>

          <button
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            onClick={loadHistory}
            disabled={historyLoading}
            type="button"
          >
            Refresh
          </button>
        </div>

        {historyError && <p className="mt-4 text-sm text-red-600">{historyError}</p>}

        {historyLoading ? (
          <p className="mt-4 text-sm text-gray-600">Loading…</p>
        ) : history.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <div className="text-sm font-medium text-gray-900">No conversions yet</div>
            <div className="mt-1 text-sm text-gray-600">
              Upload your first .eml file to generate a clean record.
            </div>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="py-3 pr-3 font-medium">File</th>
                  <th className="py-3 pr-3 font-medium">Converted</th>
                  <th className="py-3 pr-3 font-medium">Messages</th>
                  <th className="py-3 pr-3 font-medium">Formats</th>
                  <th className="py-3 text-right font-medium">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((c) => {
                  const sheetKey = `${c.id}:sheet`;
                  const pdfKey = `${c.id}:pdf`;
                  const count = c.message_count ?? 1;
                  const isThread = count > 1;

                  return (
                    <tr key={c.id} className="align-middle">
                      <td className="py-3 pr-3">
                        <div className="text-sm text-gray-900">
                          {c.original_filename || "(unnamed)"}
                        </div>
                        <div className="text-xs text-gray-500">ID: {c.id.slice(0, 8)}</div>
                      </td>

                      <td className="py-3 pr-3 text-gray-600">
                        {new Date(c.created_at).toLocaleString()}
                      </td>

                      <td className="py-3 pr-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {isThread && (
                            <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-900">
                              Thread
                            </span>
                          )}

                          <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
                            {count.toLocaleString()} {count === 1 ? "message" : "messages"}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 pr-3">
                        <div className="flex flex-wrap gap-2">
                          {c.xlsx_path && (
                            <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
                              XLSX
                            </span>
                          )}
                          {!c.xlsx_path && c.csv_path && (
                            <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
                              CSV
                            </span>
                          )}
                          {c.pdf_path && (
                            <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
                              PDF
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {/* ✅ History Excel button now matches PDF too */}
                          <button
                            className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
                            onClick={() => c.sheet_path && downloadConversionFile(c.id, "sheet")}
                            disabled={!c.sheet_path || downloadingKey === sheetKey}
                            type="button"
                          >
                            {downloadingKey === sheetKey ? "Preparing…" : "Excel"}
                          </button>

                          <button
                            className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
                            onClick={() => c.pdf_path && downloadConversionFile(c.id, "pdf")}
                            disabled={!c.pdf_path || downloadingKey === pdfKey}
                            type="button"
                          >
                            {downloadingKey === pdfKey ? "Preparing…" : "PDF"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <p className="mt-4 text-xs text-gray-500">
              PDFs are generated during conversion and stored alongside Excel exports.
            </p>
          </div>
        )}
      </section>
    </>
  );
}