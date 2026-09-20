"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Database, Disc3, LoaderCircle, Music2, Pencil, Plus, RotateCcw, Search, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { CatalogEditor, type EditorState } from "./catalog-editor";
import type { AdminArtist, AdminRelease, CatalogSaveResponse, OwnerAccount } from "./catalog-types";

type CatalogResponse = { message?: string; artists: AdminArtist[]; releases: AdminRelease[] };

export function CatalogClient({ adminAccessSource, initialArtists, initialReleases, ownerAccounts }: {
  adminAccessSource: "allowlist" | "role";
  initialArtists: AdminArtist[];
  initialReleases: AdminRelease[];
  ownerAccounts: OwnerAccount[];
}) {
  const [artists, setArtists] = useState(initialArtists);
  const [releases, setReleases] = useState(initialReleases);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState<EditorState>(null);
  const [takedownTarget, setTakedownTarget] = useState<AdminRelease | null>(null);
  const [takedownNote, setTakedownNote] = useState("");
  const [reinstateTarget, setReinstateTarget] = useState<AdminRelease | null>(null);
  const [reinstateNote, setReinstateNote] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  async function seedCatalogue() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/catalog-seed", { method: "POST" });

    if (!response.ok) {
      setMessage("The baseline catalogue could not be prepared.");
      setBusy(false);
      return;
    }

    const data = await response.json() as CatalogResponse;
    setArtists(data.artists);
    setReleases(data.releases);
    setMessage(data.message ?? "Catalogue updated.");
    setBusy(false);
  }

  function recordSaved(result: CatalogSaveResponse) {
    if (result.entity === "artist") {
      setArtists((current) => {
        const next = current.some((artist) => artist.id === result.item.id)
          ? current.map((artist) => artist.id === result.item.id ? result.item : artist)
          : [...current, result.item];
        return next.sort((a, b) => a.stageName.localeCompare(b.stageName));
      });
      setMessage("Artist profile saved.");
    } else {
      setReleases((current) => {
        const next = current.some((release) => release.id === result.item.id)
          ? current.map((release) => release.id === result.item.id ? result.item : release)
          : [...current, result.item];
        return next.sort((a, b) => (a.legacyTrackId ?? 999999) - (b.legacyTrackId ?? 999999));
      });
      setMessage("Release saved.");
    }
  }

  async function takedownRelease() {
    if (!takedownTarget || !takedownNote.trim()) return;
    const release = takedownTarget;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ releaseId: release.id, decision: "takedown", reviewNote: takedownNote }) });
    const data = await response.json() as { release?: AdminRelease; error?: string };
    if (!response.ok || !data.release) {
      setMessage(data.error ?? "The release could not be taken down.");
      setBusy(false);
      return;
    }
    setReleases((current) => current.map((item) => item.id === release.id ? data.release as AdminRelease : item));
    setMessage(`${release.title} was taken down and its public media access was removed.`);
    setBusy(false);
    setTakedownTarget(null);
    setTakedownNote("");
  }

  async function reinstateRelease() {
    if (!reinstateTarget || !reinstateNote.trim()) return;
    const release = reinstateTarget;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ releaseId: release.id, decision: "reinstate", reviewNote: reinstateNote }) });
    const data = await response.json() as { release?: AdminRelease; error?: string };
    if (!response.ok || !data.release) {
      setMessage(data.error ?? "The release could not be returned to review.");
      setBusy(false);
      return;
    }
    setReleases((current) => current.map((item) => item.id === release.id ? data.release as AdminRelease : item));
    setMessage(`${release.title} was returned to private review. Fresh media must be attached before approval.`);
    setBusy(false);
    setReinstateTarget(null);
    setReinstateNote("");
  }

  const artistNames = useMemo(() => new Map(artists.map((artist) => [artist.id, artist.stageName])), [artists]);
  const filteredArtists = useMemo(() => {
    const query = search.trim().toLowerCase();
    return artists.filter((artist) => !query || [artist.stageName, artist.primaryGenre, artist.countryRegion].join(" ").toLowerCase().includes(query));
  }, [artists, search]);
  const filteredReleases = useMemo(() => {
    const query = search.trim().toLowerCase();
    return releases.filter((release) => {
      const artist = artistNames.get(release.artistProfileId) ?? "";
      return (!query || [release.title, artist, release.genre, release.region, release.discoveryLane].join(" ").toLowerCase().includes(query)) && (statusFilter === "all" || release.approvalStatus === statusFilter);
    });
  }, [artistNames, releases, search, statusFilter]);

  return (
    <main className="admin-shell">
      <header className="admin-hero">
        <Link href="/" className="admin-brand" aria-label="Back to ChuneSide">
          <Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority />
        </Link>
        <div>
          <span><Database /> Admin foundation</span>
          <h1>Catalogue</h1>
          <p>Review the database foundation for artist profiles and releases before ChuneSide begins accepting account-managed submissions.</p>
          <small className="admin-access-source">Access granted by {adminAccessSource === "allowlist" ? "owner email allowlist" : "database admin role"}.</small>
        </div>
      </header>

      <section className="admin-toolbar catalog-toolbar">
        <div className="admin-nav-actions">
          <Button asChild variant="outline"><Link href="/admin/accounts">Accounts</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/reviews">Review Queue</Link></Button><Button asChild variant="outline"><Link href="/admin/analytics">Analytics</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/feature-flags">Feature Control</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/announcements">News Bar</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/ai-controls">AI Controls</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/stage">Stage</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/audit">Audit Log</Link></Button>
        </div>
        <div className="catalog-create-actions">
          <Button variant="outline" onClick={() => setEditor({ kind: "artist", item: null })}><Plus /> Artist</Button>
          <Button variant="outline" onClick={() => setEditor({ kind: "release", item: null })} disabled={!artists.length}><Plus /> Release</Button>
          <Button onClick={seedCatalogue} disabled={busy}>
            {busy ? <LoaderCircle className="catalog-spinner" /> : <Database />}
            {artists.length || releases.length ? "Check baseline" : "Seed baseline"}
          </Button>
        </div>
      </section>

      <section className="admin-summary" aria-label="Catalogue summary">
        <div><strong>{artists.length}</strong><span>Artist profiles</span></div>
        <div><strong>{releases.length}</strong><span>Releases</span></div>
        <div><strong>{releases.filter((release) => release.approvalStatus === "approved").length}</strong><span>Approved records</span></div>
      </section>

      {message && <p className="admin-message" role="status">{message}</p>}

      <section className="catalog-filters" aria-label="Filter catalogue records"><label><Search /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search artists, releases, genres or regions" aria-label="Search catalogue" /></label><NativeSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter releases by approval status"><NativeSelectOption value="all">All release statuses</NativeSelectOption>{["draft", "pending", "approved", "rejected", "disabled"].map((status) => <NativeSelectOption key={status} value={status}>{label(status)}</NativeSelectOption>)}</NativeSelect>{(search || statusFilter !== "all") && <Button type="button" variant="outline" onClick={() => { setSearch(""); setStatusFilter("all"); }}>Clear</Button>}</section>

      <section className="catalog-section">
        <div className="catalog-section-heading"><Music2 /><div><h2>Artists</h2><p>Profiles are independent records that can later be claimed by an approved member account.</p></div></div>
        <div className="catalog-artist-grid">
          {filteredArtists.map((artist) => (
            <article className="catalog-artist" key={artist.id}>
              <b>{artist.stageName.slice(0, 2).toUpperCase()}</b>
              <div><h3>{artist.stageName} {artist.verificationStatus === "verified" && <BadgeCheck aria-label="Verified artist" />}</h3><p>{artist.primaryGenre} · {artist.countryRegion}</p><small>{artist.visibility}{artist.foundingArtist ? " · Founding Artist" : ""}</small></div>
              <Button className="catalog-edit-button" variant="ghost" size="icon" onClick={() => setEditor({ kind: "artist", item: artist })} aria-label={"Edit " + artist.stageName}><Pencil /></Button>
            </article>
          ))}
          {!filteredArtists.length && <div className="catalog-empty"><Music2 /><p>{artists.length ? "No matching artist profiles." : "No artist profiles have been seeded yet."}</p></div>}
        </div>
      </section>

      <section className="catalog-section">
        <div className="catalog-section-heading"><Disc3 /><div><h2>Releases</h2><p>Approval, explicit-content, AI disclosure, and download readiness are stored separately for every release.</p></div></div>
        <div className="catalog-release-list">
          {filteredReleases.map((release) => (
            <article className="catalog-release" key={release.id}>
              <span className="catalog-track-number">{release.legacyTrackId ? String(release.legacyTrackId).padStart(2, "0") : "--"}</span>
              <div><h3>{release.title}</h3><p>{artistNames.get(release.artistProfileId) ?? "Unknown artist"} · {release.genre}</p></div>
              <span>{release.discoveryLane}</span>
              <span>{release.creationType === "ai_assisted" ? "AI-assisted" : "Artist-made"}</span>
              <span className={`catalog-status ${release.approvalStatus}`}>{release.approvalStatus}</span>
              <Button variant="ghost" size="icon" onClick={() => setEditor({ kind: "release", item: release })} aria-label={"Edit " + release.title}><Pencil /></Button>
              {release.approvalStatus === "approved" && <Button variant="ghost" size="icon" disabled={busy} onClick={() => { setTakedownTarget(release); setTakedownNote(""); }} aria-label={"Take down " + release.title}><ShieldAlert /></Button>}
              {release.approvalStatus === "disabled" && <Button variant="ghost" size="icon" disabled={busy} onClick={() => { setReinstateTarget(release); setReinstateNote(""); }} aria-label={"Return " + release.title + " to review"}><RotateCcw /></Button>}
            </article>
          ))}
          {!filteredReleases.length && <div className="catalog-empty"><Disc3 /><p>{releases.length ? "No matching releases." : "No releases have been seeded yet."}</p></div>}
        </div>
      </section>

      <footer className="admin-footer">
        <Button asChild variant="outline"><Link href="/">Back to ChuneSide</Link></Button>
        <span><Database /> Seeding is repeatable and recorded in the admin audit log.</span>
      </footer>
      <CatalogEditor editor={editor} artists={artists} ownerAccounts={ownerAccounts} onClose={() => setEditor(null)} onSaved={recordSaved} />
      <Dialog open={Boolean(takedownTarget)} onOpenChange={(open) => { if (!open && !busy) { setTakedownTarget(null); setTakedownNote(""); } }}>
        <DialogContent className="catalog-editor-dialog">
          <DialogHeader><DialogTitle>Take down release</DialogTitle><DialogDescription>{takedownTarget ? `Remove "${takedownTarget.title}" from public discovery and revoke its media access.` : "Remove this release from public discovery."}</DialogDescription></DialogHeader>
          <label className="catalog-field wide"><span>Reason</span><Textarea value={takedownNote} onChange={(event) => setTakedownNote(event.target.value)} maxLength={1000} placeholder="Required for the audit record" /></label>
          <DialogFooter><Button type="button" variant="outline" onClick={() => { setTakedownTarget(null); setTakedownNote(""); }}>Cancel</Button><Button type="button" disabled={busy || !takedownNote.trim()} onClick={takedownRelease}>{busy ? <LoaderCircle className="catalog-spinner" /> : <ShieldAlert />} Take down release</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(reinstateTarget)} onOpenChange={(open) => { if (!open && !busy) { setReinstateTarget(null); setReinstateNote(""); } }}>
        <DialogContent className="catalog-editor-dialog">
          <DialogHeader><DialogTitle>Return release to review</DialogTitle><DialogDescription>{reinstateTarget ? `Return "${reinstateTarget.title}" to the private review queue. It will remain unavailable to listeners until a new human approval.` : "Return this release to private review."}</DialogDescription></DialogHeader>
          <label className="catalog-field wide"><span>Reinstatement note</span><Textarea value={reinstateNote} onChange={(event) => setReinstateNote(event.target.value)} maxLength={1000} placeholder="Required for the audit record" /></label>
          <DialogFooter><Button type="button" variant="outline" onClick={() => { setReinstateTarget(null); setReinstateNote(""); }}>Cancel</Button><Button type="button" disabled={busy || !reinstateNote.trim()} onClick={reinstateRelease}>{busy ? <LoaderCircle className="catalog-spinner" /> : <RotateCcw />} Return to review</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
