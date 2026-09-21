"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Volume2, VolumeX } from "lucide-react";

type Campaign = { id: string; sponsorName: string; position: "corner" | "center"; mobileMode: "bottom" | "top" | "hidden"; maxWidth: number; clickUrl: string | null; dismissible: boolean; videoUrl: string; posterUrl: string | null };

export function FloatingVideoAd({ enabled, musicPlaying }: { enabled: boolean; musicPlaying: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [phase, setPhase] = useState<"hidden" | "entering" | "visible" | "exiting">("hidden");
  const [adAudioEnabled, setAdAudioEnabled] = useState(false);
  const impressionSent = useRef(false);

  useEffect(() => {
    if (!enabled) {
      const timer = window.setTimeout(() => { setCampaign(null); setPhase("hidden"); }, 0);
      return () => window.clearTimeout(timer);
    }
    let cancelled = false;
    let timer: number | null = null;
    const visitor = getToken("chuneside-ad-visitor", window.localStorage);
    const session = getToken("chuneside-ad-session", window.sessionStorage);
    const check = async () => {
      if (cancelled || document.hidden) return;
      const data = await fetch("/api/ads/eligible", { headers: { "x-chuneside-ad-visitor": visitor, "x-chuneside-ad-session": session }, cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .catch(() => null) as { campaign?: Campaign | null } | null;
      if (cancelled) return;
      if (data?.campaign) {
        impressionSent.current = false;
        setCampaign(data.campaign);
        setPhase("entering");
        return;
      }
      timer = window.setTimeout(() => void check(), 10_000);
    };
    const checkOnFocus = () => { if (!document.hidden && !videoRef.current) void check(); };
    timer = window.setTimeout(() => void check(), 800);
    window.addEventListener("focus", checkOnFocus);
    document.addEventListener("visibilitychange", checkOnFocus);
    return () => { cancelled = true; if (timer !== null) window.clearTimeout(timer); window.removeEventListener("focus", checkOnFocus); document.removeEventListener("visibilitychange", checkOnFocus); };
  }, [enabled]);

  useEffect(() => { if (phase === "entering") { const timer = window.setTimeout(() => setPhase("visible"), 40); return () => window.clearTimeout(timer); } }, [phase]);
  useEffect(() => { if (musicPlaying && videoRef.current) { videoRef.current.muted = true; setAdAudioEnabled(false); } }, [musicPlaying]);
  useEffect(() => { if (phase === "visible" && !impressionSent.current && campaign) { impressionSent.current = true; void sendEvent(campaign.id, "impression"); } }, [phase, campaign]);

  function exit(eventType: "complete" | "close") { if (!campaign) return; void sendEvent(campaign.id, eventType, videoRef.current?.currentTime); setPhase("exiting"); window.setTimeout(() => setCampaign(null), 260); }
  function toggleAudio() { if (musicPlaying || !videoRef.current) return; const next = !adAudioEnabled; videoRef.current.muted = !next; setAdAudioEnabled(next); }
  if (!enabled || !campaign) return null;
  return <aside className={`floating-video-ad floating-video-ad-${campaign.position} floating-video-ad-mobile-${campaign.mobileMode} floating-video-ad-${phase}`} style={{ "--ad-max-width": `${campaign.maxWidth}px` } as React.CSSProperties} aria-label={`Sponsored video from ${campaign.sponsorName}`}>
    <div className="floating-video-ad-label">Sponsored · {campaign.sponsorName}</div>
    <div className="floating-video-ad-frame"><video ref={videoRef} src={campaign.videoUrl} poster={campaign.posterUrl ?? undefined} autoPlay muted playsInline preload="metadata" onPlay={() => void sendEvent(campaign.id, "start")} onEnded={() => exit("complete")} /><div className="floating-video-ad-controls"><button type="button" onClick={toggleAudio} disabled={musicPlaying} aria-label={musicPlaying ? "Ad audio muted while music is playing" : adAudioEnabled ? "Mute ad" : "Enable ad sound"}>{adAudioEnabled ? <Volume2 /> : <VolumeX />}</button>{campaign.clickUrl && <a href={campaign.clickUrl} target="_blank" rel="noreferrer" onClick={() => void sendEvent(campaign.id, "click")} aria-label="Open sponsor link"><ExternalLink /></a>}</div></div>
  </aside>;
}

function getToken(key: string, storage: Storage) { try { const existing = storage.getItem(key); if (existing) return existing; const value = crypto.randomUUID(); storage.setItem(key, value); return value; } catch { return crypto.randomUUID(); } }
async function sendEvent(campaignId: string, eventType: "impression" | "start" | "complete" | "click" | "close", durationSeconds?: number) { const visitor = localStorage.getItem("chuneside-ad-visitor") ?? "missing"; const session = sessionStorage.getItem("chuneside-ad-session") ?? "missing"; await fetch("/api/ads/events", { method: "POST", headers: { "content-type": "application/json", "x-chuneside-ad-visitor": visitor, "x-chuneside-ad-session": session }, body: JSON.stringify({ campaignId, eventType, durationSeconds }), keepalive: true }).catch(() => undefined); }
