"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, FileText, LoaderCircle, RotateCcw, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { contentAlignments, contentFontFamilies, contentSizes, contentWeights, publicContentStyle, type SiteContentStyle } from "@/lib/site-content-shared";

type Item = { key: string; section: string; label: string; description: string; defaultValue: string; draftValue: string; publishedValue: string; draftStyle: SiteContentStyle; publishedStyle: SiteContentStyle; status: "draft" | "published"; updatedAt: string; publishedAt: string | null };

export function SiteContentClient({ adminAccessSource }: { adminAccessSource: "allowlist" | "role" }) {
  const [items, setItems] = useState<Item[]>([]);
  const [section, setSection] = useState("all");
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { fetch("/api/admin/site-content").then((response) => response.json()).then((data) => setItems(data.items ?? [])).catch(() => setError("Site content could not be loaded.")); }, []);
  const visible = useMemo(() => items.filter((item) => section === "all" || item.section === section), [items, section]);
  const sections = [...new Set(items.map((item) => item.section))];

  async function update(item: Item, action: "save" | "publish" | "restore") {
    setBusyKey(`${item.key}:${action}`); setError(""); setMessage("");
    const response = await fetch("/api/admin/site-content", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, key: item.key, value: item.draftValue, style: item.draftStyle }) });
    const data = await response.json() as { item?: Item; error?: string };
    if (!response.ok || !data.item) { setError(data.error ?? "That content could not be saved."); setBusyKey(""); return; }
    setItems((current) => current.map((row) => row.key === item.key ? data.item as Item : row));
    setMessage(action === "publish" ? `${item.label} published.` : action === "restore" ? `${item.label} restored to its default draft.` : `${item.label} saved as a draft.`);
    setBusyKey("");
  }

  return <main className="admin-shell site-content-admin"><header className="admin-hero"><Link href="/" className="admin-brand" aria-label="Back to ChuneSide"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link><div><span><FileText /> Admin foundation</span><h1>Site Content</h1><p>Edit approved public-facing copy with a draft preview, safe typography choices, and explicit publishing.</p><small className="admin-access-source">Access granted by {adminAccessSource === "allowlist" ? "owner email allowlist" : "database admin role"}.</small></div></header>
    <nav className="admin-toolbar admin-nav-actions" aria-label="Admin sections"><Button asChild variant="outline"><Link href="/admin/accounts">Accounts</Link></Button><Button asChild variant="outline"><Link href="/admin/catalog">Catalogue</Link></Button><Button asChild variant="outline"><Link href="/admin/reviews">Review Queue</Link></Button><Button asChild variant="outline"><Link href="/admin/analytics">Analytics</Link></Button><Button asChild variant="outline"><Link href="/admin/announcements">News Bar</Link></Button><Button asChild variant="outline"><Link href="/admin/site-content">Site Content</Link></Button><Button asChild variant="outline"><Link href="/admin/stage">Stage</Link></Button></nav>
    <section className="site-content-toolbar"><label>Page or section <NativeSelect value={section} onChange={(event) => setSection(event.target.value)}><NativeSelectOption value="all">All sections</NativeSelectOption>{sections.map((value) => <NativeSelectOption key={value} value={value}>{titleCase(value)}</NativeSelectOption>)}</NativeSelect></label><p><Eye /> Drafts stay private until published. News Bar messages remain managed separately.</p></section>
    {message && <p className="admin-message" role="status">{message}</p>}{error && <p className="catalog-editor-error announcement-error" role="alert">{error}</p>}
    <section className="site-content-list">{visible.map((item) => <ContentEditor key={item.key} item={item} busyKey={busyKey} onChange={(next) => setItems((current) => current.map((row) => row.key === item.key ? next : row))} onUpdate={update} />)}{!visible.length && <div className="admin-empty"><FileText /><h2>Loading site content</h2><p>Approved public copy fields will appear here.</p></div>}</section>
  </main>;
}

function ContentEditor({ item, busyKey, onChange, onUpdate }: { item: Item; busyKey: string; onChange: (item: Item) => void; onUpdate: (item: Item, action: "save" | "publish" | "restore") => void }) {
  const setStyle = (key: keyof SiteContentStyle, value: string) => onChange({ ...item, draftStyle: { ...item.draftStyle, [key]: value } as SiteContentStyle });
  return <article className="site-content-card"><header><div><span className="site-content-section">{titleCase(item.section)}</span><h2>{item.label}</h2><p>{item.description}</p></div><span className={`site-content-status ${item.status}`}>{item.status}</span></header><div className="site-content-editor"><label><span>Draft copy</span><Textarea value={item.draftValue} onChange={(event) => onChange({ ...item, draftValue: event.target.value })} maxLength={600} /></label><div className="site-content-controls"><label><span>Font</span><NativeSelect value={item.draftStyle.fontFamily} onChange={(event) => setStyle("fontFamily", event.target.value)}>{contentFontFamilies.map((value) => <NativeSelectOption key={value} value={value}>{titleCase(value)}</NativeSelectOption>)}</NativeSelect></label><label><span>Size</span><NativeSelect value={item.draftStyle.size} onChange={(event) => setStyle("size", event.target.value)}>{contentSizes.map((value) => <NativeSelectOption key={value} value={value}>{titleCase(value)}</NativeSelectOption>)}</NativeSelect></label><label><span>Weight</span><NativeSelect value={item.draftStyle.weight} onChange={(event) => setStyle("weight", event.target.value)}>{contentWeights.map((value) => <NativeSelectOption key={value} value={value}>{titleCase(value)}</NativeSelectOption>)}</NativeSelect></label><label><span>Align</span><NativeSelect value={item.draftStyle.align} onChange={(event) => setStyle("align", event.target.value)}>{contentAlignments.map((value) => <NativeSelectOption key={value} value={value}>{titleCase(value)}</NativeSelectOption>)}</NativeSelect></label></div><div className="site-content-preview"><span><Eye /> Preview</span><p style={publicContentStyle(item.draftStyle)}>{item.draftValue}</p></div></div><footer><small>Published copy: {item.publishedValue}</small><div><Button type="button" variant="outline" onClick={() => onUpdate(item, "restore")} disabled={Boolean(busyKey)}><RotateCcw /> Restore default</Button><Button type="button" variant="outline" onClick={() => onUpdate(item, "save")} disabled={Boolean(busyKey)}>{busyKey === `${item.key}:save` ? <LoaderCircle className="catalog-spinner" /> : <Save />} Save draft</Button><Button type="button" onClick={() => onUpdate(item, "publish")} disabled={Boolean(busyKey)}>{busyKey === `${item.key}:publish` ? <LoaderCircle className="catalog-spinner" /> : <Upload />} Publish</Button></div></footer></article>;
}

function titleCase(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
