import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const RATE = 44100;
const FRAMES = RATE;

function wav(left, right = null) {
  const channels = right ? 2 : 1;
  const bytes = FRAMES * channels * 2;
  const data = Buffer.alloc(44 + bytes);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + bytes, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(channels, 22);
  data.writeUInt32LE(RATE, 24);
  data.writeUInt32LE(RATE * channels * 2, 28);
  data.writeUInt16LE(channels * 2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(bytes, 40);
  for (let i = 0; i < FRAMES; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left(i))) * 32767), 44 + i * channels * 2);
    if (right) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right(i))) * 32767), 46 + i * channels * 2);
  }
  return data;
}

export async function createAudioFixtures(directory, { ffmpeg = "ffmpeg" } = {}) {
  await mkdir(directory, { recursive: true });
  const tone = (frequency, amplitude = 0.4) => (i) => amplitude * Math.sin(2 * Math.PI * frequency * i / RATE);
  const files = {
    stereo: path.join(directory, "known-good-stereo.wav"),
    mono: path.join(directory, "mono.wav"),
    silentLeft: path.join(directory, "silent-left.wav"),
    imbalance: path.join(directory, "imbalance.wav"),
    clipping: path.join(directory, "clipping.wav"),
    silence: path.join(directory, "long-silence.wav"),
    corrupt: path.join(directory, "fake-audio.wav"),
    mp3: path.join(directory, "known-good-stereo.mp3"),
  };
  await Promise.all([
    writeFile(files.stereo, wav(tone(440), tone(660))),
    writeFile(files.mono, wav(tone(440))),
    writeFile(files.silentLeft, wav(() => 0, tone(440))),
    writeFile(files.imbalance, wav(tone(440), tone(660, 0.03))),
    writeFile(files.clipping, wav((i) => i % 2 ? 1 : -1, (i) => i % 2 ? 1 : -1)),
    writeFile(files.silence, wav((i) => i < RATE * 0.7 ? 0 : tone(440)(i), (i) => i < RATE * 0.7 ? 0 : tone(660)(i))),
    writeFile(files.corrupt, Buffer.from("RIFF\x00\x00\x00\x00WAVE-not-real-audio")),
  ]);
  await exec(ffmpeg, ["-nostdin", "-v", "error", "-y", "-i", files.stereo, "-codec:a", "libmp3lame", "-b:a", "320k", files.mp3], { timeout: 30_000, maxBuffer: 64 * 1024 });
  return files;
}
