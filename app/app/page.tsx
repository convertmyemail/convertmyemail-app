"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/browser";

type Conversion = {
  id: string;
  original_filename: string | null;
  created_at: string;
  csv_path: string | null;
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
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const pickFiles = () => {
    fileInputRef.current?.click();
  };

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

      if (!res.ok) {
        throw new Error(json?.error || "Failed to load history");
      }

      setHistory(Array.isArray(json?.conversions) ? json.conversions : []);
    } catch (e: any) {
      setHistoryError(e?.message || "Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const downloadFromHistory = async (c: Conversion) => {
    if (!c.csv_path) return;

    setDownloadingId(c.id);
    setHistoryError("");

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: c.csv_path }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to create download link");
      }

      window.location.href = json.url;
    } catch (e: any) {
      setHistoryError(e?.message || "Download failed");
    } finally {
      setDownloadingId(null);
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

    setStatus("Uploading and converting...");

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

    // Download CSV (keep existing behavior)
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "converted-emails.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    setStatus(`Done! Converted ${files.length} file(s).`);

    // Refresh history after a successful conversion
    loadHistory();
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black px-6 py-10">
      <div className="mx-auto w-full max-w-2xl rounded-2xl bg-white dark:bg-zinc-950 p-6 shadow">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
              Upload .eml files
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Select one or more .eml files. We’ll convert them into a CSV.
            </p>
          </div>

          <button
            className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black px-4 py-2 text-sm font-medium text-black dark:text-zinc-50 hover:opacity-90"
            onClick={logout}
            type="button"
          >
            Logout
          </button>
        </div>

        {/* Hidden file input (triggered by Upload button) */}
        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept=".eml,message/rfc822"
          multiple
          onChange={(e) => setFiles(e.target.files)}
        />

        <div className="mt-5 flex flex-col sm:flex-row gap-3">
          <button
            className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black px-5 py-3 text-sm font-medium text-black dark:text-zinc-50 hover:opacity-90"
            onClick={pickFiles}
            type="button"
          >
            Upload / Choose Files
          </button>

          <button
            className="rounded-xl bg-black text-white dark:bg-white dark:text-black px-5 py-3 text-sm font-medium disabled:opacity-50"
            onClick={upload}
            disabled={!files || files.length === 0}
            type="button"
          >
            Convert to CSV
          </button>
        </div>

        {/* File list */}
        <div className="mt-4">
          {!files || files.length === 0 ? (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              No files selected yet.
            </p>
          ) : (
            <>
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                {files.length} file(s) selected:
              </p>

              <div className="max-h-40 overflow-y-auto rounded-lg border border-black/10 dark:border-white/10 p-2 bg-zinc-50 dark:bg-zinc-900 text-xs">
                {Array.from(files).map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                    className="truncate text-zinc-700 dark:text-zinc-300 py-1"
                    title={file.name}
                  >
                    {file.name}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {status && (
          <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">
            {status}
          </p>
        )}

        {/* Conversion History */}
        <div className="mt-8 pt-6 border-t border-black/10 dark:border-white/10">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Conversion History
            </h2>
            <button
              className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black px-3 py-2 text-sm font-medium text-black dark:text-zinc-50 hover:opacity-90 disabled:opacity-50"
              onClick={loadHistory}
              disabled={historyLoading}
              type="button"
            >
              Refresh
            </button>
          </div>

          {historyError && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">
              {historyError}
            </p>
          )}

          {historyLoading ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              Loading…
            </p>
          ) : history.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              No conversions yet.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-zinc-600 dark:text-zinc-400 border-b border-black/10 dark:border-white/10">
                    <th className="py-2 pr-3">File</th>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 text-right"> </th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-black/5 dark:border-white/5"
                    >
                      <td className="py-2 pr-3 text-zinc-800 dark:text-zinc-200">
                        {c.original_filename || "(unnamed)"}
                      </td>
                      <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-400">
                        {new Date(c.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          className="rounded-xl bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium disabled:opacity-50"
                          onClick={() => downloadFromHistory(c)}
                          disabled={!c.csv_path || downloadingId === c.id}
                          type="button"
                        >
                          {downloadingId === c.id
                            ? "Preparing…"
                            : "Download CSV"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}