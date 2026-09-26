import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ANALYZER_VERSION = "technical-audio-prototype-1";
const MAX_INPUT_BYTES = 40 * 1024 * 1024;
const MAX_DECODED_BYTES = 512 * 1024 * 1024;
const MAX_TEXT_BYTES = 64 * 1024;
const TIMEOUT_MS = 30_000;

function finding(code, classification, severity, message) {
  return { code, classification, severity, message };
}

function makeResult(media, startedAt) {
  return {
    contractVersion: 1,
    analyzerVersion: ANALYZER_VERSION,
    media,
    status: "inconclusive",
    metrics: {},
    findings: [],
    failure: null,
    startedAt,
    completedAt: null,
    processingMs: null,
  };
}

function finish(result, start) {
  result.completedAt = new Date().toISOString();
  result.processingMs = Math.round(performance.now() - start);
  return result;
}

function runTool(binary, args, { onStdout, timeoutMs = TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let stdout = "";
    let stdoutBytes = 0;
    let settled = false;
    let stoppedFor = null;
    const stop = (reason) => {
      if (stoppedFor) return;
      stoppedFor = reason;
      child.kill();
    };
    const timer = setTimeout(() => stop("timeout"), timeoutMs);
    const done = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    child.on("error", (error) => done(error));
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (onStdout) {
        try { onStdout(chunk, stdoutBytes); } catch (error) { stop(error); }
      } else if (stdoutBytes <= MAX_TEXT_BYTES) {
        stdout += chunk.toString("utf8");
      } else stop("output_limit");
    });
    child.stderr.on("data", (chunk) => {
      if (Buffer.byteLength(stderr) + chunk.length <= MAX_TEXT_BYTES) stderr += chunk.toString("utf8");
      else stop("output_limit");
    });
    child.on("close", (code) => {
      if (stoppedFor) return done(new Error(typeof stoppedFor === "string" ? stoppedFor : stoppedFor.message));
      if (code !== 0) return done(new Error(`tool_exit_${code}: ${stderr.slice(0, 300)}`));
      done(null, stdout);
    });
  });
}

function sampleAccumulator(channels) {
  const sums = Array(channels).fill(0);
  const peaks = Array(channels).fill(0);
  const clipped = Array(channels).fill(0);
  let samples = 0;
  let silentFrames = 0;
  let remainder = Buffer.alloc(0);
  return {
    add(chunk, totalBytes) {
      if (totalBytes > MAX_DECODED_BYTES) throw new Error("decoded_size_limit");
      const data = remainder.length ? Buffer.concat([remainder, chunk]) : chunk;
      const frameBytes = channels * 4;
      const complete = data.length - (data.length % frameBytes);
      for (let offset = 0; offset < complete; offset += frameBytes) {
        let quiet = true;
        for (let channel = 0; channel < channels; channel++) {
          const value = data.readFloatLE(offset + channel * 4);
          if (!Number.isFinite(value)) throw new Error("non_finite_sample");
          const magnitude = Math.abs(value);
          sums[channel] += value * value;
          peaks[channel] = Math.max(peaks[channel], magnitude);
          if (magnitude >= 0.999) clipped[channel]++;
          if (magnitude >= 0.001) quiet = false;
        }
        samples++;
        if (quiet) silentFrames++;
      }
      remainder = data.subarray(complete);
    },
    metrics() {
      if (!samples || remainder.length) throw new Error("incomplete_pcm_output");
      return {
        decodedFrames: samples,
        rmsByChannel: sums.map((sum) => Math.sqrt(sum / samples)),
        peakByChannel: peaks,
        clippedFractionByChannel: clipped.map((count) => count / samples),
        silenceFraction: silentFrames / samples,
      };
    },
  };
}

