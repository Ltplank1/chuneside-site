"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Award, ImagePlus, Save, ShieldCheck, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import styles from "./trophy-admin.module.css";

type Category = "milestone" | "stage" | "ranking" | "competition" | "championship" | "special";
type Source = "chart" | "competition" | "fan_choice" | "judges_choice" | "stage_artist" | "stage_dj" | "stage_spoken_word" | "editorial" | "special" | "milestone";
type Definition = { id: string; key: string; title: string; description: string; category: Category; repeatable: boolean; active: boolean; artworkVersion: number; artworkContentType: string | null };
type Artist = { id: string; stageName: string; slug: string };
type Release = { id: string; title: string; artistProfileId: string; linkedArtistProfileIds: string[] };
type Performance = { id: string; title: string; artistProfileId: string; performanceType: string; genre: string; performanceDate: string | null };
type Award = { award: { id: string; definitionId: string; artistProfileId: string; releaseId: string | null; sourceType: string; sourceEventId: string | null; sourceEventTitleSnapshot: string | null; sourceEventDateSnapshot: string | null; awardedAt: string; titleSnapshot: string; descriptionSnapshot: string; artistNameSnapshot: string; releaseTitleSnapshot: string | null; note: string | null; revokedAt: string | null; revocationReason: string | null }; artistName: string; definitionTitle: string };
type Data = { definitions: Definition[]; artists: Artist[]; releases: Release[]; performances: Performance[]; awards: Award[]; hasMoreAwards: boolean };
type DefinitionForm = { id: string; key: string; title: string; description: string; category: Category; repeatable: boolean; active: boolean };

const emptyDefinition: DefinitionForm = { id: "", key: "", title: "", description: "", category: "milestone", repeatable: false, active: true };
const categories: Category[] = ["milestone", "stage", "ranking", "competition", "championship", "special"];
const sources: { value: Source; label: string }[] = [
  { value: "stage_artist", label: "Artist Stage appearance" }, { value: "stage_dj", label: "DJ Stage appearance" },
  { value: "stage_spoken_word", label: "Spoken Word Stage appearance" }, { value: "competition", label: "Competition award" },
  { value: "fan_choice", label: "Fan Choice" }, { value: "judges_choice", label: "Judges' Choice" },
  { value: "chart", label: "Chart / ranking" }, { value: "editorial", label: "Editorial / Featured Artist" },
  { value: "special", label: "Special ChuneSide award" }, { value: "milestone", label: "Artist milestone" },
];

function localDateTimeInputValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function TrophyAdminClient({ adminAccessSource }: { adminAccessSource: "allowlist" | "role" }) {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState<DefinitionForm>(emptyDefinition);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [awardArtist, setAwardArtist] = useState("");
  const [awardDefinition, setAwardDefinition] = useState("");
  const [awardSource, setAwardSource] = useState<Source>("special");
  const [awardEvent, setAwardEvent] = useState("");
  const [awardEventTitle, setAwardEventTitle] = useState("");
  const [awardPerformance, setAwardPerformance] = useState("");
  const [awardRelease, setAwardRelease] = useState("");
  const [awardDate, setAwardDate] = useState(() => localDateTimeInputValue(new Date()));
  const [awardNote, setAwardNote] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/admin/trophies?q=${encodeURIComponent(search)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Trophy Case data could not be loaded.");
    const loaded = await response.json() as Data;
    setData((current) => ({ ...loaded, releases: current?.releases ?? [], performances: current?.performances ?? [] }));
  }, [search]);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/trophies", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Trophy Case data could not be loaded.");
        return await response.json() as Data;
      })
      .then((loaded) => { if (active) setData(loaded); })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "Trophy Case data could not be loaded."); });
    return () => { active = false; };
  }, []);
  const dataLoaded = Boolean(data);
  useEffect(() => {
    if (!dataLoaded || !awardArtist) return;
    const controller = new AbortController();
    void fetch(`/api/admin/trophies?mode=artist_options&artistId=${encodeURIComponent(awardArtist)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Artist releases and Stage appearances could not be loaded.");
        return await response.json() as Pick<Data, "releases" | "performances">;
      })
      .then((result) => setData((current) => current ? { ...current, ...result } : current))
      .catch((error: unknown) => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Artist options could not be loaded."); });
    return () => controller.abort();
  }, [awardArtist, dataLoaded]);
  useEffect(() => {
    if (!dataLoaded) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/admin/trophies?mode=awards&q=${encodeURIComponent(search)}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Awards could not be searched.");
          return await response.json() as Pick<Data, "awards" | "hasMoreAwards">;
        })
        .then((result) => setData((current) => current ? { ...current, ...result } : current))
        .catch((error: unknown) => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Awards could not be searched."); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search, dataLoaded]);

  async function loadMoreAwards() {
    if (!data?.hasMoreAwards) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/trophies?mode=awards&q=${encodeURIComponent(search)}&offset=${data.awards.length}`, { cache: "no-store" });
      if (!response.ok) throw new Error("More awards could not be loaded.");
      const result = await response.json() as Pick<Data, "awards" | "hasMoreAwards">;
      setData((current) => current ? { ...current, awards: [...current.awards, ...result.awards], hasMoreAwards: result.hasMoreAwards } : current);
    } catch (error) { setMessage(error instanceof Error ? error.message : "More awards could not be loaded."); }
    finally { setBusy(false); }
  }

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/trophies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string; duplicate?: boolean };
      if (!response.ok) throw new Error(result.error ?? "The change could not be saved.");
      setMessage(result.duplicate ? "This achievement was already recorded; no duplicate was created." : "Trophy Case updated.");
      await refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The change could not be saved.");
      return false;
    } finally { setBusy(false); }
  }

  async function saveDefinition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await post({ action: "save_definition", ...form })) setForm(emptyDefinition);
  }

  async function uploadArtwork(definitionId: string, file: File | undefined) {
    if (!file) return;
    const body = new FormData(); body.set("definitionId", definitionId); body.set("file", file);
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/trophies/artwork", { method: "POST", body });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Artwork upload failed.");
      setMessage("Artwork version uploaded. Previously awarded trophies keep their original artwork.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Artwork upload failed."); }
    finally { setBusy(false); }
  }

  async function createAward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedDefinition = data?.definitions.find((definition) => definition.id === awardDefinition);
    if (selectedDefinition?.repeatable && !awardEvent.trim()) { setMessage("Enter a unique source event ID for a repeatable achievement."); return; }
    const matchingPerformance = data?.performances.find((performance) => performance.id === awardPerformance);
    const performanceId = awardSource.startsWith("stage_") ? awardPerformance : null;
    const eventId = matchingPerformance?.id ?? (awardEvent.trim() || null);
    const date = new Date(awardDate);
    await post({ action: "award", definitionId: awardDefinition, artistProfileId: awardArtist, releaseId: awardRelease || null, stagePerformanceId: performanceId, sourceType: awardSource, sourceEventId: eventId, sourceEventTitle: matchingPerformance?.title ?? awardEventTitle, sourceEventDate: matchingPerformance?.performanceDate ?? null, awardedAt: date.toISOString(), note: awardNote || null });
  }

  const eligiblePerformances = data?.performances.filter((performance) => performance.artistProfileId === awardArtist && (
    (awardSource === "stage_dj" && performance.performanceType === "dj") ||
    (awardSource === "stage_artist" && performance.performanceType === "artist" && !/spoken\s*word|poetry/i.test(performance.genre)) ||
    (awardSource === "stage_spoken_word" && performance.performanceType === "artist" && /spoken\s*word|poetry/i.test(performance.genre))
  )) ?? [];

  return (
    <main className={`admin-shell ${styles.shell}`}>
      <header className="admin-hero">
        <Link href="/" className="admin-brand" aria-label="Back to ChuneSide"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link>
        <div><span><ShieldCheck /> Admin foundation</span><h1>Trophy Case</h1><p>Manage artist achievements and preserve each award as part of their ChuneSide history.</p><small className="admin-access-source">Access granted by {adminAccessSource === "allowlist" ? "owner email allowlist" : "database admin role"}.</small></div>
      </header>
      <nav className="admin-toolbar admin-nav-actions" aria-label="Admin sections">
        <Button asChild variant="outline"><Link href="/admin/accounts">Accounts</Link></Button><Button asChild variant="outline"><Link href="/admin/catalog">Catalogue</Link></Button><Button asChild variant="outline"><Link href="/admin/analytics">Analytics</Link></Button><Button asChild variant="outline"><Link href="/admin/reviews">Review Queue</Link></Button><Button asChild variant="outline"><Link href="/admin/stage">Stage</Link></Button><Button asChild variant="outline"><Link href="/admin/feature-flags">Feature Control</Link></Button><Button asChild variant="outline"><Link href="/admin/audit">Audit Log</Link></Button>
      </nav>
      {message && <p className="admin-message" role="status">{message}</p>}
      {!data ? <p className={styles.loading} role="status">Loading Trophy Case records…</p> : <>
        <section className={styles.section} aria-labelledby="trophy-definition-heading">
          <div className={styles.sectionHeading}><div><span>Definitions</span><h2 id="trophy-definition-heading">Trophy pack</h2></div><span>{data.definitions.length} definitions</span></div>
          <div className={styles.definitionLayout}>
            <form className={styles.definitionForm} onSubmit={saveDefinition}>
              <h3>{form.id ? "Edit definition" : "Create definition"}</h3>
              <label>Key<Input required maxLength={80} value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "") })} /></label>
              <label>Title<Input required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
              <label>Category<NativeSelect value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as Category })}>{categories.map((category) => <NativeSelectOption key={category} value={category}>{category.replaceAll("_", " ")}</NativeSelectOption>)}</NativeSelect></label>
              <label>Description<Textarea maxLength={500} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
              <div className={styles.formChecks}><label><input type="checkbox" checked={form.repeatable} disabled={Boolean(form.id)} onChange={(event) => setForm({ ...form, repeatable: event.target.checked })} /> Repeatable with distinct event IDs{form.id && " (fixed after creation)"}</label><label><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Active for awards</label></div>
              <div className={styles.formActions}><Button type="submit" disabled={busy}><Save /> Save definition</Button>{form.id && <Button type="button" variant="outline" onClick={() => setForm(emptyDefinition)}><X /> Cancel edit</Button>}</div>
            </form>
          <div className={styles.definitionList}>
              {data.definitions.map((definition) => <article className={styles.definitionRow} key={definition.id}>
                <div className={styles.definitionArt}>{definition.artworkVersion ? <Image src={`/api/trophies/artwork/${encodeURIComponent(definition.id)}?version=${definition.artworkVersion}`} alt={`${definition.title} artwork preview`} width={64} height={64} unoptimized /> : <Award aria-hidden="true" />}</div>
                <div className={styles.definitionCopy}><span>{definition.category.replaceAll("_", " ")} · {definition.active ? "Active" : "Inactive"} · {definition.repeatable ? "Repeatable" : "One time"}</span><h3>{definition.title}</h3><p>{definition.description || definition.key}</p></div>
                <div className={styles.definitionTools}><Button type="button" variant="outline" onClick={() => setForm({ ...definition })}>Edit</Button><label className={styles.uploadButton}><Upload /> {definition.artworkVersion ? "Replace PNG" : "Upload PNG"}<input aria-label={`Upload PNG artwork for ${definition.title}`} type="file" accept="image/png" disabled={busy} onChange={(event) => { void uploadArtwork(definition.id, event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>{definition.artworkVersion ? <a className={styles.previewLink} href={`/api/trophies/artwork/${encodeURIComponent(definition.id)}?version=${definition.artworkVersion}`} target="_blank" rel="noreferrer"><ImagePlus /> Preview</a> : <span className={styles.previewLink} aria-disabled="true"><ImagePlus /> Preview</span>}</div>
              </article>)}
              {!data.definitions.length && <p className={styles.empty}>No trophy definitions yet.</p>}
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="manual-award-heading">
          <div className={styles.sectionHeading}><div><span>Awards</span><h2 id="manual-award-heading">Record achievement</h2></div><span>Admin only</span></div>
          <form className={styles.awardForm} onSubmit={createAward}>
            <label>Trophy definition<NativeSelect required value={awardDefinition} onChange={(event) => setAwardDefinition(event.target.value)}><NativeSelectOption value="">Choose definition</NativeSelectOption>{data.definitions.filter((definition) => definition.active).map((definition) => <NativeSelectOption key={definition.id} value={definition.id}>{definition.title}{definition.repeatable ? " · repeatable" : ""}</NativeSelectOption>)}</NativeSelect></label>
            <label>Artist<NativeSelect required value={awardArtist} onChange={(event) => { setAwardArtist(event.target.value); setAwardPerformance(""); setAwardEvent(""); setAwardEventTitle(""); setAwardRelease(""); setData((current) => current ? { ...current, releases: [], performances: [] } : current); }}><NativeSelectOption value="">Choose artist</NativeSelectOption>{data.artists.map((artist) => <NativeSelectOption key={artist.id} value={artist.id}>{artist.stageName}</NativeSelectOption>)}</NativeSelect></label>
            <label>Achievement source<NativeSelect value={awardSource} onChange={(event) => { setAwardSource(event.target.value as Source); setAwardPerformance(""); setAwardEvent(""); setAwardEventTitle(""); }}><>{sources.map((source) => <NativeSelectOption key={source.value} value={source.value}>{source.label}</NativeSelectOption>)}</></NativeSelect></label>
            {awardSource.startsWith("stage_") && <label>Stage appearance<NativeSelect required value={awardPerformance} onChange={(event) => { const performance = eligiblePerformances.find((item) => item.id === event.target.value); setAwardPerformance(event.target.value); setAwardEvent(event.target.value); setAwardEventTitle(performance?.title ?? ""); }}><NativeSelectOption value="">Choose appearance</NativeSelectOption>{eligiblePerformances.map((performance) => <NativeSelectOption key={performance.id} value={performance.id}>{performance.title}{performance.performanceDate ? ` · ${new Date(performance.performanceDate).getFullYear()}` : ""}</NativeSelectOption>)}</NativeSelect></label>}
            <label>Release/song (optional)<NativeSelect value={awardRelease} onChange={(event) => setAwardRelease(event.target.value)}><NativeSelectOption value="">No release association</NativeSelectOption>{data.releases.filter((release) => release.artistProfileId === awardArtist || release.linkedArtistProfileIds.includes(awardArtist)).map((release) => <NativeSelectOption key={release.id} value={release.id}>{release.title}</NativeSelectOption>)}</NativeSelect></label>
            <label>Event ID {data.definitions.find((definition) => definition.id === awardDefinition)?.repeatable && <span aria-hidden="true">*</span>}<Input maxLength={180} required={Boolean(data.definitions.find((definition) => definition.id === awardDefinition)?.repeatable) || ["competition", "fan_choice", "judges_choice"].includes(awardSource)} value={awardEvent} onChange={(event) => setAwardEvent(event.target.value)} placeholder="Unique competition or event ID" /></label>
            {!awardSource.startsWith("stage_") && <label>Event or competition name<Input maxLength={180} value={awardEventTitle} onChange={(event) => setAwardEventTitle(event.target.value)} /></label>}
            <label>Achievement date<input type="datetime-local" required value={awardDate} onChange={(event) => setAwardDate(event.target.value)} /></label>
            <label className={styles.awardNote}>Admin note / description<Textarea maxLength={1000} rows={3} value={awardNote} onChange={(event) => setAwardNote(event.target.value)} /></label>
            <div className={styles.awardSubmit}><Button type="submit" disabled={busy || !data.definitions.some((definition) => definition.id === awardDefinition && definition.active)}><Award /> Record award</Button></div>
          </form>
        </section>

        <section className={styles.section} aria-labelledby="award-history-heading">
          <div className={styles.sectionHeading}><div><span>History</span><h2 id="award-history-heading">Award ledger</h2></div><span>{data.awards.length} records</span></div>
          <label className={styles.historySearch}>Search awards<Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Artist, trophy or source" /></label>
          <div className={styles.awardList}>{data.awards.map(({ award, definitionTitle }) => <article className={`${styles.awardRow}${award.revokedAt ? ` ${styles.revoked}` : ""}`} key={award.id}>
            <div><span>{award.sourceType.replaceAll("_", " ")} · {award.awardedAt.slice(0, 10)}{award.revokedAt ? " · Revoked" : ""}</span><h3>{award.titleSnapshot}</h3><p>{award.artistNameSnapshot}{award.releaseTitleSnapshot ? ` · ${award.releaseTitleSnapshot}` : ""}{award.note ? ` · ${award.note}` : ""}</p><small>Definition: {definitionTitle}{award.sourceEventTitleSnapshot ? ` · ${award.sourceEventTitleSnapshot}` : ""}{award.sourceEventId ? ` · Event ID ${award.sourceEventId}` : ""}</small>{award.revocationReason && <small>Revocation: {award.revocationReason}</small>}</div>
            {!award.revokedAt && <div className={styles.awardActions}><details><summary>Correct record</summary><form onSubmit={(event) => { event.preventDefault(); const fd = new FormData(event.currentTarget); const date = new Date(String(fd.get("awardedAt"))); void post({ action: "correct", awardId: award.id, awardedAt: date.toISOString(), note: String(fd.get("note") || "") || null }); }}><label>Achievement date<input name="awardedAt" type="datetime-local" required defaultValue={localDateTimeInputValue(new Date(award.awardedAt))} /></label><label>Admin note<textarea name="note" maxLength={1000} defaultValue={award.note ?? ""} /></label><Button type="submit" disabled={busy}><Save /> Save correction</Button></form></details><Button type="button" variant="outline" disabled={busy} onClick={() => { const reason = window.prompt("Why is this award being revoked? This reason is recorded in the audit log."); if (reason?.trim()) void post({ action: "revoke", awardId: award.id, reason: reason.trim() }); }}><X /> Revoke</Button></div>}
          </article>)}{!data.awards.length && <p className={styles.empty}>No awards match this search.</p>}</div>
          {data.hasMoreAwards && <div className={styles.awardSubmit}><Button type="button" variant="outline" disabled={busy} onClick={() => void loadMoreAwards()}>Load more awards</Button></div>}
        </section>
      </>}
      <footer className="admin-footer"><Button asChild variant="outline"><Link href="/">Back to ChuneSide</Link></Button><span><Award /> Definition artwork and award history are saved separately.</span></footer>
    </main>
  );
}
