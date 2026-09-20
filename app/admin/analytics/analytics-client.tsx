"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BarChart3, ChevronRight, Radio, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type Metrics = { totalStreams: number; qualifiedStreams: number; uniqueListeners: number; repeatListens: number; returningListeners: number; likes: number; shares: number; averageDurationSeconds: number; completionRate: number; returnRate: number };
type Song = Metrics & { releaseId: string; artistProfileId: string; artistName: string; title: string; genre: string };
type Analytics = { from: string; to: string; overview: Metrics; songs: Song[]; artists: Array<Metrics & { artistProfileId: string; artistName: string }>; detail: (Song & { events: Array<{ id: string; startedAt: string; durationSeconds: number; completed: boolean; qualified: boolean; repeatListening: boolean }> }) | null };
type SortKey = keyof Pick<Song, "qualifiedStreams" | "uniqueListeners" | "repeatListens" | "likes" | "shares" | "averageDurationSeconds" | "completionRate" | "returningListeners">;

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const formatSeconds = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function rangeDates(range: string) {
  const now = new Date();
  const end = isoDate(now);
  if (range === "today") return { from: end, to: end };
  if (range === "last7") return { from: isoDate(new Date(now.getTime() - 6 * 86400000)), to: end };
  if (range === "last30") return { from: isoDate(new Date(now.getTime() - 29 * 86400000)), to: end };
  if (range === "month") return { from: isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), to: end };
  if (range === "all") return { from: "1970-01-01", to: end };
  return { from: isoDate(new Date(now.getTime() - 29 * 86400000)), to: end };
}

