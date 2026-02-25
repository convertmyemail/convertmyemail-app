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

  const { data, error } = await supabase
    .from("conversions")
    .select("id, original_filename, created_at, csv_path, pdf_path")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ conversions: data ?? [] });
}