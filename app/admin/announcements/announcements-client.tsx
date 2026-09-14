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
  enabled: boolean;
  sortOrder: number;
  scrollSpeedSeconds: number;
  textSize: "small" | "medium" | "large";
  fontStyle: "standard" | "bold" | "wide";
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
    const response = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save",
        id: current?.id,
        message: form.get("message"),
        linkUrl: form.get("linkUrl"),
        category: form.get("category"),
        enabled: form.get("enabled") === "on",
        sortOrder: Number(form.get("sortOrder")),
        scrollSpeedSeconds: Number(form.get("scrollSpeedSeconds")),
        textSize: form.get("textSize"),
        fontStyle: form.get("fontStyle"),
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

    setAnnouncements((currentRows) => {
      const next = currentRows.some((row) => row.id === data.announcement?.id)
        ? currentRows.map((row) => row.id === data.announcement?.id ? data.announcement as Announcement : row)
        : [...currentRows, data.announcement as Announcement];
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
        <Button asChild variant="outline"><Link href="/admin/reviews">Review Queue</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/feature-flags">Feature Control</Link></Button>
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

      <AnnouncementEditor editor={editor} busy={busyId === "save"} error={error} onClose={() => setEditor(null)} onSubmit={save} />
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
  return (
    <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="catalog-editor-dialog">
        <DialogHeader>
          <DialogTitle>{announcement ? "Edit announcement" : "Create announcement"}</DialogTitle>
          <DialogDescription>Messages appear only when enabled, inside their active dates, and when the Community News Bar feature is available.</DialogDescription>
        </DialogHeader>
        {editor && (
          <form className="catalog-editor-form" onSubmit={onSubmit}>
            <Field label="Message" wide><Textarea name="message" required maxLength={240} defaultValue={announcement?.message ?? ""} /></Field>
            <Field label="Optional link"><Input name="linkUrl" type="url" defaultValue={announcement?.linkUrl ?? ""} /></Field>
            <Field label="Category"><Choice name="category" value={announcement?.category ?? "general"} options={["general", "community", "release", "competition", "stage", "maintenance", "artist"]} /></Field>
            <Field label="Order"><Input name="sortOrder" type="number" min={0} max={9999} required defaultValue={announcement?.sortOrder ?? 100} /></Field>
            <Field label="Scroll speed seconds"><Input name="scrollSpeedSeconds" type="number" min={10} max={120} required defaultValue={announcement?.scrollSpeedSeconds ?? 28} /></Field>
            <Field label="Text size"><Choice name="textSize" value={announcement?.textSize ?? "medium"} options={["small", "medium", "large"]} /></Field>
            <Field label="Font"><Choice name="fontStyle" value={announcement?.fontStyle ?? "bold"} options={["standard", "bold", "wide"]} /></Field>
            <Field label="Start date"><Input name="startAt" type="datetime-local" defaultValue={dateTimeLocal(announcement?.startAt)} /></Field>
            <Field label="End date"><Input name="endAt" type="datetime-local" defaultValue={dateTimeLocal(announcement?.endAt)} /></Field>
            <label className="catalog-check"><input name="enabled" type="checkbox" defaultChecked={announcement?.enabled ?? true} /><span>Enabled</span></label>
            {error && <p className="catalog-editor-error" role="alert">{error}</p>}
            <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="catalog-spinner" /> : <Save />} Save</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
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