export function AnalyticsClient({ adminAccessSource }: { adminAccessSource: "allowlist" | "role" }) {
  const initial = rangeDates("last30");
  const [range, setRange] = useState("last30");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [query, setQuery] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("qualifiedStreams");
  const [sortDescending, setSortDescending] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ from, to });
    if (selectedReleaseId) params.set("releaseId", selectedReleaseId);
    fetch(`/api/admin/analytics?${params}`).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data as Analytics; }).then(setAnalytics).catch(() => undefined);
  }, [from, selectedReleaseId, to]);

  const visibleSongs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (analytics?.songs ?? []).filter((song) => !needle || `${song.title} ${song.artistName} ${song.genre}`.toLowerCase().includes(needle)).sort((a, b) => {
      const difference = Number(a[sortKey]) - Number(b[sortKey]);
      return (sortDescending ? -difference : difference) || a.title.localeCompare(b.title);
    });
  }, [analytics?.songs, query, sortDescending, sortKey]);

  const chooseRange = (next: string) => { setRange(next); if (next !== "custom") { const dates = rangeDates(next); setFrom(dates.from); setTo(dates.to); setSelectedReleaseId(null); } };
  const sortable = (key: SortKey) => ({ type: "button" as const, onClick: () => { if (sortKey === key) setSortDescending((value) => !value); else { setSortKey(key); setSortDescending(true); } }, className: "analytics-sort" });
  const overview = analytics?.overview;

  return <main className="admin-shell analytics-admin-shell">
    <header className="admin-hero"><Link href="/" className="admin-brand" aria-label="Back to ChuneSide"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link><div><span><BarChart3 /> Admin foundation</span><h1>Listening Analytics</h1><p>Data visibility for qualified listening, audience reach and future discovery decisions. Like-based rankings remain unchanged.</p><small className="admin-access-source">Access granted by {adminAccessSource === "allowlist" ? "owner email allowlist" : "database admin role"}.</small></div></header>
    <nav className="admin-toolbar admin-nav-actions" aria-label="Admin sections"><Button asChild variant="outline"><Link href="/admin/accounts">Accounts</Link></Button><Button asChild variant="outline"><Link href="/admin/catalog">Catalogue</Link></Button><Button asChild variant="outline"><Link href="/admin/reviews">Review Queue</Link></Button><Button asChild variant="outline"><Link href="/admin/analytics">Analytics</Link></Button><Button asChild variant="outline"><Link href="/admin/site-content">Site Content</Link></Button><Button asChild variant="outline"><Link href="/admin/stage">Stage</Link></Button><Button asChild variant="outline"><Link href="/admin/audit">Audit Log</Link></Button></nav>
    <section className="analytics-filters" aria-label="Filter listening analytics"><label>Range <NativeSelect value={range} onChange={(event) => chooseRange(event.target.value)}><NativeSelectOption value="today">Today</NativeSelectOption><NativeSelectOption value="last7">Last 7 days</NativeSelectOption><NativeSelectOption value="last30">Last 30 days</NativeSelectOption><NativeSelectOption value="month">This month</NativeSelectOption><NativeSelectOption value="all">All time</NativeSelectOption><NativeSelectOption value="custom">Custom</NativeSelectOption></NativeSelect></label>{range === "custom" && <><label>From <Input type="date" value={from} onChange={(event) => { setSelectedReleaseId(null); setFrom(event.target.value); }} /></label><label>To <Input type="date" value={to} onChange={(event) => { setSelectedReleaseId(null); setTo(event.target.value); }} /></label></>}<label className="analytics-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search songs or artists" aria-label="Search listening analytics" /></label></section>
    <section className="admin-summary analytics-summary" aria-label="Listening overview"><div><strong>{overview?.qualifiedStreams ?? 0}</strong><span>Qualified streams</span></div><div><strong>{overview?.uniqueListeners ?? 0}</strong><span>Unique listeners</span></div><div><strong>{overview?.repeatListens ?? 0}</strong><span>Repeat streams</span></div><div><strong>{overview?.likes ?? 0}</strong><span>Likes</span></div><div><strong>{overview?.shares ?? 0}</strong><span>Shares</span></div><div><strong>{formatSeconds(overview?.averageDurationSeconds ?? 0)}</strong><span>Average listening</span></div><div><strong>{overview?.completionRate ?? 0}%</strong><span>Average completion</span></div><div><strong>{overview?.returningListeners ?? 0}</strong><span>Returning listeners</span></div></section>
    <section className="analytics-note"><Radio /><p><strong>Qualified stream policy</strong> A release listen counts after the configured threshold, with rapid repeats held out of meaningful totals for 10 minutes. Only approved public release playback and release shares appear here; ChuneSide Stage, breaks and paid-ad placements are excluded and do not affect rankings.</p></section>
    <section className="analytics-panel"><div className="analytics-panel-heading"><div><span className="kicker"><Radio /> Song reach</span><h2>Listening by release</h2></div><small>{analytics?.songs.length ?? 0} songs in range</small></div>{visibleSongs.length ? <div className="analytics-song-table"><div className="analytics-song-header"><span>Song</span>{(["qualifiedStreams", "uniqueListeners", "repeatListens", "likes", "shares", "averageDurationSeconds", "completionRate", "returningListeners"] as SortKey[]).map((key) => <button key={key} {...sortable(key)}>{key === "qualifiedStreams" ? "Qualified" : key === "uniqueListeners" ? "Listeners" : key === "repeatListens" ? "Repeats" : key === "averageDurationSeconds" ? "Avg listen" : key === "completionRate" ? "Complete" : key === "returningListeners" ? "Returning" : key[0].toUpperCase() + key.slice(1)} {sortKey === key ? (sortDescending ? "↓" : "↑") : ""}</button>)}</div>{visibleSongs.map((song) => <button type="button" className="analytics-song-row" key={song.releaseId} onClick={() => setSelectedReleaseId(song.releaseId)}><span className="analytics-song-main"><strong>{song.title}</strong><small>{song.artistName} · {song.genre}</small></span><span><b>{song.qualifiedStreams}</b></span><span><b>{song.uniqueListeners}</b></span><span><b>{song.repeatListens}</b></span><span><b>{song.likes}</b></span><span><b>{song.shares}</b></span><span><b>{formatSeconds(song.averageDurationSeconds)}</b></span><span><b>{song.completionRate}%</b></span><span><b>{song.returningListeners}</b></span><ChevronRight /></button>)}</div> : <div className="admin-empty"><Radio /><h2>No listening data yet</h2><p>Approved release playback will appear here after qualified sessions are recorded.</p></div>}</section>
    {analytics?.artists.length ? <section className="analytics-panel"><div className="analytics-panel-heading"><div><span className="kicker"><Users /> Artist reach</span><h2>Audience rollups</h2></div><small>Qualified listeners, shares and return rate</small></div><div className="analytics-artist-table">{analytics.artists.map((artist) => <div className="analytics-artist-row" key={artist.artistProfileId}><strong>{artist.artistName}</strong><span>{artist.qualifiedStreams} qualified</span><span>{artist.uniqueListeners} listeners</span><span>{artist.likes} likes</span><span>{artist.shares} shares</span><span>{artist.returnRate}% return</span></div>)}</div></section> : null}
    {analytics?.detail && <section className="analytics-panel analytics-detail"><div className="analytics-panel-heading"><div><span className="kicker"><BarChart3 /> Song detail</span><h2>{analytics.detail.title}</h2><small>{analytics.detail.artistName} · {analytics.detail.genre}</small></div><Button type="button" variant="outline" onClick={() => setSelectedReleaseId(null)}>Close detail</Button></div><div className="analytics-detail-grid"><div><strong>{analytics.detail.qualifiedStreams}</strong><span>Qualified streams</span></div><div><strong>{analytics.detail.uniqueListeners}</strong><span>Unique listeners</span></div><div><strong>{analytics.detail.repeatListens}</strong><span>Repeat streams</span></div><div><strong>{analytics.detail.likes}</strong><span>Likes</span></div><div><strong>{analytics.detail.shares}</strong><span>Shares</span></div><div><strong>{formatSeconds(analytics.detail.averageDurationSeconds)}</strong><span>Average listen</span></div><div><strong>{analytics.detail.completionRate}%</strong><span>Completion</span></div><div><strong>{analytics.detail.returningListeners}</strong><span>Returning listeners</span></div></div><div className="analytics-event-list">{analytics.detail.events.slice(-20).reverse().map((event) => <div key={event.id}><span>{new Date(event.startedAt).toLocaleString()}</span><span>{formatSeconds(event.durationSeconds)}</span><span>{event.qualified ? "Qualified" : "Recorded"}</span><span>{event.completed ? "Completed" : "Not completed"}</span></div>)}</div></section>}
  </main>;
}
