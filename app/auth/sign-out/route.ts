import { createSupabaseServerClient, supabaseConfigured } from "@/lib/supabase/server";
import { authRedirect } from "@/app/auth/paths";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  if (supabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    } catch {
      // Redirect even when the provider is temporarily unavailable.
    }
  }
  return authRedirect(new URL(returnTo, url.origin));
}

function safeReturnTo(value: string | null) { return value && value.startsWith("/") && !value.startsWith("//") ? value : "/"; }
