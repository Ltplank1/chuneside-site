export const stageStatuses = ["draft", "submitted", "pending_review", "approved", "scheduled", "published", "featured", "rejected", "archived"] as const;
export const stagePerformanceTypes = ["artist", "dj"] as const;
export const stagePlacements = ["none", "featured", "latest", "trending", "most_watched", "wadadli", "caribbean"] as const;
export const stageFeeStatuses = ["not_required", "free_promotion", "discounted", "waived", "pending", "paid"] as const;

export type StageStatus = typeof stageStatuses[number];
export type StagePerformanceType = typeof stagePerformanceTypes[number];
export type StagePlacement = typeof stagePlacements[number];
export type StageFeeStatus = typeof stageFeeStatuses[number];

export function extractYouTubeVideoId(value: string | null | undefined) {
  const input = value?.trim();
  if (!input) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

  try {
    const url = new URL(input);
    if (url.hostname.includes("youtu.be")) return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (url.hostname.includes("youtube.com")) {
      if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
        return url.pathname.split("/").filter(Boolean)[1] ?? null;
      }
      return url.searchParams.get("v");
    }
  } catch {
    return null;
  }

  return null;
}

export function parseSongsPerformed(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function stageStatusNeedsConsent(status: StageStatus) {
  return ["approved", "scheduled", "published", "featured"].includes(status);
}

export type StageTracklistInput = {
  title: string;
  externalArtistName?: string | null;
  artistProfileId?: string | null;
  releaseId?: string | null;
  externalInfo?: string | null;
};

export function normalizeTracklist(entries: StageTracklistInput[]) {
  return entries
    .map((entry) => ({
      title: entry.title.trim(),
      externalArtistName: entry.externalArtistName?.trim() || null,
      artistProfileId: entry.artistProfileId || null,
      releaseId: entry.releaseId || null,
      externalInfo: entry.externalInfo?.trim() || null,
    }))
    .filter((entry) => entry.title)
    .slice(0, 30);
}
