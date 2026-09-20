export type SortableStagePerformance = {
  title: string;
  description: string;
  artistStageName: string;
  songsPerformed: string[];
  genre: string;
  region: string;
  performanceDate: string | null;
  status: "published" | "featured";
  homePlacement: string;
  featureStartAt: string | null;
  featureEndAt: string | null;
  viewCount: number;
  performanceType?: "artist" | "dj";
};

export function sortPublicStagePerformances<T extends SortableStagePerformance>(performances: T[], now = new Date()) {
  return [...performances].sort((a, b) => {
    const placement = placementRank(a, now) - placementRank(b, now);
    if (placement !== 0) return placement;
    const views = b.viewCount - a.viewCount;
    if (views !== 0 && (isPlacementActive(a, now) || isPlacementActive(b, now))) return views;
    return sortDate(b) - sortDate(a) || a.title.localeCompare(b.title);
  });
}

export function isPlacementActive(performance: SortableStagePerformance, now = new Date()) {
  if (performance.homePlacement === "none") return false;
  const timestamp = now.getTime();
  const starts = performance.featureStartAt ? Date.parse(performance.featureStartAt) : null;
  const ends = performance.featureEndAt ? Date.parse(performance.featureEndAt) : null;
  return (starts === null || starts <= timestamp) && (ends === null || ends >= timestamp);
}

export function filterPublicStagePerformances<T extends SortableStagePerformance>(
  performances: T[],
  filters: { query?: string; region?: string; genre?: string; type?: string },
) {
  const query = (filters.query ?? "").trim().toLowerCase();
  const region = (filters.region ?? "").trim();
  const genre = (filters.genre ?? "").trim();
  const type = (filters.type ?? "").trim();

  return performances.filter((performance) => {
    const regionMatch = !region || performance.region === region;
    const genreMatch = !genre || performance.genre === genre;
    const typeMatch = !type || performance.performanceType === type;
    const searchText = [
      performance.title,
      performance.artistStageName,
      performance.description,
      performance.genre,
      performance.region,
      ...performance.songsPerformed,
    ].join(" ").toLowerCase();
    return regionMatch && genreMatch && typeMatch && (!query || searchText.includes(query));
  });
}

function placementRank(performance: SortableStagePerformance, now: Date) {
  if (isPlacementActive(performance, now)) {
    if (performance.homePlacement === "featured") return 0;
    if (performance.homePlacement === "latest") return 1;
    if (performance.homePlacement === "most_watched" || performance.homePlacement === "trending") return 2;
    if (performance.homePlacement === "wadadli" || performance.homePlacement === "caribbean") return 3;
    return 4;
  }
  return performance.status === "featured" ? 5 : 6;
}

function sortDate(performance: SortableStagePerformance) {
  return Date.parse(performance.performanceDate ?? "") || 0;
}
