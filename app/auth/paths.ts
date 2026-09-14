export function productionAuthConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function appSignInPath(returnTo: string) {
  const safeReturnTo = safeReturnPath(returnTo);
  return productionAuthConfigured()
    ? `/auth/sign-in?returnTo=${encodeURIComponent(safeReturnTo)}`
    : `/signin-with-chatgpt?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function appSignOutPath(returnTo = "/") {
  const safeReturnTo = safeReturnPath(returnTo);
  return productionAuthConfigured()
    ? `/auth/sign-out?returnTo=${encodeURIComponent(safeReturnTo)}`
    : `/signout-with-chatgpt?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function authRedirect(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

function safeReturnPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
import { NextResponse } from "next/server";
