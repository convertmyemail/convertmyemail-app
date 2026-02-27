"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/browser";

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

type Usage = {
  plan: "Free" | "Pro" | string;
  used: number;
  remaining: number | null;
  free_limit: number;
};

export default function UploadPageClient({ plan }: { plan: string | null }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Prevent duplicate Stripe redirect attempts
  const checkoutStartedRef = useRef(false);

  const [files, setFiles] = useState<FileList | null>(null);
  const [status, setStatus] = useState<string>("");

  // Usage / plan (from /api/usage)
  const [usage, setUsage] = useState<Usage | null>(null);
  const [usageLoading, setUsageLoading] = useState<boolean>(true);

  // History
  const [history, setHistory] = useState<Conversion[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(true);
  const [historyError, setHistoryError] = useState<string>("");
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const pickFiles = () => fileInputRef.current?.click();

  const logout = async () => {
    setStatus("");
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const loadUsage = async () => {
    setUsageLoading(true);
    try {
      const res = await fetch("/api/usage", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load usage");
      setUsage(json as Usage);
    } catch (e) {
      // Don't block UI if this fails — just hide usage.
      console.error("usage load error", e);
      setUsage(null);
    } finally {
      setUsageLoading(false);
    }
  };

  const startCheckout = async (priceKey: "starter" | "pro") => {
    if (checkoutStartedRef.current) return;
    checkoutStartedRef.current = true;

    try {
      setStatus("Redirecting to secure checkout…");

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceKey }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not start checkout");

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      throw new Error("Missing checkout URL");
    } catch (e: any) {
      checkoutStartedRef.current = false; // allow retry if it failed
      setStatus(e?.message || "Checkout error.");
    }
  };

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
  const downloadConversionFile = async (
    id: string,
    kind: "pdf" | "sheet" | "xlsx" | "csv"
  ) => {
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

  // Load history + usage on mount
  useEffect(() => {
    loadHistory();
    loadUsage();
  }, []);

  // ✅ Auto-start Stripe Checkout if plan is present (passed from server wrapper)
  useEffect(() => {
    const planKey = (plan || "").trim().toLowerCase();
    if (planKey !== "starter" && planKey !== "pro") return;

    // This handles the "plan=pro" deep-link behavior you already built.
    startCheckout(planKey as "starter" | "pro");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

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

    // Handle free limit block (403) with a friendly message + CTA
    if (!res.ok) {
      let msg = "Conversion failed.";
      try {
        const maybeJson = await res.json();
        if (maybeJson?.error) {
          // if API returns structured limit response
          if (res.status === 403 && /limit/i.test(String(maybeJson.error))) {
            const used = maybeJson?.used;
            const remaining = maybeJson?.remaining;
            const freeLimit = maybeJson?.free_limit;
            msg =
              `Free limit reached. ` +
              (typeof used === "number" && typeof freeLimit === "number"
                ? `You’ve used ${used}/${freeLimit} free conversions. `
                : "") +
              `Upgrade to continue.`;
          } else {
            msg = maybeJson.error;
          }
        } else {
          msg = JSON.stringify(maybeJson);
        }
      } catch {
        // fallback to text
        const text = await res.text().catch(() => "");
        if (text) msg = text;
      }

      setStatus(`Error: ${msg}`);

      // refresh usage so the counter updates even after a blocked attempt
      loadUsage();
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

    // update UI
    loadHistory();
    loadUsage();
  };

  const selectedCount = files?.length ?? 0;

  const normalizedPlan = String(usage?.plan || "Free").toLowerCase();
  const isPro = normalizedPlan === "pro" || normalizedPlan === "starter"; // if you call starter paid, treat as paid here
  const showUsage = usage && !usageLoading;

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden w-64 border-r border-gray-200 bg-white md:flex md:flex-col">
          <div className="px-6 py-5">
            <div className="text-sm font-semibold tracking-tight">Convert My Email</div>
            <div className="mt-1 text-xs text-gray-500">Professional conversions</div>
          </div>

          <nav className="px-3">
            <SidebarItem active>Dashboard</SidebarItem>
            <SidebarItem>Conversions</SidebarItem>
            <SidebarItem>Billing</SidebarItem>
            <SidebarItem>Account</SidebarItem>
          </nav>

          <div className="mt-auto p-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs font-medium text-gray-700">Output formats</div>
              <div className="mt-1 text-xs text-gray-600">Excel (.xlsx) • PDF</div>
            </div>

            <button
              className="mt-3 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
              onClick={logout}
              type="button"
            >
              Sign out
            </button>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1">
          {/* Topbar */}
          <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-sm font-semibold">Dashboard</div>

                  {/* ✅ Plan badge */}
                  {showUsage && (
                    <span
                      className={[
                        "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold border",
                        isPro
                          ? "border-green-200 bg-green-50 text-green-800"
                          : "border-yellow-200 bg-yellow-50 text-yellow-800",
                      ].join(" ")}
                      title="Your current plan"
                    >
                      {String(usage.plan || "Free")}
                    </span>
                  )}

                  {/* ✅ Subtle usage counter */}
                  {showUsage && !isPro && usage.remaining !== null && (
                    <span className="text-xs text-gray-500">
                      {usage.used} used —{" "}
                      <span className="font-semibold text-gray-800">{usage.remaining} left</span>
                    </span>
                  )}

                  {showUsage && isPro && (
                    <span className="text-xs text-gray-500">Unlimited conversions</span>
                  )}
                </div>

                <div className="mt-1 text-xs text-gray-500 truncate">
                  Convert email files into clean records for storage or submission.
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* ✅ Upgrade button inside dashboard */}
                {!isPro && (
                  <button
                    className="hidden sm:inline-flex rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black"
                    onClick={() => startCheckout("pro")}
                    type="button"
                  >
                    Upgrade
                  </button>
                )}

                <button
                  className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 md:hidden"
                  onClick={logout}
                  type="button"
                >
                  Sign out
                </button>

                <div className="hidden md:flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
                  <span className="text-xs text-gray-500">Selected</span>
                  <span className="text-xs font-semibold">{selectedCount}</span>
                </div>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-6 py-8">
            {/* Upload card */}
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h1 className="text-lg font-semibold">Upload email files</h1>
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

                  <button
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                    onClick={() => upload("xlsx")}
                    disabled={!files || files.length === 0}
                    type="button"
                  >
                    Convert to Excel
                  </button>

                  <button
                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
                    onClick={() => upload("pdf")}
                    disabled={!files || files.length === 0}
                    type="button"
                  >
                    Convert to PDF
                  </button>
                </div>
              </div>

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
                      <div className="text-sm font-medium text-gray-900">
                        {files.length} file(s) selected
                      </div>
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
                            <div className="text-xs text-gray-500">
                              {(file.size / 1024).toFixed(0)} KB
                            </div>
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

                    {/* If they hit the limit, show Upgrade CTA right there */}
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
                                <button
                                  className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                                  onClick={() =>
                                    c.sheet_path && downloadConversionFile(c.id, "sheet")
                                  }
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
          </main>
        </div>
      </div>
    </div>
  );
}

function SidebarItem({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-center rounded-xl px-3 py-2 text-sm font-medium",
        active
          ? "bg-gray-900 text-white"
          : "text-gray-700 hover:bg-gray-50 hover:text-gray-900",
      ].join(" ")}
    >
      {children}
    </div>
  );
}