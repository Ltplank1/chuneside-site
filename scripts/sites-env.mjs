import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimeRoot = process.env.SITES_RUNTIME_ROOT || path.join(projectRoot, ".sites-runtime");
const runtimeDirectories = ["home", "npm-cache", "xdg-config", "tmp", path.join("wrangler", "logs")];
await Promise.all(runtimeDirectories.map((directory) => mkdir(path.join(runtimeRoot, directory), { recursive: true })));

const commandArgs = process.argv.slice(2);
if (commandArgs[0] === "--") commandArgs.shift();
if (!commandArgs.length) throw new Error("Usage: scripts/sites-env.mjs -- command [args...]");

const [requestedCommand, ...args] = commandArgs;
const command = requestedCommand === "node" || requestedCommand === "eslint" || requestedCommand === "drizzle-kit"
  ? process.execPath
  : requestedCommand;
const resolvedArgs = requestedCommand === "node"
  ? args
  : requestedCommand === "eslint"
  ? [path.join(projectRoot, "node_modules", "eslint", "bin", "eslint.js"), ...args]
  : requestedCommand === "drizzle-kit"
    ? [path.join(projectRoot, "node_modules", "drizzle-kit", "bin.cjs"), ...args]
    : args;
const env = {
  ...process.env,
  SITES_ENV_READY: "1",
  SITES_PROJECT_ROOT: projectRoot,
  HOME: path.join(runtimeRoot, "home"),
  XDG_CONFIG_HOME: path.join(runtimeRoot, "xdg-config"),
  TMPDIR: path.join(runtimeRoot, "tmp"),
  WRANGLER_WRITE_LOGS: "false",
  WRANGLER_LOG_PATH: path.join(runtimeRoot, "wrangler", "logs"),
  MINIFLARE_REGISTRY_PATH: path.join(runtimeRoot, "wrangler", "registry"),
  npm_config_cache: path.join(runtimeRoot, "npm-cache"),
  npm_config_audit: "false",
  npm_config_fund: "false",
  npm_config_update_notifier: "false",
};
for (const key of ["NPM_CONFIG_CACHE", "npm_config_proxy", "npm_config_http_proxy", "npm_config_https_proxy", "NPM_CONFIG_PROXY", "NPM_CONFIG_HTTP_PROXY", "NPM_CONFIG_HTTPS_PROXY"]) {
  delete env[key];
}

const child = spawn(command, resolvedArgs, { cwd: projectRoot, env, stdio: "inherit", shell: false });
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
