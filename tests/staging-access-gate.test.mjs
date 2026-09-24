import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  dispatchWorkerRequest,
  isStagingAuthException,
  isStagingAdminUser,
  isValidStagingRuntime,
  provisionStagingIdentity,
  verifyStagingUser,
} from "../lib/staging-access.mjs";

const stagingEnv = {
  CHUNESIDE_STAGING_ACCESS_GATE: "1",
  CHUNESIDE_STAGING_ADMIN_EMAILS: "wadadtv@gmail.com",
  CHUNESIDE_STAGING_SUPABASE_URL: "https://staging-project.supabase.co",
  CHUNESIDE_STAGING_SUPABASE_PUBLISHABLE_KEY: "staging-public-key",
};

const adminUser = {
  email: "wadadtv@gmail.com",
  email_confirmed_at: "2026-09-23T12:00:00.000Z",
};

function request(path, method = "GET", headers = {}) {
  return new Request(`https://staging.chuneside.com${path}`, { method, headers });
}

function dispatcher({ env = stagingEnv, verifyUser, stagingBuild = true } = {}) {
  const calls = { app: 0, image: 0, verifiedEnv: null, request: null };
  const responsePromise = (req, type) => {
    calls[type] += 1;
    calls.request = req;
    return Promise.resolve(new Response(type, { headers: { "X-Response-Type": type } }));
  };
  return {
    calls,
    run: (req) => dispatchWorkerRequest({
      request: req,
      env,
      stagingBuild,
      handleApp: (forwarded) => responsePromise(forwarded, "app"),
      handleImage: (forwarded) => responsePromise(forwarded, "image"),
      verifyUser: async (forwarded, receivedEnv) => {
        calls.verifiedEnv = receivedEnv;
        return verifyUser ? verifyUser(forwarded, receivedEnv) : { user: null };
      },
    }),
  };
}

test("anonymous page requests are redirected before App Router dispatch", async () => {
  const app = dispatcher();
  const response = await app.run(request("/"));
  assert.equal(response.status, 303);
  assert.match(response.headers.get("location"), /\/auth\/sign-in/);
  assert.equal(app.calls.app, 0);
});

test("anonymous API requests are denied before route handlers", async () => {
  const app = dispatcher();
  const response = await app.run(request("/api/catalog"));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Staging access denied." });
  assert.equal(app.calls.app, 0);
});

test("anonymous image optimization requests are denied at the outer Worker boundary", async () => {
  const app = dispatcher();
  const response = await app.run(request("/_vinext/image?url=%2Fcover.png&w=640"));
  assert.equal(response.status, 401);
  assert.equal(app.calls.image, 0);
  assert.equal(app.calls.app, 0);
});

test("a signed-in non-allowlisted identity is denied", async () => {
  const app = dispatcher({ verifyUser: async () => ({ user: { ...adminUser, email: "other@example.com" } }) });
  const response = await app.run(request("/api/member-state"));
  assert.equal(response.status, 401);
  assert.equal(app.calls.app, 0);
});

test("only a verified allowlisted staging Supabase user reaches pages and image handling", async () => {
  const app = dispatcher({ verifyUser: async () => ({ user: adminUser }) });
  const pageResponse = await app.run(request("/artist/dashboard"));
  assert.equal(pageResponse.status, 200);
  assert.equal(app.calls.app, 1);
  assert.equal(app.calls.verifiedEnv, stagingEnv);

  const imageResponse = await app.run(request("/_vinext/image?url=%2Fcover.png&w=640"));
  assert.equal(imageResponse.status, 200);
  assert.equal(app.calls.image, 1);
});

test("malformed, expired, or unverifiable sessions fail closed", async (t) => {
  const cases = [
    ["missing session", async () => ({ user: null }), 401],
    ["malformed or expired session", async () => ({ user: null, error: new Error("invalid token") }), 401],
    ["Supabase verification failure", async () => { throw new Error("provider unavailable"); }, 503],
    ["unverified email", async () => ({ user: { email: adminUser.email } }), 401],
  ];
  for (const [label, verifyUser, expectedStatus] of cases) {
    await t.test(label, async () => {
      const app = dispatcher({ verifyUser });
      const response = await app.run(request("/api/member-state"));
      assert.equal(response.status, expectedStatus);
      assert.equal(app.calls.app, 0);
    });
  }
});

