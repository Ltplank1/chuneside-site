"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LoaderCircle, Megaphone, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

type Announcement = {
  id: string;
  message: string;
  linkUrl: string | null;
  category: "community" | "release" | "competition" | "stage" | "maintenance" | "artist" | "general";
  showCategory: boolean;
  categoryPosition: "left" | "right";
  enabled: boolean;
  sortOrder: number;
  scrollSpeedSeconds: number;
  animationStyle: "scroll" | "slide_left" | "slide_right" | "drop_in" | "rise" | "fade" | "zoom" | "bounce" | "pulse" | "pop" | "typewriter" | "static";
  animationBehavior: "once" | "loop" | "delay";
  animationDurationSeconds: number;
  animationDelaySeconds: number;
  position: "top" | "below_header" | "above_content" | "bottom";
  textSize: "small" | "medium" | "large";
  fontStyle: "standard" | "bold" | "wide";
  textColor: string;
  backgroundColor: string;
  backgroundTransparent: boolean;
  barHeight: number;
  padding: number;
  fontFamily: "sans" | "display" | "mono";
  fontWeight: "normal" | "semibold" | "bold";
  backgroundImageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
};

type EditorState = Announcement | null | "new";

export function AnnouncementsClient({ adminAccessSource, initialAnnouncements }: {
  adminAccessSource: "allowlist" | "role";
  initialAnnouncements: Announcement[];
}) {
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [editor, setEditor] = useState<EditorState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyId("save");
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const current = typeof editor === "object" ? editor : null;
    const backgroundFile = form.get("backgroundImage");
    const response = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save",
        id: current?.id,
        message: form.get("message"),
        linkUrl: form.get("linkUrl"),
        category: form.get("category"),
        showCategory: form.get("showCategory") === "on",
        categoryPosition: form.get("categoryPosition"),
        enabled: form.get("enabled") === "on",
        sortOrder: Number(form.get("sortOrder")),
        scrollSpeedSeconds: Number(form.get("scrollSpeedSeconds")),
        animationStyle: form.get("animationStyle"),
        animationBehavior: form.get("animationBehavior"),
        animationDurationSeconds: Number(form.get("animationDurationSeconds")),
        animationDelaySeconds: Number(form.get("animationDelaySeconds")),
        position: form.get("position"),
        textSize: form.get("textSize"),
        fontStyle: form.get("fontStyle"),
        textColor: form.get("textColor"),
        backgroundColor: form.get("backgroundColor"),
        backgroundTransparent: form.get("backgroundTransparent") === "on",
        barHeight: Number(form.get("barHeight")),
        padding: Number(form.get("padding")),
        fontFamily: form.get("fontFamily"),
        fontWeight: form.get("fontWeight"),
        removeBackgroundImage: form.get("removeBackgroundImage") === "on",
        restoreDefaults: form.get("restoreDefaults") === "on",
        startAt: form.get("startAt"),
        endAt: form.get("endAt"),
      }),
    });
    const data = await response.json() as { announcement?: Announcement; error?: string };
    if (!response.ok || !data.announcement) {
      setError(data.error ?? "That announcement could not be saved.");
      setBusyId(null);
      return;
    }

    let savedAnnouncement = data.announcement as Announcement;
    if (backgroundFile instanceof File && backgroundFile.size) {
      const upload = new FormData();
      upload.set("id", savedAnnouncement.id);
      upload.set("file", backgroundFile);
      const uploadResponse = await fetch("/api/admin/announcements/background", { method: "POST", body: upload });
      const uploadData = await uploadResponse.json() as { backgroundImageUrl?: string; error?: string };
      if (!uploadResponse.ok || !uploadData.backgroundImageUrl) {
        setError(uploadData.error ?? "The announcement was saved, but its background image could not be uploaded.");
      } else savedAnnouncement = { ...savedAnnouncement, backgroundImageUrl: uploadData.backgroundImageUrl };
    }
    setAnnouncements((currentRows) => {
      const next = currentRows.some((row) => row.id === savedAnnouncement.id)
        ? currentRows.map((row) => row.id === savedAnnouncement.id ? savedAnnouncement : row)
        : [...currentRows, savedAnnouncement];
      return next.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
    });
    setMessage("Announcement saved.");
    setBusyId(null);
    setEditor(null);
  }

  async function remove(announcement: Announcement) {
    setBusyId(announcement.id);
    setError("");
    setMessage("");
    const response = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete", id: announcement.id }),
    });
    if (!response.ok) {
      setError("That announcement could not be deleted.");
      setBusyId(null);
      return;
    }
    setAnnouncements((current) => current.filter((row) => row.id !== announcement.id));
    setMessage("Announcement deleted.");
    setBusyId(null);
  }

  return (
    <main className="admin-shell">
      <header className="admin-hero">
        <Link href="/" className="admin-brand" aria-label="Back to ChuneSide">
          <Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized />
        </Link>
        <div>
          <span><Megaphone /> Admin foundation</span>
          <h1>Community News Bar</h1>
          <p>Create scrolling ChuneSide announcements for news, new releases, Stage premieres, competitions, Carnival updates, and maintenance notices.</p>
          <small className="admin-access-source">Access granted by {adminAccessSource === "allowlist" ? "owner email allowlist" : "database admin role"}.</small>
        </div>
      </header>

      <nav className="admin-toolbar admin-nav-actions" aria-label="Admin sections">
        <Button asChild variant="outline"><Link href="/admin/accounts">Accounts</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/catalog">Catalogue</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/analytics">Analytics</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/site-content">Site Content</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/reviews">Review Queue</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/feature-flags">Feature Control</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/advertising">Advertising</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/ai-controls">AI Controls</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/stage">Stage</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/audit">Audit Log</Link></Button>
        <Button onClick={() => setEditor("new")}><Plus /> Announcement</Button>
      </nav>

      <section className="admin-summary" aria-label="Announcement summary">
        <div><strong>{announcements.length}</strong><span>Total messages</span></div>
        <div><strong>{announcements.filter((row) => row.enabled).length}</strong><span>Enabled</span></div>
        <div><strong>{announcements.filter((row) => row.endAt && new Date(row.endAt) < new Date()).length}</strong><span>Expired</span></div>
      </section>

      {message && <p className="admin-message" role="status">{message}</p>}
      {error && <p className="catalog-editor-error announcement-error" role="alert">{error}</p>}

      <section className="announcement-admin-list">
        {announcements.map((announcement) => (
          <article key={announcement.id} className={!announcement.enabled ? "paused" : ""}>
            <span className="announcement-order">{announcement.sortOrder}</span>
            <div>
              <h2>{announcement.message}</h2>
              <p>{announcement.category} · {announcement.textSize} · {announcement.fontStyle} · {announcement.scrollSpeedSeconds}s</p>
              <small>{dateLabel(announcement.startAt, announcement.endAt)}{announcement.linkUrl ? ` · ${announcement.linkUrl}` : ""}</small>
            </div>
            <strong>{announcement.enabled ? "Enabled" : "Paused"}</strong>
            <Button variant="ghost" size="icon" onClick={() => setEditor(announcement)} aria-label="Edit announcement"><Pencil /></Button>
            <Button variant="ghost" size="icon" disabled={busyId === announcement.id} onClick={() => remove(announcement)} aria-label="Delete announcement">{busyId === announcement.id ? <LoaderCircle className="catalog-spinner" /> : <Trash2 />}</Button>
          </article>
        ))}
        {!announcements.length && <div className="admin-empty"><Megaphone /><h2>No announcements yet</h2><p>Add the first scrolling message, then enable the Community News Bar from Feature Control.</p></div>}
      </section>

      <AnnouncementEditor key={typeof editor === "object" ? editor?.id ?? "new" : String(editor)} editor={editor} busy={busyId === "save"} error={error} onClose={() => setEditor(null)} onSubmit={save} />
    </main>
  );
}

