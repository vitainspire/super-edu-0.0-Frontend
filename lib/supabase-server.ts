import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { BACKEND_URL } from "./backend";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Only import from Server Components, Route Handlers, and middleware.
// Never import from a "use client" file — next/headers is server-only.
export async function createServerComponentClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        );
      },
    },
  });
}

/**
 * Server Component equivalent of lib/backend.ts's backendFetch. That helper
 * reads the Supabase session via the browser client (localStorage-backed),
 * which doesn't exist during server rendering — this reads the same session
 * from the SSR cookie jar instead and forwards it as a bearer token.
 */
export async function backendFetchServer(path: string, init: RequestInit = {}): Promise<Response> {
  const supabase = await createServerComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${BACKEND_URL}${path}`, { ...init, headers, cache: "no-store" });
}
