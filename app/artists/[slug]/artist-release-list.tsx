"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, Disc3, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PublicTrack } from "@/lib/public-catalog";

export function ArtistReleaseList({ releases }: { releases: PublicTrack[] }) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeRelease = releases.find((release) => release.id === activeId) ?? null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeRelease?.audioUrl) return;
    if (playing) void audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }, [activeRelease?.audioUrl, playing]);

  function togglePlayback(release: PublicTrack) {
    if (!release.audioUrl) return;
    if (activeId === release.id) {
      setPlaying((current) => !current);
      return;
    }
    setActiveId(release.id);
    setPlaying(true);
  }

  return <>
    <div className="artist-release-list">
      {releases.map((release, index) => (
        <article className="artist-release-row" key={release.id}>
          <span className="artist-release-number">{String(index + 1).padStart(2, "0")}</span>
          <div className={"artist-release-cover relative overflow-hidden bg-gradient-to-br " + release.colors}>
            {release.coverImageUrl ? <Image src={release.coverImageUrl} alt={`${release.title} cover artwork`} fill sizes="64px" unoptimized /> : release.mark}
          </div>
          <div className="artist-release-meta">
            <h3>{release.title}</h3>
            <p>{release.genre} · {release.mood}</p>
            <small>{release.origin} · {release.creation}</small>
          </div>
          {release.creation === "AI-assisted" && <span className="artist-ai-label"><Bot /> AI-assisted</span>}
          <span className="artist-release-duration">{release.duration}</span>
          {release.audioUrl ? <Button type="button" size="icon" onClick={() => togglePlayback(release)} aria-label={`${activeId === release.id && playing ? "Pause" : "Play"} ${release.title}`}>{activeId === release.id && playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</Button> : <Button asChild size="icon" aria-label={`Find ${release.title} in Discovery`}><Link href="/#discover"><ArrowRight /></Link></Button>}
        </article>
      ))}
      {!releases.length && (
        <div className="artist-release-empty">
          <Disc3 />
          <h3>No approved releases yet</h3>
          <p>This profile is ready, and its music will appear here after ChuneSide review.</p>
        </div>
      )}
    </div>
    <audio ref={audioRef} src={activeRelease?.audioUrl ?? undefined} onEnded={() => setPlaying(false)} onError={() => setPlaying(false)} preload="metadata" />
  </>;
}
