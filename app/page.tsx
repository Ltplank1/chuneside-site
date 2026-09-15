"use client";

import { type CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, BadgeCheck, Bot, ChevronDown, Clock3, Disc3, DollarSign, MapPin,
  ExternalLink, Heart, Megaphone, Menu, MessageCircle, Mic2, Pause, Play, Radio,
  PlaySquare, Search, Send, Share2, ShieldCheck, SkipBack, SkipForward, Sparkles,
  Trophy, UserPlus, Users, Video, Volume2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { demoTracks, type PublicTrack } from "@/lib/public-catalog";

const videos = [
  { eyebrow: "ChuneSide premiere · 268", artist: "Kaia Rivers", title: "Golden Hour", note: "Featured music video", tint: "hero-a", trackId: 1 },
  { eyebrow: "Artist spotlight · Interview", artist: "Nia Vale", title: "Behind the Chune", note: "Studio conversation", tint: "hero-b", trackId: 3 },
  { eyebrow: "Future frequency · AI-assisted", artist: "Mika + Machine", title: "Neon Mangrove", note: "Process disclosed", tint: "hero-c", trackId: 7 },
];

type MemberState = {
  authenticated: boolean;
  member: { displayName: string; email: string } | null;
  likes: number[];
  follows: string[];
  allTime: Record<string, number>;
  monthly: Record<string, number>;
};

type PublicFeatureSnapshot = Record<string, { available: boolean; state: string }>;

type PublicAnnouncement = {
  id: string;
  message: string;
  linkUrl: string | null;
  category: "community" | "release" | "competition" | "stage" | "maintenance" | "artist" | "general";
  scrollSpeedSeconds: number;
  textSize: "small" | "medium" | "large";
  fontStyle: "standard" | "bold" | "wide";
};

type PublicStagePerformance = {
  slug: string;
  title: string;
  description: string;
  artistStageName: string;
  artistSlug: string;
  youtubeVideoId: string;
  youtubeUrl: string | null;
  thumbnailUrl: string | null;
  durationMinutes: number | null;
  songsPerformed: string[];
  genre: string;
  region: string;
  status: "published" | "featured";
};

function Cover({ track, large = false }: { track: PublicTrack; large?: boolean }) {
  return <div className={`cover relative overflow-hidden bg-gradient-to-br ${track.colors} ${large ? "aspect-[1.07]" : "aspect-square"}`}>
    {track.coverImageUrl && <Image className="cover-art" src={track.coverImageUrl} alt={`${track.title} cover artwork`} fill sizes={large ? "(max-width: 900px) 100vw, 50vw" : "(max-width: 650px) 100vw, 25vw"} unoptimized />}
    <div className="cover-grid" /><Disc3 className="absolute -bottom-8 -right-8 h-36 w-36 text-black/20" strokeWidth={1.2} />
    <span className="cover-label">{track.creation}</span>
    <span className={`cover-mark ${large ? "cover-mark-large" : ""}`}>{track.mark}</span>
    {track.creation === "AI-assisted" && <span className="ai-corner"><Bot /> AI</span>}
  </div>;
}

function durationSeconds(value: string) {
  const [minutes, seconds] = value.split(":").map(Number);
  return (minutes || 0) * 60 + (seconds || 0);
}

function formatPlayerTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export default function Home() {
  const [tracks, setTracks] = useState<PublicTrack[]>(demoTracks);
  const [catalogSource, setCatalogSource] = useState<"demo" | "database">("demo");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [selectedRegion, setSelectedRegion] = useState("All");
  const [sortMode, setSortMode] = useState("curated");
  const [lane, setLane] = useState("all");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(18);
  const [volume, setVolume] = useState(72);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [memberState, setMemberState] = useState<MemberState | null>(null);
  const [memberGate, setMemberGate] = useState(false);
  const [memberBusy, setMemberBusy] = useState<string | null>(null);
  const [rankPeriod, setRankPeriod] = useState<"monthly" | "allTime">("monthly");
  const [rankGenre, setRankGenre] = useState("All");
  const [heroIndex, setHeroIndex] = useState(0);
  const [comments, setComments] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [votes, setVotes] = useState(342);
  const [voted, setVoted] = useState(false);
  const [features, setFeatures] = useState<PublicFeatureSnapshot | null>(null);
  const [announcements, setAnnouncements] = useState<PublicAnnouncement[]>([]);
  const [stagePerformances, setStagePerformances] = useState<PublicStagePerformance[]>([]);
  const [catalogUrlReady, setCatalogUrlReady] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeAudioUrl = tracks.find((track) => track.id === activeId)?.audioUrl ?? null;

  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(() => {
      try {
        const savedComments = JSON.parse(
          window.localStorage.getItem("chuneside-comments") || "[]",
        );
        if (!cancelled) setComments(savedComments);
      } catch { /* keep clean defaults */ }
    });

    fetch("/api/member-state")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data && !cancelled && setMemberState(data));
    fetch("/api/feature-flags")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data?.features && !cancelled && setFeatures(data.features));
    fetch("/api/catalog")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!cancelled && Array.isArray(data?.tracks) && (data.source === "database" || data.tracks.length)) {
          setTracks(data.tracks);
          setCatalogSource(data.source === "database" ? "database" : "demo");
        }
      });
    fetch("/api/announcements")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => Array.isArray(data?.announcements) && !cancelled && setAnnouncements(data.announcements));
    fetch("/api/stage?placement=home&limit=3")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data?.available && Array.isArray(data?.performances) && !cancelled && setStagePerformances(data.performances));

    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const urlLane = params.get("lane");
      const urlSort = params.get("sort");
      if (urlLane && ["all", "wadadli", "caribbean", "ai", "world"].includes(urlLane)) setLane(urlLane);
      if (urlSort && ["curated", "newest", "title"].includes(urlSort)) setSortMode(urlSort);
      if (params.get("q")) setQuery(params.get("q") ?? "");
      if (params.get("genre")) setSelectedGenre(params.get("genre") ?? "All");
      if (params.get("region")) setSelectedRegion(params.get("region") ?? "All");
      setCatalogUrlReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!catalogUrlReady) return;
    const url = new URL(window.location.href);
    const params = url.searchParams;
    const values = { q: query.trim(), lane, genre: selectedGenre, region: selectedRegion, sort: sortMode };
    for (const [key, value] of Object.entries(values)) {
      const isDefault = (key === "lane" && value === "all") || (key === "genre" && value === "All") || (key === "region" && value === "All") || (key === "sort" && value === "curated") || !value;
      if (isDefault) params.delete(key); else params.set(key, value);
    }
    window.history.replaceState(null, "", `${url.pathname}${params.size ? `?${params}` : ""}${url.hash}`);
  }, [catalogUrlReady, lane, query, selectedGenre, selectedRegion, sortMode]);
  useEffect(() => {
    if (!playing || activeAudioUrl) return;
    const timer = window.setInterval(() => setProgress((value) => value >= 100 ? 0 : value + .28), 200);
    return () => window.clearInterval(timer);
  }, [playing, activeAudioUrl]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume / 100;
  }, [volume]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeAudioUrl) return;
    if (playing) void audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }, [activeAudioUrl, playing]);
  useEffect(() => {
    const timer = window.setInterval(() => setHeroIndex((index) => (index + 1) % videos.length), 9000);
    return () => window.clearInterval(timer);
  }, []);

  const availableGenres = useMemo(() => catalogueValues(tracks.map((track) => track.genre)), [tracks]);
  const availableRegions = useMemo(() => catalogueValues(tracks.map((track) => track.origin)), [tracks]);
  const activeGenre = availableGenres.includes(selectedGenre) ? selectedGenre : "All";
  const activeRegion = availableRegions.includes(selectedRegion) ? selectedRegion : "All";
  const visibleTracks = useMemo(() => tracks.filter((track) => {
    const laneMatch = lane === "all" || track.lane === lane;
    const genreMatch = activeGenre === "All" || track.genre === activeGenre;
    const regionMatch = activeRegion === "All" || track.origin === activeRegion;
    const q = query.trim().toLowerCase();
    return laneMatch && genreMatch && regionMatch && (!q || `${track.title} ${track.artist} ${track.genre} ${track.origin}`.toLowerCase().includes(q));
  }).sort((a, b) => sortMode === "title" ? a.title.localeCompare(b.title) : sortMode === "newest" ? b.id - a.id : a.id - b.id), [tracks, activeGenre, activeRegion, lane, query, sortMode]);
  const discoveryFilterCount = Number(Boolean(query.trim())) + Number(lane !== "all") + Number(activeGenre !== "All") + Number(activeRegion !== "All") + Number(sortMode !== "curated");

  const active = tracks.find((track) => track.id === activeId) ?? tracks[0] ?? null;
  const activeDuration = active ? durationSeconds(active.duration) : 0;
  const hero = videos[heroIndex];
  const featureOn = (key: string, fallback = true) => features?.[key]?.available ?? fallback;
  const songRankingsOn = featureOn("song_rankings");
  const competitionsOn = featureOn("competitions");
  const musicVideosOn = featureOn("music_videos");
  const sponsorshipsOn = featureOn("sponsorships");
  const artistWorkspaceOn = featureOn("artist_workspace", false);
  const chunesideStageOn = featureOn("chuneside_stage", false);
  // These server routes choose Supabase in production and retain the local fallback when it is not configured.
  const memberSignInPath = "/auth/sign-in?returnTo=%2F%23charts";
  const memberSignOutPath = "/auth/sign-out?returnTo=%2F";
  const chooseTrack = (track?: PublicTrack) => {
    if (!track) return;
    if (track.id === activeId) { setPlaying((current) => !current); return; }
    setActiveId(track.id); setProgress(0); setPlaying(true);
  };
  const moveTrack = (direction: number) => {
    if (!tracks.length) return;
    const index = tracks.findIndex((track) => track.id === activeId);
    chooseTrack(tracks[(index + direction + tracks.length) % tracks.length]);
  };
  const memberAction = async (action: "like" | "follow", track: PublicTrack) => {
    if (action === "like" && !songRankingsOn) return;
    if (!memberState?.authenticated) { setMemberGate(true); return; }
    const key = `${action}-${track.id}`;
    setMemberBusy(key);
    const response = await fetch("/api/member-state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, trackId: track.id, artist: track.artist }) });
    if (response.ok) setMemberState(await response.json());
    setMemberBusy(null);
  };
  const seekTrack = (nextProgress: number) => {
    setProgress(nextProgress);
    const audio = audioRef.current;
    if (active?.audioUrl && audio && Number.isFinite(audio.duration)) audio.currentTime = audio.duration * nextProgress / 100;
  };
  const ranking = useMemo(() => tracks.map((track) => ({ track, count: memberState?.[rankPeriod]?.[String(track.id)] ?? 0 })).filter((item) => (rankGenre === "All" || item.track.genre === rankGenre) && item.count > 0).sort((a, b) => b.count - a.count || a.track.id - b.track.id), [tracks, memberState, rankPeriod, rankGenre]);
  const addComment = (event: FormEvent) => {
    event.preventDefault();
    const clean = comment.trim();
    if (!clean) return;
    const next = [clean, ...comments].slice(0, 4);
    setComments(next); setComment("");
    window.localStorage.setItem("chuneside-comments", JSON.stringify(next));
  };
  const share = async () => {
    const data = { title: "ChuneSide", text: "Discover the next sound from Wadadli and beyond.", url: window.location.href };
    if (navigator.share) await navigator.share(data); else await navigator.clipboard.writeText(window.location.href);
  };

  return <main>
    <header className="site-header">
      <a href="#top" className="brand brand-image" aria-label="ChuneSide home"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></a>
      <nav className="desktop-nav" aria-label="Main navigation"><a href="#discover">Discover</a>{songRankingsOn && <a href="#charts">Charts</a>}{chunesideStageOn && <Link href="/stage">Stage</Link>}<a href="#ai-music">AI music</a>{catalogSource === "demo" && <a href="#stories">Stories</a>}{competitionsOn && <a href="#contests">Contests</a>}<a href="#community">Community</a></nav>
      {memberState?.authenticated ? <a className="member-pill" href={memberSignOutPath}><BadgeCheck /> {memberState.member?.displayName}<span>Sign out</span></a> : <a className="member-pill join" href={memberSignInPath}><UserPlus /> Join free</a>}
      <Button className="menu-button" variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Open menu">{mobileOpen ? <X /> : <Menu />}</Button>
      {mobileOpen && <nav className="mobile-nav" aria-label="Mobile navigation">{[["Discover", "#discover"], ...(songRankingsOn ? [["Charts", "#charts"]] : []), ...(chunesideStageOn ? [["Stage", "/stage"]] : []), ["AI music", "#ai-music"], ...(catalogSource === "demo" ? [["Stories", "#stories"]] : []), ...(competitionsOn ? [["Contests", "#contests"]] : []), ["Community", "#community"], ["Guidelines", "#guidelines"], ["Submit music", "#submit"]].map(([label, href]) => href.startsWith("/") ? <Link key={href} href={href} onClick={() => setMobileOpen(false)}>{label}</Link> : <a key={href} href={href} onClick={() => setMobileOpen(false)}>{label}</a>)}</nav>}
    </header>

    <CommunityNewsBar announcements={announcements} />

    <section id="top" className={`cinema-hero ${hero.tint}`}>
      <video key={heroIndex} className="hero-video" autoPlay muted loop playsInline poster="/chuneside-hero.jpg" aria-label="ChuneSide featured video preview"><source src="/chuneside-hero-loop.mp4" type="video/mp4" /></video>
      <div className="hero-shade" />
      <div className="hero-brand-ghost"><Image src="/chuneside-logo-v2.png" alt="" width={420} height={184} priority unoptimized /></div>
      <div className="cinema-copy">
        <div className="eyebrow"><span /> {hero.eyebrow}</div>
        <h1>{hero.title === "Golden Hour" ? <>Local sound.<br /><em>World stage.</em></> : <>{hero.title}<br /><em>{hero.artist}</em></>}</h1>
        <p>Wadadli leads the mix. The Caribbean joins the rhythm. Selected independent voices from around the world are welcome.</p>
        <div className="hero-actions"><Button size="lg" disabled={!tracks.length} onClick={() => chooseTrack(tracks.find((track) => track.id === hero.trackId) ?? tracks[0])}><Play fill="currentColor" /> Play feature</Button><Button size="lg" variant="outline" asChild><a href="#discover">Explore music <ArrowRight /></a></Button></div>
      </div>
      <div className="premiere-card"><span>{hero.note}</span><strong>{hero.artist}</strong><p>{hero.title}</p><small>Demo visual — replace with any approved feature video</small></div>
      <div className="hero-switcher" aria-label="Choose featured video">{videos.map((video, index) => <button key={video.title} className={index === heroIndex ? "active" : ""} onClick={() => setHeroIndex(index)}><b>0{index + 1}</b><span>{video.title}</span></button>)}</div>
    </section>

    <section className="territory-bar"><div><span>01</span><strong>Made in Wadadli</strong><p>Antiguan and Barbudan voices lead the platform.</p></div><div><span>02</span><strong>Caribbean Spotlight</strong><p>A selected window into neighbouring islands.</p></div><div><span>03</span><strong>Guest Frequency</strong><p>Exceptional independent music from the wider world.</p></div></section>

    {chunesideStageOn && stagePerformances.length > 0 && <section className="home-stage-section section-wrap">
      <div className="section-heading"><div><span className="kicker"><PlaySquare /> ChuneSide Stage</span><h2>Fresh performances from the Stage.</h2></div><Button asChild variant="outline"><Link href="/stage">Watch Stage <ArrowRight /></Link></Button></div>
      <div className="home-stage-grid">
        {stagePerformances.map((performance) => (
          <article className="home-stage-card" key={performance.slug}>
            <Link className="home-stage-media" href={`/stage/${performance.slug}`} aria-label={`Watch ${performance.title}`}>
              {performance.thumbnailUrl ? <Image src={performance.thumbnailUrl} alt="" fill sizes="(max-width: 760px) 100vw, 480px" unoptimized /> : <PlaySquare />}
              <span><Play fill="currentColor" /> {performance.status === "featured" ? "Featured" : "Stage"}</span>
            </Link>
            <div className="home-stage-copy">
              <strong>{performance.region} · {performance.genre}</strong>
              <h3><Link href={`/stage/${performance.slug}`}>{performance.title}</Link></h3>
              <Link href={`/artists/${performance.artistSlug}`}>{performance.artistStageName}</Link>
              <p>{performance.description || `${performance.durationMinutes ?? "--"} minute ChuneSide Stage performance.`}</p>
            </div>
          </article>
        ))}
      </div>
    </section>}

    <section id="discover" className="discover section-wrap">
      <div className="section-heading"><div><span className="kicker"><Radio /> ChuneSide radio · Discovery</span><h2>Find your next chune.</h2></div><label className="search-box"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search music, artist or island" aria-label="Search music, artist or island" /></label></div>
      <Tabs value={lane} onValueChange={setLane} className="music-tabs">
        <TabsList><TabsTrigger value="all">All music</TabsTrigger><TabsTrigger value="wadadli">Wadadli</TabsTrigger><TabsTrigger value="caribbean">Caribbean</TabsTrigger><TabsTrigger value="ai">AI-assisted</TabsTrigger><TabsTrigger value="world">World</TabsTrigger></TabsList>
        <TabsContent value={lane}>
          <div className="catalog-discovery-filters"><div className="genre-row" aria-label="Filter by genre">{availableGenres.map((genre) => <button key={genre} type="button" className={activeGenre === genre ? "active" : ""} aria-pressed={activeGenre === genre} onClick={() => setSelectedGenre(genre)}>{genre}</button>)}</div><div className="catalog-discovery-selects"><label className="catalog-region-filter"><MapPin /><NativeSelect value={activeRegion} onChange={(event) => setSelectedRegion(event.target.value)} aria-label="Filter by region">{availableRegions.map((region) => <NativeSelectOption key={region} value={region}>{region === "All" ? "All regions" : region}</NativeSelectOption>)}</NativeSelect></label><label className="catalog-sort-filter"><NativeSelect value={sortMode} onChange={(event) => setSortMode(event.target.value)} aria-label="Sort catalogue"><NativeSelectOption value="curated">Curated order</NativeSelectOption><NativeSelectOption value="newest">Newest first</NativeSelectOption><NativeSelectOption value="title">Title A-Z</NativeSelectOption></NativeSelect></label>{discoveryFilterCount > 0 && <Button type="button" variant="outline" onClick={() => { setQuery(""); setLane("all"); setSelectedGenre("All"); setSelectedRegion("All"); setSortMode("curated"); }}>Clear all</Button>}</div></div>
          <p className="catalog-result-count" role="status">Showing {visibleTracks.length} of {tracks.length} {tracks.length === 1 ? "chune" : "chunes"}</p>
          <div className="track-grid">{visibleTracks.map((track, index) => <article className="track-card" key={track.id}>
            <button className="cover-button" onClick={() => chooseTrack(track)} aria-label={`Play ${track.title} by ${track.artist}`}><Cover track={track} /><span className="play-float">{activeId === track.id && playing ? <Pause /> : <Play fill="currentColor" />}</span><span className="track-number">{String(index + 1).padStart(2, "0")}</span></button>
            <div className="track-meta"><div><h3>{track.title}</h3><p><Link href={"/artists/" + track.artistSlug}>{track.artist}</Link> · {track.genre}</p><small>{track.origin} · {track.creation}</small></div><span>{track.duration}</span></div>
            <div className="reaction-row">{songRankingsOn && <button type="button" disabled={memberBusy === `like-${track.id}`} aria-pressed={memberState?.likes.includes(track.id) ?? false} className={memberState?.likes.includes(track.id) ? "selected" : ""} onClick={() => memberAction("like", track)}><Heart fill="currentColor" /> {memberState?.allTime[String(track.id)] ?? 0} verified likes</button>}<button type="button" disabled={memberBusy === `follow-${track.id}`} aria-pressed={memberState?.follows.includes(track.artist) ?? false} className={memberState?.follows.includes(track.artist) ? "selected fan" : "fan"} onClick={() => memberAction("follow", track)}><UserPlus /> {memberState?.follows.includes(track.artist) ? "Following" : "Follow"}</button></div>
          </article>)}{visibleTracks.length === 0 && <div className="empty-state"><Disc3 /><h3>No chunes found</h3><p>{catalogSource === "database" && tracks.length === 0 ? "Approved music will appear here as releases complete review." : "Try another lane, title or genre."}</p></div>}</div>
        </TabsContent>
      </Tabs>
    </section>

    {songRankingsOn && <section id="charts" className="charts section-wrap">
      <div className="section-heading"><div><span className="kicker"><Trophy /> Verified member charts</span><h2>The ChuneSide ranking.</h2></div><div className="chart-controls"><label><span>Genre</span><NativeSelect value={rankGenre} onChange={(event) => setRankGenre(event.target.value)} aria-label="Filter charts by genre">{availableGenres.map((genre) => <NativeSelectOption key={genre} value={genre}>{genre}</NativeSelectOption>)}</NativeSelect></label><div className="chart-period"><button className={rankPeriod === "monthly" ? "active" : ""} onClick={() => setRankPeriod("monthly")}>This month</button><button className={rankPeriod === "allTime" ? "active" : ""} onClick={() => setRankPeriod("allTime")}>All time</button></div></div></div>
      <div className="ranking-rule"><BadgeCheck /><p><strong>One member. One like. One honest chart.</strong> Guests can listen, but only signed-in members can Like or Follow. Removing a Like removes it from the chart.</p></div>
      {ranking.length ? <div className="leaderboard">{ranking.map(({ track, count }, index) => <article key={track.id} className={index === 0 ? "number-one" : ""}><span className="rank-number">{String(index + 1).padStart(2, "0")}</span><div className={`rank-cover bg-gradient-to-br ${track.colors}`}>{track.mark}</div><div className="rank-track"><strong>{track.title}</strong><span>{track.artist} · {track.origin}</span></div><div className="rank-score"><Heart fill="currentColor" /><strong>{count}</strong><span>unique {count === 1 ? "like" : "likes"}</span></div><button onClick={() => chooseTrack(track)} aria-label={`Play ${track.title}`}><Play fill="currentColor" /></button></article>)}</div> : <div className="chart-empty"><Trophy /><h3>{rankGenre === "All" ? "The chart is ready for its first member vote." : `No ${rankGenre} songs have votes yet.`}</h3><p>Like an approved song to place it on the official {rankGenre === "All" ? "" : `${rankGenre} `}{rankPeriod === "monthly" ? "monthly" : "all-time"} ranking.</p></div>}
      <div className="chart-note"><span>Monthly chart</span><p>Counts unique Likes added during the current calendar month.</p><span>All-time chart</span><p>Counts every active unique member Like since the song joined ChuneSide.</p></div>
    </section>}

    <section id="ai-music" className="ai-section section-wrap">
      <div className="ai-orbit"><Bot /><span>Human idea</span><span>AI disclosed</span><span>Rights checked</span></div>
      <div className="ai-copy"><span className="kicker"><Sparkles /> Future Frequency</span><h2>AI-assisted.<br />Clearly labelled.</h2><p>Creators using generative tools get a dedicated discovery lane—not a hidden label. Every submission must explain the human contribution, tools used, and confirm rights to the voice, music and artwork.</p><Button onClick={() => { setLane("ai"); document.querySelector("#discover")?.scrollIntoView(); }}>Explore AI-assisted music <ArrowRight /></Button></div>
    </section>

    {catalogSource === "demo" && <section id="stories" className="stories section-wrap">
      <div className="feature-art"><Cover track={tracks[2]} large /></div>
      <div className="feature-copy"><span className="kicker"><Mic2 /> Artist spotlight · Interview 001</span><h2>Meet Nia Vale.</h2><p>A bold new R&amp;B voice blending late-night soul, island cadence and fearless writing. ChuneSide goes beyond the song to introduce the person, process and place behind the music.</p><div className="spotlight-meta"><span>St. John&apos;s, Antigua</span><span>R&amp;B / Soul</span><span>Independent</span></div><div className="social-row"><Button onClick={() => chooseTrack(tracks.find((track) => track.artistSlug === "nia-vale") ?? tracks[0])}><Play fill="currentColor" /> Play spotlight</Button><Button asChild variant="outline"><Link href="/artists/nia-vale"><BadgeCheck /> Artist profile</Link></Button>{musicVideosOn && <Dialog><DialogTrigger asChild><Button variant="outline"><Video /> Open interview</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Behind the Chune: Nia Vale</DialogTitle><DialogDescription>A preview of the artist-interview experience.</DialogDescription></DialogHeader><div className="interview-preview"><Play fill="currentColor" /><span>Interview video goes here</span></div><p className="dialog-copy">Talk about the story behind the record, the creative process, Antigua&apos;s influence, and what comes next.</p></DialogContent></Dialog>}</div><small>Sample profile and interview concept for the private preview.</small></div>
    </section>}

    {competitionsOn && <section id="contests" className="contest-section section-wrap">
      <div className="contest-top"><div><span className="kicker"><Trophy /> ChuneSide challenges</span><h2>The Road March Refix.</h2></div><div className="contest-status"><span>Concept contest</span><strong>Entries open soon</strong></div></div>
      <div className="contest-grid"><div className="contest-main"><p>Flip a supplied Antiguan rhythm into an original two-minute track. Finalists get a ChuneSide feature, artist interview and audience voting week.</p><div className="contest-stats"><span><Clock3 /> Submission window<br /><b>To be announced</b></span><span><Users /> Judging<br /><b>Panel + fan choice</b></span><span><Trophy /> Prize<br /><b>Partner announcement soon</b></span></div><Button asChild><a href="mailto:chuneside@gmail.com?subject=ChuneSide%20Contest%20Interest">Register interest <ArrowRight /></a></Button></div><div className="fan-choice"><span>Fan choice preview</span><strong>Audience vote</strong><p>Let listeners help select a winner without replacing the independent judging panel.</p><button className={voted ? "voted" : ""} onClick={() => { setVoted(!voted); setVotes((value) => value + (voted ? -1 : 1)); }}><Heart fill="currentColor" /> {voted ? "Vote counted" : "Cast demo vote"}</button><small>{votes.toLocaleString()} preview votes</small></div></div>
    </section>}

    <section id="community" className="community section-wrap">
      <div className="section-heading"><div><span className="kicker"><MessageCircle /> The Side Talk</span><h2>Fans shape the conversation.</h2></div><p>Music-first discussion, moderated for respect. Follow artists, react to releases and talk about what deserves another spin.</p></div>
      <div className="community-grid"><div className="prompt-card"><span>Weekly prompt</span><h3>Which Wadadli sound should the world hear next?</h3><form onSubmit={addComment}><Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add your take…" maxLength={240} /><div><small>{comment.length}/240</small><Button type="submit"><Send /> Post</Button></div></form></div><div className="comment-stack"><article><b>JT</b><div><strong>Jada T.</strong><p>Soca with live brass. That sound hits different when the band is really in the room.</p><small>Featured community take</small></div></article>{comments.map((item, index) => <article key={`${item}-${index}`}><b>YOU</b><div><strong>Community member</strong><p>{item}</p><small>Saved in this preview</small></div></article>)}</div></div>
    </section>

    <section id="guidelines" className="guidelines section-wrap">
      <div className="guideline-intro"><span className="kicker"><ShieldCheck /> The ChuneSide standard</span><h2>Creative freedom.<br />A safer stage.</h2><p>Every release is reviewed before publication. The goal is expressive, original music without direct threats, hate or exploitative content.</p><Dialog><DialogTrigger asChild><Button variant="outline">Read full submission rules <ArrowRight /></Button></DialogTrigger><DialogContent className="rules-dialog"><DialogHeader><DialogTitle>ChuneSide submission rules</DialogTitle><DialogDescription>The working standard for every artist, producer and AI-assisted creator.</DialogDescription></DialogHeader><ol><li><b>Own your submission.</b> Submit only music, samples, artwork and voices you created or have permission to use.</li><li><b>No direct violence or threats.</b> We may reject material that celebrates real-world harm, targets a person, or encourages criminal violence.</li><li><b>No hate or harassment.</b> No attacks based on race, nationality, religion, gender, sexuality or disability.</li><li><b>Protect minors.</b> Sexual exploitation or unsafe depictions of children are never accepted.</li><li><b>Label explicit content.</b> Mature themes must be disclosed for review and clear audience labelling.</li><li><b>Disclose AI.</b> Name the tools used, the human creative role and confirm consent for cloned voices or likenesses.</li><li><b>Human review is final.</b> ChuneSide may decline or remove work that conflicts with community safety or legal rights.</li></ol></DialogContent></Dialog></div>
      <div className="guideline-grid"><article><ShieldCheck /><strong>Rights first</strong><p>Only owned or properly licensed audio, artwork, samples and likenesses.</p></article><article><Heart /><strong>Respect people</strong><p>No direct threats, targeted hate, harassment or sexual exploitation.</p></article><article><BadgeCheck /><strong>Clear labels</strong><p>Explicit themes and AI involvement are disclosed before publication.</p></article><article><Users /><strong>Human review</strong><p>Every upload is checked by ChuneSide before it joins the catalogue.</p></article></div>
    </section>

    {sponsorshipsOn && <section className="funding section-wrap">
      <div className="section-heading"><div><span className="kicker"><DollarSign /> Fund the frequency</span><h2>Revenue without ruining the music.</h2></div><p>Keep sponsorship selective, clearly labelled and relevant to the audience. Songs should never be interrupted mid-play.</p></div>
      <div className="funding-grid"><article><span>01</span><strong>Curated sponsors</strong><p>One tasteful landing-page placement from a trusted local or regional brand.</p></article><article><span>02</span><strong>Supported premieres</strong><p>A brand can fund an interview or video premiere, with transparent sponsor labelling.</p></article><article><span>03</span><strong>Contest partners</strong><p>Businesses fund prizes, studio time or performance opportunities for artists.</p></article><article><span>04</span><strong>Fan support later</strong><p>Add memberships, tips or merch links once the audience and catalogue are established.</p></article></div>
    </section>}

    <section id="submit" className="submit-section section-wrap"><div className="submit-icon"><Send /></div><span className="kicker">Artists &amp; managers worldwide</span><h2>Bring your sound<br />to the Side.</h2><p>Send your finished track, cover artwork, short biography, social links and creation disclosure. Wadadli artists receive priority placement; exceptional Caribbean and international work can enter the wider lanes.</p><div className="submit-actions"><Button size="lg" asChild><a href="mailto:chuneside@gmail.com?subject=ChuneSide%20Music%20Submission&body=Artist%20name%3A%0ASong%20title%3A%0ACountry%3A%0AGenre%3A%0AArtist-made%20or%20AI-assisted%3A%0ASocial%20links%3A%0A%0APlease%20attach%20your%20track%2C%20artwork%2C%20short%20bio%20and%20rights%20confirmation.">Submit to chuneside@gmail.com <ArrowRight /></a></Button>{artistWorkspaceOn && <Button size="lg" variant="outline" asChild><Link href="/artist/dashboard">Artist Dashboard <ArrowRight /></Link></Button>}</div><div className="submission-steps"><span><b>01</b>Send your package</span><span><b>02</b>Rights + safety review</span><span><b>03</b>Approved music goes live</span></div></section>

    <footer><a href="#top" className="brand brand-image"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} unoptimized /></a><p>From Wadadli, the Caribbean and the World.</p><div className="footer-actions"><button onClick={share}><Share2 /> Share ChuneSide</button><a href="mailto:chuneside@gmail.com"><ExternalLink /> Email</a></div><span>© 2026 ChuneSide</span></footer>

    <Dialog open={memberGate} onOpenChange={setMemberGate}><DialogContent className="member-dialog"><DialogHeader><DialogTitle>Join ChuneSide to make it count</DialogTitle><DialogDescription>Listening is open to guests. Likes and artist follows are reserved for signed-in members so every chart position represents a unique person.</DialogDescription></DialogHeader><div className="member-benefits"><span><Heart /> One verified Like per song</span><span><Trophy /> Help shape monthly rankings</span><span><UserPlus /> Follow your favourite artists</span></div><Button asChild><a href={memberSignInPath}>Sign in or create an account <ArrowRight /></a></Button><small>Free membership. Your email is used only to identify your unique ChuneSide account.</small></DialogContent></Dialog>

    <audio ref={audioRef} src={active?.audioUrl ?? undefined} onTimeUpdate={(event) => { const audio = event.currentTarget; if (audio.duration) setProgress(audio.currentTime / audio.duration * 100); }} onEnded={() => moveTrack(1)} onError={() => setPlaying(false)} preload="metadata" />
    <aside className="now-playing" aria-label={active?.audioUrl ? "Audio player" : "Catalogue player"}><div className={`mini-cover bg-gradient-to-br ${active?.colors ?? "from-[#242832] via-[#171a21] to-[#090a0d]"}`}>{active?.coverImageUrl ? <Image src={active.coverImageUrl} alt="" fill sizes="46px" unoptimized /> : active?.mark ?? <Disc3 />}</div><div className="now-meta"><strong>{active?.title ?? "No approved chunes"}</strong><span>{active ? `${active.artist} · ${active.audioUrl ? "Now playing" : "Preview mode"}` : "The live catalogue is being prepared."}</span></div><div className="player-controls"><button disabled={!active} onClick={() => moveTrack(-1)} aria-label="Previous track"><SkipBack /></button><button className="main-play" disabled={!active} onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button><button disabled={!active} onClick={() => moveTrack(1)} aria-label="Next track"><SkipForward /></button></div><input className="progress-range" type="range" min="0" max="100" step=".1" value={progress} disabled={!active} onChange={(event) => seekTrack(Number(event.target.value))} aria-label="Track progress" /><span className="time">{formatPlayerTime(activeDuration * progress / 100)} / {active?.duration ?? "--"}</span><label className="volume"><Volume2 /><input type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Volume" /></label><ChevronDown className="queue" /></aside>
  </main>;
}

function CommunityNewsBar({ announcements }: { announcements: PublicAnnouncement[] }) {
  if (!announcements.length) return null;
  const speed = Math.max(10, Math.min(120, Math.round(announcements[0]?.scrollSpeedSeconds ?? 28)));
  const items = announcements.length > 1 ? announcements : [...announcements, ...announcements];
  const className = `community-news-bar text-${announcements[0]?.textSize ?? "medium"} font-${announcements[0]?.fontStyle ?? "bold"}`;
  return (
    <section className={className} aria-label="ChuneSide community announcements" style={{ "--news-speed": `${speed}s` } as CSSProperties}>
      <div className="news-track">
        {items.map((item, index) => {
          const content = <><Megaphone /><span>{titleCase(item.category)}</span><strong>{item.message}</strong></>;
          return item.linkUrl
            ? <a href={item.linkUrl} key={`${item.id}-${index}`}>{content}</a>
            : <p key={`${item.id}-${index}`}>{content}</p>;
        })}
      </div>
    </section>
  );
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function catalogueValues(values: string[]) {
  return ["All", ...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b));
}
