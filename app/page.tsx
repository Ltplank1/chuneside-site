"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, Disc3, ExternalLink, Heart, Menu, Pause, Play, Search, Send, Sparkles, ThumbsUp, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Track = { id: number; title: string; artist: string; genre: string; mood: string; duration: string; colors: string; mark: string; loves: number; likes: number; fans: number };

const tracks: Track[] = [
  { id: 1, title: "Golden Hour", artist: "Kaia Rivers", genre: "Soca", mood: "Carnival glow", duration: "3:18", colors: "from-[#ff4d00] via-[#ff8a00] to-[#ffe600]", mark: "KR", loves: 428, likes: 187, fans: 96 },
  { id: 2, title: "Harbour Lights", artist: "Marlon Tide", genre: "Reggae", mood: "Roots & soul", duration: "4:06", colors: "from-[#03a678] via-[#006b5b] to-[#081c24]", mark: "MT", loves: 361, likes: 204, fans: 73 },
  { id: 3, title: "No Apology", artist: "Nia Vale", genre: "R&B", mood: "Late-night confidence", duration: "2:54", colors: "from-[#8b3dff] via-[#5023b8] to-[#140b31]", mark: "NV", loves: 292, likes: 145, fans: 84 },
  { id: 4, title: "Bend the Road", artist: "Kruz & The Bay", genre: "Dancehall", mood: "Bass-forward energy", duration: "3:32", colors: "from-[#ff1967] via-[#8d174c] to-[#210816]", mark: "KB", loves: 254, likes: 123, fans: 61 },
  { id: 5, title: "Sugar Mill", artist: "Elijah Stone", genre: "Afrobeat", mood: "Island rhythm", duration: "3:45", colors: "from-[#00c2ff] via-[#0063cc] to-[#071d44]", mark: "ES", loves: 198, likes: 117, fans: 52 },
  { id: 6, title: "Sea Grape", artist: "Lani June", genre: "Alternative", mood: "Soft coastal haze", duration: "3:09", colors: "from-[#c9ff22] via-[#5e9b18] to-[#15300b]", mark: "LJ", loves: 176, likes: 98, fans: 48 },
];

const genres = ["All", "Soca", "Reggae", "Dancehall", "R&B", "Afrobeat", "Alternative"];

function Cover({ track, large = false }: { track: Track; large?: boolean }) {
  return <div className={`cover relative overflow-hidden bg-gradient-to-br ${track.colors} ${large ? "aspect-[1.07]" : "aspect-square"}`}>
    <div className="cover-grid" /><Disc3 className="absolute -bottom-8 -right-8 h-36 w-36 text-black/20" strokeWidth={1.2} />
    <span className="absolute left-4 top-4 text-[0.68rem] font-black uppercase tracking-[.22em] text-white/75">ChuneSide preview</span>
    <span className={`absolute bottom-3 left-4 font-black tracking-[-.08em] text-white/90 ${large ? "text-7xl sm:text-8xl" : "text-4xl"}`}>{track.mark}</span>
  </div>;
}

