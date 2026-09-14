import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
await mkdir(path.join(projectRoot, ".wrangler"), { recursive: true });

const vite = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const child = spawn(process.execPath, [vite, ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: { ...process.env, WRANGLER_LOG_PATH: path.join(projectRoot, ".wrangler", "wrangler.log") },
  stdio: "inherit",
});

const forwardSignal = (signal) => child.kill(signal);
process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
