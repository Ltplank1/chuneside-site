import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeLocalAudio, ANALYZER_VERSION } from "../tools/audio-technical/analyze.mjs";
import { createAudioFixtures } from "../tools/audio-technical/fixtures.mjs";

const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobe = process.env.FFPROBE_PATH || "ffprobe";

test("local FFmpeg processor reports measurements and bounded findings", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "chuneside-audio-fixtures-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const files = await createAudioFixtures(directory, { ffmpeg });
  const analyze = (file) => analyzeLocalAudio(file, { ffmpeg, ffprobe, media: { id: "fixture", variant: "master", version: 1 } });

  const stereo = await analyze(files.stereo);
  assert.equal(stereo.contractVersion, 1);
  assert.equal(stereo.analyzerVersion, ANALYZER_VERSION);
  assert.equal(stereo.status, "pass");
  assert.equal(stereo.metrics.channels, 2);
  assert.ok(Math.abs(stereo.metrics.decodedDurationSeconds - 1) < 0.01);
  assert.equal(stereo.findings[0].classification, "deterministic");
  assert.deepEqual(stereo.media, { id: "fixture", variant: "master", version: 1 });

  const mono = await analyze(files.mono);
  assert.equal(mono.status, "pass");
  assert.ok(mono.findings.some((item) => item.code === "mono_layout" && item.classification === "informational"));

  const silentLeft = await analyze(files.silentLeft);
  assert.equal(silentLeft.status, "warning");
  assert.ok(silentLeft.findings.some((item) => item.code === "silent_left_channel" && item.classification === "deterministic"));

  const imbalance = await analyze(files.imbalance);
  assert.ok(imbalance.findings.some((item) => item.code === "severe_channel_imbalance" && item.classification === "heuristic"));

  const clipping = await analyze(files.clipping);
  assert.ok(clipping.findings.some((item) => item.code === "frequent_digital_peaks" && item.classification === "heuristic"));

  const silence = await analyze(files.silence);
  assert.ok(silence.findings.some((item) => item.code === "unusual_silence" && item.classification === "heuristic"));

  const corrupt = await analyze(files.corrupt);
  assert.equal(corrupt.status, "fail");
  assert.equal(corrupt.failure.kind, "decode_error");

  const mp3 = await analyzeLocalAudio(files.mp3, { ffmpeg, ffprobe, media: { id: "derived", variant: "stream", version: 1, sourceMediaId: "fixture" } });
  assert.equal(mp3.status, "pass");
  assert.equal(mp3.metrics.codec, "mp3");
  assert.ok(Math.abs(mp3.metrics.decodedDurationSeconds - stereo.metrics.decodedDurationSeconds) < 0.1);
  assert.equal(mp3.media.sourceMediaId, "fixture");
});

test("missing input and unavailable tools remain inconclusive", async (t) => {
  const missing = await analyzeLocalAudio(path.join(os.tmpdir(), "chuneside-does-not-exist.wav"));
  assert.equal(missing.status, "inconclusive");
  assert.equal(missing.failure.kind, "input_error");
  const directory = await mkdtemp(path.join(os.tmpdir(), "chuneside-audio-tool-error-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const files = await createAudioFixtures(directory, { ffmpeg });
  const unavailable = await analyzeLocalAudio(files.stereo, { ffprobe: path.join(directory, "missing-ffprobe"), ffmpeg });
  assert.equal(unavailable.status, "inconclusive");
  assert.deepEqual(unavailable.failure, { kind: "processor_error", code: "tool_unavailable" });
});
