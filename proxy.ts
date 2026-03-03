import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    // Fail fast (helps catch misconfigured Vercel env)
    return NextResponse.json(
      { error: "Missing Supabase environment variables" },
      { status: 500 }
    );
  }

  // Create a “pass-through” response we can attach refreshed cookies to
  const response = NextResponse.next({ request });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If not logged in, redirect to /login (preserve full path + query)
  if (!user) {
    const loginUrl = new URL("/login", request.url);

    const nextPath = request.nextUrl.pathname + request.nextUrl.search;
    loginUrl.searchParams.set("next", nextPath);

    return NextResponse.redirect(loginUrl);
  }

  return response;
}

// ✅ IMPORTANT: match BOTH "/app" and anything under it
export const config = {
  matcher: ["/app", "/app/:path*"],
};