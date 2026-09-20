"use client";

import { FormEvent, type ReactNode, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Archive, ArrowDown, ArrowUp, ChevronDown, LoaderCircle, Pencil, PlaySquare, Plus, Save, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { countryOptions, genrePresets } from "@/lib/submission-options";
import { formatStageSlug, normalizeStageSlug } from "@/lib/stage-policy";

type StageStatus = "draft" | "submitted" | "pending_review" | "approved" | "scheduled" | "published" | "featured" | "rejected" | "archived";
type StagePlacement = "none" | "featured" | "latest" | "trending" | "most_watched" | "wadadli" | "caribbean";
type StageFeeStatus = "not_required" | "free_promotion" | "discounted" | "waived" | "pending" | "paid";
type StagePerformance = {
  id: string;
  artistProfileId: string;
  performanceType: "artist" | "dj";
  slug: string;
  title: string;
  description: string;
  youtubeVideoId: string | null;
  youtubeUrl: string | null;
  thumbnailUrl: string | null;
  durationMinutes: number | null;
  songsPerformedJson: string;
  genre: string;
  region: string;
  performanceDate: string | null;
  status: StageStatus;
  artistConsent: boolean;
  rightsDeclaration: boolean;
  originalSubmissionInfo: string | null;
  homePlacement: StagePlacement;
  featureStartAt: string | null;
  featureEndAt: string | null;
  stageFeeLabel: string | null;
  feeStatus: StageFeeStatus;
  viewCount: number;
  favoriteCount: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  tracklist: TracklistEntry[];
};
type ArtistOption = { id: string; stageName: string };
type ReleaseOption = { id: string; title: string; artistProfileId: string };
type TracklistEntry = { id?: string; title: string; externalArtistName: string | null; artistProfileId: string | null; releaseId: string | null; externalInfo: string | null };
type EditorState = StagePerformance | "new" | null;

export function StageClient({ adminAccessSource, storageReady, artists, releases, initialPerformances }: {
  adminAccessSource: "allowlist" | "role";
  storageReady: boolean;
  artists: ArtistOption[];
  releases: ReleaseOption[];
  initialPerformances: StagePerformance[];
}) {
  const [performances, setPerformances] = useState(initialPerformances);
  const [editor, setEditor] = useState<EditorState>(null);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState(storageReady ? "" : "ChuneSide Stage storage is not ready. Apply migration 0008 before saving performances.");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [placementFilter, setPlacementFilter] = useState("all");
  const [sortMode, setSortMode] = useState("updated");
  const artistNames = useMemo(() => new Map(artists.map((artist) => [artist.id, artist.stageName])), [artists]);
  const totalViews = useMemo(() => performances.reduce((sum, performance) => sum + performance.viewCount, 0), [performances]);
  const publicPerformances = performances.filter((performance) => ["published", "featured"].includes(performance.status));
  const topRegion = [...new Set(publicPerformances.map((performance) => performance.region))].map((region) => ({ region, count: publicPerformances.filter((performance) => performance.region === region).length })).sort((a, b) => b.count - a.count || a.region.localeCompare(b.region))[0];
  const placementCounts = ["featured", "latest", "trending", "most_watched", "wadadli", "caribbean"].map((placement) => ({ placement, count: performances.filter((performance) => performance.homePlacement === placement).length })).filter((item) => item.count > 0);
  const topViewed = useMemo(() => [...publicPerformances].sort((a, b) => b.viewCount - a.viewCount || b.favoriteCount - a.favoriteCount).slice(0, 5), [publicPerformances]);
  const topViewCount = topViewed[0]?.viewCount ?? 0;
  const visiblePerformances = useMemo(() => {
    const q = search.trim().toLowerCase();
    return performances
      .filter((performance) => {
        const statusMatch = statusFilter === "all" || performance.status === statusFilter;
        const placementMatch = placementFilter === "all" || placementState(performance) === placementFilter;
        const artist = artistNames.get(performance.artistProfileId) ?? "";
        const text = [
          performance.title,
          performance.slug,
          artist,
          performance.genre,
          performance.region,
          performance.description,
          songsText(performance.songsPerformedJson),
        ].join(" ").toLowerCase();
        return statusMatch && placementMatch && (!q || text.includes(q));
      })
      .sort((a, b) => {
        if (sortMode === "views") return b.viewCount - a.viewCount || b.updatedAt.localeCompare(a.updatedAt);
        if (sortMode === "performance") return (b.performanceDate ?? "").localeCompare(a.performanceDate ?? "") || b.updatedAt.localeCompare(a.updatedAt);
        if (sortMode === "placement") return placementSort(a) - placementSort(b) || b.updatedAt.localeCompare(a.updatedAt);
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [artistNames, performances, placementFilter, search, sortMode, statusFilter]);

  async function save(event: FormEvent<HTMLFormElement>, tracklist: TracklistEntry[]) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const current = typeof editor === "object" ? editor : null;
    setBusyId("save");
    setError("");
    setMessage("");
    const response = await fetch("/api/admin/stage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save",
        id: current?.id,
        artistProfileId: form.get("artistProfileId"),
        performanceType: form.get("performanceType"),
        slug: form.get("slug"),
        title: form.get("title"),
        description: form.get("description"),
        youtubeUrl: form.get("youtubeUrl"),
        thumbnailUrl: form.get("thumbnailUrl"),
        durationMinutes: form.get("durationMinutes") ? Number(form.get("durationMinutes")) : null,
        songsPerformed: form.get("songsPerformed"),
        genre: form.get("genre") === "__other__" ? form.get("genreOther") : form.get("genre"),
        region: form.get("region"),
        performanceDate: form.get("performanceDate"),
        status: form.get("status"),
        artistConsent: form.get("artistConsent") === "on",
        rightsDeclaration: form.get("rightsDeclaration") === "on",
        originalSubmissionInfo: form.get("originalSubmissionInfo"),
        homePlacement: form.get("homePlacement"),
        featureStartAt: form.get("featureStartAt"),
        featureEndAt: form.get("featureEndAt"),
        stageFeeLabel: form.get("stageFeeLabel"),
        feeStatus: form.get("feeStatus"),
        reviewNote: form.get("reviewNote"),
        tracklist,
      }),
    });
    const data = await response.json() as { performance?: StagePerformance; error?: string };
    if (!response.ok || !data.performance) {
      setError(data.error ?? "That Stage performance could not be saved.");
      setBusyId("");
      return;
    }
    const savedPerformance = { ...data.performance, tracklist } as StagePerformance;
    setPerformances((currentRows) => {
      const next = currentRows.some((item) => item.id === savedPerformance.id)
        ? currentRows.map((item) => item.id === savedPerformance.id ? savedPerformance : item)
        : [...currentRows, savedPerformance];
      return next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
    setMessage("ChuneSide Stage performance saved.");
    setBusyId("");
    setEditor(null);
  }

  async function archive(performance: StagePerformance) {
    setBusyId(performance.id);
    setError("");
    setMessage("");
    const response = await fetch("/api/admin/stage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "archive", id: performance.id }),
    });
    const data = await response.json() as { performance?: StagePerformance; error?: string };
    if (!response.ok || !data.performance) {
      setError(data.error ?? "That performance could not be archived.");
      setBusyId("");
      return;
    }
    setPerformances((current) => current.map((item) => item.id === performance.id ? data.performance as StagePerformance : item));
    setMessage("Performance archived.");
    setBusyId("");
  }

  return (
    <main className="admin-shell stage-admin-shell">
      <header className="admin-hero">
        <Link href="/" className="admin-brand" aria-label="Back to ChuneSide"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link>
        <div><span><PlaySquare /> ChuneSide Stage</span><h1>Stage Management</h1><p>Manage short professional performance features, YouTube embeds, artist consent, placements, and review state.</p><small className="admin-access-source">Access granted by {adminAccessSource === "allowlist" ? "owner email allowlist" : "database admin role"}.</small></div>
      </header>

      <nav className="admin-toolbar admin-nav-actions" aria-label="Admin sections">
        <Button asChild variant="outline"><Link href="/admin/accounts">Accounts</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/catalog">Catalogue</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/analytics">Analytics</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/reviews">Review Queue</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/announcements">News Bar</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/ai-controls">AI Controls</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/feature-flags">Feature Control</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/audit">Audit Log</Link></Button>
        <Button onClick={() => setEditor("new")} disabled={!storageReady || !artists.length}><Plus /> Performance</Button>
      </nav>

      <section className="admin-summary" aria-label="Stage summary">
        <div><strong>{performances.length}</strong><span>Total performances</span></div>
        <div><strong>{performances.filter((item) => ["published", "featured"].includes(item.status)).length}</strong><span>Live/public-ready</span></div>
        <div><strong>{performances.filter((item) => item.artistConsent).length}</strong><span>Consent confirmed</span></div>
        <div><strong>{performances.filter(isActiveHomePlacement).length}</strong><span>Active homepage placements</span></div>
        <div><strong>{totalViews.toLocaleString()}</strong><span>Total Stage views</span></div>
      </section>

      <section className="stage-admin-analytics" aria-label="Stage analytics">
        <div><span>Top public region</span><strong>{topRegion?.region ?? "No public data"}</strong><small>{topRegion ? `${topRegion.count} ${topRegion.count === 1 ? "performance" : "performances"}` : "Publish a performance to see regional reach."}</small></div>
        <div><span>Public share</span><strong>{performances.length ? `${Math.round((publicPerformances.length / performances.length) * 100)}%` : "0%"}</strong><small>{publicPerformances.length} of {performances.length} performances live or ready</small></div>
        <div><span>Placement mix</span><strong>{placementCounts.length}</strong><small>{placementCounts.length ? placementCounts.map((item) => `${label(item.placement)} ${item.count}`).join(" · ") : "No home placements configured"}</small></div>
      </section>

      <section className="stage-analytics-board" aria-label="Top public Stage performances">
        <div className="stage-analytics-board-heading"><div><span className="kicker"><PlaySquare /> Public performance reach</span><h2>What is moving the audience.</h2></div><small>Ranked by recorded Stage views</small></div>
        {topViewed.length ? <div className="stage-analytics-list">{topViewed.map((performance, index) => {
          const favoriteRate = performance.viewCount ? Math.round((performance.favoriteCount / performance.viewCount) * 100) : 0;
          return <article key={performance.id}><strong>{String(index + 1).padStart(2, "0")}</strong><div><h3>{performance.title}</h3><p>{artistNames.get(performance.artistProfileId) ?? "Unknown artist"} · {performance.region}</p><div className="stage-analytics-bar"><span style={{ width: `${topViewCount ? Math.max(4, performance.viewCount / topViewCount * 100) : 0}%` }} /></div></div><span>{performance.viewCount.toLocaleString()} views<br /><small>{favoriteRate}% favorite rate</small></span></article>;
        })}</div> : <div className="stage-analytics-empty"><PlaySquare /><p>Publish a consented performance to start tracking public reach.</p></div>}
      </section>

      {message && <p className="admin-message" role="status">{message}</p>}
      {error && <p className="catalog-editor-error announcement-error" role="alert">{error}</p>}

      <section className="stage-admin-filters" aria-label="Filter Stage performances">
        <label><Search /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, artist, region or song" aria-label="Search Stage performances" /></label>
        <NativeSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by Stage status">
          <NativeSelectOption value="all">All statuses</NativeSelectOption>
          {["draft", "submitted", "pending_review", "approved", "scheduled", "published", "featured", "rejected", "archived"].map((status) => <NativeSelectOption key={status} value={status}>{label(status)}</NativeSelectOption>)}
        </NativeSelect>
        <NativeSelect value={placementFilter} onChange={(event) => setPlacementFilter(event.target.value)} aria-label="Filter by home placement state">
          <NativeSelectOption value="all">All placements</NativeSelectOption>
          <NativeSelectOption value="active">Active home</NativeSelectOption>
          <NativeSelectOption value="scheduled">Scheduled home</NativeSelectOption>
          <NativeSelectOption value="expired">Expired home</NativeSelectOption>
          <NativeSelectOption value="none">No home placement</NativeSelectOption>
        </NativeSelect>
        <NativeSelect value={sortMode} onChange={(event) => setSortMode(event.target.value)} aria-label="Sort Stage performances">
          <NativeSelectOption value="updated">Recently updated</NativeSelectOption>
          <NativeSelectOption value="views">Most viewed</NativeSelectOption>
          <NativeSelectOption value="performance">Performance date</NativeSelectOption>
          <NativeSelectOption value="placement">Placement priority</NativeSelectOption>
        </NativeSelect>
        {(search || statusFilter !== "all" || placementFilter !== "all" || sortMode !== "updated") && <Button type="button" variant="outline" onClick={() => { setSearch(""); setStatusFilter("all"); setPlacementFilter("all"); setSortMode("updated"); }}>Clear</Button>}
      </section>

      <section className="stage-admin-list">
        {visiblePerformances.map((performance) => (
          <article key={performance.id}>
            <div className="stage-thumb">{performance.thumbnailUrl ? <Image src={performance.thumbnailUrl} alt="" fill sizes="88px" unoptimized /> : <PlaySquare />}</div>
            <div><h2>{performance.title}</h2><p>{performance.performanceType === "dj" ? "DJ Performance" : "Artist Performance"} · {artistNames.get(performance.artistProfileId) ?? "Unknown profile"} · {performance.genre} · {performance.region}</p><small>{performance.performanceType === "dj" ? `${performance.tracklist.length} linked tracks` : songsLabel(performance.songsPerformedJson)} · {performance.durationMinutes ?? "--"} min · {performance.youtubeVideoId ? "YouTube ready" : "No video"}</small><span className={"stage-placement " + placementState(performance)}>{placementLabel(performance)}</span><span className="stage-metrics">{performance.viewCount.toLocaleString()} views · {performance.favoriteCount.toLocaleString()} favorites</span></div>
            <strong className={"stage-status " + performance.status}>{label(performance.status)}</strong>
            <span className={performance.artistConsent ? "stage-consent ready" : "stage-consent"}>{performance.artistConsent ? "Consent" : "No consent"}</span>
            <Button variant="ghost" size="icon" onClick={() => setEditor(performance)} aria-label={"Edit " + performance.title}><Pencil /></Button>
            <Button variant="ghost" size="icon" disabled={busyId === performance.id || performance.status === "archived"} onClick={() => archive(performance)} aria-label={"Archive " + performance.title}>{busyId === performance.id ? <LoaderCircle className="catalog-spinner" /> : <Archive />}</Button>
          </article>
        ))}
        {!performances.length && <div className="admin-empty"><PlaySquare /><h2>No Stage performances yet</h2><p>Create the first ChuneSide Stage record after at least one artist profile exists.</p></div>}
        {performances.length > 0 && !visiblePerformances.length && <div className="admin-empty"><Search /><h2>No matching Stage performances</h2><p>Try a different status, placement, sort, or search term.</p></div>}
      </section>

      <StageEditor key={editor && typeof editor === "object" ? editor.id : String(editor)} editor={editor} artists={artists} releases={releases} busy={busyId === "save"} error={error} onClose={() => setEditor(null)} onSubmit={save} />
    </main>
  );
}

function StageEditor({ editor, artists, releases, busy, error, onClose, onSubmit }: {
  editor: EditorState;
  artists: ArtistOption[];
  releases: ReleaseOption[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>, tracklist: TracklistEntry[]) => void;
}) {
  const performance = typeof editor === "object" ? editor : null;
  const [tracklist, setTracklist] = useState<TracklistEntry[]>(performance?.tracklist ?? []);
  const moveTrack = (index: number, direction: -1 | 1) => setTracklist((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  return (
    <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="catalog-editor-dialog stage-editor-dialog">
        <DialogHeader><DialogTitle>{performance ? "Edit Stage performance" : "Create Stage performance"}</DialogTitle><DialogDescription>Use YouTube embeds first. Confirm artist consent before approval, scheduling, publishing, or featuring.</DialogDescription></DialogHeader>
        {editor && <form className="catalog-editor-form" onSubmit={(event) => onSubmit(event, tracklist)}>
          <div className="catalog-form-grid">
            <Field label="Performance type"><Choice name="performanceType" value={performance?.performanceType ?? "artist"} options={["artist", "dj"]} /></Field>
            <Field label="Artist or DJ profile"><NativeSelect name="artistProfileId" defaultValue={performance?.artistProfileId ?? artists[0]?.id ?? ""} required>{artists.map((artist) => <NativeSelectOption key={artist.id} value={artist.id}>{artist.stageName}</NativeSelectOption>)}</NativeSelect></Field>
            <Field label="Performance title"><Input name="title" required maxLength={160} defaultValue={performance?.title ?? ""} /></Field>
            <Field label="Slug"><SlugField value={performance?.slug ?? ""} /></Field>
            <Field label="Status"><Choice name="status" value={performance?.status ?? "draft"} options={["draft", "submitted", "pending_review", "approved", "scheduled", "published", "featured", "rejected", "archived"]} /></Field>
            <Field label="YouTube URL or ID"><Input name="youtubeUrl" maxLength={500} defaultValue={performance?.youtubeUrl ?? performance?.youtubeVideoId ?? ""} /></Field>
            <Field label="Thumbnail URL"><Input name="thumbnailUrl" type="url" defaultValue={performance?.thumbnailUrl ?? ""} /></Field>
            <Field label="Duration minutes"><Input name="durationMinutes" type="number" min={1} max={180} defaultValue={performance?.durationMinutes ?? ""} /></Field>
            <Field label="Genre"><GenreField value={performance?.genre ?? ""} /></Field>
            <Field label="Country/Region"><RegionField value={performance?.region ?? ""} /></Field>
            <Field label="Performance date"><DateTimeField name="performanceDate" value={performance?.performanceDate} /></Field>
            <Field label="Home placement"><Choice name="homePlacement" value={performance?.homePlacement ?? "none"} options={["none", "featured", "latest", "trending", "most_watched", "wadadli", "caribbean"]} /></Field>
            <Field label="Fee status"><Choice name="feeStatus" value={performance?.feeStatus ?? "not_required"} options={["not_required", "free_promotion", "discounted", "waived", "pending", "paid"]} /></Field>
            <Field label="Stage fee label"><Input name="stageFeeLabel" maxLength={120} placeholder="Configured later; do not hard-code public prices" defaultValue={performance?.stageFeeLabel ?? ""} /></Field>
            <Field label="Feature starts"><DateTimeField name="featureStartAt" value={performance?.featureStartAt} /></Field>
            <Field label="Feature ends"><DateTimeField name="featureEndAt" value={performance?.featureEndAt} /></Field>
            <Field label="Songs performed" wide><Textarea name="songsPerformed" maxLength={1000} defaultValue={songsText(performance?.songsPerformedJson)} placeholder={"Song one\nSong two\nSong three"} /></Field>
            <div className="catalog-field wide stage-tracklist-editor"><span>DJ tracklist (optional)</span><p>Link ChuneSide artists and approved songs where they are identifiable. External tracks can remain unlinked.</p>{tracklist.map((track, index) => <div className="stage-tracklist-row" key={track.id ?? `new-${index}`}><Input aria-label={`Track ${index + 1} title`} value={track.title} onChange={(event) => setTracklist((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} placeholder="Song title" /><Input aria-label={`Track ${index + 1} external artist`} value={track.externalArtistName ?? ""} onChange={(event) => setTracklist((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, externalArtistName: event.target.value || null } : item))} placeholder="Artist or external artist" /><NativeSelect aria-label={`Link artist for track ${index + 1}`} value={track.artistProfileId ?? ""} onChange={(event) => setTracklist((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, artistProfileId: event.target.value || null } : item))}><NativeSelectOption value="">No ChuneSide artist link</NativeSelectOption>{artists.map((artist) => <NativeSelectOption value={artist.id} key={artist.id}>{artist.stageName}</NativeSelectOption>)}</NativeSelect><NativeSelect aria-label={`Link release for track ${index + 1}`} value={track.releaseId ?? ""} onChange={(event) => setTracklist((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, releaseId: event.target.value || null } : item))}><NativeSelectOption value="">No ChuneSide song link</NativeSelectOption>{releases.map((release) => <NativeSelectOption value={release.id} key={release.id}>{release.title}</NativeSelectOption>)}</NativeSelect><Button type="button" variant="ghost" size="icon" aria-label="Move track up" onClick={() => moveTrack(index, -1)}><ArrowUp /></Button><Button type="button" variant="ghost" size="icon" aria-label="Move track down" onClick={() => moveTrack(index, 1)}><ArrowDown /></Button><Button type="button" variant="ghost" size="icon" aria-label="Remove track" onClick={() => setTracklist((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></Button></div>)}<Button type="button" variant="outline" onClick={() => setTracklist((current) => [...current, { title: "", externalArtistName: null, artistProfileId: null, releaseId: null, externalInfo: null }])} disabled={tracklist.length >= 30}><Plus /> Add track</Button></div>
            <Field label="Description" wide><Textarea name="description" maxLength={2000} defaultValue={performance?.description ?? ""} /></Field>
            <Field label="Original submission info" wide><Textarea name="originalSubmissionInfo" maxLength={2000} defaultValue={performance?.originalSubmissionInfo ?? ""} /></Field>
            <Field label="Review note" wide><Textarea name="reviewNote" maxLength={1000} placeholder="Required when rejecting: explain what the artist needs to correct." /></Field>
          </div>
          <label className="catalog-check rights-confirmation"><input name="artistConsent" type="checkbox" defaultChecked={performance?.artistConsent ?? false} /><span>Artist consent is confirmed for ChuneSide Stage publication and potential official ChuneSide YouTube use.</span></label>
          <label className="catalog-check rights-confirmation"><input name="rightsDeclaration" type="checkbox" defaultChecked={performance?.rightsDeclaration ?? false} /><span>I confirm this performance has the necessary permissions or rights declaration for ChuneSide Stage review and publication.</span></label>
          {error && <p className="catalog-editor-error" role="alert">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="catalog-spinner" /> : <Save />} Save performance</Button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? "catalog-field wide" : "catalog-field"}><span>{label}</span>{children}</label>;
}

function Choice({ name, value, options }: { name: string; value: string; options: string[] }) {
  return <NativeSelect name={name} defaultValue={value} required>{options.map((option) => <NativeSelectOption key={option} value={option}>{label(option)}</NativeSelectOption>)}</NativeSelect>;
}

function SlugField({ value }: { value: string }) {
  const [slug, setSlug] = useState(() => normalizeStageSlug(value));
  return <Input name="slug" required maxLength={90} value={slug} onChange={(event) => setSlug(formatStageSlug(event.target.value))} onBlur={() => setSlug((current) => normalizeStageSlug(current))} placeholder="artist-stage-performance" />;
}

function GenreField({ value }: { value: string }) {
  const isPreset = genrePresets.includes(value as typeof genrePresets[number]);
  const [choice, setChoice] = useState(isPreset ? value : value ? "__other__" : "");
  const [custom, setCustom] = useState(isPreset ? "" : value);
  return <div className="stage-choice-stack">
    <NativeSelect name="genre" value={choice} onChange={(event) => setChoice(event.target.value)} required>
      <NativeSelectOption value="">Choose genre</NativeSelectOption>
      {genrePresets.map((genre) => <NativeSelectOption key={genre} value={genre}>{genre}</NativeSelectOption>)}
      <NativeSelectOption value="__other__">Other</NativeSelectOption>
    </NativeSelect>
    {choice === "__other__" && <Input name="genreOther" required maxLength={80} value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="Enter genre" aria-label="Custom genre" />}
  </div>;
}

function RegionField({ value }: { value: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [region, setRegion] = useState(value);
  const [open, setOpen] = useState(false);
  const matches = countryOptions().filter((country) => country.toLowerCase().includes(region.trim().toLowerCase())).slice(0, 80);
  function choose(next: string) {
    setRegion(next);
    setOpen(false);
  }
  return <div className="stage-region-combobox">
    <div className="stage-region-input-wrap">
      <Input ref={inputRef} required value={region} onFocus={() => setOpen(true)} onChange={(event) => { setRegion(event.target.value); setOpen(true); }} onBlur={() => window.setTimeout(() => setOpen(false), 120)} maxLength={120} placeholder="Search a country or type a region" aria-label="Country or region" aria-autocomplete="list" aria-expanded={open} aria-controls="stage-region-options" />
      <Button type="button" variant="ghost" size="icon" className="stage-region-toggle" aria-label="Show country and region options" onMouseDown={(event) => event.preventDefault()} onClick={() => { setOpen((current) => !current); inputRef.current?.focus(); }}><ChevronDown /></Button>
    </div>
    <input type="hidden" name="region" value={region.trim()} />
    {open && <div id="stage-region-options" className="stage-region-options" role="listbox" aria-label="Country and region options">
      {matches.map((country) => <button type="button" role="option" aria-selected={region === country} key={country} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(country)}>{country}</button>)}
      {!matches.length && <p>No matching country. Use a manual region below.</p>}
      <button type="button" className="stage-region-manual" onMouseDown={(event) => event.preventDefault()} onClick={() => { choose(""); inputRef.current?.focus(); }}>Other / Manual entry</button>
    </div>}
  </div>;
}

function DateTimeField({ name, value }: { name: string; value?: string | null }) {
  const [date, initialTime] = dateTimeParts(value);
  const [datePart, setDatePart] = useState(date);
  const [timePart, setTimePart] = useState(initialTime);
  const times = timeOptions();
  if (initialTime && !times.includes(initialTime)) times.push(initialTime);
  const combined = datePart && timePart ? `${datePart}T${timePart}` : "";
  return <div className="stage-date-time-field">
    <DateTimeInput type="date" value={datePart} onChange={(event) => setDatePart(event.target.value)} pickerLabel={`Choose ${name} date`} aria-label={`${name} date`} />
    <NativeSelect className="stage-time-select" value={timePart} onChange={(event) => setTimePart(event.target.value)} aria-label={`${name} time`}>
      <NativeSelectOption value="">Time</NativeSelectOption>
      {times.sort().map((time) => <NativeSelectOption key={time} value={time}>{formatTime(time)}</NativeSelectOption>)}
    </NativeSelect>
    <input type="hidden" name={name} value={combined} />
  </div>;
}

function dateTimeParts(value?: string | null): [string, string] {
  if (!value) return ["", ""];
  const local = dateTimeLocal(value);
  return [local.slice(0, 10), local.slice(11, 16)];
}

function timeOptions() {
  return Array.from({ length: 288 }, (_, index) => `${String(Math.floor(index / 12)).padStart(2, "0")}:${String((index % 12) * 5).padStart(2, "0")}`);
}

function formatTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return `${String(hours % 12 || 12)}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateTimeLocal(value?: string | null) {
  return value ? value.slice(0, 16) : "";
}

function songsText(value?: string | null) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string").join("\n") : "";
  } catch {
    return "";
  }
}

function songsLabel(value: string) {
  const songs = songsText(value).split("\n").filter(Boolean);
  if (!songs.length) return "No songs listed";
  return `${songs.length} ${songs.length === 1 ? "song" : "songs"}`;
}

function isActiveHomePlacement(performance: StagePerformance) {
  return placementState(performance) === "active";
}

function placementState(performance: StagePerformance) {
  if (performance.homePlacement === "none") return "none";
  const now = Date.now();
  const starts = performance.featureStartAt ? Date.parse(performance.featureStartAt) : null;
  const ends = performance.featureEndAt ? Date.parse(performance.featureEndAt) : null;
  if (starts !== null && starts > now) return "scheduled";
  if (ends !== null && ends < now) return "expired";
  return "active";
}

function placementLabel(performance: StagePerformance) {
  if (performance.homePlacement === "none") return "No homepage placement";
  const state = placementState(performance);
  const prefix = `Home ${label(performance.homePlacement)}`;
  if (state === "scheduled") return `${prefix} starts ${shortDate(performance.featureStartAt)}`;
  if (state === "expired") return `${prefix} ended ${shortDate(performance.featureEndAt)}`;
  if (performance.featureEndAt) return `${prefix} until ${shortDate(performance.featureEndAt)}`;
  return `${prefix} active`;
}

function placementSort(performance: StagePerformance) {
  const state = placementState(performance);
  if (state === "active") return 0;
  if (state === "scheduled") return 1;
  if (state === "expired") return 2;
  return 3;
}

function shortDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
