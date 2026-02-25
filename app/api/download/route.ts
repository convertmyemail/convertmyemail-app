import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type DownloadFormat = "xlsx" | "csv" | "pdf";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const cookieStore = await Promise.resolve(cookies() as any);
  const supabase = createSupabaseServerClient(cookieStore);

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = userData.user.id;

  // Backward compatible: old client sends { path }
  const directPath = body?.path as string | undefined;

  // New preferred: client sends { conversionId, format }
  const conversionId = body?.conversionId as string | undefined;
  const format = (body?.format as DownloadFormat | undefined) ?? "xlsx";

  let pathToSign: string | undefined = directPath;

  if (!pathToSign && conversionId) {
    const { data: conv, error: convErr } = await supabase
      .from("conversions")
      .select("id, user_id, xlsx_path, csv_path, pdf_path")
      .eq("id", conversionId)
      .single();

    if (convErr || !conv) {
      return NextResponse.json({ error: "Conversion not found" }, { status: 404 });
    }

    if (conv.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Prefer XLSX, fallback to CSV if older conversion
    if (format === "xlsx") pathToSign = conv.xlsx_path ?? conv.csv_path ?? undefined;
    if (format === "csv") pathToSign = conv.csv_path ?? undefined;
    if (format === "pdf") pathToSign = conv.pdf_path ?? undefined;
  }

  if (!pathToSign) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  // Safety: if client uses legacy {path}, ensure it’s within this user’s folder
  // and only known file types.
  const isAllowedExt =
    pathToSign.endsWith(".xlsx") || pathToSign.endsWith(".csv") || pathToSign.endsWith(".pdf");

  const isInUserFolder = pathToSign.startsWith(`${userId}/`);

  if (!conversionId) {
    if (!isAllowedExt) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }
    if (!isInUserFolder) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data, error } = await supabase.storage
    .from("conversions")
    .createSignedUrl(pathToSign, 60);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    url: data.signedUrl,
    path: pathToSign,
    format:
      pathToSign.endsWith(".pdf") ? "pdf" : pathToSign.endsWith(".csv") ? "csv" : "xlsx",
  });
}