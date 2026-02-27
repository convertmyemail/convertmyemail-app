import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies(); // ✅ Proper async usage
  const supabase = createSupabaseServerClient(cookieStore);

  const { data: userData, error: userErr } = await supabase.auth.getUser();

  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = userData.user.id;

  const { data, error } = await supabase
    .from("conversions")
    .select(
      "id, user_id, original_filename, created_at, xlsx_path, csv_path, pdf_path, message_count"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const conversions = (data ?? []).map((c: any) => ({
    id: c.id,
    original_filename: c.original_filename,
    created_at: c.created_at,
    xlsx_path: c.xlsx_path ?? null,
    csv_path: c.csv_path ?? null,
    pdf_path: c.pdf_path ?? null,
    sheet_path: c.xlsx_path ?? c.csv_path ?? null,
    message_count: typeof c.message_count === "number" ? c.message_count : 1,
  }));

  return NextResponse.json({ conversions });
}