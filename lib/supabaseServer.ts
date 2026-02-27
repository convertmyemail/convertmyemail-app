// lib/supabaseServer.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Works whether cookies() is sync or async in your Next version/types
type CookieStore = Awaited<ReturnType<typeof cookies>>;

export function createSupabaseServerClient(cookieStore: CookieStore) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          // Some contexts provide a readonly cookie store; guard.
          try {
            (cookieStore as any).set({ name, value, ...options });
          } catch {
            // ignore if not mutable
          }
        },
        remove(name: string, options: any) {
          try {
            (cookieStore as any).set({ name, value: "", ...options });
          } catch {
            // ignore if not mutable
          }
        },
      },
    }
  );
}