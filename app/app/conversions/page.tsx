"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";

export const dynamic = "force-dynamic";

type Conversion = {
  id: string;
  original_filename: string | null;
  created_at: string;
  xlsx_path: string | null;
  pdf_path: string | null;
  message_count: number | null;
};

export default function ConversionsPage() {
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Please log in to view your conversions.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("conversions")
        .select(
          "id, original_filename, created_at, xlsx_path, pdf_path, message_count"
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        setError("Failed to load conversions.");
      } else {
        setConversions(data || []);
      }

      setLoading(false);
    }

    load();
  }, []);

  async function downloadFile(path: string) {
    const { data, error } = await supabase.storage
      .from("conversions")
      .download(path);

    if (error || !data) {
      console.error(error);
      alert("Download failed.");
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split("/").pop() || "download";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold mb-6">Your Conversions</h1>

      {loading && (
        <div className="text-gray-500 text-sm">Loading conversions...</div>
      )}

      {error && (
        <div className="text-red-600 text-sm mb-4">{error}</div>
      )}

      {!loading && conversions.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-gray-600 text-sm">
            No conversions yet. Upload an .eml file from the dashboard to get started.
          </p>
        </div>
      )}

      {!loading && conversions.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-700">
                  File
                </th>
                <th className="px-6 py-3 font-medium text-gray-700">
                  Messages
                </th>
                <th className="px-6 py-3 font-medium text-gray-700">
                  Date
                </th>
                <th className="px-6 py-3 font-medium text-gray-700">
                  Downloads
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {conversions.map((c) => (
                <tr key={c.id}>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">
                      {c.original_filename || "Untitled"}
                    </div>
                  </td>

                  <td className="px-6 py-4 text-gray-600">
                    {c.message_count ?? 1}
                  </td>

                  <td className="px-6 py-4 text-gray-600">
                    {new Date(c.created_at).toLocaleString()}
                  </td>

                  <td className="px-6 py-4 space-x-2">
                    {c.xlsx_path && (
                      <button
                        onClick={() => downloadFile(c.xlsx_path!)}
                        className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                      >
                        XLSX
                      </button>
                    )}

                    {c.pdf_path && (
                      <button
                        onClick={() => downloadFile(c.pdf_path!)}
                        className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                      >
                        PDF
                      </button>
                    )}
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