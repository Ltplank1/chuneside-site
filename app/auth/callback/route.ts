import { createSupabaseServerClient, supabaseConfigured } from "@/lib/supabase/server";
import { authRedirect } from "@/app/auth/paths";
import { provisionMember } from "@/lib/member-provisioning";
import { provisionStagingIdentity } from "@/lib/staging-access.mjs";

declare const __CHUNESIDE_STAGING_BUILD__: boolean;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error");
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  if (!supabaseConfigured()) return authRedirect(new URL(`/auth/sign-in?error=not_configured&returnTo=${encodeURIComponent(returnTo)}`, url.origin));
  if (providerError) return authRedirect(new URL(`/auth/sign-in?error=provider_failed&returnTo=${encodeURIComponent(returnTo)}`, url.origin));
  if (!code) return authRedirect(new URL(`/auth/sign-in?error=missing_code&returnTo=${encodeURIComponent(returnTo)}`, url.origin));
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) return authRedirect(new URL(`/auth/sign-in?error=callback_failed&returnTo=${encodeURIComponent(returnTo)}`, url.origin));
    const allowed = await provisionStagingIdentity(
      data.user,
      __CHUNESIDE_STAGING_BUILD__,
      process.env.CHUNESIDE_STAGING_ACCESS_GATE,
      () => provisionMember(data.user),
      async () => { await supabase.auth.signOut(); },
    );
    if (!allowed) return authRedirect(new URL(`/auth/sign-in?error=staging_access_denied&returnTo=${encodeURIComponent(returnTo)}`, url.origin));
  } catch {
    return authRedirect(new URL(`/auth/sign-in?error=callback_failed&returnTo=${encodeURIComponent(returnTo)}`, url.origin));
  }
  return authRedirect(new URL(returnTo, url.origin));
}

function safeReturnTo(value: string | null) { return value && value.startsWith("/") && !value.startsWith("//") ? value : "/"; }
