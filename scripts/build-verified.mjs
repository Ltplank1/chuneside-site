import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimeRoot = process.env.SITES_RUNTIME_ROOT || path.join(projectRoot, ".sites-runtime");
const directories = ["home", "npm-cache", "xdg-config", "tmp", path.join("wrangler", "logs")].map((directory) => path.join(runtimeRoot, directory));
await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true })));
const env = { ...process.env, SITES_ENV_READY: "1", SITES_PROJECT_ROOT: projectRoot, HOME: path.join(runtimeRoot, "home"), XDG_CONFIG_HOME: path.join(runtimeRoot, "xdg-config"), TMPDIR: path.join(runtimeRoot, "tmp"), WRANGLER_WRITE_LOGS: "false", WRANGLER_LOG_PATH: path.join(runtimeRoot, "wrangler", "logs"), MINIFLARE_REGISTRY_PATH: path.join(runtimeRoot, "wrangler", "registry"), npm_config_cache: path.join(runtimeRoot, "npm-cache"), npm_config_audit: "false", npm_config_fund: "false", npm_config_update_notifier: "false" };
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
