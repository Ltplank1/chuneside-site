import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const buildArgs = process.argv.slice(2);
const buildTarget = buildArgs.length === 2 && buildArgs[0] === "--target" ? buildArgs[1] : "";
if (!buildTarget || !["production", "staging"].includes(buildTarget)) {
  throw new Error("Usage: npm run build or npm run build:staging");
}

const stagingBuild = buildTarget === "staging";
const env = { ...process.env };
if (stagingBuild) {
  const requiredStagingValues = [
    "CHUNESIDE_STAGING_ADMIN_EMAILS",
    "CHUNESIDE_STAGING_SUPABASE_URL",
    "CHUNESIDE_STAGING_SUPABASE_PUBLISHABLE_KEY",
  ];
  const missing = requiredStagingValues.filter((name) => !env[name]?.trim());
  if (missing.length) {
    throw new Error(`Staging build blocked; configure staging-only values: ${missing.join(", ")}`);
  }

  if (env.CHUNESIDE_STAGING_ADMIN_EMAILS.trim().toLowerCase() !== "wadadtv@gmail.com") {
    throw new Error("Staging build blocked; the staging admin allowlist must contain only the verified staging admin.");
  }

  const stagingUrl = new URL(env.CHUNESIDE_STAGING_SUPABASE_URL);
  if (stagingUrl.protocol !== "https:") {
    throw new Error("Staging Supabase URL must use HTTPS.");
  }
  if (
    env.NEXT_PUBLIC_SUPABASE_URL &&
    new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin === stagingUrl.origin
  ) {
    throw new Error("Staging Supabase URL must not match the generic production Supabase URL.");
  }

  for (const name of [
    "CHUNESIDE_ADMIN_EMAILS",
    "CHUNESIDE_ENABLE_LOCAL_AUTH",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "STRIPE_SECRET_KEY",
  ]) {
    delete env[name];
  }
  Object.assign(env, {
    CHUNESIDE_DEPLOY_TARGET: buildTarget,
    CHUNESIDE_STAGING_ACCESS_GATE: "1",
    CHUNESIDE_ADMIN_EMAILS: env.CHUNESIDE_STAGING_ADMIN_EMAILS,
    CHUNESIDE_ENABLE_LOCAL_AUTH: "0",
    NEXT_PUBLIC_SUPABASE_URL: env.CHUNESIDE_STAGING_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.CHUNESIDE_STAGING_SUPABASE_PUBLISHABLE_KEY,
  });
} else {
  for (const name of [
    "CHUNESIDE_STAGING_ACCESS_GATE",
    "CHUNESIDE_STAGING_ADMIN_EMAILS",
    "CHUNESIDE_STAGING_SUPABASE_URL",
    "CHUNESIDE_STAGING_SUPABASE_PUBLISHABLE_KEY",
  ]) {
    delete env[name];
  }
  env.CHUNESIDE_DEPLOY_TARGET = buildTarget;
}

const runtimeRoot = process.env.SITES_RUNTIME_ROOT || path.join(projectRoot, ".sites-runtime");
const directories = ["home", "npm-cache", "xdg-config", "tmp", path.join("wrangler", "logs")].map((directory) => path.join(runtimeRoot, directory));
await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true })));
Object.assign(env, { SITES_ENV_READY: "1", SITES_PROJECT_ROOT: projectRoot, HOME: path.join(runtimeRoot, "home"), XDG_CONFIG_HOME: path.join(runtimeRoot, "xdg-config"), TMPDIR: path.join(runtimeRoot, "tmp"), WRANGLER_WRITE_LOGS: "false", WRANGLER_LOG_PATH: path.join(runtimeRoot, "wrangler", "logs"), MINIFLARE_REGISTRY_PATH: path.join(runtimeRoot, "wrangler", "registry"), npm_config_cache: path.join(runtimeRoot, "npm-cache"), npm_config_audit: "false", npm_config_fund: "false", npm_config_update_notifier: "false" });
const command = process.platform === "win32" ? process.execPath : path.join(projectRoot, "node_modules", ".bin", "vinext");
const args = process.platform === "win32"
  ? [path.join(projectRoot, "node_modules", "vinext", "dist", "cli.js"), "build"]
  : ["build"];
const child = spawn(command, args, { cwd: projectRoot, env, stdio: "inherit" });
const timeoutMs = parseDuration(process.env.SITES_BUILD_TIMEOUT || "3m");
const killAfterMs = parseDuration(process.env.SITES_BUILD_KILL_AFTER || "10s");
const timer = setTimeout(() => { console.error(`Build exceeded ${timeoutMs}ms; stopping it.`); child.kill("SIGTERM"); setTimeout(() => child.kill("SIGKILL"), killAfterMs).unref(); }, timeoutMs);
child.on("exit", (code, signal) => { clearTimeout(timer); process.exit(signal ? 1 : (code ?? 1)); });
function parseDuration(value) { const match = /^(\d+)(ms|s|m|h)$/.exec(value.trim()); if (!match) throw new Error(`Invalid duration: ${value}`); return Number(match[1]) * ({ ms: 1, s: 1000, m: 60000, h: 3600000 }[match[2]]); }
