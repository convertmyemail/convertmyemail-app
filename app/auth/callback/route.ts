import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  // Where to send the user after auth
  const redirectTo = new URL("/app", url.origin);

  // Create the response up-front so we can attach cookies to it
  const response = NextResponse.redirect(redirectTo);

  if (!code) {
    return response;
  }

  // ✅ In your Next.js version, cookies() is async
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Read cookies from the incoming request
        getAll() {
          return cookieStore.getAll();
        },

        // Write cookies onto the outgoing response
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
    // Redirect somewhere sensible on failure
    return NextResponse.redirect(new URL("/login?error=auth_callback_failed", url.origin));
  }

  return response;
}