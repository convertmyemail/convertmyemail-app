import { createServerClient } from "@supabase/ssr";

type CookieStoreLike = {
  get: (name: string) => { value?: string } | undefined;
  set: (args: { name: string; value: string } & Record<string, any>) => void;
};

export function createSupabaseServerClient(cookieStore: CookieStoreLike) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    }
  );
}