test("expired stored sessions are denied without attempting a refresh", async () => {
  let userLookupCalled = false;
  const result = await verifyStagingUser(request("/"), stagingEnv, () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: "expired-token", expires_at: 1 } }, error: null }),
      getUser: async () => { userLookupCalled = true; return { data: { user: adminUser }, error: null }; },
    },
  }));
  assert.deepEqual(result, { user: null });
  assert.equal(userLookupCalled, false);
});

test("unexpired sessions are verified against the staging Auth endpoint with the exact access token", async () => {
  let options;
  let verifiedToken;
  const result = await verifyStagingUser(request("/", "GET", { cookie: "sb-stage-auth-token=abc" }), stagingEnv, (url, key, clientOptions) => {
    options = { url, key, clientOptions };
    return {
      auth: {
        getSession: async () => ({ data: { session: { access_token: "current-token", expires_at: Math.floor(Date.now() / 1000) + 300 } }, error: null }),
        getUser: async (token) => { verifiedToken = token; return { data: { user: adminUser }, error: null }; },
      },
    };
  });
  assert.equal(options.url, stagingEnv.CHUNESIDE_STAGING_SUPABASE_URL);
  assert.equal(options.key, stagingEnv.CHUNESIDE_STAGING_SUPABASE_PUBLISHABLE_KEY);
  assert.equal(options.clientOptions.cookies.getAll()[0].name, "sb-stage-auth-token");
  assert.equal(verifiedToken, "current-token");
  assert.equal(result.user, adminUser);
});

test("missing or invalid staging runtime configuration fails closed, including auth exceptions", async (t) => {
  const cases = [
    ["missing marker", { ...stagingEnv, CHUNESIDE_STAGING_ACCESS_GATE: undefined }],
    ["invalid marker", { ...stagingEnv, CHUNESIDE_STAGING_ACCESS_GATE: "true" }],
    ["missing Supabase URL", { ...stagingEnv, CHUNESIDE_STAGING_SUPABASE_URL: "" }],
    ["missing publishable key", { ...stagingEnv, CHUNESIDE_STAGING_SUPABASE_PUBLISHABLE_KEY: "" }],
    ["wrong allowlist", { ...stagingEnv, CHUNESIDE_STAGING_ADMIN_EMAILS: "admin@example.com" }],
  ];
  for (const [label, env] of cases) {
    await t.test(label, async () => {
      assert.equal(isValidStagingRuntime(env), false);
      const app = dispatcher({ env });
      const response = await app.run(request("/auth/sign-in"));
      assert.equal(response.status, 503);
      assert.equal(app.calls.app, 0);
    });
  }
});

test("auth exceptions are limited and do not include protected APIs, pages, or media", async () => {
  const allowed = [
    ["/auth/sign-in", "GET"],
    ["/auth/sign-up", "GET"],
    ["/auth/reset-password", "GET"],
    ["/auth/callback", "GET"],
    ["/auth/confirm", "GET"],
    ["/auth/sign-out", "GET"],
    ["/api/auth/config", "GET"],
    ["/_next/static/chunks/auth.js", "GET"],
    ["/chuneside-logo-v2.png", "GET"],
  ];
  for (const [path, method] of allowed) assert.equal(isStagingAuthException(path, method), true, `${method} ${path}`);

  for (const [path, method] of [
    ["/api/auth/config", "POST"],
    ["/api/catalog", "GET"],
    ["/api/admin/accounts", "GET"],
    ["/api/media/release-1", "GET"],
    ["/artists/artist-one", "GET"],
    ["/auth/update-password", "GET"],
  ]) assert.equal(isStagingAuthException(path, method), false, `${method} ${path}`);

  const app = dispatcher();
  const response = await app.run(request("/api/catalog"));
  assert.equal(response.status, 401);
  assert.equal(app.calls.app, 0);
});

