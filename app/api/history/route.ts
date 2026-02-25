import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET() {
  const cookieStore = await Promise.resolve(cookies() as any);
  const supabase = createSupabaseServerClient(cookieStore);

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = userData.user.id;

  const { data, error } = await supabase
    .from("conversions")
    .select("id, user_id, original_filename, created_at, xlsx_path, csv_path, pdf_path")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const conversions =
    (data ?? []).map((c) => ({
      id: c.id,
      original_filename: c.original_filename,
      created_at: c.created_at,
      // new
      xlsx_path: c.xlsx_path ?? null,
      // legacy
      csv_path: c.csv_path ?? null,
      pdf_path: c.pdf_path ?? null,
      // convenience: prefer xlsx, fallback to csv
      sheet_path: c.xlsx_path ?? c.csv_path ?? null,
    })) ?? [];

  return NextResponse.json({ conversions });
}