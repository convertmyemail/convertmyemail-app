import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function safeNextPath(next: string | null) {
  // Only allow relative paths within your app
  if (!next) return "/app";
  if (!next.startsWith("/")) return "/app";
  // prevent protocol-relative or weird stuff like //evil.com
  if (next.startsWith("//")) return "/app";
  return next;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextRaw = url.searchParams.get("next");
  const next = safeNextPath(nextRaw);

  // Prepare a response we can attach cookies to
  const redirectTo = new URL(next, url.origin);
  const response = NextResponse.redirect(redirectTo);

  if (!code) {
    const errUrl = new URL("/login?error=missing_code", url.origin);
    return NextResponse.redirect(errUrl);
  }

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
    // Make the real cause visible in the browser URL
    const errUrl = new URL("/login", url.origin);
    errUrl.searchParams.set("error", "auth_callback_failed");
    errUrl.searchParams.set("reason", error.message);
    // keep next so user still lands where they intended after retry
    errUrl.searchParams.set("next", next);
    return NextResponse.redirect(errUrl);
  }

  return response;
}