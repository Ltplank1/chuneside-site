import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { artistProfiles, listeningEvents, releases, shareEvents, songLikes } from "@/db/schema";
import { publicReleaseCondition } from "@/lib/release-visibility";

type ListeningRow = {
  eventId: string;
  releaseId: string;
  artistProfileId: string;
  artistName: string;
  title: string;
  genre: string;
  legacyTrackId: number | null;
  startedAt: Date;
  listenerKeyHash: string;
  durationSeconds: number;
  completed: boolean;
  qualified: boolean;
  repeatListening: boolean;
};

type MetricMaps = { likes: Map<string, number>; shares: Map<string, number> };

export type ListeningSongSummary = {
  releaseId: string;
  artistProfileId: string;
  artistName: string;
  title: string;
  genre: string;
  totalStreams: number;
  qualifiedStreams: number;
  uniqueListeners: number;
  repeatListens: number;
  returningListeners: number;
  likes: number;
  shares: number;
  averageDurationSeconds: number;
  completionRate: number;
  returnRate: number;
};

function summarize(rows: ListeningRow[], releaseId: string | undefined, metrics: MetricMaps) {
  const qualifiedRows = rows.filter((row) => row.qualified);
  const listeners = new Map<string, number>();
  for (const row of qualifiedRows) listeners.set(row.listenerKeyHash, (listeners.get(row.listenerKeyHash) ?? 0) + 1);
  const uniqueListeners = listeners.size;
  const returningListeners = [...listeners.values()].filter((count) => count > 1).length;
  const first = rows[0];
  const releaseIds = new Set(rows.map((row) => row.releaseId));
  const likes = [...releaseIds].reduce((sum, id) => sum + (metrics.likes.get(id) ?? 0), 0);
  const shares = [...releaseIds].reduce((sum, id) => sum + (metrics.shares.get(id) ?? 0), 0);
  return {
    totalStreams: rows.length,
    qualifiedStreams: qualifiedRows.length,
    uniqueListeners,
    repeatListens: rows.filter((row) => row.repeatListening).length,
    returningListeners,
    likes,
    shares,
    averageDurationSeconds: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.durationSeconds, 0) / rows.length) : 0,
    completionRate: qualifiedRows.length ? Math.round(qualifiedRows.filter((row) => row.completed).length / qualifiedRows.length * 100) : 0,
    returnRate: uniqueListeners ? Math.round(returningListeners / uniqueListeners * 100) : 0,
    ...(releaseId ? { releaseId, artistProfileId: first?.artistProfileId ?? "", artistName: first?.artistName ?? "Unknown artist", title: first?.title ?? "Unknown release", genre: first?.genre ?? "" } : {}),
  };
}

export async function getListeningAnalytics({ from, to, releaseId }: { from: Date; to: Date; releaseId?: string }) {
  const conditions = [gte(listeningEvents.startedAt, from), lte(listeningEvents.startedAt, to), publicReleaseCondition(), eq(artistProfiles.visibility, "public")];
  if (releaseId) conditions.push(eq(listeningEvents.releaseId, releaseId));
  const rows = await getDb().select({
    eventId: listeningEvents.id, releaseId: listeningEvents.releaseId, artistProfileId: artistProfiles.id, artistName: artistProfiles.stageName,
    title: releases.title, genre: releases.genre, legacyTrackId: releases.legacyTrackId, startedAt: listeningEvents.startedAt,
    listenerKeyHash: listeningEvents.listenerKeyHash, durationSeconds: listeningEvents.durationSeconds, completed: listeningEvents.completed,
    qualified: listeningEvents.qualified, repeatListening: listeningEvents.repeatListening,
  }).from(listeningEvents).innerJoin(releases, eq(listeningEvents.releaseId, releases.id)).innerJoin(artistProfiles, eq(releases.artistProfileId, artistProfiles.id))
    .where(and(...conditions)).orderBy(asc(listeningEvents.startedAt));

  const typedRows = rows as ListeningRow[];
  const releaseIds = [...new Set(typedRows.map((row) => row.releaseId))];
  const likeRows = releaseIds.length ? await getDb().select({ trackId: songLikes.trackId }).from(songLikes)
    .innerJoin(releases, eq(songLikes.trackId, releases.legacyTrackId))
    .where(and(inArray(releases.id, releaseIds), gte(songLikes.createdAt, from), lte(songLikes.createdAt, to))) : [];
  const shareRows = releaseIds.length ? await getDb().select({ releaseId: shareEvents.releaseId }).from(shareEvents)
    .where(and(inArray(shareEvents.releaseId, releaseIds), gte(shareEvents.sharedAt, from), lte(shareEvents.sharedAt, to))) : [];
  const legacyToRelease = new Map(typedRows.filter((row) => row.legacyTrackId !== null).map((row) => [row.legacyTrackId as number, row.releaseId]));
  const likes = new Map<string, number>();
  for (const row of likeRows) { const id = legacyToRelease.get(row.trackId); if (id) likes.set(id, (likes.get(id) ?? 0) + 1); }
  const shares = new Map<string, number>();
  for (const row of shareRows) shares.set(row.releaseId, (shares.get(row.releaseId) ?? 0) + 1);
  const metrics = { likes, shares };
  const byRelease = new Map<string, ListeningRow[]>();
  const byArtist = new Map<string, ListeningRow[]>();
  for (const row of typedRows) {
    byRelease.set(row.releaseId, [...(byRelease.get(row.releaseId) ?? []), row]);
    byArtist.set(row.artistProfileId, [...(byArtist.get(row.artistProfileId) ?? []), row]);
  }
  const songs = [...byRelease.entries()].map(([id, group]) => summarize(group, id, metrics) as ListeningSongSummary)
    .sort((a, b) => b.qualifiedStreams - a.qualifiedStreams || b.uniqueListeners - a.uniqueListeners || a.title.localeCompare(b.title));
  const artists = [...byArtist.entries()].map(([artistProfileId, group]) => ({ artistProfileId, artistName: group[0]?.artistName ?? "Unknown artist", ...summarize(group, undefined, metrics) }))
    .sort((a, b) => b.qualifiedStreams - a.qualifiedStreams || b.uniqueListeners - a.uniqueListeners);
  const daily = new Map<string, { date: string; totalStreams: number; qualifiedStreams: number }>();
  for (const row of typedRows) {
    const date = row.startedAt.toISOString().slice(0, 10);
    const current = daily.get(date) ?? { date, totalStreams: 0, qualifiedStreams: 0 };
    current.totalStreams += 1; current.qualifiedStreams += Number(row.qualified); daily.set(date, current);
  }
  return {
    from: from.toISOString(), to: to.toISOString(), overview: summarize(typedRows, undefined, metrics), songs, artists, daily: [...daily.values()],
    detail: releaseId ? { ...summarize(typedRows, releaseId, metrics), events: typedRows.map((row) => ({ id: row.eventId, startedAt: row.startedAt.toISOString(), durationSeconds: row.durationSeconds, completed: row.completed, qualified: row.qualified, repeatListening: row.repeatListening })) } : null,
  };
}
