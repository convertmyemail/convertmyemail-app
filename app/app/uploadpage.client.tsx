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
  sheet_path: string | null;
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
  const { usage: shellUsage, usageLoading, isPro, refreshUsage, startCheckout } = useAppShell();

  const effectiveUsage = shellUsage ?? usage;

  const usageUsed = (effectiveUsage as any)?.used ?? 0;
  const usageRemaining = (effectiveUsage as any)?.remaining ?? 0;
  const usageLimit =
    (effectiveUsage as any)?.limit ??
    (effectiveUsage as any)?.free_limit ??
    FREE_LIMIT_FALLBACK;

  const [files, setFiles] = useState<FileList | null>(null);
  const [status, setStatus] = useState<string>("");

  const [limitModal, setLimitModal] = useState<LimitModalState>({ open: false });

  const openLimitModal = (opts?: Partial<LimitModalState>) => {
    setLimitModal({
      open: true,
      used: opts?.used ?? usageUsed,
      limit: opts?.limit ?? usageLimit,
      message:
        opts?.message ??
        "You’ve reached the free plan limit. Upgrade to Pro to keep converting.",
    });
  };

  const closeLimitModal = () => setLimitModal({ open: false });

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
      setStatus("Error: Not logged in.");
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
      setStatus("Error: Conversion failed.");
      await refreshUsage();
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      format === "pdf" ? "email-records.pdf" : "converted-emails.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    setStatus(`Done. Converted ${files.length} file(s).`);
    await refreshUsage();
  };

  const limitHit = !isPro && usageRemaining <= 0;

  return (
    <>
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-lg font-semibold">Upload email files</h1>
            <p className="mt-1 text-sm text-gray-600">
              Select one or more <span className="font-medium">.eml</span>{" "}
              files. We’ll extract structured fields and generate downloadable
              records.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            {/* Secondary */}
            <button
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              Choose files
            </button>

            {/* Primary - Excel */}
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
            >
              Convert to Excel
            </button>

            {/* Primary - PDF */}
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

        {status && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-sm text-gray-700">{status}</p>
          </div>
        )}
      </section>
    </>
  );
}