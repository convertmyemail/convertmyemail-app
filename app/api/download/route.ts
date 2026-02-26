import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Kind = "pdf" | "xlsx" | "csv" | "sheet";

function contentTypeFor(ext: string) {
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "csv":
      return "text/csv; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function safeDownloadName(name: string) {
  return (name || "download")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 140);
}

function parseKind(raw: string | null): Kind | null {
  const k = (raw || "").toLowerCase();
  if (k === "pdf" || k === "xlsx" || k === "csv" || k === "sheet") return k;
  return null;
}

function contentDisposition(filename: string) {
  // filename= is widely supported; filename*=UTF-8'' handles spaces/utf-8 properly.
  const fallback = filename.replace(/"/g, ""); // keep it simple + safe for quoted string
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const conversionId = url.searchParams.get("id");
  const kind = parseKind(url.searchParams.get("kind"));

  if (!conversionId || !kind) {
    return NextResponse.json({ error: "Missing or invalid id/kind" }, { status: 400 });
  }

  const cookieStore = await Promise.resolve(cookies() as any);
  const supabase = createSupabaseServerClient(cookieStore);

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ensure conversion belongs to user
  const { data: row, error: rowErr } = await supabase
    .from("conversions")
    .select("id, user_id, original_filename, pdf_path, xlsx_path, csv_path")
    .eq("id", conversionId)
    .eq("user_id", user.id)
    .single();

  if (rowErr || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const path =
    kind === "pdf"
      ? row.pdf_path
      : kind === "xlsx"
        ? row.xlsx_path
        : kind === "csv"
          ? row.csv_path
          : kind === "sheet"
            ? row.xlsx_path || row.csv_path
            : null;

  if (!path) {
    return NextResponse.json({ error: "File not available" }, { status: 404 });
  }

  const { data: blob, error: dlErr } = await supabase.storage
    .from("conversions")
    .download(path);

  if (dlErr || !blob) {
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }

  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  const extFromPath = (path.split(".").pop() || "").toLowerCase();
  const ext = kind === "sheet" ? (extFromPath === "csv" ? "csv" : "xlsx") : kind;

  const originalBase = safeDownloadName(row.original_filename || "conversion");
  const filename = `${originalBase}.${ext}`;

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentTypeFor(ext),
      "Content-Disposition": contentDisposition(filename),
      "Cache-Control": "no-store",
    },
  });
}