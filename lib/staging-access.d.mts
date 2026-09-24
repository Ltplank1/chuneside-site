export interface StagingAccessEnv {
  CHUNESIDE_STAGING_ACCESS_GATE?: string;
  CHUNESIDE_STAGING_ADMIN_EMAILS?: string;
  CHUNESIDE_STAGING_SUPABASE_URL?: string;
  CHUNESIDE_STAGING_SUPABASE_PUBLISHABLE_KEY?: string;
}

export interface StagingSessionClient {
  auth: {
    getSession: () => Promise<{
      data: { session: { access_token: string; expires_at?: number } | null };
      error: unknown;
    }>;
    getUser: (jwt: string) => Promise<{ data: { user: unknown | null }; error: unknown }>;
  };
}

export type StagingSessionClientFactory = (
  url: string,
  key: string,
  options: { cookies: { getAll: () => Array<{ name: string; value: string }> } },
) => StagingSessionClient;

export function isValidStagingRuntime(env: StagingAccessEnv): boolean;
export function isStagingAdminUser(user: unknown): boolean;
export function isStagingAuthException(pathname: string, method: string): boolean;
export function verifyStagingUser(
  request: Request,
  env: StagingAccessEnv,
  createClient?: StagingSessionClientFactory,
): Promise<{ user: unknown }>;
export function guardStagingRequest(
  request: Request,
  env: StagingAccessEnv,
  handle: (request: Request) => Promise<Response>,
  verifyUser?: (request: Request, env: StagingAccessEnv) => Promise<{ user?: unknown; cookieHeader?: string; setCookies?: string[]; cookieHeaders?: Record<string, string> }>,
): Promise<Response>;
export function dispatchWorkerRequest(options: {
  request: Request;
  env: StagingAccessEnv;
  stagingBuild: boolean;
  handleApp: (request: Request) => Promise<Response>;
  handleImage: (request: Request) => Promise<Response>;
  verifyUser?: (request: Request, env: StagingAccessEnv) => Promise<{ user?: unknown; cookieHeader?: string; setCookies?: string[]; cookieHeaders?: Record<string, string> }>;
}): Promise<Response>;
export function provisionStagingIdentity(
  user: unknown,
  stagingBuild: boolean,
  runtimeMarker: string | undefined,
  provision: () => Promise<unknown>,
  signOut: () => Promise<unknown>,
): Promise<boolean>;
