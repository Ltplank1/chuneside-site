import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimeRoot = process.env.SITES_RUNTIME_ROOT || path.join(projectRoot, ".sites-runtime");
const cacheRoot = path.join(runtimeRoot, "npm-cache");
await mkdir(cacheRoot, { recursive: true });

const lockfile = await readFile(path.join(projectRoot, "package-lock.json"));
const lockfileSha256 = createHash("sha256").update(lockfile).digest("hex");
const npmCli = process.env.npm_execpath;
const npmCommand = npmCli ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm");
const npmArgs = npmCli ? [npmCli, "ci", "--cache", cacheRoot] : ["ci", "--cache", cacheRoot];
const child = spawn(npmCommand, npmArgs, {
  cwd: projectRoot,
  env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false", npm_config_update_notifier: "false", npm_config_fetch_retries: "0", npm_config_fetch_timeout: "30000" },
  stdio: "inherit",
  shell: false,
});

const timeoutMs = parseDuration(process.env.SITES_INSTALL_TIMEOUT || "8m");
const killAfterMs = parseDuration(process.env.SITES_INSTALL_KILL_AFTER || "15s");
const timer = setTimeout(() => {
  console.error(`Dependency installation exceeded ${timeoutMs}ms; stopping it.`);
  child.kill("SIGTERM");
  setTimeout(() => child.kill("SIGKILL"), killAfterMs).unref();
}, timeoutMs);

child.on("exit", async (code, signal) => {
  clearTimeout(timer);
  if (!signal && code === 0) {
    await writeFile(path.join(projectRoot, "node_modules", ".sites-install.json"), `${JSON.stringify({ lockfile_sha256: lockfileSha256, node: process.version, platform: `${process.platform}-${process.arch}` }, null, 2)}\n`);
  }
  process.exit(signal ? 1 : (code ?? 1));
});

function parseDuration(value) {
  const match = /^(\d+)(ms|s|m|h)$/.exec(value.trim());
  if (!match) throw new Error(`Invalid duration: ${value}`);
  return Number(match[1]) * ({ ms: 1, s: 1000, m: 60000, h: 3600000 }[match[2]]);
}
