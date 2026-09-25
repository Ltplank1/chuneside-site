"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AudioLines, ClipboardCheck, Plus, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import styles from "./audio-review.module.css";

type CheckStatus = "not_performed" | "inconclusive" | "pass" | "warning" | "needs_review" | "fail";
type ReviewStatus = "pending" | "needs_review" | "completed" | "superseded";
type ReviewRow = {
  mediaId: string; releaseId: string; mediaVersion: number; mediaVariant: "master" | "stream";
  mediaName: string; contentType: string; mediaCreatedAt: string;
  releaseTitle: string; artistName: string; radioReadyConfirmed: boolean; aiClassification: string;
  reviewId: string | null; status: ReviewStatus | null;
  technicalStatus: CheckStatus | null; cleanStatus: CheckStatus | null; aiStatus: CheckStatus | null;
  reviewCreatedAt: string | null;
};
type Review = {
  id: string; releaseIdSnapshot: string; mediaIdSnapshot: string; releaseTitleSnapshot: string;
  artistNameSnapshot: string; mediaNameSnapshot: string; mediaVariant: "master" | "stream";
  mediaVersion: number; mediaContentType: string; sourceMediaIdSnapshot: string | null;
  radioReadyConfirmedSnapshot: boolean; aiClassificationSnapshot: string; aiDisclosureSnapshot: string | null;
  status: ReviewStatus; technicalStatus: CheckStatus; cleanStatus: CheckStatus; aiStatus: CheckStatus;
  adminDecision: string; reviewNote: string | null; reviewedAt: string | null; reviewedBy: string | null;
  previousReviewId: string | null; createdAt: string; supersededAt: string | null;
};
type Finding = { id: string; origin: string; category: string; severity: string; message: string; confidence: number | null; offsetSeconds: number | null; createdAt: string };
type Report = { id: string; reason: string; status: string; offsetSeconds: number | null; createdAt: string };
type Detail = { review: Review; findings: Finding[]; history: Review[]; reports: Report[] };

const filters = [
  ["pending", "Pending"], ["needs_review", "Needs review"], ["warning", "Warnings"],
  ["failed", "Failed checks"], ["completed", "Completed"], ["technical", "Technical issues"],
  ["clean", "Clean issues"], ["ai", "AI issues"], ["all", "All current media"],
] as const;

function label(value: string | null) { return (value ?? "unreviewed").replaceAll("_", " "); }
function date(value: string | null) { return value ? new Date(value).toLocaleString() : "Not recorded"; }
function checkLabel(value: CheckStatus | null) { return value === null || value === "not_performed" ? "Not performed" : label(value); }

