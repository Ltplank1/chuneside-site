import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function supabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public configuration is missing.");
  return createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Server Components cannot always mutate cookies. */ }
      },
    },
  });
}

export async function getSupabaseUser() {
  if (!supabaseConfigured()) return null;
  try {
    const client = await createSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();
    return user ? { id: user.id, email: user.email ?? "", displayName: String(user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Member"), fullName: String(user.user_metadata?.full_name || user.user_metadata?.display_name || "") || null } : null;
  } catch {
    return null;
  }
}
