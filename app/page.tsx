"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowRight, BadgeCheck, Bot, ChevronDown, Clock3, Disc3, DollarSign,
  ExternalLink, Heart, Menu, MessageCircle, Mic2, Pause, Play, Radio,
  Search, Send, Share2, ShieldCheck, SkipBack, SkipForward, Sparkles,
  Trophy, UserPlus, Users, Video, Volume2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type Lane = "wadadli" | "caribbean" | "ai" | "world";
type Track = {
  id: number; title: string; artist: string; genre: string; origin: string;
  lane: Lane; creation: "Artist-made" | "AI-assisted"; mood: string;
  duration: string; colors: string; mark: string; loves: number; likes: number; fans: number;
};

const tracks: Track[] = [
  { id: 1, title: "Golden Hour", artist: "Kaia Rivers", genre: "Soca", origin: "Antigua & Barbuda", lane: "wadadli", creation: "Artist-made", mood: "Carnival glow", duration: "3:18", colors: "from-[#ff4d00] via-[#ff8a00] to-[#ffe600]", mark: "KR", loves: 428, likes: 187, fans: 96 },
  { id: 2, title: "Harbour Lights", artist: "Marlon Tide", genre: "Reggae", origin: "Antigua & Barbuda", lane: "wadadli", creation: "Artist-made", mood: "Roots & soul", duration: "4:06", colors: "from-[#03a678] via-[#006b5b] to-[#081c24]", mark: "MT", loves: 361, likes: 204, fans: 73 },
  { id: 3, title: "No Apology", artist: "Nia Vale", genre: "R&B", origin: "Antigua & Barbuda", lane: "wadadli", creation: "Artist-made", mood: "Late-night confidence", duration: "2:54", colors: "from-[#8b3dff] via-[#5023b8] to-[#140b31]", mark: "NV", loves: 292, likes: 145, fans: 84 },
  { id: 4, title: "Bend the Road", artist: "Kruz & The Bay", genre: "Dancehall", origin: "Antigua & Barbuda", lane: "wadadli", creation: "Artist-made", mood: "Bass-forward energy", duration: "3:32", colors: "from-[#ff1967] via-[#8d174c] to-[#210816]", mark: "KB", loves: 254, likes: 123, fans: 61 },
  { id: 5, title: "Sugar Mill", artist: "Elijah Stone", genre: "Afrobeat", origin: "Barbados", lane: "caribbean", creation: "Artist-made", mood: "Island rhythm", duration: "3:45", colors: "from-[#00c2ff] via-[#0063cc] to-[#071d44]", mark: "ES", loves: 198, likes: 117, fans: 52 },
  { id: 6, title: "Sea Grape", artist: "Lani June", genre: "Alternative", origin: "Dominica", lane: "caribbean", creation: "Artist-made", mood: "Soft coastal haze", duration: "3:09", colors: "from-[#c9ff22] via-[#5e9b18] to-[#15300b]", mark: "LJ", loves: 176, likes: 98, fans: 48 },
  { id: 7, title: "Neon Mangrove", artist: "Mika + Machine", genre: "Electronic", origin: "Antigua & Barbuda", lane: "ai", creation: "AI-assisted", mood: "Future-island pulse", duration: "2:47", colors: "from-[#dfff00] via-[#00b98f] to-[#10211c]", mark: "AI", loves: 144, likes: 89, fans: 37 },
  { id: 8, title: "Satellite Riddim", artist: "Nova Palm", genre: "Fusion", origin: "Guest Frequency", lane: "world", creation: "AI-assisted", mood: "Global bass experiment", duration: "3:26", colors: "from-[#7d2cff] via-[#ff2fa6] to-[#241044]", mark: "NP", loves: 121, likes: 76, fans: 31 },
];

const videos = [
  { eyebrow: "ChuneSide premiere · 268", artist: "Kaia Rivers", title: "Golden Hour", note: "Featured music video", tint: "hero-a", trackId: 1 },
  { eyebrow: "Artist spotlight · Interview", artist: "Nia Vale", title: "Behind the Chune", note: "Studio conversation", tint: "hero-b", trackId: 3 },
  { eyebrow: "Future frequency · AI-assisted", artist: "Mika + Machine", title: "Neon Mangrove", note: "Process disclosed", tint: "hero-c", trackId: 7 },
];

