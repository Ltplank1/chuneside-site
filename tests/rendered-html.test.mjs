import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("build emits the Cloudflare worker and ChuneSide client", async () => {
  await access(new URL("../dist/server/index.js", import.meta.url));
  const clientManifest = await readFile(
    new URL("../dist/client/.vite/manifest.json", import.meta.url),
    "utf8",
  );
  assert.match(clientManifest, /app\/page\.tsx/);

  const assets = await readdir(
    new URL("../dist/client/assets/", import.meta.url),
  );
  assert.ok(assets.some((name) => name.endsWith(".css")));
});
