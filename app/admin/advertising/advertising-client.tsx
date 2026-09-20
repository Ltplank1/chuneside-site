"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Megaphone, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Campaign = { id: string; name: string; sponsorName: string; status: "draft" | "active" | "paused"; startAt: string | null; endAt: string | null; rotationWeight: number; position: "corner" | "center"; mobileMode: "bottom" | "top" | "hidden"; maxWidth: number; frequencyCapCount: number; frequencyCapWindowSeconds: number; sessionCapCount: number; clickUrl: string | null; dismissible: boolean; videoObjectKey: string | null; posterObjectKey: string | null; stats: Record<string, number> };
type Editor = Campaign | "new" | null;

export function AdvertisingClient({ adminAccessSource }: { adminAccessSource: "allowlist" | "role" }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [editor, setEditor] = useState<Editor>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch("/api/admin/advertising", { cache: "no-store" });
    const data = await response.json() as { campaigns?: Campaign[]; totals?: Record<string, number> };
    setCampaigns(data.campaigns ?? []); setTotals(data.totals ?? {});
  }
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget); const current = editor && typeof editor === "object" ? editor : null;
    const response = await fetch("/api/admin/advertising", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      action: "save", id: current?.id, name: form.get("name"), sponsorName: form.get("sponsorName"), status: form.get("status"), startAt: form.get("startAt") || null, endAt: form.get("endAt") || null,
      rotationWeight: Number(form.get("rotationWeight")), position: form.get("position"), mobileMode: form.get("mobileMode"), maxWidth: Number(form.get("maxWidth")), frequencyCapCount: Number(form.get("frequencyCapCount")), frequencyCapWindowSeconds: Number(form.get("frequencyCapWindowSeconds")), sessionCapCount: Number(form.get("sessionCapCount")), clickUrl: form.get("clickUrl") || null, dismissible: form.get("dismissible") === "on",
    }) });
    const data = await response.json() as { campaign?: Campaign; error?: string };
    if (!response.ok || !data.campaign) { setError(data.error ?? "Campaign could not be saved."); setBusy(false); return; }
    const video = form.get("video"); const poster = form.get("poster");
    for (const [kind, file] of [["video", video], ["poster", poster]] as const) if (file instanceof File && file.size) {
      const upload = new FormData(); upload.set("campaignId", data.campaign.id); upload.set("kind", kind); upload.set("file", file);
      const uploadResponse = await fetch("/api/admin/advertising/media", { method: "POST", body: upload });
      if (!uploadResponse.ok) { const uploadData = await uploadResponse.json() as { error?: string }; setError(uploadData.error ?? `${kind} upload failed.`); }
    }
    await refresh(); setMessage("Campaign saved."); setBusy(false); setEditor(null);
  }

  async function remove(campaign: Campaign) {
    if (!window.confirm(`Delete ${campaign.name}?`)) return;
    await fetch("/api/admin/advertising", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete", id: campaign.id }) });
    await refresh();
  }

  return <main className="admin-shell advertising-admin">
    <header className="admin-hero"><Link href="/" className="admin-brand" aria-label="Back to ChuneSide"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link><div><span><Megaphone /> Admin foundation</span><h1>FLOATING ADS</h1><p>Manage tasteful, muted-by-default sponsor video campaigns without touching music playback or rankings.</p><small className="admin-access-source">Access granted by {adminAccessSource === "allowlist" ? "owner email allowlist" : "database admin role"}.</small></div></header>
    <nav className="admin-toolbar admin-nav-actions" aria-label="Admin sections"><Button asChild variant="outline"><Link href="/admin/feature-flags">Feature Control</Link></Button><Button asChild variant="outline"><Link href="/admin/analytics">Analytics</Link></Button><Button asChild variant="outline"><Link href="/admin/announcements">News Bar</Link></Button><Button asChild variant="outline"><Link href="/admin/site-content">Site Content</Link></Button><Button onClick={() => setEditor("new")}><Plus /> Campaign</Button></nav>
    <section className="admin-summary" aria-label="Advertising totals"><div><strong>{campaigns.length}</strong><span>Campaigns</span></div><div><strong>{totals.impression ?? 0}</strong><span>Impressions</span></div><div><strong>{totals.complete ?? 0}</strong><span>Completes</span></div><div><strong>{totals.click ?? 0}</strong><span>Clicks</span></div></section>
    {message && <p className="admin-message" role="status">{message}</p>}{error && <p className="catalog-editor-error" role="alert">{error}</p>}
    <section className="ad-policy"><strong>Music wins</strong><p>Ads load lazily, start muted, fade in and out, and never pause, restart, seek, or change the music player. ChuneSide breaks, paid placements, and listening/ranking events remain separate.</p></section>
    <section className="advertising-list">{campaigns.map((campaign) => <article key={campaign.id} className="advertising-row"><span className={`ad-status ${campaign.status}`}>{campaign.status}</span><div><h2>{campaign.name}</h2><p>{campaign.sponsorName} · {campaign.position} · weight {campaign.rotationWeight}</p><small>{campaign.stats.impression ?? 0} impressions · {campaign.stats.complete ?? 0} completes · {campaign.stats.click ?? 0} clicks</small></div><Button variant="ghost" size="icon" onClick={() => setEditor(campaign)} aria-label={`Edit ${campaign.name}`}><Pencil /></Button><Button variant="ghost" size="icon" onClick={() => void remove(campaign)} aria-label={`Delete ${campaign.name}`}><Trash2 /></Button></article>)}{!campaigns.length && <div className="admin-empty"><Megaphone /><h2>No campaigns yet</h2><p>Create a draft, upload its video, then enable Advertising from Feature Control when you are ready.</p></div>}</section>
    <Dialog open={editor !== null} onOpenChange={(open) => !open && setEditor(null)}><DialogContent className="ad-editor"><DialogHeader><DialogTitle>{editor === "new" ? "New ad campaign" : "Edit ad campaign"}</DialogTitle><DialogDescription>Use a short, lightweight video and a poster image. Campaigns stay private until active and the global Advertising flag is on.</DialogDescription></DialogHeader><form onSubmit={save}><div className="ad-form-grid"><label>Name<Input name="name" defaultValue={editor && typeof editor === "object" ? editor.name : ""} required /></label><label>Sponsor<Input name="sponsorName" defaultValue={editor && typeof editor === "object" ? editor.sponsorName : ""} required /></label><label>Status<NativeSelect name="status" defaultValue={editor && typeof editor === "object" ? editor.status : "draft"}><NativeSelectOption value="draft">Draft</NativeSelectOption><NativeSelectOption value="active">Active</NativeSelectOption><NativeSelectOption value="paused">Paused</NativeSelectOption></NativeSelect></label><label>Position<NativeSelect name="position" defaultValue={editor && typeof editor === "object" ? editor.position : "corner"}><NativeSelectOption value="corner">Corner</NativeSelectOption><NativeSelectOption value="center">Center</NativeSelectOption></NativeSelect></label><label>Mobile<NativeSelect name="mobileMode" defaultValue={editor && typeof editor === "object" ? editor.mobileMode : "bottom"}><NativeSelectOption value="bottom">Bottom</NativeSelectOption><NativeSelectOption value="top">Top</NativeSelectOption><NativeSelectOption value="hidden">Hide on mobile</NativeSelectOption></NativeSelect></label><label>Rotation weight<Input name="rotationWeight" type="number" min="1" max="100" defaultValue={editor && typeof editor === "object" ? editor.rotationWeight : 1} /></label><label>Max width (px)<Input name="maxWidth" type="number" min="280" max="720" defaultValue={editor && typeof editor === "object" ? editor.maxWidth : 420} /></label><label>Frequency cap<Input name="frequencyCapCount" type="number" min="1" max="20" defaultValue={editor && typeof editor === "object" ? editor.frequencyCapCount : 1} /></label><label>Cap window (seconds)<Input name="frequencyCapWindowSeconds" type="number" min="300" defaultValue={editor && typeof editor === "object" ? editor.frequencyCapWindowSeconds : 86400} /></label><label>Session cap<Input name="sessionCapCount" type="number" min="1" max="5" defaultValue={editor && typeof editor === "object" ? editor.sessionCapCount : 1} /></label><label>Click URL<Input name="clickUrl" type="url" defaultValue={editor && typeof editor === "object" ? editor.clickUrl ?? "" : ""} placeholder="https://example.com" /></label><label>Starts<Input name="startAt" type="datetime-local" defaultValue={dateInput(editor && typeof editor === "object" ? editor.startAt : null)} /></label><label>Ends<Input name="endAt" type="datetime-local" defaultValue={dateInput(editor && typeof editor === "object" ? editor.endAt : null)} /></label><label className="ad-file">Video (.mp4/.webm)<Input name="video" type="file" accept="video/mp4,video/webm,video/quicktime" /></label><label className="ad-file">Poster image<Input name="poster" type="file" accept="image/jpeg,image/png,image/webp" /></label><label className="ad-check"><input name="dismissible" type="checkbox" defaultChecked={editor && typeof editor === "object" ? editor.dismissible : true} /> Allow close button</label></div><DialogFooter><Button type="button" variant="outline" onClick={() => setEditor(null)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : <><Save /> Save campaign</>}</Button></DialogFooter></form></DialogContent></Dialog>
  </main>;
}

function dateInput(value: string | null) { return value ? new Date(value).toISOString().slice(0, 16) : ""; }