export function AudioReviewClient({ adminAccessSource }: { adminAccessSource: "allowlist" | "role" }) {
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ReviewRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState("");
  const [selectedReviewId, setSelectedReviewId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [decision, setDecision] = useState<"reviewed" | "follow_up" | "replacement_requested">("reviewed");
  const [decisionNote, setDecisionNote] = useState("");
  const [findingCategory, setFindingCategory] = useState<"technical" | "clean" | "ai" | "other">("technical");
  const [findingSeverity, setFindingSeverity] = useState<"info" | "warning" | "critical">("warning");
  const [findingMessage, setFindingMessage] = useState("");
  const [findingTime, setFindingTime] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const loadQueue = useCallback(async (offset = 0, signal?: AbortSignal) => {
    const params = new URLSearchParams({ filter, q: search, offset: String(offset) });
    const response = await fetch(`/api/admin/audio-review?${params}`, { cache: "no-store", signal });
    if (!response.ok) throw new Error("Audio Review queue could not be loaded.");
    const result = await response.json() as { items: ReviewRow[]; hasMore: boolean };
    setItems((current) => offset ? [...current, ...result.items] : result.items);
    setHasMore(result.hasMore);
  }, [filter, search]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadQueue(0, controller.signal).catch((error: unknown) => {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Audio Review queue could not be loaded.");
      });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [loadQueue]);

  const loadDetail = useCallback(async (reviewId: string, signal?: AbortSignal) => {
    const response = await fetch(`/api/admin/audio-review?caseId=${encodeURIComponent(reviewId)}`, { cache: "no-store", signal });
    if (!response.ok) throw new Error("Audio Review details could not be loaded.");
    setDetail(await response.json() as Detail);
  }, []);

  useEffect(() => {
    if (!selectedReviewId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadDetail(selectedReviewId, controller.signal).catch((error: unknown) => {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Audio Review details could not be loaded.");
      });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [selectedReviewId, loadDetail]);

  async function post(body: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/audio-review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string; review?: Review; findingId?: string };
      if (!response.ok) throw new Error(result.error ?? "The Audio Review change could not be saved.");
      await loadQueue();
      const reviewId = result.review?.id ?? selectedReviewId;
      if (reviewId) { setSelectedReviewId(reviewId); await loadDetail(reviewId); }
      setMessage("Audio Review updated. Release approval and artist classification were not changed.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Audio Review change could not be saved.");
      return false;
    } finally { setBusy(false); }
  }

  const selected = items.find((item) => item.mediaId === selectedMediaId);
  const review = detail?.review?.id === selectedReviewId ? detail.review : null;

  return <main className="admin-shell">
    <header className="admin-hero">
      <Link href="/" className="admin-brand" aria-label="Back to ChuneSide"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link>
      <div><span><AudioLines /> Admin foundation</span><h1>Audio Review</h1><p>Track upload versions, artist declarations, findings, and human decisions.</p><small className="admin-access-source">Access granted by {adminAccessSource === "allowlist" ? "owner email allowlist" : "database admin role"}.</small></div>
    </header>
    <nav className="admin-toolbar admin-nav-actions" aria-label="Admin sections"><Button asChild variant="outline"><Link href="/admin/reviews">Review Queue</Link></Button><Button asChild variant="outline"><Link href="/admin/catalog">Catalogue</Link></Button><Button asChild variant="outline"><Link href="/admin/feature-flags">Feature Control</Link></Button><Button asChild variant="outline"><Link href="/admin/audit">Audit Log</Link></Button></nav>
    {message && <p className="admin-message" role="status">{message}</p>}
    <div className={styles.filters}>
      <label><Search aria-hidden="true" /><Input aria-label="Search artist or release" placeholder="Search artist or release" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <NativeSelect aria-label="Review filter" value={filter} onChange={(event) => setFilter(event.target.value)}>{filters.map(([value, name]) => <NativeSelectOption key={value} value={value}>{name}</NativeSelectOption>)}</NativeSelect>
    </div>
    <div className={styles.layout}>
      <section className={styles.queue} aria-label="Audio review queue">
        <div className={styles.sectionHeading}><h2>Audio uploads</h2><span>{items.length} shown</span></div>
        {items.map((item) => <button className={`${styles.queueRow}${selectedMediaId === item.mediaId ? ` ${styles.selected}` : ""}`} key={item.mediaId} type="button" onClick={() => { setSelectedMediaId(item.mediaId); setSelectedReviewId(item.reviewId ?? ""); setDetail(null); setMessage(""); }}>
          <span className={styles.queueMeta}>{item.mediaVariant} · version {item.mediaVersion} · {date(item.mediaCreatedAt)}</span>
          <strong>{item.releaseTitle}</strong><span>{item.artistName}</span>
          <span className={styles.queueStatus}>{label(item.status)} · technical {checkLabel(item.technicalStatus)}</span>
        </button>)}
        {!items.length && <p className={styles.empty}>No audio uploads match this filter.</p>}
        {hasMore && <Button type="button" variant="outline" disabled={busy} onClick={() => { setBusy(true); void loadQueue(items.length).catch(() => setMessage("More audio uploads could not be loaded.")).finally(() => setBusy(false)); }}>Load more</Button>}
      </section>
      <section className={styles.detail} aria-label="Audio review detail">
        {!selected ? <p className={styles.empty}>Select an upload to review its current version.</p> : <>
          <div className={styles.sectionHeading}><div><span className={styles.queueMeta}>{selected.artistName} · {selected.mediaVariant} v{selected.mediaVersion}</span><h2>{selected.releaseTitle}</h2></div><span>{label(selected.status)}</span></div>
          <div className={styles.metadata}><span>File: {selected.mediaName}</span><span>Format: {selected.contentType}</span><span>Uploaded: {date(selected.mediaCreatedAt)}</span></div>
          {!selected.reviewId && <div className={styles.actions}><p>No review case exists for this media version.</p><Button disabled={busy} onClick={() => void post({ action: "create_case", mediaId: selected.mediaId })}><Plus /> Open review case</Button></div>}
          {selected.reviewId && !review && <p className={styles.empty}>Loading review details…</p>}
          {review && <>
            <div className={styles.checkGrid}>
              <div><span>Technical audio</span><strong>{checkLabel(review.technicalStatus)}</strong></div>
              <div><span>Clean audio screening</span><strong>{checkLabel(review.cleanStatus)}</strong></div>
              <div><span>AI music screening</span><strong>{checkLabel(review.aiStatus)}</strong></div>
            </div>
            <div className={styles.declarations}><h3>Artist declarations</h3><p>Clean/radio-ready: <strong>{review.radioReadyConfirmedSnapshot ? "Confirmed by uploader" : "Not confirmed"}</strong></p><p>AI disclosure: <strong>{label(review.aiClassificationSnapshot)}</strong></p>{review.aiDisclosureSnapshot && <p>{review.aiDisclosureSnapshot}</p>}</div>
            <div className={styles.recordSection}><h3>Findings</h3>{detail?.findings.length ? <ul>{detail.findings.map((finding) => <li key={finding.id}><strong>{label(finding.category)} · {label(finding.severity)}</strong><span>{finding.message}{finding.offsetSeconds !== null ? ` · ${finding.offsetSeconds}s` : ""}</span><small>{label(finding.origin)} · {date(finding.createdAt)}</small></li>)}</ul> : <p>No findings recorded. This does not mean automated checks passed.</p>}</div>
            {review.status !== "superseded" && review.status !== "completed" && <form className={styles.form} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void post({ action: "add_finding", reviewId: review.id, category: findingCategory, severity: findingSeverity, message: findingMessage, offsetSeconds: findingTime ? Number(findingTime) : null }).then((saved) => { if (saved) { setFindingMessage(""); setFindingTime(""); } }); }}>
              <h3>Record admin observation</h3><div className={styles.formGrid}><label>Category<NativeSelect value={findingCategory} onChange={(event) => setFindingCategory(event.target.value as typeof findingCategory)}><NativeSelectOption value="technical">Technical</NativeSelectOption><NativeSelectOption value="clean">Clean audio</NativeSelectOption><NativeSelectOption value="ai">AI music</NativeSelectOption><NativeSelectOption value="other">Other</NativeSelectOption></NativeSelect></label><label>Severity<NativeSelect value={findingSeverity} onChange={(event) => setFindingSeverity(event.target.value as typeof findingSeverity)}><NativeSelectOption value="info">Information</NativeSelectOption><NativeSelectOption value="warning">Warning</NativeSelectOption><NativeSelectOption value="critical">Critical</NativeSelectOption></NativeSelect></label><label>Time in audio, seconds (optional)<Input type="number" min="0" max="86400" step="1" value={findingTime} onChange={(event) => setFindingTime(event.target.value)} /></label></div><label>Observation<Textarea required maxLength={500} value={findingMessage} onChange={(event) => setFindingMessage(event.target.value)} /></label><Button type="submit" variant="outline" disabled={busy}>Save observation</Button>
            </form>}
            {review.status !== "superseded" && review.status !== "completed" && <form className={styles.form} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void post({ action: "decision", reviewId: review.id, decision, note: decisionNote || null }).then((saved) => { if (saved) setDecisionNote(""); }); }}>
              <h3>Admin disposition</h3><p>This records an Audio Review decision only. It does not approve, reject, publish, or reclassify a release.</p><label>Decision<NativeSelect value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)}><NativeSelectOption value="reviewed">Review complete</NativeSelectOption><NativeSelectOption value="follow_up">Needs follow-up</NativeSelectOption><NativeSelectOption value="replacement_requested">Replacement requested</NativeSelectOption></NativeSelect></label><label>Reviewer note<Textarea maxLength={1000} required={decision !== "reviewed"} value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} /></label><Button type="submit" disabled={busy}><ClipboardCheck /> Record decision</Button>
            </form>}
            <div className={styles.recordSection}><h3>Review history</h3>{detail?.history.map((item) => <p key={item.id}>{item.mediaVariant} v{item.mediaVersion} · {label(item.status)} · {date(item.createdAt)}{item.previousReviewId ? " · replacement/re-review" : ""}</p>)}</div>
            <div className={styles.recordSection}><h3>Member reports</h3>{detail?.reports.length ? detail.reports.map((report) => <p key={report.id}>{label(report.reason)} · {label(report.status)} · {date(report.createdAt)}</p>) : <p>No reports for this upload. Member submission is not enabled in this phase.</p>}</div>
          </>}
        </>}
      </section>
    </div>
    <footer className="admin-footer"><Button asChild variant="outline"><Link href="/admin/reviews">Release Review Queue</Link></Button><span><ShieldCheck /> Automated signals do not replace human review.</span></footer>
  </main>;
}