function AnnouncementEditor({ editor, busy, error, onClose, onSubmit }: {
  editor: EditorState;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const announcement = typeof editor === "object" ? editor : null;
  const [preview, setPreview] = useState<PreviewAnnouncement>(() => previewFrom(announcement));
  function syncPreview(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    setPreview({
      ...previewFrom(announcement),
      message: String(form.get("message") || "Preview announcement"),
      animationStyle: String(form.get("animationStyle") || "scroll") as PreviewAnnouncement["animationStyle"],
      animationBehavior: String(form.get("animationBehavior") || "loop") as PreviewAnnouncement["animationBehavior"],
      animationDurationSeconds: Number(form.get("animationDurationSeconds") || 28),
      animationDelaySeconds: Number(form.get("animationDelaySeconds") || 0),
      position: String(form.get("position") || "below_header") as PreviewAnnouncement["position"],
      textSize: String(form.get("textSize") || "medium") as PreviewAnnouncement["textSize"],
      fontFamily: String(form.get("fontFamily") || "sans") as PreviewAnnouncement["fontFamily"],
      fontWeight: String(form.get("fontWeight") || "bold") as PreviewAnnouncement["fontWeight"],
      textColor: String(form.get("textColor") || "#07080a"),
      backgroundColor: String(form.get("backgroundColor") || "#dfff00"),
      backgroundTransparent: form.get("backgroundTransparent") === "on",
      barHeight: Number(form.get("barHeight") || 42),
      padding: Number(form.get("padding") || 16),
    });
  }
  return (
    <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="catalog-editor-dialog">
        <DialogHeader>
          <DialogTitle>{announcement ? "Edit announcement" : "Create announcement"}</DialogTitle>
          <DialogDescription>Messages appear only when enabled, inside their active dates, and when the Community News Bar feature is available.</DialogDescription>
        </DialogHeader>
        {editor && (
          <form className="catalog-editor-form" onSubmit={onSubmit} onInput={syncPreview}>
            <Field label="Message" wide><Textarea name="message" required maxLength={240} defaultValue={announcement?.message ?? ""} /></Field>
            <Field label="Optional link"><Input name="linkUrl" type="url" defaultValue={announcement?.linkUrl ?? ""} /></Field>
            <Field label="Category"><Choice name="category" value={announcement?.category ?? "general"} options={["general", "community", "release", "competition", "stage", "maintenance", "artist"]} /></Field>
            <Field label="Category position"><Choice name="categoryPosition" value={announcement?.categoryPosition ?? "left"} options={["left", "right"]} /></Field>
            <Field label="Order"><Input name="sortOrder" type="number" min={0} max={9999} required defaultValue={announcement?.sortOrder ?? 100} /></Field>
            <Field label="Scroll speed seconds"><Input name="scrollSpeedSeconds" type="number" min={10} max={120} required defaultValue={announcement?.scrollSpeedSeconds ?? 28} /></Field>
            <Field label="Animation style"><Choice name="animationStyle" value={announcement?.animationStyle ?? "scroll"} options={["scroll", "slide_left", "slide_right", "drop_in", "rise", "fade", "zoom", "bounce", "pulse", "pop", "typewriter", "static"]} /></Field>
            <Field label="Animation behavior"><Choice name="animationBehavior" value={announcement?.animationBehavior ?? "loop"} options={["once", "loop", "delay"]} /></Field>
            <Field label="Animation duration seconds"><Input name="animationDurationSeconds" type="number" min={1} max={120} required defaultValue={announcement?.animationDurationSeconds ?? 28} /></Field>
            <Field label="Repeat delay seconds"><Input name="animationDelaySeconds" type="number" min={0} max={120} required defaultValue={announcement?.animationDelaySeconds ?? 0} /></Field>
            <Field label="Reel position"><Choice name="position" value={announcement?.position ?? "below_header"} options={["top", "below_header", "above_content", "bottom"]} /></Field>
            <Field label="Text size"><Choice name="textSize" value={announcement?.textSize ?? "medium"} options={["small", "medium", "large"]} /></Field>
            <Field label="Font"><Choice name="fontStyle" value={announcement?.fontStyle ?? "bold"} options={["standard", "bold", "wide"]} /></Field>
            <Field label="Font family"><Choice name="fontFamily" value={announcement?.fontFamily ?? "sans"} options={["sans", "display", "mono"]} /></Field>
            <Field label="Weight"><Choice name="fontWeight" value={announcement?.fontWeight ?? "bold"} options={["normal", "semibold", "bold"]} /></Field>
            <Field label="Text color"><Input name="textColor" type="color" defaultValue={announcement?.textColor ?? "#07080a"} /></Field>
            <Field label="Background color"><Input name="backgroundColor" type="color" defaultValue={announcement?.backgroundColor ?? "#dfff00"} /></Field>
            <Field label="Bar height"><Input name="barHeight" type="number" min={28} max={160} required defaultValue={announcement?.barHeight ?? 42} /></Field>
            <Field label="Padding"><Input name="padding" type="number" min={0} max={48} required defaultValue={announcement?.padding ?? 16} /></Field>
            <Field label="Custom background graphic" wide><Input name="backgroundImage" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /><small className="field-hint">PNG, JPG, GIF, or WebP up to 4 MB.</small></Field>
            <Field label="Start date"><Input name="startAt" type="datetime-local" defaultValue={dateTimeLocal(announcement?.startAt)} /></Field>
            <Field label="End date"><Input name="endAt" type="datetime-local" defaultValue={dateTimeLocal(announcement?.endAt)} /></Field>
            <label className="catalog-check"><input name="enabled" type="checkbox" defaultChecked={announcement?.enabled ?? true} /><span>Enabled</span></label>
            <label className="catalog-check"><input name="showCategory" type="checkbox" defaultChecked={announcement?.showCategory ?? false} /><span>Show category label in the reel</span></label>
            <label className="catalog-check"><input name="backgroundTransparent" type="checkbox" defaultChecked={announcement?.backgroundTransparent ?? false} /><span>Use transparent background color</span></label>
            <label className="catalog-check"><input name="removeBackgroundImage" type="checkbox" /><span>Remove existing background graphic</span></label>
            <label className="catalog-check"><input name="restoreDefaults" type="checkbox" /><span>Restore animation and design defaults</span></label>
            <AnnouncementPreview announcement={preview} />
            {error && <p className="catalog-editor-error" role="alert">{error}</p>}
            <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="catalog-spinner" /> : <Save />} Save</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

type PreviewAnnouncement = Pick<Announcement, "message" | "animationStyle" | "animationBehavior" | "animationDurationSeconds" | "animationDelaySeconds" | "position" | "textSize" | "fontFamily" | "fontWeight" | "textColor" | "backgroundColor" | "backgroundTransparent" | "barHeight" | "padding">;

function previewFrom(announcement: Announcement | null): PreviewAnnouncement {
  return {
    message: announcement?.message ?? "Preview announcement",
    animationStyle: announcement?.animationStyle ?? "scroll",
    animationBehavior: announcement?.animationBehavior ?? "loop",
    animationDurationSeconds: announcement?.animationDurationSeconds ?? 28,
    animationDelaySeconds: announcement?.animationDelaySeconds ?? 0,
    position: announcement?.position ?? "below_header",
    textSize: announcement?.textSize ?? "medium",
    fontFamily: announcement?.fontFamily ?? "sans",
    fontWeight: announcement?.fontWeight ?? "bold",
    textColor: announcement?.textColor ?? "#07080a",
    backgroundColor: announcement?.backgroundColor ?? "#dfff00",
    backgroundTransparent: announcement?.backgroundTransparent ?? false,
    barHeight: announcement?.barHeight ?? 42,
    padding: announcement?.padding ?? 16,
  };
}

function AnnouncementPreview({ announcement }: { announcement: PreviewAnnouncement }) {
  const className = `news-reel-admin-preview community-news-bar news-animation-${announcement.animationStyle} news-behavior-${announcement.animationBehavior} text-${announcement.textSize} family-${announcement.fontFamily}`;
  const style = { "--news-speed": `${announcement.animationDurationSeconds}s`, "--news-delay": `${announcement.animationDelaySeconds}s`, "--news-text-color": announcement.textColor, "--news-background": announcement.backgroundTransparent ? "transparent" : announcement.backgroundColor, "--news-height": `${announcement.barHeight}px`, "--news-padding": `${announcement.padding}px` } as React.CSSProperties;
  return <div className="news-reel-live-preview"><span className="visualizer-field-label">Live preview</span><div className={className} style={style}><div className="news-track"><p><Megaphone /><span>Preview</span><strong>{announcement.message || "Preview announcement"}</strong></p></div></div><small>Position: {titleCase(announcement.position)} · Changes are not public until saved.</small></div>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "catalog-field wide" : "catalog-field"}><span>{label}</span>{children}</label>;
}

function Choice({ name, value, options }: { name: string; value: string; options: string[] }) {
  return <NativeSelect name={name} defaultValue={value} required>{options.map((option) => <NativeSelectOption key={option} value={option}>{titleCase(option)}</NativeSelectOption>)}</NativeSelect>;
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateTimeLocal(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 16);
}

function dateLabel(startAt: string | null, endAt: string | null) {
  if (!startAt && !endAt) return "Always active";
  if (startAt && endAt) return `${new Date(startAt).toLocaleDateString()} to ${new Date(endAt).toLocaleDateString()}`;
  if (startAt) return `Starts ${new Date(startAt).toLocaleDateString()}`;
  return `Ends ${new Date(endAt as string).toLocaleDateString()}`;
}