const genres = ["All", "Soca", "Reggae", "Dancehall", "R&B", "Afrobeat", "Alternative", "Electronic", "Fusion"];

type MemberState = {
  authenticated: boolean;
  member: { displayName: string; email: string } | null;
  likes: number[];
  follows: string[];
  allTime: Record<string, number>;
  monthly: Record<string, number>;
};

function Cover({ track, large = false }: { track: Track; large?: boolean }) {
  return <div className={`cover relative overflow-hidden bg-gradient-to-br ${track.colors} ${large ? "aspect-[1.07]" : "aspect-square"}`}>
    <div className="cover-grid" /><Disc3 className="absolute -bottom-8 -right-8 h-36 w-36 text-black/20" strokeWidth={1.2} />
    <span className="cover-label">{track.creation}</span>
    <span className={`cover-mark ${large ? "cover-mark-large" : ""}`}>{track.mark}</span>
    {track.creation === "AI-assisted" && <span className="ai-corner"><Bot /> AI</span>}
  </div>;
}

export default function Home() {
  const [selectedGenre, setSelectedGenre] = useState("All");
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
  const [heroIndex, setHeroIndex] = useState(0);
  const [comments, setComments] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [votes, setVotes] = useState(342);
  const [voted, setVoted] = useState(false);

  useEffect(() => {
    try {
      setComments(JSON.parse(window.localStorage.getItem("chuneside-comments") || "[]"));
    } catch { /* keep clean defaults */ }
    fetch("/api/member-state").then((response) => response.ok ? response.json() : null).then((data) => data && setMemberState(data));
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setProgress((value) => value >= 100 ? 0 : value + .28), 200);
    return () => window.clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    const timer = window.setInterval(() => setHeroIndex((index) => (index + 1) % videos.length), 9000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleTracks = useMemo(() => tracks.filter((track) => {
    const laneMatch = lane === "all" || track.lane === lane;
    const genreMatch = selectedGenre === "All" || track.genre === selectedGenre;
    const q = query.trim().toLowerCase();
    return laneMatch && genreMatch && (!q || `${track.title} ${track.artist} ${track.genre} ${track.origin}`.toLowerCase().includes(q));
  }), [lane, selectedGenre, query]);

  const active = tracks.find((track) => track.id === activeId) ?? tracks[0];
  const hero = videos[heroIndex];
  const chooseTrack = (track: Track) => { setActiveId(track.id); setProgress(0); setPlaying(true); };
  const moveTrack = (direction: number) => {
    const index = tracks.findIndex((track) => track.id === activeId);
    chooseTrack(tracks[(index + direction + tracks.length) % tracks.length]);
  };
  const memberAction = async (action: "like" | "follow", track: Track) => {
    if (!memberState?.authenticated) { setMemberGate(true); return; }
    const key = `${action}-${track.id}`;
    setMemberBusy(key);
    const response = await fetch("/api/member-state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, trackId: track.id, artist: track.artist }) });
    if (response.ok) setMemberState(await response.json());
    setMemberBusy(null);
  };
  const ranking = useMemo(() => tracks.map((track) => ({ track, count: memberState?.[rankPeriod]?.[String(track.id)] ?? 0 })).filter((item) => item.count > 0).sort((a, b) => b.count - a.count || a.track.id - b.track.id), [memberState, rankPeriod]);
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
      <a href="#top" className="brand brand-image" aria-label="ChuneSide home"><img src="/chuneside-logo-v2.png" alt="ChuneSide" /></a>
      <nav className="desktop-nav" aria-label="Main navigation"><a href="#discover">Discover</a><a href="#charts">Charts</a><a href="#ai-music">AI music</a><a href="#stories">Stories</a><a href="#contests">Contests</a><a href="#community">Community</a></nav>
      {memberState?.authenticated ? <a className="member-pill" href="/signout-with-chatgpt?return_to=%2F" target="_top"><BadgeCheck /> {memberState.member?.displayName}<span>Sign out</span></a> : <a className="member-pill join" href="/signin-with-chatgpt?return_to=%2F%23charts" target="_top"><UserPlus /> Join free</a>}
      <Button className="menu-button" variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Open menu">{mobileOpen ? <X /> : <Menu />}</Button>
      {mobileOpen && <nav className="mobile-nav" aria-label="Mobile navigation">{[["Discover", "#discover"], ["Charts", "#charts"], ["AI music", "#ai-music"], ["Stories", "#stories"], ["Contests", "#contests"], ["Community", "#community"], ["Guidelines", "#guidelines"], ["Submit music", "#submit"]].map(([label, href]) => <a key={href} href={href} onClick={() => setMobileOpen(false)}>{label}</a>)}</nav>}
    </header>

    <section id="top" className={`cinema-hero ${hero.tint}`}>
      <video key={heroIndex} className="hero-video" autoPlay muted loop playsInline poster="/chuneside-hero.jpg" aria-label="ChuneSide featured video preview"><source src="/chuneside-hero-loop.mp4" type="video/mp4" /></video>
      <div className="hero-shade" />
      <div className="hero-brand-ghost"><img src="/chuneside-logo-v2.png" alt="" /></div>
      <div className="cinema-copy">
        <div className="eyebrow"><span /> {hero.eyebrow}</div>
        <h1>{hero.title === "Golden Hour" ? <>Local sound.<br /><em>World stage.</em></> : <>{hero.title}<br /><em>{hero.artist}</em></>}</h1>
        <p>Wadadli leads the mix. The Caribbean joins the rhythm. Selected independent voices from around the world are welcome.</p>
        <div className="hero-actions"><Button size="lg" onClick={() => chooseTrack(tracks.find((track) => track.id === hero.trackId) ?? tracks[0])}><Play fill="currentColor" /> Play feature</Button><Button size="lg" variant="outline" asChild><a href="#discover">Explore music <ArrowRight /></a></Button></div>
      </div>
      <div className="premiere-card"><span>{hero.note}</span><strong>{hero.artist}</strong><p>{hero.title}</p><small>Demo visual — replace with any approved feature video</small></div>
      <div className="hero-switcher" aria-label="Choose featured video">{videos.map((video, index) => <button key={video.title} className={index === heroIndex ? "active" : ""} onClick={() => setHeroIndex(index)}><b>0{index + 1}</b><span>{video.title}</span></button>)}</div>
    </section>

    <section className="territory-bar"><div><span>01</span><strong>Made in Wadadli</strong><p>Antiguan and Barbudan voices lead the platform.</p></div><div><span>02</span><strong>Caribbean Spotlight</strong><p>A selected window into neighbouring islands.</p></div><div><span>03</span><strong>Guest Frequency</strong><p>Exceptional independent music from the wider world.</p></div></section>

    <section id="discover" className="discover section-wrap">
      <div className="section-heading"><div><span className="kicker"><Radio /> ChuneSide radio · Discovery</span><h2>Find your next chune.</h2></div><label className="search-box"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search music, artist or island" aria-label="Search music, artist or island" /></label></div>
      <Tabs value={lane} onValueChange={setLane} className="music-tabs">
        <TabsList><TabsTrigger value="all">All music</TabsTrigger><TabsTrigger value="wadadli">Wadadli</TabsTrigger><TabsTrigger value="caribbean">Caribbean</TabsTrigger><TabsTrigger value="ai">AI-assisted</TabsTrigger><TabsTrigger value="world">World</TabsTrigger></TabsList>
        <TabsContent value={lane}>
          <div className="genre-row" aria-label="Filter by genre">{genres.map((genre) => <button key={genre} className={selectedGenre === genre ? "active" : ""} onClick={() => setSelectedGenre(genre)}>{genre}</button>)}</div>
          <div className="track-grid">{visibleTracks.map((track, index) => <article className="track-card" key={track.id}>
            <button className="cover-button" onClick={() => chooseTrack(track)} aria-label={`Play ${track.title} by ${track.artist}`}><Cover track={track} /><span className="play-float">{activeId === track.id && playing ? <Pause /> : <Play fill="currentColor" />}</span><span className="track-number">{String(index + 1).padStart(2, "0")}</span></button>
            <div className="track-meta"><div><h3>{track.title}</h3><p>{track.artist} · {track.genre}</p><small>{track.origin} · {track.creation}</small></div><span>{track.duration}</span></div>
            <div className="reaction-row"><button disabled={memberBusy === `like-${track.id}`} className={memberState?.likes.includes(track.id) ? "selected" : ""} onClick={() => memberAction("like", track)}><Heart fill="currentColor" /> {memberState?.allTime[String(track.id)] ?? 0} verified likes</button><button disabled={memberBusy === `follow-${track.id}`} className={memberState?.follows.includes(track.artist) ? "selected fan" : "fan"} onClick={() => memberAction("follow", track)}><UserPlus /> {memberState?.follows.includes(track.artist) ? "Following" : "Follow"}</button></div>
          </article>)}{visibleTracks.length === 0 && <div className="empty-state"><Disc3 /><h3>No chunes found</h3><p>Try another lane, title or genre.</p></div>}</div>
        </TabsContent>
      </Tabs>
    </section>

    <section id="charts" className="charts section-wrap">
      <div className="section-heading"><div><span className="kicker"><Trophy /> Verified member charts</span><h2>The ChuneSide ranking.</h2></div><div className="chart-period"><button className={rankPeriod === "monthly" ? "active" : ""} onClick={() => setRankPeriod("monthly")}>This month</button><button className={rankPeriod === "allTime" ? "active" : ""} onClick={() => setRankPeriod("allTime")}>All time</button></div></div>
      <div className="ranking-rule"><BadgeCheck /><p><strong>One member. One like. One honest chart.</strong> Guests can listen, but only signed-in members can Like or Follow. Removing a Like removes it from the chart.</p></div>
      {ranking.length ? <div className="leaderboard">{ranking.map(({ track, count }, index) => <article key={track.id} className={index === 0 ? "number-one" : ""}><span className="rank-number">{String(index + 1).padStart(2, "0")}</span><div className={`rank-cover bg-gradient-to-br ${track.colors}`}>{track.mark}</div><div className="rank-track"><strong>{track.title}</strong><span>{track.artist} · {track.origin}</span></div><div className="rank-score"><Heart fill="currentColor" /><strong>{count}</strong><span>unique {count === 1 ? "like" : "likes"}</span></div><button onClick={() => chooseTrack(track)} aria-label={`Play ${track.title}`}><Play fill="currentColor" /></button></article>)}</div> : <div className="chart-empty"><Trophy /><h3>The chart is ready for its first member vote.</h3><p>Like an approved song to place it on the official {rankPeriod === "monthly" ? "monthly" : "all-time"} ranking.</p></div>}
      <div className="chart-note"><span>Monthly chart</span><p>Counts unique Likes added during the current calendar month.</p><span>All-time chart</span><p>Counts every active unique member Like since the song joined ChuneSide.</p></div>
    </section>

    <section id="ai-music" className="ai-section section-wrap">
      <div className="ai-orbit"><Bot /><span>Human idea</span><span>AI disclosed</span><span>Rights checked</span></div>
      <div className="ai-copy"><span className="kicker"><Sparkles /> Future Frequency</span><h2>AI-assisted.<br />Clearly labelled.</h2><p>Creators using generative tools get a dedicated discovery lane—not a hidden label. Every submission must explain the human contribution, tools used, and confirm rights to the voice, music and artwork.</p><Button onClick={() => { setLane("ai"); document.querySelector("#discover")?.scrollIntoView(); }}>Explore AI-assisted music <ArrowRight /></Button></div>
    </section>

    <section id="stories" className="stories section-wrap">
      <div className="feature-art"><Cover track={tracks[2]} large /></div>
      <div className="feature-copy"><span className="kicker"><Mic2 /> Artist spotlight · Interview 001</span><h2>Meet Nia Vale.</h2><p>A bold new R&amp;B voice blending late-night soul, island cadence and fearless writing. ChuneSide goes beyond the song to introduce the person, process and place behind the music.</p><div className="spotlight-meta"><span>St. John&apos;s, Antigua</span><span>R&amp;B / Soul</span><span>Independent</span></div><div className="social-row"><Button onClick={() => chooseTrack(tracks[2])}><Play fill="currentColor" /> Play spotlight</Button><Dialog><DialogTrigger asChild><Button variant="outline"><Video /> Open interview</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Behind the Chune: Nia Vale</DialogTitle><DialogDescription>A preview of the artist-interview experience.</DialogDescription></DialogHeader><div className="interview-preview"><Play fill="currentColor" /><span>Interview video goes here</span></div><p className="dialog-copy">Talk about the story behind the record, the creative process, Antigua&apos;s influence, and what comes next.</p></DialogContent></Dialog></div><small>Sample profile and interview concept for the private preview.</small></div>
    </section>

    <section id="contests" className="contest-section section-wrap">
      <div className="contest-top"><div><span className="kicker"><Trophy /> ChuneSide challenges</span><h2>The Road March Refix.</h2></div><div className="contest-status"><span>Concept contest</span><strong>Entries open soon</strong></div></div>
      <div className="contest-grid"><div className="contest-main"><p>Flip a supplied Antiguan rhythm into an original two-minute track. Finalists get a ChuneSide feature, artist interview and audience voting week.</p><div className="contest-stats"><span><Clock3 /> Submission window<br /><b>To be announced</b></span><span><Users /> Judging<br /><b>Panel + fan choice</b></span><span><Trophy /> Prize<br /><b>Partner announcement soon</b></span></div><Button asChild><a href="mailto:chuneside@gmail.com?subject=ChuneSide%20Contest%20Interest">Register interest <ArrowRight /></a></Button></div><div className="fan-choice"><span>Fan choice preview</span><strong>Audience vote</strong><p>Let listeners help select a winner without replacing the independent judging panel.</p><button className={voted ? "voted" : ""} onClick={() => { setVoted(!voted); setVotes((value) => value + (voted ? -1 : 1)); }}><Heart fill="currentColor" /> {voted ? "Vote counted" : "Cast demo vote"}</button><small>{votes.toLocaleString()} preview votes</small></div></div>
    </section>

    <section id="community" className="community section-wrap">
      <div className="section-heading"><div><span className="kicker"><MessageCircle /> The Side Talk</span><h2>Fans shape the conversation.</h2></div><p>Music-first discussion, moderated for respect. Follow artists, react to releases and talk about what deserves another spin.</p></div>
      <div className="community-grid"><div className="prompt-card"><span>Weekly prompt</span><h3>Which Wadadli sound should the world hear next?</h3><form onSubmit={addComment}><Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add your take…" maxLength={240} /><div><small>{comment.length}/240</small><Button type="submit"><Send /> Post</Button></div></form></div><div className="comment-stack"><article><b>JT</b><div><strong>Jada T.</strong><p>Soca with live brass. That sound hits different when the band is really in the room.</p><small>Featured community take</small></div></article>{comments.map((item, index) => <article key={`${item}-${index}`}><b>YOU</b><div><strong>Community member</strong><p>{item}</p><small>Saved in this preview</small></div></article>)}</div></div>
    </section>

    <section id="guidelines" className="guidelines section-wrap">
      <div className="guideline-intro"><span className="kicker"><ShieldCheck /> The ChuneSide standard</span><h2>Creative freedom.<br />A safer stage.</h2><p>Every release is reviewed before publication. The goal is expressive, original music without direct threats, hate or exploitative content.</p><Dialog><DialogTrigger asChild><Button variant="outline">Read full submission rules <ArrowRight /></Button></DialogTrigger><DialogContent className="rules-dialog"><DialogHeader><DialogTitle>ChuneSide submission rules</DialogTitle><DialogDescription>The working standard for every artist, producer and AI-assisted creator.</DialogDescription></DialogHeader><ol><li><b>Own your submission.</b> Submit only music, samples, artwork and voices you created or have permission to use.</li><li><b>No direct violence or threats.</b> We may reject material that celebrates real-world harm, targets a person, or encourages criminal violence.</li><li><b>No hate or harassment.</b> No attacks based on race, nationality, religion, gender, sexuality or disability.</li><li><b>Protect minors.</b> Sexual exploitation or unsafe depictions of children are never accepted.</li><li><b>Label explicit content.</b> Mature themes must be disclosed for review and clear audience labelling.</li><li><b>Disclose AI.</b> Name the tools used, the human creative role and confirm consent for cloned voices or likenesses.</li><li><b>Human review is final.</b> ChuneSide may decline or remove work that conflicts with community safety or legal rights.</li></ol></DialogContent></Dialog></div>
      <div className="guideline-grid"><article><ShieldCheck /><strong>Rights first</strong><p>Only owned or properly licensed audio, artwork, samples and likenesses.</p></article><article><Heart /><strong>Respect people</strong><p>No direct threats, targeted hate, harassment or sexual exploitation.</p></article><article><BadgeCheck /><strong>Clear labels</strong><p>Explicit themes and AI involvement are disclosed before publication.</p></article><article><Users /><strong>Human review</strong><p>Every upload is checked by ChuneSide before it joins the catalogue.</p></article></div>
    </section>

    <section className="funding section-wrap">
      <div className="section-heading"><div><span className="kicker"><DollarSign /> Fund the frequency</span><h2>Revenue without ruining the music.</h2></div><p>Keep sponsorship selective, clearly labelled and relevant to the audience. Songs should never be interrupted mid-play.</p></div>
      <div className="funding-grid"><article><span>01</span><strong>Curated sponsors</strong><p>One tasteful landing-page placement from a trusted local or regional brand.</p></article><article><span>02</span><strong>Supported premieres</strong><p>A brand can fund an interview or video premiere, with transparent sponsor labelling.</p></article><article><span>03</span><strong>Contest partners</strong><p>Businesses fund prizes, studio time or performance opportunities for artists.</p></article><article><span>04</span><strong>Fan support later</strong><p>Add memberships, tips or merch links once the audience and catalogue are established.</p></article></div>
    </section>

    <section id="submit" className="submit-section section-wrap"><div className="submit-icon"><Send /></div><span className="kicker">Artists &amp; managers worldwide</span><h2>Bring your sound<br />to the Side.</h2><p>Send your finished track, cover artwork, short biography, social links and creation disclosure. Wadadli artists receive priority placement; exceptional Caribbean and international work can enter the wider lanes.</p><Button size="lg" asChild><a href="mailto:chuneside@gmail.com?subject=ChuneSide%20Music%20Submission&body=Artist%20name%3A%0ASong%20title%3A%0ACountry%3A%0AGenre%3A%0AArtist-made%20or%20AI-assisted%3A%0ASocial%20links%3A%0A%0APlease%20attach%20your%20track%2C%20artwork%2C%20short%20bio%20and%20rights%20confirmation.">Submit to chuneside@gmail.com <ArrowRight /></a></Button><div className="submission-steps"><span><b>01</b>Send your package</span><span><b>02</b>Rights + safety review</span><span><b>03</b>Approved music goes live</span></div></section>

    <footer><a href="#top" className="brand brand-image"><img src="/chuneside-logo-v2.png" alt="ChuneSide" /></a><p>From Wadadli, the Caribbean and the World.</p><div className="footer-actions"><button onClick={share}><Share2 /> Share ChuneSide</button><a href="mailto:chuneside@gmail.com"><ExternalLink /> Email</a></div><span>© 2026 ChuneSide</span></footer>

    <Dialog open={memberGate} onOpenChange={setMemberGate}><DialogContent className="member-dialog"><DialogHeader><DialogTitle>Join ChuneSide to make it count</DialogTitle><DialogDescription>Listening is open to guests. Likes and artist follows are reserved for signed-in members so every chart position represents a unique person.</DialogDescription></DialogHeader><div className="member-benefits"><span><Heart /> One verified Like per song</span><span><Trophy /> Help shape monthly rankings</span><span><UserPlus /> Follow your favourite artists</span></div><Button asChild><a href="/signin-with-chatgpt?return_to=%2F%23charts" target="_top">Sign in with ChatGPT <ArrowRight /></a></Button><small>Free membership. Your email is used only to identify your unique ChuneSide account.</small></DialogContent></Dialog>

    <aside className="now-playing" aria-label="Preview player"><div className={`mini-cover bg-gradient-to-br ${active.colors}`}>{active.mark}</div><div className="now-meta"><strong>{active.title}</strong><span>{active.artist} · Preview</span></div><div className="player-controls"><button onClick={() => moveTrack(-1)} aria-label="Previous track"><SkipBack /></button><button className="main-play" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button><button onClick={() => moveTrack(1)} aria-label="Next track"><SkipForward /></button></div><input className="progress-range" type="range" min="0" max="100" step=".1" value={progress} onChange={(event) => setProgress(Number(event.target.value))} aria-label="Track progress" /><span className="time">{Math.floor(progress * 2.08 / 60)}:{String(Math.floor(progress * 2.08) % 60).padStart(2, "0")} / {active.duration}</span><label className="volume"><Volume2 /><input type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Volume" /></label><ChevronDown className="queue" /></aside>
  </main>;
}
