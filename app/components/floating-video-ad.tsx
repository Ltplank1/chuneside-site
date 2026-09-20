"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Volume2, VolumeX, X } from "lucide-react";

type Campaign = { id: string; sponsorName: string; position: "corner" | "center"; mobileMode: "bottom" | "top" | "hidden"; maxWidth: number; clickUrl: string | null; dismissible: boolean; videoUrl: string; posterUrl: string | null };

export function FloatingVideoAd({ enabled, musicPlaying }: { enabled: boolean; musicPlaying: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [phase, setPhase] = useState<"hidden" | "entering" | "visible" | "exiting">("hidden");
  const [adAudioEnabled, setAdAudioEnabled] = useState(false);
  const impressionSent = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const visitor = getToken("chuneside-ad-visitor", localStorage);
    const session = getToken("chuneside-ad-session", sessionStorage);
    const timer = window.setTimeout(() => { void fetch(`/api/ads/eligible`, { headers: { "x-chuneside-ad-visitor": visitor, "x-chuneside-ad-session": session }, cache: "no-store" }).then((response) => response.json()).then((data: { campaign?: Campaign | null }) => { if (data.campaign) { setCampaign(data.campaign); setPhase("entering"); } }).catch(() => undefined); }, 1500);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  useEffect(() => { if (phase === "entering") { const timer = window.setTimeout(() => setPhase("visible"), 40); return () => window.clearTimeout(timer); } }, [phase]);
  useEffect(() => { if (musicPlaying && videoRef.current) { videoRef.current.muted = true; setAdAudioEnabled(false); } }, [musicPlaying]);
  useEffect(() => { if (phase === "visible" && !impressionSent.current && campaign) { impressionSent.current = true; void sendEvent(campaign.id, "impression"); } }, [phase, campaign]);

  function exit(eventType: "complete" | "close") { if (!campaign) return; void sendEvent(campaign.id, eventType, videoRef.current?.currentTime); setPhase("exiting"); window.setTimeout(() => setCampaign(null), 260); }
  function toggleAudio() { if (musicPlaying || !videoRef.current) return; const next = !adAudioEnabled; videoRef.current.muted = !next; setAdAudioEnabled(next); }
  if (!campaign) return null;
  return <aside className={`floating-video-ad floating-video-ad-${campaign.position} floating-video-ad-mobile-${campaign.mobileMode} floating-video-ad-${phase}`} style={{ "--ad-max-width": `${campaign.maxWidth}px` } as React.CSSProperties} aria-label={`Sponsored video from ${campaign.sponsorName}`}>
    <div className="floating-video-ad-label">Sponsored · {campaign.sponsorName}</div>
    <div className="floating-video-ad-frame"><video ref={videoRef} src={campaign.videoUrl} poster={campaign.posterUrl ?? undefined} autoPlay muted playsInline preload="none" onPlay={() => void sendEvent(campaign.id, "start")} onEnded={() => exit("complete")} onError={() => exit("close")} /><div className="floating-video-ad-controls"><button type="button" onClick={toggleAudio} disabled={musicPlaying} aria-label={musicPlaying ? "Ad audio muted while music is playing" : adAudioEnabled ? "Mute ad" : "Enable ad sound"}>{adAudioEnabled ? <Volume2 /> : <VolumeX />}</button>{campaign.clickUrl && <a href={campaign.clickUrl} target="_blank" rel="noreferrer" onClick={() => void sendEvent(campaign.id, "click")} aria-label="Open sponsor link"><ExternalLink /></a>}{campaign.dismissible && <button type="button" onClick={() => exit("close")} aria-label="Close sponsored video"><X /></button>}</div></div>
  </aside>;
}

function getToken(key: string, storage: Storage) { const existing = storage.getItem(key); if (existing) return existing; const value = crypto.randomUUID(); storage.setItem(key, value); return value; }
async function sendEvent(campaignId: string, eventType: "impression" | "start" | "complete" | "click" | "close", durationSeconds?: number) { const visitor = localStorage.getItem("chuneside-ad-visitor") ?? "missing"; const session = sessionStorage.getItem("chuneside-ad-session") ?? "missing"; await fetch("/api/ads/events", { method: "POST", headers: { "content-type": "application/json", "x-chuneside-ad-visitor": visitor, "x-chuneside-ad-session": session }, body: JSON.stringify({ campaignId, eventType, durationSeconds }), keepalive: true }).catch(() => undefined); }
