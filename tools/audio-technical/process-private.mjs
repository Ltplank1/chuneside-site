import { createWriteStream } from "node:fs";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import os from "node:os";
import path from "node:path";
import { analyzeLocalAudio, ANALYZER_VERSION } from "./analyze.mjs";

export const MAX_PRIVATE_AUDIO_BYTES = 40 * 1024 * 1024;

// This module is for a native processor runtime only; never import it from the Worker.
export async function analyzePrivateAudio({ body, sizeBytes, media, signal }, tools = {}) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_PRIVATE_AUDIO_BYTES) {
    throw new Error("private_audio_size_invalid");
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), "chuneside-analysis-"));
  const file = path.join(directory, "input.audio");
  try {
    await chmod(directory, 0o700);
    let received = 0;
    const limit = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length;
        callback(received > sizeBytes || received > MAX_PRIVATE_AUDIO_BYTES
          ? new Error("private_audio_size_mismatch") : null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(body), limit, createWriteStream(file, { flags: "wx", mode: 0o600 }), { signal });
    if (received !== sizeBytes) throw new Error("private_audio_size_mismatch");
    if (signal?.aborted) throw new Error("processor_lease_lost");
    const result = await analyzeLocalAudio(file, { ...tools, media, signal });
    if (signal?.aborted) throw new Error("processor_lease_lost");
    return result;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export const PRIVATE_ANALYZER_VERSION = ANALYZER_VERSION;
