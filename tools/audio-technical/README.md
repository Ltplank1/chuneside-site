# Local Technical Audio prototype

This standalone Node CLI uses native FFprobe for metadata and native FFmpeg for a complete PCM decode. It is not imported by the Cloudflare Worker, does not contact D1/R2, and does not write analysis results to ChuneSide. Supply a **local file path** only.

Requires Node 22+ and FFmpeg/FFprobe executables. By default the commands are resolved from PATH; `FFMPEG_PATH` and `FFPROBE_PATH` can point to existing local executables. No binary is installed or bundled here.

```sh
node tools/audio-technical/analyze.mjs path/to/local-audio.wav
node --test tests/technical-audio-local.test.mjs
```

The result uses `contractVersion: 1` and `analyzerVersion: technical-audio-prototype-1`. The optional `media` field is an opaque caller-provided identity for local comparisons; it is not checked against D1. `metrics` contains observed metadata and decoded-signal measurements. Each finding has a `classification` (`deterministic`, `informational`, or `heuristic`) and separate severity. `failure.kind` distinguishes input, processor, and decode failures. A heuristic warning is never an artist rejection.

The tests create deterministic one-second WAV fixtures in the OS temporary directory, plus a 320 kbps MP3 encoded from the stereo WAV. They remove the files afterward. The fixture generator is `fixtures.mjs` if longer-lived local copies are needed.

Execution is bounded to a 40 MiB input, 512 MiB streamed decoded output, 64 KiB diagnostic output, and 30 seconds per tool by default. Native tools are launched without a shell; no user-controlled option strings are interpolated into commands. The FFmpeg invocation restricts input protocols to `file,pipe`. This is still a prototype: untrusted media should ultimately run inside an isolated, resource-limited processor container. It does not prove mobile browser compatibility or subjective mix quality.
