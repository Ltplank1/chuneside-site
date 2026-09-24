import { createServerClient, parseCookieHeader } from "@supabase/ssr";

export const STAGING_ADMIN_EMAIL = "wadadtv@gmail.com";

const AUTH_PAGE_PATHS = new Set([
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/reset-password",
]);

const AUTH_GET_PATHS = new Set([
  "/auth/callback",
  "/auth/confirm",
  "/auth/sign-out",
  "/api/auth/config",
]);

export function isValidStagingRuntime(env) {
  if (env?.CHUNESIDE_STAGING_ACCESS_GATE !== "1") return false;
  if (env?.CHUNESIDE_STAGING_ADMIN_EMAILS?.trim().toLowerCase() !== STAGING_ADMIN_EMAIL) return false;
  if (!env?.CHUNESIDE_STAGING_SUPABASE_PUBLISHABLE_KEY?.trim()) return false;

  try {
    const url = new URL(env.CHUNESIDE_STAGING_SUPABASE_URL);
    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

export function isStagingAdminUser(user) {
  const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
  return email === STAGING_ADMIN_EMAIL && Boolean(user.email_confirmed_at || user.confirmed_at);
}

export function isStagingAuthException(pathname, method) {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET" && normalizedMethod !== "HEAD") return false;
  if (AUTH_PAGE_PATHS.has(pathname)) return true;
  if (normalizedMethod === "GET" && AUTH_GET_PATHS.has(pathname)) return true;
  return (
    pathname.startsWith("/_next/static/") ||
    pathname === "/favicon.ico" ||
    pathname === "/chuneside-logo-v2.png"
  );
}

export async function guardStagingRequest(request, env, handle, verifyUser = verifyStagingUser) {
  if (!isValidStagingRuntime(env)) return unavailableResponse(request);

  const url = new URL(request.url);
  if (isStagingAuthException(url.pathname, request.method)) return handle(request);

  let verification;
  try {
    verification = await verifyUser(request, env);
  } catch {
    return unavailableResponse(request);
  }

  if (!verification?.user || !isStagingAdminUser(verification.user)) {
    return deniedResponse(request);
  }

  return handle(request);
}

export async function dispatchWorkerRequest({
  request,
  env,
  stagingBuild,
  handleApp,
  handleImage,
  verifyUser,
}) {
  const dispatch = (forwardedRequest) =>
    new URL(forwardedRequest.url).pathname === "/_vinext/image"
      ? handleImage(forwardedRequest)
      : handleApp(forwardedRequest);

  if (!stagingBuild) return dispatch(request);
  return guardStagingRequest(request, env, dispatch, verifyUser);
}

export async function provisionStagingIdentity(user, stagingBuild, runtimeMarker, provision, signOut) {
  if (!stagingBuild) {
    await provision();
    return true;
  }

  if (runtimeMarker !== "1" || !isStagingAdminUser(user)) {
    try {
      await signOut();
    } catch {
      // The Worker gate still denies this session if sign-out cannot clear it.
    }
    return false;
  }

  await provision();
  return true;
}

export async function verifyStagingUser(request, env, createClient = createServerClient) {
  const cookies = parseCookieHeader(request.headers.get("cookie") ?? "");
  const supabase = createClient(
    env.CHUNESIDE_STAGING_SUPABASE_URL,
    env.CHUNESIDE_STAGING_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookies,
      },
    },
  );

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (
    sessionError ||
    !session?.access_token ||
    !Number.isFinite(session.expires_at) ||
    session.expires_at * 1000 <= Date.now()
  ) {
    return { user: null };
  }

  const { data, error } = await supabase.auth.getUser(session.access_token);
  if (error || !data.user) return { user: null };
  return { user: data.user };
}

function deniedResponse(request) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || url.pathname === "/_vinext/image") {
    return jsonError(401, "Staging access denied.");
  }

  const signIn = new URL("/auth/sign-in?error=staging_access_denied", url.origin);
  signIn.searchParams.set("returnTo", `${url.pathname}${url.search}`);
  return privateResponse(Response.redirect(signIn, 303));
}

function unavailableResponse(request) {
  if (new URL(request.url).pathname.startsWith("/api/") || new URL(request.url).pathname === "/_vinext/image") {
    return jsonError(503, "Staging access is unavailable.");
  }
  return privateResponse(new Response("Staging access is unavailable.", { status: 503 }));
}

function jsonError(status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

function privateResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
