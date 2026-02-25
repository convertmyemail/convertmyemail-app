import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/app";

  const redirectTo = new URL(next, url.origin);
  const response = NextResponse.redirect(redirectTo);

  if (!code) return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // 👇 This makes the real cause visible in the browser URL
    const errUrl = new URL("/login", url.origin);
    errUrl.searchParams.set("error", "auth_callback_failed");
    errUrl.searchParams.set("reason", error.message);
    return NextResponse.redirect(errUrl);
  }

  return response;
}