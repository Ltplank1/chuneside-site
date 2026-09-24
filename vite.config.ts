import vinext from "vinext";
import { defineConfig } from "vite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const stagingConfigPath = "./wrangler.staging.jsonc";

async function validateStagingConfig() {
  const absolutePath = path.resolve(stagingConfigPath);
  let config: {
    name?: string;
    workers_dev?: boolean;
    preview_urls?: boolean;
    d1_databases?: Array<{ binding?: string; database_name?: string; database_id?: string; migrations_dir?: string }>;
    r2_buckets?: Array<{ binding?: string; bucket_name?: string }>;
    vars?: Record<string, string>;
    routes?: unknown[];
  };
  try {
    config = JSON.parse(await readFile(absolutePath, "utf8"));
  } catch {
    throw new Error(`Staging build blocked: ${stagingConfigPath} is missing or invalid.`);
  }

  const db = config.d1_databases?.length === 1 ? config.d1_databases[0] : undefined;
  const r2 = config.r2_buckets?.length === 1 ? config.r2_buckets[0] : undefined;
  if (
    config.name !== "chuneside-site-staging" ||
    config.workers_dev !== false ||
    config.preview_urls !== false ||
    config.routes?.length ||
    db?.binding !== "DB" ||
    db.database_name !== "chuneside-staging-d1" ||
    db.database_id !== "8854df00-b77d-40ae-95c6-e81e839f122f" ||
    String(db.database_id) === "62e26dc9-ed6b-49f2-9153-ddcd9b6e7719" ||
    db.migrations_dir !== "drizzle" ||
    r2?.binding !== "MEDIA" ||
    r2.bucket_name !== "chuneside-staging-r2" ||
    String(r2.bucket_name) === "site-creator-r2" ||
    Object.keys(config.vars ?? {}).some(
      (name) => !["CHUNESIDE_ENABLE_LOCAL_AUTH", "CHUNESIDE_STAGING_ACCESS_GATE"].includes(name),
    ) ||
    config.vars?.CHUNESIDE_ENABLE_LOCAL_AUTH !== "0" ||
    config.vars?.CHUNESIDE_STAGING_ACCESS_GATE !== "1"
  ) {
    throw new Error(`Staging build blocked: ${stagingConfigPath} does not match the verified isolated staging resources.`);
  }
}

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  vars: {
    CHUNESIDE_ADMIN_EMAILS: process.env.CHUNESIDE_ADMIN_EMAILS ?? "",
    CHUNESIDE_ENABLE_LOCAL_AUTH: process.env.CHUNESIDE_ENABLE_LOCAL_AUTH ?? "0",
  },
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async ({ command }) => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  const deployTarget = process.env.CHUNESIDE_DEPLOY_TARGET;
  if (command === "build" && deployTarget !== "production" && deployTarget !== "staging") {
    throw new Error("Build blocked: set an explicit production or staging build target.");
  }
  if (command === "build" && deployTarget === "staging") {
    if (!process.env.CHUNESIDE_ADMIN_EMAILS?.trim()) {
      throw new Error("Staging build blocked: staging admin allowlist is missing.");
    }
    await validateStagingConfig();
  }

  return {
    ...(command === "build" && deployTarget === "staging" ? { envDir: false } : {}),
    define: {
      __CHUNESIDE_STAGING_BUILD__: JSON.stringify(command === "build" && deployTarget === "staging"),
    },
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        ...(command === "build"
          ? {
              configPath:
                deployTarget === "staging"
                  ? stagingConfigPath
                  : "./wrangler.production.jsonc",
              config: () => {
                if (deployTarget === "staging") {
                  const vars: Record<string, string> = {
                    CHUNESIDE_ADMIN_EMAILS: process.env.CHUNESIDE_STAGING_ADMIN_EMAILS ?? "",
                    CHUNESIDE_ENABLE_LOCAL_AUTH: "0",
                    CHUNESIDE_STAGING_ACCESS_GATE: "1",
                    CHUNESIDE_STAGING_ADMIN_EMAILS: process.env.CHUNESIDE_STAGING_ADMIN_EMAILS ?? "",
                    CHUNESIDE_STAGING_SUPABASE_URL: process.env.CHUNESIDE_STAGING_SUPABASE_URL ?? "",
                    CHUNESIDE_STAGING_SUPABASE_PUBLISHABLE_KEY:
                      process.env.CHUNESIDE_STAGING_SUPABASE_PUBLISHABLE_KEY ?? "",
                  };
                  return { vars };
                }

                const vars: Record<string, string> = {
                  CHUNESIDE_ADMIN_EMAILS: process.env.CHUNESIDE_ADMIN_EMAILS ?? "",
                  CHUNESIDE_ENABLE_LOCAL_AUTH: "0",
                };
                return { vars };
              },
            }
          : { config: localBindingConfig }),
      }),
    ],
  };
});
