import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { artistProfiles, listeningEvents, releases } from "@/db/schema";

type ListeningRow = {
  eventId: string;
  releaseId: string;
  artistProfileId: string;
  artistName: string;
  title: string;
  genre: string;
  startedAt: Date;
  listenerKeyHash: string;
  durationSeconds: number;
  completed: boolean;
  qualified: boolean;
  repeatListening: boolean;
};

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
  averageDurationSeconds: number;
  completionRate: number;
  returnRate: number;
};

function summarize(rows: ListeningRow[], releaseId?: string) {
  const qualifiedRows = rows.filter((row) => row.qualified);
  const listeners = new Map<string, number>();
  for (const row of qualifiedRows) listeners.set(row.listenerKeyHash, (listeners.get(row.listenerKeyHash) ?? 0) + 1);
  const totalUnique = listeners.size;
  const returning = [...listeners.values()].filter((count) => count > 1).length;
  const first = rows[0];
  return {
    totalStreams: rows.length,
    qualifiedStreams: qualifiedRows.length,
    uniqueListeners: totalUnique,
    repeatListens: rows.filter((row) => row.repeatListening).length,
    averageDurationSeconds: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.durationSeconds, 0) / rows.length) : 0,
    completionRate: qualifiedRows.length ? Math.round(qualifiedRows.filter((row) => row.completed).length / qualifiedRows.length * 100) : 0,
    returnRate: totalUnique ? Math.round(returning / totalUnique * 100) : 0,
    ...(releaseId ? {
      releaseId,
      artistProfileId: first?.artistProfileId ?? "",
      artistName: first?.artistName ?? "Unknown artist",
      title: first?.title ?? "Unknown release",
      genre: first?.genre ?? "",
    } : {}),
  };
}

export async function getListeningAnalytics({ from, to, releaseId }: { from: Date; to: Date; releaseId?: string }) {
  const conditions = [gte(listeningEvents.startedAt, from), lte(listeningEvents.startedAt, to)];
  if (releaseId) conditions.push(eq(listeningEvents.releaseId, releaseId));
  const rows = await getDb().select({
    eventId: listeningEvents.id,
    releaseId: listeningEvents.releaseId,
    artistProfileId: artistProfiles.id,
    artistName: artistProfiles.stageName,
    title: releases.title,
    genre: releases.genre,
    startedAt: listeningEvents.startedAt,
    listenerKeyHash: listeningEvents.listenerKeyHash,
    durationSeconds: listeningEvents.durationSeconds,
    completed: listeningEvents.completed,
    qualified: listeningEvents.qualified,
    repeatListening: listeningEvents.repeatListening,
  }).from(listeningEvents)
    .innerJoin(releases, eq(listeningEvents.releaseId, releases.id))
    .innerJoin(artistProfiles, eq(releases.artistProfileId, artistProfiles.id))
    .where(and(...conditions))
    .orderBy(asc(listeningEvents.startedAt));

  const typedRows = rows as ListeningRow[];
  const byRelease = new Map<string, ListeningRow[]>();
  const byArtist = new Map<string, ListeningRow[]>();
  for (const row of typedRows) {
    byRelease.set(row.releaseId, [...(byRelease.get(row.releaseId) ?? []), row]);
    byArtist.set(row.artistProfileId, [...(byArtist.get(row.artistProfileId) ?? []), row]);
  }
  const songs = [...byRelease.entries()].map(([id, group]) => summarize(group, id) as ListeningSongSummary)
    .sort((a, b) => b.qualifiedStreams - a.qualifiedStreams || b.uniqueListeners - a.uniqueListeners || a.title.localeCompare(b.title));
  const artists = [...byArtist.entries()].map(([artistProfileId, group]) => ({
    artistProfileId,
    artistName: group[0]?.artistName ?? "Unknown artist",
    ...summarize(group),
  })).sort((a, b) => b.qualifiedStreams - a.qualifiedStreams || b.uniqueListeners - a.uniqueListeners);
  const daily = new Map<string, { date: string; totalStreams: number; qualifiedStreams: number }>();
  for (const row of typedRows) {
    const date = row.startedAt.toISOString().slice(0, 10);
    const current = daily.get(date) ?? { date, totalStreams: 0, qualifiedStreams: 0 };
    current.totalStreams += 1;
    current.qualifiedStreams += Number(row.qualified);
    daily.set(date, current);
  }
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    overview: summarize(typedRows),
    songs,
    artists,
    daily: [...daily.values()],
    detail: releaseId ? { ...summarize(typedRows, releaseId), events: typedRows.map((row) => ({ id: row.eventId, startedAt: row.startedAt.toISOString(), durationSeconds: row.durationSeconds, completed: row.completed, qualified: row.qualified, repeatListening: row.repeatListening })) } : null,
  };
}