test("allowed staging admin can use password recovery and callback routes", async () => {
  for (const path of ["/auth/sign-in", "/auth/reset-password", "/auth/callback", "/auth/confirm", "/api/auth/config"]) {
    const app = dispatcher();
    const response = await app.run(request(path));
    assert.equal(response.status, 200, path);
  }

  const update = dispatcher({ verifyUser: async () => ({ user: adminUser }) });
  assert.equal((await update.run(request("/auth/update-password"))).status, 200);
});

test("callback and confirmation cannot provision non-allowlisted identities", async (t) => {
  for (const flow of ["callback", "confirmation"]) {
    await t.test(flow, async () => {
      let provisioned = false;
      let signedOut = false;
      const allowed = await provisionStagingIdentity(
        { ...adminUser, email: "other@example.com" },
        true,
        "1",
        async () => { provisioned = true; },
        async () => { signedOut = true; },
      );
      assert.equal(allowed, false);
      assert.equal(provisioned, false);
      assert.equal(signedOut, true);
    });
  }

  let provisionedAllowed = false;
  assert.equal(await provisionStagingIdentity(adminUser, true, "1", async () => { provisionedAllowed = true; }, async () => {}), true);
  assert.equal(provisionedAllowed, true);
});

test("production configuration has no staging gate or staging Supabase settings", async () => {
  const config = JSON.parse(await readFile(new URL("../wrangler.production.jsonc", import.meta.url), "utf8"));
  const vars = config.vars ?? {};
  assert.equal(vars.CHUNESIDE_STAGING_ACCESS_GATE, undefined);
  assert.equal(vars.CHUNESIDE_STAGING_SUPABASE_URL, undefined);
  assert.equal(vars.CHUNESIDE_STAGING_SUPABASE_PUBLISHABLE_KEY, undefined);
  assert.equal(vars.CHUNESIDE_STAGING_ADMIN_EMAILS, undefined);

  const generated = JSON.parse(await readFile(new URL("../dist/server/wrangler.json", import.meta.url), "utf8"));
  const generatedVars = generated.vars ?? {};
  assert.equal(generated.name, config.name);
  assert.equal(generatedVars.CHUNESIDE_STAGING_ACCESS_GATE, undefined);
  assert.equal(generatedVars.CHUNESIDE_STAGING_ADMIN_EMAILS, undefined);
  assert.equal(generatedVars.CHUNESIDE_STAGING_SUPABASE_URL, undefined);
  assert.equal(generatedVars.CHUNESIDE_STAGING_SUPABASE_PUBLISHABLE_KEY, undefined);

  let verified = false;
  for (const path of ["/", "/api/catalog", "/_vinext/image?url=%2Fcover.png"]) {
    const app = dispatcher({ stagingBuild: false, env: {}, verifyUser: async () => { verified = true; return { user: null }; } });
    const response = await app.run(request(path));
    assert.equal(response.status, 200, path);
  }
  assert.equal(verified, false);
});

test("staging Wrangler config requires the gate and binds only staging data resources", async () => {
  const config = JSON.parse(await readFile(new URL("../wrangler.staging.jsonc", import.meta.url), "utf8"));
  assert.equal(config.name, "chuneside-site-staging");
  assert.equal(config.vars.CHUNESIDE_STAGING_ACCESS_GATE, "1");
  assert.equal(config.vars.CHUNESIDE_ENABLE_LOCAL_AUTH, "0");
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.routes, undefined);
  assert.deepEqual(config.d1_databases.map(({ binding, database_name, database_id }) => ({ binding, database_name, database_id })), [
    { binding: "DB", database_name: "chuneside-staging-d1", database_id: "8854df00-b77d-40ae-95c6-e81e839f122f" },
  ]);
  assert.deepEqual(config.r2_buckets, [{ binding: "MEDIA", bucket_name: "chuneside-staging-r2" }]);
});

test("production identity provisioning remains unchanged", async () => {
  let provisioned = false;
  const allowed = await provisionStagingIdentity(
    { email: "any-user@example.com" },
    false,
    undefined,
    async () => { provisioned = true; },
    async () => {},
  );
  assert.equal(allowed, true);
  assert.equal(provisioned, true);
});

test("staging identity comparison requires the verified exact admin mailbox", () => {
  assert.equal(isStagingAdminUser(adminUser), true);
  assert.equal(isStagingAdminUser({ ...adminUser, email: "wadadtv+test@gmail.com" }), false);
});
