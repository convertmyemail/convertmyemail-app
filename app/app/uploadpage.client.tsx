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

type CheckoutPlan = "starter" | "pro" | "business";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function readNumber(obj: Record<string, unknown> | null, key: string): number | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === "number" ? v : null;
}

function readString(obj: Record<string, unknown> | null, key: string): string | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function UploadPageClient({ usage }: { usage: UsageInfo }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // App shell (client-side usage + checkout helpers)
  const { usage: shellUsage, usageLoading, isPro, refreshUsage, startCheckout } = useAppShell();

  // Prefer freshest usage from shell once it loads; fallback to server-passed usage
  const effectiveUsage = (shellUsage ?? usage) as unknown;
  const usageObj = asRecord(effectiveUsage);

  // Normalize usage fields (app shell type vs server type)
  const usageUsed =
    readNumber(usageObj, "used") ??
    readNumber(usageObj, "usage_used") ??
    readNumber(usageObj, "used_count") ??
    0;

  const usageRemainingRaw =
    (usageObj && usageObj["remaining"] === null ? null : readNumber(usageObj, "remaining")) ??
    readNumber(usageObj, "usage_remaining") ??
    readNumber(usageObj, "remaining_count");

  const usageLimit =
    readNumber(usageObj, "limit") ??
    readNumber(usageObj, "free_limit") ??
    readNumber(usageObj, "freeLimit") ??
    FREE_LIMIT_FALLBACK;

  const usageRemaining =
    usageRemainingRaw === null ? null : typeof usageRemainingRaw === "number" ? usageRemainingRaw : 0;

  const [files, setFiles] = useState<FileList | null>(null);
  const [status, setStatus] = useState<string>("");

  // Upgrade modal
  const [limitModal, setLimitModal] = useState<LimitModalState>({ open: false });
  const [loadingPlan, setLoadingPlan] = useState<CheckoutPlan | null>(null);

  const openLimitModal = (opts?: Partial<LimitModalState>) => {
    setLimitModal({
      open: true,
      used: opts?.used ?? usageUsed,
      limit: opts?.limit ?? usageLimit,
      message:
        opts?.message ??
        "Your free plan limit has been reached. Upgrade to keep converting instantly — no waiting until next month.",
    });
  };

  const closeLimitModal = () => {
    setLimitModal({ open: false });
    setLoadingPlan(null);
  };

  const handleUpgrade = async (plan: CheckoutPlan) => {
    try {
      setLoadingPlan(plan);
      await Promise.resolve(startCheckout(plan));
      // If startCheckout redirects, code may never reach here — that’s OK.
    } catch (e) {
      // Don’t lock the UI on error
      setLoadingPlan(null);
    }
  };

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
      const json: unknown = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = readString(asRecord(json), "error") ?? "Failed to load history";
        throw new Error(msg);
      }

      const j = asRecord(json);
      const conversions =
        j && Array.isArray(j["conversions"]) ? (j["conversions"] as Conversion[]) : [];
      setHistory(conversions);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load history";
      setHistoryError(msg);
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
        const j: unknown = await res.json().catch(() => null);
        msg = readString(asRecord(j), "error") ?? msg;
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Download failed";
      setHistoryError(msg);
    } finally {
      setDownloadingKey(null);
    }
  };

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  // Auto-start checkout on /app?plan=pro (deep-link)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const planKey = (sp.get("plan") || "").trim().toLowerCase();
    if (planKey !== "starter" && planKey !== "pro" && planKey !== "business") return;

    startCheckout(planKey as CheckoutPlan);
  }, [startCheckout]);

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
        const maybeJson: unknown = await res.json().catch(() => null);
        const j = asRecord(maybeJson);

        const code = readString(j, "code") ?? "";
        const errStr = readString(j, "error") ?? "";
        const messageStr = readString(j, "message") ?? "";

        // 402 + FREE_LIMIT_REACHED / LIMIT_REACHED => open modal
        const isLimit =
          res.status === 402 &&
          (code === "FREE_LIMIT_REACHED" || code === "LIMIT_REACHED" || /limit/i.test(errStr));

        if (isLimit) {
          usedFromServer = readNumber(j, "used") ?? undefined;

          limitFromServer = readNumber(j, "free_limit") ?? readNumber(j, "limit") ?? undefined;

          openLimitModal({
            used: usedFromServer,
            limit: limitFromServer,
            message: messageStr || errStr || undefined,
          });

          msg =
            `Free limit reached. ` +
            (typeof usedFromServer === "number" && typeof limitFromServer === "number"
              ? `You’ve used ${usedFromServer}/${limitFromServer} free conversions. `
              : "") +
            `Upgrade to continue.`;
        } else if (errStr) {
          msg = errStr;
        } else if (maybeJson) {
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
      {/* Upgrade Modal (UPDATED UI) */}
      {limitModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Upgrade required"
        >
          <button
            className="absolute inset-0 bg-black/50"
            onClick={closeLimitModal}
            aria-label="Close modal"
            type="button"
          />

          <div className="relative w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-semibold text-gray-900">⚡ Monthly limit reached</div>
                <div className="mt-1 text-sm text-gray-600">
                  {limitModal.message ||
                    "Your free plan limit has been reached. Upgrade to keep converting instantly — no waiting until next month."}
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

            {/* Usage pill */}
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between gap-3 text-sm text-gray-700">
                <span className="font-medium">This month</span>
                <span className="font-semibold">
                  {typeof limitModal.used === "number" ? limitModal.used : usageUsed} /{" "}
                  {typeof limitModal.limit === "number" ? limitModal.limit : usageLimit} used
                </span>
              </div>

              <div className="mt-3 h-2 w-full overflow-hidden rounded-full border border-gray-200 bg-white">
                <div
                  className="h-full bg-gray-900"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        ((Number(typeof limitModal.used === "number" ? limitModal.used : usageUsed) /
                          Math.max(
                            1,
                            Number(typeof limitModal.limit === "number" ? limitModal.limit : usageLimit)
                          )) *
                          100)
                      )
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Plan selector */}
            <div className="mt-5 grid gap-3">
              {/* Starter */}
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-gray-900">Starter</div>
                    <div className="mt-1 text-sm text-gray-600">20 conversions per month</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-gray-900">$9/mo</div>
                    <div className="text-xs text-gray-500">Cancel anytime</div>
                  </div>
                </div>

                <button
                  className={cn(
                    "mt-4 w-full rounded-xl px-4 py-2 text-sm font-semibold transition",
                    loadingPlan
                      ? "bg-gray-100 text-gray-500"
                      : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                  )}
                  onClick={() => handleUpgrade("starter")}
                  disabled={!!loadingPlan}
                  type="button"
                >
                  {loadingPlan === "starter" ? "Redirecting…" : "Upgrade to Starter"}
                </button>
              </div>

              {/* Pro (Most popular) */}
              <div className="rounded-2xl border border-gray-900 bg-gray-900/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="text-base font-semibold text-gray-900">Pro</div>
                      <span className="rounded-full bg-gray-900 px-2 py-0.5 text-xs font-medium text-white">
                        Most popular
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-gray-600">75 conversions per month</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-gray-900">$19/mo</div>
                    <div className="text-xs text-gray-500">Cancel anytime</div>
                  </div>
                </div>

                <button
                  className={cn(
                    "mt-4 w-full rounded-xl px-4 py-2 text-sm font-semibold transition",
                    loadingPlan
                      ? "bg-gray-900/60 text-white"
                      : "bg-gray-900 text-white hover:bg-black"
                  )}
                  onClick={() => handleUpgrade("pro")}
                  disabled={!!loadingPlan}
                  type="button"
                >
                  {loadingPlan === "pro" ? "Redirecting…" : "Upgrade to Pro"}
                </button>
              </div>

              {/* Business */}
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-gray-900">Business</div>
                    <div className="mt-1 text-sm text-gray-600">Unlimited conversions</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-gray-900">$39/mo</div>
                    <div className="text-xs text-gray-500">Cancel anytime</div>
                  </div>
                </div>

                <button
                  className={cn(
                    "mt-4 w-full rounded-xl px-4 py-2 text-sm font-semibold transition",
                    loadingPlan
                      ? "bg-gray-100 text-gray-500"
                      : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                  )}
                  onClick={() => handleUpgrade("business")}
                  disabled={!!loadingPlan}
                  type="button"
                >
                  {loadingPlan === "business" ? "Redirecting…" : "Upgrade to Business"}
                </button>
              </div>
            </div>

            {/* De-emphasized close */}
            <div className="mt-5 text-center">
              <button
                className="text-sm text-gray-500 hover:text-gray-700"
                onClick={closeLimitModal}
                type="button"
              >
                Not now
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

            {/* Convert to Excel */}
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

        {/* ...rest of your file remains unchanged... */}

        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept=".eml,message/rfc822"
          multiple
          onChange={(e) => setFiles(e.target.files)}
        />

        {/* Keep the rest of your component exactly as-is */}
        {/* (history table, status, download, etc.) */}
      </section>

      {/* Your history section remains unchanged below */}
    </>
  );
}