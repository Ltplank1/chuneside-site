import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";

const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER = "oai-authenticated-user-full-name-encoding";
const LOCAL_USER_ID_HEADER = "x-chuneside-local-user-id";
const LOCAL_USER_EMAIL_HEADER = "x-chuneside-local-user-email";
const LOCAL_USER_FULL_NAME_HEADER = "x-chuneside-local-user-full-name";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";

export type AuthenticatedHeaderUser = {
  id: string | null;
  email: string | null;
  displayName: string | null;
  fullName: string | null;
};

export function readAuthenticatedHeaderUser(requestHeaders: Headers | ReadonlyHeaders): AuthenticatedHeaderUser {
  const sitesUser = readSitesUser(requestHeaders);
  if (sitesUser.email || sitesUser.id) return sitesUser;

  if (!localAuthEnabled()) return { id: null, email: null, displayName: null, fullName: null };

  const id = requestHeaders.get(LOCAL_USER_ID_HEADER);
  const email = requestHeaders.get(LOCAL_USER_EMAIL_HEADER);
  const fullName = requestHeaders.get(LOCAL_USER_FULL_NAME_HEADER);
  return {
    id,
    email,
    displayName: fullName || email?.split("@")[0] || null,
    fullName,
  };
}

export async function getAuthenticatedUser(): Promise<AuthenticatedHeaderUser> {
  const { getSupabaseUser } = await import("@/lib/supabase/server");
  const supabaseUser = await getSupabaseUser();
  if (supabaseUser) return supabaseUser;
  return readAuthenticatedHeaderUser(await import("next/headers").then(({ headers }) => headers()));
}

function readSitesUser(requestHeaders: Headers | ReadonlyHeaders): AuthenticatedHeaderUser {
  const id = requestHeaders.get(USER_ID_HEADER);
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return {
    id,
    email,
    displayName: fullName || email?.split("@")[0] || null,
    fullName,
  };
}

function localAuthEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.CHUNESIDE_ENABLE_LOCAL_AUTH === "1";
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
