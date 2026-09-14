export const mediaRules = {
  audio: {
    maxBytes: 40 * 1024 * 1024,
    contentTypes: ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/ogg"],
  },
  cover: {
    maxBytes: 8 * 1024 * 1024,
    contentTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  video: {
    maxBytes: 100 * 1024 * 1024,
    contentTypes: ["video/mp4", "video/webm", "video/quicktime"],
  },
  profile: {
    maxBytes: 4 * 1024 * 1024,
    contentTypes: ["image/jpeg", "image/png", "image/webp"],
  },
} as const;

export type MediaKind = keyof typeof mediaRules;

export function validateMediaFile(kind: MediaKind, file: { size: number; type: string }, header: Uint8Array) {
  const rule = mediaRules[kind];
  if (!rule.contentTypes.includes(file.type as never)) return `Unsupported ${kind} file type.`;
  if (file.size < 1 || file.size > rule.maxBytes) return `${mediaLabel(kind)} files must be ${mediaLimitLabel(kind)} or smaller.`;

  const ascii = String.fromCharCode(...header);
  const imageSignature =
    (file.type === "image/jpeg" && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) ||
    (file.type === "image/png" && header[0] === 0x89 && ascii.slice(1, 4) === "PNG") ||
    (file.type === "image/webp" && ascii.slice(0, 4) === "RIFF" && ascii.slice(8, 12) === "WEBP");
  const audioSignature =
    (file.type === "audio/mpeg" && (ascii.slice(0, 3) === "ID3" || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0))) ||
    (["audio/wav", "audio/x-wav"].includes(file.type) && ascii.slice(0, 4) === "RIFF" && ascii.slice(8, 12) === "WAVE") ||
    (file.type === "audio/mp4" && ascii.slice(4, 8) === "ftyp") ||
    (file.type === "audio/ogg" && ascii.slice(0, 4) === "OggS");
  const videoSignature =
    (["video/mp4", "video/quicktime"].includes(file.type) && ascii.slice(4, 8) === "ftyp") ||
    (file.type === "video/webm" && header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3);

  if (kind === "audio") return audioSignature ? null : "The audio file contents do not match its type.";
  if (kind === "video") return videoSignature ? null : "The video file contents do not match its type.";
  return imageSignature ? null : `The ${kind === "profile" ? "profile photo" : "cover"} file contents do not match its type.`;
}

function mediaLabel(kind: MediaKind) {
  return kind === "audio" ? "Audio" : kind === "video" ? "Video" : kind === "profile" ? "Profile photo" : "Cover";
}

function mediaLimitLabel(kind: MediaKind) {
  return kind === "audio" ? "40 MB" : kind === "video" ? "100 MB" : kind === "profile" ? "4 MB" : "8 MB";
}

export function parseByteRange(value: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || size < 1) return null;
  const startText = match[1];
  const endText = match[2];
  if (!startText && !endText) return null;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength < 1) return null;
    const length = Math.min(suffixLength, size);
    return { offset: size - length, length };
  }

  const offset = Number(startText);
  const requestedEnd = endText ? Number(endText) : size - 1;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(requestedEnd) || offset < 0 || offset >= size || requestedEnd < offset) return null;
  const end = Math.min(requestedEnd, size - 1);
  return { offset, length: end - offset + 1 };
}
