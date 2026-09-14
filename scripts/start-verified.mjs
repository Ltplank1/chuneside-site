import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimeRoot = process.env.SITES_RUNTIME_ROOT || path.join(projectRoot, ".sites-runtime");
await mkdir(path.join(runtimeRoot, "wrangler", "logs"), { recursive: true });

const vinext = path.join(projectRoot, "node_modules", "vinext", "dist", "cli.js");
const child = spawn(process.execPath, [vinext, "start", ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: { ...process.env, WRANGLER_LOG_PATH: path.join(runtimeRoot, "wrangler", "logs", "wrangler.log") },
  stdio: "inherit",
});

const forwardSignal = (signal) => child.kill(signal);
process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
