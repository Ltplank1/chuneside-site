"use client";

import { type CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Megaphone, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Campaign = { id: string; name: string; sponsorName: string; status: "draft" | "active" | "paused"; manualOverride: "auto" | "on" | "off"; startAt: string | null; endAt: string | null; rotationWeight: number; position: "corner" | "center"; mobileMode: "bottom" | "top" | "hidden"; maxWidth: number; frequencyCapCount: number; frequencyCapWindowSeconds: number; sessionCapCount: number; clickUrl: string | null; dismissible: boolean; videoObjectKey: string | null; posterObjectKey: string | null; stats: Record<string, number>; diagnostics: string[]; delivery: { result: "blocked" | "ready" | "delivered"; videoValid: boolean; scheduleEligible: boolean; lastEventType: string | null; lastEventAt: string | null } };
type Editor = Campaign | "new" | null;

export function AdvertisingClient({ adminAccessSource }: { adminAccessSource: "allowlist" | "role" }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [editor, setEditor] = useState<Editor>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [advertisingOn, setAdvertisingOn] = useState(false);
  const [previewVideoFile, setPreviewVideoFile] = useState<File | null>(null);
  const [previewPosterFile, setPreviewPosterFile] = useState<File | null>(null);
  const [previewPosition, setPreviewPosition] = useState<Campaign["position"]>("corner");
  const [previewMaxWidth, setPreviewMaxWidth] = useState(420);

  async function refresh() {
    const response = await fetch("/api/admin/advertising", { cache: "no-store" });
    const data = await response.json() as { campaigns?: Campaign[]; totals?: Record<string, number>; advertisingOn?: boolean };
    setCampaigns(data.campaigns ?? []); setTotals(data.totals ?? {}); setAdvertisingOn(Boolean(data.advertisingOn));
  }
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, []);
  function openEditor(next: Editor) {
    setPreviewVideoFile(null);
    setPreviewPosterFile(null);
    setPreviewPosition(next && typeof next === "object" ? next.position : "corner");
    setPreviewMaxWidth(next && typeof next === "object" ? next.maxWidth : 420);
    setEditor(next);
  }
  function closeEditor() { setEditor(null); setPreviewVideoFile(null); setPreviewPosterFile(null); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget); const current = editor && typeof editor === "object" ? editor : null;
    const startAt = combineDateTime(form.get("startDate"), form.get("startTime"));
    const endAt = combineDateTime(form.get("endDate"), form.get("endTime"));
    const response = await fetch("/api/admin/advertising", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      action: "save", id: current?.id, name: form.get("name"), sponsorName: form.get("sponsorName"), status: form.get("status"), startAt, endAt,
      rotationWeight: Number(form.get("rotationWeight")), position: form.get("position"), mobileMode: form.get("mobileMode"), maxWidth: Number(form.get("maxWidth")), frequencyCapCount: Number(form.get("frequencyCapCount")), frequencyCapWindowSeconds: Number(form.get("frequencyCapWindowSeconds")), sessionCapCount: Number(form.get("sessionCapCount")), clickUrl: form.get("clickUrl") || null, dismissible: form.get("dismissible") === "on",
    }) });
    const data = await response.json() as { campaign?: Campaign; error?: string };
    if (!response.ok || !data.campaign) { setError(data.error ?? "Campaign could not be saved."); setBusy(false); return; }
    const video = form.get("video"); const poster = form.get("poster");
    const files = [["video", video], ["poster", poster]] as const;
    const hasUploads = files.some(([, file]) => file instanceof File && file.size > 0);
    setBusy(false); closeEditor(); setMessage(hasUploads ? "Campaign saved. Uploading media…" : "Campaign saved."); void refresh();
    if (hasUploads) void uploadCampaignMedia(data.campaign.id, files, (error) => { if (error) setError(error); else setMessage("Campaign saved and media uploaded."); void refresh(); });
  }

  async function remove(campaign: Campaign) {
    if (!window.confirm(`Delete ${campaign.name}?`)) return;
    await fetch("/api/admin/advertising", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete", id: campaign.id }) });
    await refresh();
  }

  async function setOverride(campaign: Campaign, mode: "auto" | "on" | "off") {
    const response = await fetch("/api/admin/advertising", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "override", id: campaign.id, mode }) });
    if (!response.ok) { const data = await response.json().catch(() => null) as { error?: string } | null; setError(data?.error ?? "Campaign override could not be updated."); return; }
    setMessage(mode === "on" ? "Campaign started now." : mode === "off" ? "Campaign stopped." : "Campaign returned to its schedule.");
    await refresh();
  }

  return <main className="admin-shell advertising-admin">
    <header className="admin-hero"><Link href="/" className="admin-brand" aria-label="Back to ChuneSide"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link><div><span><Megaphone /> Admin foundation</span><h1>FLOATING ADS</h1><p>Manage tasteful, muted-by-default sponsor video campaigns without touching music playback or rankings.</p><small className="admin-access-source">Access granted by {adminAccessSource === "allowlist" ? "owner email allowlist" : "database admin role"}.</small></div></header>
    <nav className="admin-toolbar admin-nav-actions" aria-label="Admin sections"><Button asChild variant="outline"><Link href="/admin/feature-flags">Feature Control</Link></Button><Button asChild variant="outline"><Link href="/admin/analytics">Analytics</Link></Button><Button asChild variant="outline"><Link href="/admin/announcements">News Bar</Link></Button><Button asChild variant="outline"><Link href="/admin/site-content">Site Content</Link></Button><Button onClick={() => openEditor("new")}><Plus /> Campaign</Button></nav>
    <section className="admin-summary" aria-label="Advertising totals"><div><strong>{campaigns.length}</strong><span>Campaigns</span></div><div><strong>{totals.impression ?? 0}</strong><span>Impressions</span></div><div><strong>{totals.complete ?? 0}</strong><span>Completes</span></div><div><strong>{totals.click ?? 0}</strong><span>Clicks</span></div></section>
    {message && <p className="admin-message" role="status">{message}</p>}{error && <p className="catalog-editor-error" role="alert">{error}</p>}{!advertisingOn && <p className="ad-diagnostics-banner" role="status">Public advertising is off in Feature Control. Admin preview remains available.</p>}
    <section className="ad-policy"><strong>Music wins</strong><p>Ads load lazily, start muted, fade in and out, and never pause, restart, seek, or change the music player. ChuneSide breaks, paid placements, and listening/ranking events remain separate.</p></section>
    <section className="advertising-list">{campaigns.map((campaign) => <article key={campaign.id} className="advertising-row"><span className={`ad-status ${campaign.status}`}>{campaign.manualOverride === "on" ? "live now" : campaign.manualOverride === "off" ? "stopped" : campaign.status}</span><div><h2>{campaign.name}</h2><p>{campaign.sponsorName} · {campaign.position} · weight {campaign.rotationWeight}</p><small>{campaign.stats.impression ?? 0} impressions · {campaign.stats.complete ?? 0} completes · {campaign.stats.click ?? 0} clicks</small></div><div className="ad-row-actions"><Button variant="outline" size="sm" onClick={() => void setOverride(campaign, "on")} disabled={campaign.manualOverride === "on"}>Start now</Button><Button variant="outline" size="sm" onClick={() => void setOverride(campaign, "auto")} disabled={campaign.manualOverride === "auto"}>Use schedule</Button><Button variant="outline" size="sm" onClick={() => void setOverride(campaign, "off")} disabled={campaign.manualOverride === "off"}>Stop</Button></div><Button variant="ghost" size="icon" onClick={() => openEditor(campaign)} aria-label={`Edit ${campaign.name}`}><Pencil /></Button><Button variant="ghost" size="icon" onClick={() => void remove(campaign)} aria-label={`Delete ${campaign.name}`}><Trash2 /></Button></article>)}{!campaigns.length && <div className="admin-empty"><Megaphone /><h2>No campaigns yet</h2><p>Create a draft, upload its video, then enable Advertising from Feature Control when you are ready.</p></div>}</section>
    <Dialog open={editor !== null} onOpenChange={(open) => !open && closeEditor()}><DialogContent className="ad-editor"><DialogHeader><DialogTitle>{editor === "new" ? "New ad campaign" : "Edit ad campaign"}</DialogTitle><DialogDescription>Use a short, lightweight video and a poster image. Campaigns stay private until active and the global Advertising flag is on.</DialogDescription></DialogHeader><form onSubmit={save}><div className="ad-form-grid"><label>Name<Input name="name" defaultValue={editor && typeof editor === "object" ? editor.name : ""} required /></label><label>Sponsor<Input name="sponsorName" defaultValue={editor && typeof editor === "object" ? editor.sponsorName : ""} required /></label><label>Status<NativeSelect name="status" defaultValue={editor && typeof editor === "object" ? editor.status : "draft"}><NativeSelectOption value="draft">Draft</NativeSelectOption><NativeSelectOption value="active">Active</NativeSelectOption><NativeSelectOption value="paused">Paused</NativeSelectOption></NativeSelect></label><label>Position<NativeSelect name="position" defaultValue={editor && typeof editor === "object" ? editor.position : "corner"} onChange={(event) => setPreviewPosition(event.currentTarget.value as Campaign["position"])}><NativeSelectOption value="corner">Corner</NativeSelectOption><NativeSelectOption value="center">Center</NativeSelectOption></NativeSelect></label><label>Mobile<NativeSelect name="mobileMode" defaultValue={editor && typeof editor === "object" ? editor.mobileMode : "bottom"}><NativeSelectOption value="bottom">Bottom</NativeSelectOption><NativeSelectOption value="top">Top</NativeSelectOption><NativeSelectOption value="hidden">Hide on mobile</NativeSelectOption></NativeSelect></label><label>Rotation weight<Input name="rotationWeight" type="number" min="1" max="100" defaultValue={editor && typeof editor === "object" ? editor.rotationWeight : 1} /></label><label>Max width (px)<Input name="maxWidth" type="number" min="280" max="720" defaultValue={editor && typeof editor === "object" ? editor.maxWidth : 420} onChange={(event) => setPreviewMaxWidth(Math.min(720, Math.max(280, Number(event.currentTarget.value) || 420)))} /></label><label>Frequency cap<Input name="frequencyCapCount" type="number" min="1" max="20" defaultValue={editor && typeof editor === "object" ? editor.frequencyCapCount : 1} /></label><label>Cap window (seconds)<Input name="frequencyCapWindowSeconds" type="number" min="300" defaultValue={editor && typeof editor === "object" ? editor.frequencyCapWindowSeconds : 86400} /></label><label>Session cap<Input name="sessionCapCount" type="number" min="1" max="5" defaultValue={editor && typeof editor === "object" ? editor.sessionCapCount : 1} /></label><label>Click URL<Input name="clickUrl" type="url" defaultValue={editor && typeof editor === "object" ? editor.clickUrl ?? "" : ""} placeholder="https://example.com" /></label><DateTimeFields label="Starts" prefix="start" value={editor && typeof editor === "object" ? editor.startAt : null} /><DateTimeFields label="Ends" prefix="end" value={editor && typeof editor === "object" ? editor.endAt : null} /><label className="ad-file">Video (.mp4/.webm)<Input name="video" type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(event) => setPreviewVideoFile(event.currentTarget.files?.[0] ?? null)} /></label><label className="ad-file">Poster image<Input name="poster" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPreviewPosterFile(event.currentTarget.files?.[0] ?? null)} /></label><label className="ad-check"><input name="dismissible" type="checkbox" defaultChecked={editor && typeof editor === "object" ? editor.dismissible : true} /> Allow close button</label></div><DialogFooter><Button type="button" variant="outline" onClick={closeEditor}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : <><Save /> Save campaign</>}</Button></DialogFooter></form></DialogContent></Dialog>
    {campaigns.length > 0 && <section className="ad-diagnostics-panel" aria-label="Ad delivery diagnostics"><h2>Delivery diagnostics</h2>{campaigns.map((campaign) => <article key={campaign.id}><div><strong>{campaign.name}</strong><span className={`ad-delivery-result ${campaign.delivery.result}`}>{campaign.delivery.result}</span></div><p>{campaign.diagnostics.join(" · ")}</p><small>Campaign: {campaign.status === "active" ? "Active" : campaign.status} · Video: {campaign.delivery.videoValid ? "Valid" : "Missing or unavailable"} · Schedule: {campaign.delivery.scheduleEligible ? "Eligible" : "Blocked"} · Global ads: {advertisingOn ? "Enabled" : "Disabled"}</small><small>Last client event: {campaign.delivery.lastEventAt ? `${campaign.delivery.lastEventType} at ${new Date(campaign.delivery.lastEventAt).toLocaleString()}` : "None recorded yet"}</small></article>)}</section>}
    {editor && <AdminAdPreview campaign={editor === "new" ? null : editor} videoFile={previewVideoFile} posterFile={previewPosterFile} position={previewPosition} maxWidth={previewMaxWidth} />}
  </main>;
}

