import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient, supabaseConfigured } from "@/lib/supabase/server";
import { authRedirect } from "@/app/auth/paths";
import { provisionMember } from "@/lib/member-provisioning";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  const tokenHash = url.searchParams.get("token_hash");
  const type = emailOtpType(url.searchParams.get("type"));

  if (!supabaseConfigured()) return signInRedirect(url, "not_configured", returnTo);
  if (!tokenHash || !type) return signInRedirect(url, "confirmation_failed", returnTo);

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return signInRedirect(url, "confirmation_failed", returnTo);
    if (data.user) await provisionMember(data.user);
  } catch {
    return signInRedirect(url, "confirmation_failed", returnTo);
  }

  return authRedirect(new URL(returnTo, url.origin));
}

function emailOtpType(value: string | null): EmailOtpType | null {
  return value === "email" || value === "invite" || value === "recovery" || value === "email_change" ? value : null;
}

function signInRedirect(url: URL, error: string, returnTo: string) {
  return authRedirect(new URL(`/auth/sign-in?error=${error}&returnTo=${encodeURIComponent(returnTo)}`, url.origin));
}

function safeReturnTo(value: string | null) { return value && value.startsWith("/") && !value.startsWith("//") ? value : "/"; }