export default function Home() {
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(18);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [reactions, setReactions] = useState<Record<number, string[]>>({});

  useEffect(() => { const saved = window.localStorage.getItem("chuneside-reactions"); if (saved) setReactions(JSON.parse(saved)); }, []);
  useEffect(() => { if (!playing) return; const timer = window.setInterval(() => setProgress((value) => value >= 100 ? 0 : value + .35), 200); return () => window.clearInterval(timer); }, [playing]);

  const visibleTracks = useMemo(() => tracks.filter((track) => {
    const genreMatch = selectedGenre === "All" || track.genre === selectedGenre;
    const q = query.trim().toLowerCase();
    return genreMatch && (!q || `${track.title} ${track.artist} ${track.genre}`.toLowerCase().includes(q));
  }), [selectedGenre, query]);
  const active = tracks.find((track) => track.id === activeId) ?? tracks[0];
  const chooseTrack = (track: Track) => { setActiveId(track.id); setProgress(0); setPlaying(true); };
  const react = (trackId: number, reaction: string) => {
    const next = { ...reactions }; const current = new Set(next[trackId] ?? []); current.has(reaction) ? current.delete(reaction) : current.add(reaction); next[trackId] = [...current]; setReactions(next); window.localStorage.setItem("chuneside-reactions", JSON.stringify(next));
  };
  const reactionCount = (track: Track, key: string, base: number) => base + ((reactions[track.id] ?? []).includes(key) ? 1 : 0);

  return <main>
    <header className="site-header">
      <a href="#top" className="brand brand-image" aria-label="ChuneSide home"><img src="/chuneside-original-logo.jpg" alt="ChuneSide" /></a>
      <nav className="desktop-nav" aria-label="Main navigation"><a href="#discover">Discover</a><a href="#artists">Artists</a><a href="#genres">Genres</a><a href="#submit">Submit music</a></nav>
      <Button className="menu-button" variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Open menu">{mobileOpen ? <X /> : <Menu />}</Button>
      {mobileOpen && <nav className="mobile-nav" aria-label="Mobile navigation"><a href="#discover" onClick={() => setMobileOpen(false)}>Discover</a><a href="#artists" onClick={() => setMobileOpen(false)}>Artists</a><a href="#genres" onClick={() => setMobileOpen(false)}>Genres</a><a href="#submit" onClick={() => setMobileOpen(false)}>Submit music</a></nav>}
    </header>

    <section id="top" className="hero-shell">
      <div className="hero-copy">
        <div className="eyebrow"><span /> Fresh from the 268</div><h1>Hear what<br /><em>home</em> sounds like.</h1>
        <p>Discover independent voices shaping the sound of Antigua and the Caribbean—hand-picked and turned all the way up.</p>
        <div className="hero-actions"><Button size="lg" onClick={() => { chooseTrack(tracks[0]); document.getElementById("discover")?.scrollIntoView({ behavior: "smooth" }); }}><Play fill="currentColor" /> Play featured</Button><Button size="lg" variant="outline" asChild><a href="#discover">Explore chunes <ArrowRight /></a></Button></div>
        <div className="signal-row"><div><strong>06</strong><span>Preview tracks</span></div><div><strong>06</strong><span>Emerging artists</span></div><div><strong>268</strong><span>Home frequency</span></div></div>
      </div>
      <div className="hero-visual" aria-label="Featured artist preview"><Cover track={tracks[0]} large /><div className="hero-track-info"><div><span>Featured this week</span><h2>{tracks[0].title}</h2><p>{tracks[0].artist} · {tracks[0].genre}</p></div><Button size="icon-lg" onClick={() => chooseTrack(tracks[0])} aria-label="Play Golden Hour"><Play fill="currentColor" /></Button></div></div>
    </section>

    <section id="discover" className="discover section-wrap">
      <div className="section-heading"><div><span className="kicker">On rotation</span><h2>Discover your next chune.</h2></div><label className="search-box"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search music or artists" aria-label="Search music or artists" /></label></div>
      <div id="genres" className="genre-row" aria-label="Filter by genre">{genres.map((genre) => <button key={genre} className={selectedGenre === genre ? "active" : ""} onClick={() => setSelectedGenre(genre)}>{genre}</button>)}</div>
      <div id="artists" className="track-grid">
        {visibleTracks.map((track, index) => <article className="track-card" key={track.id}>
          <button className="cover-button" onClick={() => chooseTrack(track)} aria-label={`Play ${track.title} by ${track.artist}`}><Cover track={track} /><span className="play-float">{activeId === track.id && playing ? <Pause /> : <Play fill="currentColor" />}</span><span className="track-number">0{index + 1}</span></button>
          <div className="track-meta"><div><h3>{track.title}</h3><p>{track.artist} · {track.genre}</p></div><span>{track.duration}</span></div>
          <div className="reaction-row" aria-label={`Reactions for ${track.title}`}><button className={(reactions[track.id] ?? []).includes("love") ? "selected" : ""} onClick={() => react(track.id, "love")}><Heart fill="currentColor" /> {reactionCount(track, "love", track.loves)}</button><button className={(reactions[track.id] ?? []).includes("like") ? "selected" : ""} onClick={() => react(track.id, "like")}><ThumbsUp fill="currentColor" /> {reactionCount(track, "like", track.likes)}</button><button className={(reactions[track.id] ?? []).includes("fan") ? "selected fan" : "fan"} onClick={() => react(track.id, "fan")}><UserPlus /> Fan</button></div>
        </article>)}
        {visibleTracks.length === 0 && <div className="empty-state"><Disc3 /><h3>No chunes found</h3><p>Try another artist, title or genre.</p></div>}
      </div>
    </section>

    <section className="feature-strip section-wrap"><div className="feature-art"><Cover track={tracks[2]} large /></div><div className="feature-copy"><span className="kicker"><Sparkles /> Artist spotlight</span><h2>Meet Nia Vale.</h2><p>A bold new R&amp;B voice blending late-night soul, island cadence and fearless writing. ChuneSide goes beyond the song to introduce the artist behind it.</p><div className="spotlight-meta"><span>St. John&apos;s, Antigua</span><span>R&amp;B / Soul</span><span>Independent</span></div><div className="social-row"><Button onClick={() => chooseTrack(tracks[2])}><Play fill="currentColor" /> Play spotlight</Button><Button variant="outline" aria-label="Preview Instagram link"><ExternalLink /> Instagram</Button></div><small>Sample artist profile for the ChuneSide preview.</small></div></section>

    <section id="submit" className="submit-section section-wrap"><div className="submit-icon"><Send /></div><span className="kicker">Artists &amp; managers</span><h2>Ready to be heard?</h2><p>Send your finished track, cover artwork, short biography and social links. Every submission is personally reviewed before it appears on ChuneSide.</p><Button size="lg" asChild><a href="mailto:chuneside@gmail.com?subject=ChuneSide%20Music%20Submission&body=Artist%20name%3A%0ASong%20title%3A%0AGenre%3A%0ASocial%20links%3A%0A%0APlease%20attach%20your%20finished%20track%2C%20cover%20artwork%20and%20short%20biography.">Submit to chuneside@gmail.com <ArrowRight /></a></Button><div className="submission-steps"><span><b>01</b>Send your package</span><span><b>02</b>We review it</span><span><b>03</b>Approved music goes live</span></div></section>

    <footer><a href="#top" className="brand brand-image" aria-label="ChuneSide home"><img src="/chuneside-original-logo.jpg" alt="ChuneSide" /></a><p>From Dadli, the Caribbean and the World.</p><span>© 2026 ChuneSide</span></footer>

    <aside className="now-playing" aria-label="Now playing"><div className="mini-cover bg-gradient-to-br from-[#ff4d00] to-[#ffe600]">{active.mark}</div><div className="now-meta"><strong>{active.title}</strong><span>{active.artist}</span></div><Button size="icon" variant="ghost" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</Button><div className="progress-shell"><span style={{ width: `${progress}%` }} /></div><span className="time">{Math.floor(progress * 2.08 / 60)}:{String(Math.floor(progress * 2.08) % 60).padStart(2, "0")} / {active.duration}</span><button className="queue" aria-label="Open player menu"><ChevronDown /></button></aside>
  </main>;
}
