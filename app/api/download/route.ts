import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const path = body?.path as string | undefined;

  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const cookieStore = await Promise.resolve(cookies() as any);
  const supabase = createSupabaseServerClient(cookieStore);

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.storage
    .from("conversions")
    .createSignedUrl(path, 60);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ url: data.signedUrl });
}