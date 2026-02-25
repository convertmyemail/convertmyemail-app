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
};

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<FileList | null>(null);
  const [status, setStatus] = useState<string>("");

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

  const downloadPath = async (
    id: string,
    path: string,
    label: "xlsx" | "csv" | "pdf"
  ) => {
    if (!path) return;

    const key = `${id}:${label}`;
    setDownloadingKey(key);
    setHistoryError("");

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to create download link");

      window.location.href = json.url;
    } catch (e: any) {
      setHistoryError(e?.message || "Download failed");
    } finally {
      setDownloadingKey(null);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const upload = async () => {
    if (!files || files.length === 0) {
      setStatus("Please select one or more .eml files.");
      return;
    }

    setStatus("Uploading and converting…");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setStatus("Error: Not logged in. Please log in again.");
      return;
    }

    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));

    const res = await fetch("/api/convert-eml", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text();
      setStatus(`Error: ${text}`);
      return;
    }

    // Download XLSX (new behavior)
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "converted-emails.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    setStatus(`Done. Converted ${files.length} file(s).`);
    loadHistory();
  };

  const selectedCount = files?.length ?? 0;

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
              <div>
                <div className="text-sm font-semibold">Dashboard</div>
                <div className="text-xs text-gray-500">
                  Convert email files into clean records for storage or submission.
                </div>
              </div>

              <div className="flex items-center gap-2">
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
                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
                    onClick={upload}
                    disabled={!files || files.length === 0}
                    type="button"
                  >
                    Convert to Excel (XLSX)
                  </button>
                </div>
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept=".eml,message/rfc822"
                multiple
                onChange={(e) => setFiles(e.target.files)}
              />

              {/* File list / Empty state */}
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

              {/* Status */}
              {status && (
                <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3">
                  <p className="text-sm text-gray-700">{status}</p>
                </div>
              )}

              {/* Note for your audience */}
              <p className="mt-4 text-xs text-gray-500">
                Tip: This is designed for clean storage, audit trails, and review workflows.
              </p>
            </section>

            {/* History */}
            <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Conversion history</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Download previously generated files.
                  </p>
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
                        <th className="py-3 pr-3 font-medium">Formats</th>
                        <th className="py-3 text-right font-medium">Download</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {history.map((c) => {
                        const sheetKey = `${c.id}:sheet`;
                        const pdfKey = `${c.id}:pdf`;

                        const sheetLabel: "xlsx" | "csv" = c.xlsx_path ? "xlsx" : "csv";

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
                                    c.sheet_path && downloadPath(c.id, c.sheet_path, sheetLabel)
                                  }
                                  disabled={!c.sheet_path || downloadingKey === sheetKey}
                                  type="button"
                                >
                                  {downloadingKey === sheetKey ? "Preparing…" : "Excel"}
                                </button>

                                <button
                                  className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
                                  onClick={() => c.pdf_path && downloadPath(c.id, c.pdf_path, "pdf")}
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