export async function analyzeLocalAudio(file, { ffmpeg = "ffmpeg", ffprobe = "ffprobe", timeoutMs = TIMEOUT_MS, media = null } = {}) {
  const start = performance.now();
  const startedAt = new Date().toISOString();
  const result = makeResult(media, startedAt);
  const input = path.resolve(file);
  let size;
  try {
    const info = await stat(input);
    if (!info.isFile() || info.size === 0 || info.size > MAX_INPUT_BYTES) throw new Error("invalid_input_size");
    size = info.size;
  } catch (error) {
    result.failure = { kind: "input_error", code: error.message === "invalid_input_size" ? "invalid_input_size" : "file_unavailable" };
    return finish(result, start);
  }
  try {
    const output = await runTool(ffprobe, ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_entries", "format=format_name,duration,bit_rate:stream=index,codec_type,codec_name,sample_rate,channels,bits_per_raw_sample,bits_per_sample,bit_rate", "-of", "json", "-i", input], { timeoutMs });
    const probe = JSON.parse(output);
    const streams = probe.streams?.filter((stream) => stream.codec_type === "audio") ?? [];
    if (streams.length !== 1) throw new Error("unsupported_audio_stream_count");
    const stream = streams[0];
    const channels = Number(stream.channels);
    const sampleRate = Number(stream.sample_rate);
    if (!Number.isInteger(channels) || channels < 1 || channels > 8 || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
      throw new Error("unsupported_audio_layout");
    }
    const accumulator = sampleAccumulator(channels);
    await runTool(ffmpeg, ["-nostdin", "-v", "error", "-xerror", "-protocol_whitelist", "file,pipe", "-i", input, "-map", `0:${stream.index}`, "-vn", "-sn", "-dn", "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1"], {
      timeoutMs,
      onStdout: (chunk, totalBytes) => accumulator.add(chunk, totalBytes),
    });
    const signal = accumulator.metrics();
    const rms = signal.rmsByChannel;
    const durationSeconds = signal.decodedFrames / sampleRate;
    result.metrics = {
      inputBytes: size,
      container: probe.format?.format_name ?? null,
      codec: stream.codec_name ?? null,
      sampleRateHz: sampleRate,
      channels,
      bitDepth: Number(stream.bits_per_raw_sample || stream.bits_per_sample) || null,
      reportedBitrateBps: Number(stream.bit_rate || probe.format?.bit_rate) || null,
      reportedDurationSeconds: Number(probe.format?.duration) || null,
      decodedDurationSeconds: durationSeconds,
      ...signal,
    };
    result.findings.push(finding("decoded_audio", "deterministic", "info", "The selected audio stream decoded completely."));
    if (channels === 1) result.findings.push(finding("mono_layout", "informational", "info", "This source has one channel."));
    if (channels === 2) {
      const silent = rms.map((value) => value < 0.0001);
      if (silent[0] !== silent[1] && Math.max(...rms) > 0.02) {
        const exactlySilent = rms[silent[0] ? 0 : 1] === 0;
        result.findings.push(finding(silent[0] ? "silent_left_channel" : "silent_right_channel", exactlySilent ? "deterministic" : "heuristic", "warning", exactlySilent ? "One decoded channel is entirely silent." : "One decoded channel is nearly silent."));
      } else if (Math.min(...rms) > 0.0001 && 20 * Math.log10(Math.max(...rms) / Math.min(...rms)) >= 12) {
        result.findings.push(finding("severe_channel_imbalance", "heuristic", "warning", "Channel RMS differs by at least 12 dB."));
      }
    }
    if (signal.clippedFractionByChannel.some((fraction) => fraction >= 0.01)) {
      result.findings.push(finding("frequent_digital_peaks", "heuristic", "warning", "At least 1% of samples approach digital full scale."));
    }
    if (signal.silenceFraction >= 0.5) result.findings.push(finding("unusual_silence", "heuristic", "warning", "At least half the decoded frames are near silent."));
    result.status = result.findings.some((item) => item.severity === "warning") ? "warning" : "pass";
  } catch (error) {
    const message = String(error?.message ?? error);
    const processorCodes = ["timeout", "output_limit", "decoded_size_limit", "non_finite_sample", "incomplete_pcm_output"];
    const processorFailure = processorCodes.includes(message) || error?.code === "ENOENT";
    result.failure = { kind: processorFailure ? "processor_error" : "decode_error", code: processorFailure ? (error?.code === "ENOENT" ? "tool_unavailable" : message) : "probe_or_decode_failed" };
    result.findings.push(finding(result.failure.code, processorFailure ? "informational" : "deterministic", processorFailure ? "warning" : "critical", processorFailure ? "Analysis did not complete." : "The selected audio stream could not be fully decoded."));
    result.status = processorFailure ? "inconclusive" : "fail";
  }
  return finish(result, start);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node tools/audio-technical/analyze.mjs <local-audio-file>");
    process.exitCode = 2;
  } else {
    const result = await analyzeLocalAudio(file, { ffmpeg: process.env.FFMPEG_PATH || "ffmpeg", ffprobe: process.env.FFPROBE_PATH || "ffprobe" });
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "inconclusive") process.exitCode = 1;
  }
}
