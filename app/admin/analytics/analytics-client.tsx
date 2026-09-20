"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BarChart3, ChevronRight, Radio, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Song = { releaseId: string; artistProfileId: string; artistName: string; title: string; genre: string; totalStreams: number; qualifiedStreams: number; uniqueListeners: number; repeatListens: number; averageDurationSeconds: number; completionRate: number; returnRate: number };
type Analytics = { from: string; to: string; overview: Omit<Song, "releaseId" | "artistProfileId" | "artistName" | "title" | "genre">; songs: Song[]; artists: Array<{ artistProfileId: string; artistName: string; totalStreams: number; qualifiedStreams: number; uniqueListeners: number; repeatListens: number; averageDurationSeconds: number; completionRate: number; returnRate: number }>; detail: (Song & { events: Array<{ id: string; startedAt: string; durationSeconds: number; completed: boolean; qualified: boolean; repeatListening: boolean }> }) | null };

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const formatSeconds = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function AnalyticsClient({ adminAccessSource }: { adminAccessSource: "allowlist" | "role" }) {
  const now = new Date();
  const [from, setFrom] = useState(isoDate(new Date(now.getTime() - 29 * 86400000)));
  const [to, setTo] = useState(isoDate(now));
  const [query, setQuery] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ from, to });
    if (selectedReleaseId) params.set("releaseId", selectedReleaseId);
    fetch(`/api/admin/analytics?${params}`)
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data as Analytics; })
      .then(setAnalytics)
      .catch((reason: Error) => setError(reason.message));
  }, [from, selectedReleaseId, to]);

  const visibleSongs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (analytics?.songs ?? []).filter((song) => !needle || `${song.title} ${song.artistName} ${song.genre}`.toLowerCase().includes(needle));
  }, [analytics?.songs, query]);

  return <main className="admin-shell analytics-admin-shell">
    <header className="admin-hero"><Link href="/" className="admin-brand" aria-label="Back to ChuneSide"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link><div><span><BarChart3 /> Admin foundation</span><h1>Listening Analytics</h1><p>Collect qualified listening data for future discovery decisions. Current like-based rankings are unchanged.</p><small className="admin-access-source">Access granted by {adminAccessSource === "allowlist" ? "owner email allowlist" : "database admin role"}.</small></div></header>
    <nav className="admin-toolbar admin-nav-actions" aria-label="Admin sections"><Button asChild variant="outline"><Link href="/admin/accounts">Accounts</Link></Button><Button asChild variant="outline"><Link href="/admin/catalog">Catalogue</Link></Button><Button asChild variant="outline"><Link href="/admin/reviews">Review Queue</Link></Button><Button asChild variant="outline"><Link href="/admin/analytics">Analytics</Link></Button><Button asChild variant="outline"><Link href="/admin/stage">Stage</Link></Button><Button asChild variant="outline"><Link href="/admin/audit">Audit Log</Link></Button></nav>
    <section className="analytics-filters" aria-label="Filter listening analytics"><label>From <Input type="date" value={from} onChange={(event) => { setSelectedReleaseId(null); setFrom(event.target.value); }} /></label><label>To <Input type="date" value={to} onChange={(event) => { setSelectedReleaseId(null); setTo(event.target.value); }} /></label><label className="analytics-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search songs or artists" aria-label="Search listening analytics" /></label></section>
    {error && <p className="catalog-editor-error announcement-error" role="alert">{error}</p>}
    <section className="admin-summary analytics-summary" aria-label="Listening overview"><div><strong>{analytics?.overview.totalStreams ?? 0}</strong><span>Total starts</span></div><div><strong>{analytics?.overview.qualifiedStreams ?? 0}</strong><span>Qualified streams</span></div><div><strong>{analytics?.overview.uniqueListeners ?? 0}</strong><span>Unique listeners</span></div><div><strong>{analytics?.overview.repeatListens ?? 0}</strong><span>Repeat listens</span></div><div><strong>{analytics?.overview.completionRate ?? 0}%</strong><span>Completion rate</span></div></section>
    <section className="analytics-note"><Radio /><p><strong>Qualified stream policy</strong> A listen counts after 30 seconds, or completion for a shorter track. Rapid repeats from the same listener are recorded but held out of meaningful qualified totals for 10 minutes.</p></section>
    <section className="analytics-panel"><div className="analytics-panel-heading"><div><span className="kicker"><Radio /> Song reach</span><h2>Listening by release</h2></div><small>{analytics?.songs.length ?? 0} songs in range</small></div>{visibleSongs.length ? <div className="analytics-song-table">{visibleSongs.map((song) => <button type="button" className="analytics-song-row" key={song.releaseId} onClick={() => setSelectedReleaseId(song.releaseId)}><span className="analytics-song-main"><strong>{song.title}</strong><small>{song.artistName} · {song.genre}</small></span><span><b>{song.qualifiedStreams}</b><small>qualified</small></span><span><b>{song.uniqueListeners}</b><small>listeners</small></span><span><b>{song.repeatListens}</b><small>repeats</small></span><span><b>{song.completionRate}%</b><small>complete</small></span><ChevronRight /></button>)}</div> : <div className="admin-empty"><Radio /><h2>No listening data yet</h2><p>Approved release playback will appear here after qualified sessions are recorded.</p></div>}</section>
    {analytics?.artists.length ? <section className="analytics-panel"><div className="analytics-panel-heading"><div><span className="kicker"><Users /> Artist reach</span><h2>Audience rollups</h2></div><small>Qualified listeners and return rate</small></div><div className="analytics-artist-table">{analytics.artists.map((artist) => <div className="analytics-artist-row" key={artist.artistProfileId}><strong>{artist.artistName}</strong><span>{artist.qualifiedStreams} qualified</span><span>{artist.uniqueListeners} listeners</span><span>{artist.returnRate}% return</span></div>)}</div></section> : null}
    {analytics?.detail && <section className="analytics-panel analytics-detail"><div className="analytics-panel-heading"><div><span className="kicker"><BarChart3 /> Song detail</span><h2>{analytics.detail.title}</h2><small>{analytics.detail.artistName} · {analytics.detail.genre}</small></div><Button type="button" variant="outline" onClick={() => setSelectedReleaseId(null)}>Close detail</Button></div><div className="analytics-detail-grid"><div><strong>{analytics.detail.totalStreams}</strong><span>Starts</span></div><div><strong>{analytics.detail.qualifiedStreams}</strong><span>Qualified</span></div><div><strong>{analytics.detail.uniqueListeners}</strong><span>Unique listeners</span></div><div><strong>{formatSeconds(analytics.detail.averageDurationSeconds)}</strong><span>Average listen</span></div><div><strong>{analytics.detail.returnRate}%</strong><span>Return rate</span></div></div><div className="analytics-event-list">{analytics.detail.events.slice(-20).reverse().map((event) => <div key={event.id}><span>{new Date(event.startedAt).toLocaleString()}</span><span>{formatSeconds(event.durationSeconds)}</span><span>{event.qualified ? "Qualified" : "Recorded"}</span><span>{event.completed ? "Completed" : "Not completed"}</span></div>)}</div></section>}
  </main>;
}