function AdminAdPreview({ campaign, videoFile, posterFile, position, maxWidth }: { campaign: Campaign | null; videoFile: File | null; posterFile: File | null; position: Campaign["position"]; maxWidth: number }) {
  const localVideo = useObjectUrl(videoFile);
  const localPoster = useObjectUrl(posterFile);
  const videoUrl = localVideo ?? (campaign?.videoObjectKey ? `/api/ads/media/${campaign.id}/video?adminPreview=1` : null);
  const posterUrl = localPoster ?? (campaign?.posterObjectKey ? `/api/ads/media/${campaign.id}/poster?adminPreview=1` : null);
  return <section className={`ad-preview ad-preview-${position}`} aria-label="Admin ad preview" style={{ "--ad-preview-width": `${maxWidth}px` } as CSSProperties}><div className="ad-preview-heading"><strong>Admin preview</strong><span>{position} · {maxWidth}px max</span></div>{videoUrl ? <video src={videoUrl} poster={posterUrl ?? undefined} controls muted playsInline preload="metadata" /> : <p>Upload a video to preview this campaign.</p>}<small>Preview only. It does not create a public impression or run the public player.</small></section>;
}

function useObjectUrl(file: File | null) {
  const url = useMemo(() => file?.size ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => {
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [url]);
  return url;
}

async function uploadCampaignMedia(campaignId: string, files: readonly [string, FormDataEntryValue | null][], onFinished: (error: string | null) => void) {
  for (const [kind, file] of files) if (file instanceof File && file.size) {
    const uploadResponse = await fetch("/api/admin/advertising/media", {
      method: "POST",
      headers: { "content-type": file.type || "application/octet-stream", "x-chuneside-campaign-id": campaignId, "x-chuneside-media-kind": kind },
      body: file,
    }).catch(() => null);
    const uploadData = await uploadResponse?.json().catch(() => null) as { error?: string } | null;
    if (!uploadResponse?.ok || !uploadData) { onFinished(uploadData?.error ?? `${kind === "video" ? "Video" : "Poster"} upload failed. Please try again.`); return; }
  }
  onFinished(null);
}

function DateTimeFields({ label, prefix, value }: { label: string; prefix: "start" | "end"; value: string | null }) {
  const date = value ? new Date(value) : null;
  const dateValue = date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : "";
  const timeValue = date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(11, 16) : "";
  return <div className="ad-datetime-field"><span>{label}</span><div><label><span>Date</span><DateTimeInput name={`${prefix}Date`} type="date" defaultValue={dateValue} /></label><label><span>Time</span><NativeSelect name={`${prefix}Time`} defaultValue={timeValue}><NativeSelectOption value="">Choose time</NativeSelectOption>{timeOptions.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}</NativeSelect></label></div></div>;
}

function combineDateTime(date: FormDataEntryValue | null, time: FormDataEntryValue | null) {
  const dateText = typeof date === "string" ? date : "";
  const timeText = typeof time === "string" ? time : "";
  return dateText ? new Date(`${dateText}T${timeText || "00:00"}`).toISOString() : null;
}

const timeOptions = Array.from({ length: 288 }, (_, index) => {
  const hours = Math.floor(index / 12);
  const minutes = (index % 12) * 5;
  const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const hour = hours % 12 || 12;
  return { value, label: `${hour}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}` };
});
