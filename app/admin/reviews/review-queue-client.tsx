"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, ClipboardCheck, LoaderCircle, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { releaseReviewBlockers } from "@/lib/release-policy";

type ReviewRelease = {
  id: string;
  artistProfileId: string;
  artistName: string;
  title: string;
  genre: string;
  region: string;
  discoveryLane: "wadadli" | "caribbean" | "ai" | "world";
  creationType: "artist_made" | "ai_assisted";
  aiClassification: "human_created" | "ai_assisted" | "primarily_ai_generated" | "classification_pending";
  explicitStatus: "clean" | "explicit";
  rightsConfirmed: boolean;
  aiDisclosure: string | null;
  submissionNotes: string | null;
  createdAt: string;
  media: Array<{ id: string; releaseId: string; kind: "audio" | "cover"; originalName: string; contentType: string; sizeBytes: number; status: "pending" | "ready" | "rejected" | "deleted" }>;
};

export function ReviewQueueClient({ adminAccessSource, mediaRequired, initialReviews }: { adminAccessSource: "allowlist" | "role"; mediaRequired: boolean; initialReviews: ReviewRelease[] }) {
  const [reviews, setReviews] = useState(initialReviews);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [laneFilter, setLaneFilter] = useState("all");
  const [classificationFilter, setClassificationFilter] = useState("all");
  const visibleReviews = useMemo(() => {
    const query = search.trim().toLowerCase();
    return reviews.filter((release) => {
      const text = [release.title, release.artistName, release.genre, release.region, release.discoveryLane].join(" ").toLowerCase();
      return (!query || text.includes(query)) && (laneFilter === "all" || release.discoveryLane === laneFilter) && (classificationFilter === "all" || release.aiClassification === classificationFilter);
    });
  }, [classificationFilter, laneFilter, reviews, search]);

  async function decide(release: ReviewRelease, decision: "approve" | "reject") {
    setBusyId(release.id);
    setMessage("");
    const response = await fetch("/api/admin/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ releaseId: release.id, decision, reviewNote: notes[release.id] ?? "" }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) {
      setMessage(data.error ?? "That review decision could not be saved.");
      setBusyId(null);
      return;
    }
    setReviews((current) => current.filter((item) => item.id !== release.id));
    setMessage(`${release.title} was ${decision === "approve" ? "approved" : "returned to the artist"}.`);
    setBusyId(null);
  }

  return (
    <main className="admin-shell">
      <header className="admin-hero">
        <Link href="/" className="admin-brand" aria-label="Back to ChuneSide"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority /></Link>
        <div><span><ShieldCheck /> Admin foundation</span><h1>Review Queue</h1><p>Make human publication decisions with rights, content, and creation disclosures visible in one place.</p><small className="admin-access-source">Access granted by {adminAccessSource === "allowlist" ? "owner email allowlist" : "database admin role"}.</small></div>
      </header>

      <nav className="admin-toolbar admin-nav-actions" aria-label="Admin sections">
        <Button asChild variant="outline"><Link href="/admin/accounts">Accounts</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/catalog">Catalogue</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/feature-flags">Feature Control</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/announcements">News Bar</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/ai-controls">AI Controls</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/stage">Stage</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/audit">Audit Log</Link></Button>
      </nav>

      <section className="admin-summary" aria-label="Review queue summary">
        <div><strong>{reviews.length}</strong><span>Pending review</span></div>
        <div><strong>{reviews.filter((release) => release.rightsConfirmed).length}</strong><span>Rights confirmed</span></div>
        <div><strong>{reviews.filter((release) => release.creationType === "ai_assisted").length}</strong><span>AI-assisted</span></div>
      </section>
      {message && <p className="admin-message" role="status">{message}</p>}

      <section className="review-filters" aria-label="Filter pending reviews">
        <label><Search /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, artist, genre or region" aria-label="Search pending reviews" /></label>
        <NativeSelect value={laneFilter} onChange={(event) => setLaneFilter(event.target.value)} aria-label="Filter reviews by discovery lane">
          <NativeSelectOption value="all">All discovery lanes</NativeSelectOption>
          {["wadadli", "caribbean", "ai", "world"].map((lane) => <NativeSelectOption key={lane} value={lane}>{label(lane)} lane</NativeSelectOption>)}
        </NativeSelect>
        <NativeSelect value={classificationFilter} onChange={(event) => setClassificationFilter(event.target.value)} aria-label="Filter reviews by AI classification">
          <NativeSelectOption value="all">All AI classifications</NativeSelectOption>
          {["human_created", "ai_assisted", "primarily_ai_generated", "classification_pending"].map((classification) => <NativeSelectOption key={classification} value={classification}>{label(classification)}</NativeSelectOption>)}
        </NativeSelect>
        {(search || laneFilter !== "all" || classificationFilter !== "all") && <Button type="button" variant="outline" onClick={() => { setSearch(""); setLaneFilter("all"); setClassificationFilter("all"); }}>Clear</Button>}
      </section>
      <p className="review-filter-count" role="status">Showing {visibleReviews.length} of {reviews.length} pending {reviews.length === 1 ? "review" : "reviews"}</p>

      <section className="review-queue" aria-label="Pending release reviews">
        {visibleReviews.map((release) => {
          const blockers = releaseReviewBlockers(release);
          if (mediaRequired && !release.media.some((item) => item.kind === "audio")) blockers.push("An audio master is required.");
          if (mediaRequired && !release.media.some((item) => item.kind === "cover")) blockers.push("Cover artwork is required.");
          const note = notes[release.id] ?? "";
          return (
            <article className="review-item" key={release.id}>
              <div className="review-item-heading">
                <div><span>{release.discoveryLane} lane</span><h2>{release.title}</h2><p>{release.artistName} · {release.genre} · {release.region}</p></div>
                <div className="review-badges"><span>{release.explicitStatus}</span><span className={release.rightsConfirmed ? "ready" : "blocked"}>{release.rightsConfirmed ? "Rights confirmed" : "Rights missing"}</span>{release.creationType === "ai_assisted" && <span className="ai"><Sparkles /> AI-assisted</span>}</div>
              </div>
              <div className="review-disclosures">
                <div><strong>AI classification</strong><p>{classificationLabel(release.aiClassification)}</p></div>
                <div><strong>AI disclosure</strong><p>{release.aiDisclosure || "Not applicable or not provided."}</p></div>
                <div><strong>Artist notes</strong><p>{release.submissionNotes || "No additional notes."}</p></div>
              </div>
              <div className="review-media">
                {release.media.map((media) => media.kind === "cover" ? (
                  <div className="review-cover" key={media.id}><a href={`/api/media/${media.id}`} target="_blank" rel="noreferrer" aria-label={`Open ${release.title} submitted cover`}><Image src={`/api/media/${media.id}`} alt={`${release.title} submitted cover`} width={96} height={96} unoptimized /></a><span>{media.originalName}<small>{formatBytes(media.sizeBytes)}</small></span></div>
                ) : (
                  <div className="review-audio" key={media.id}><span>{media.originalName}<small>{formatBytes(media.sizeBytes)}</small></span><audio src={`/api/media/${media.id}`} controls preload="metadata" /></div>
                ))}
                {!release.media.length && <p>No media uploaded yet.</p>}
              </div>
              {blockers.length > 0 && <p className="review-blockers">{blockers.join(" ")}</p>}
              <label className="review-note"><span>Reviewer note</span><Textarea value={note} onChange={(event) => setNotes((current) => ({ ...current, [release.id]: event.target.value }))} maxLength={1000} placeholder="Required when returning a release; optional on approval." /></label>
              <div className="review-actions">
                <Button variant="outline" disabled={busyId === release.id || !note.trim()} onClick={() => decide(release, "reject")}>{busyId === release.id ? <LoaderCircle className="catalog-spinner" /> : <X />} Return to artist</Button>
                <Button disabled={busyId === release.id || blockers.length > 0} onClick={() => decide(release, "approve")}>{busyId === release.id ? <LoaderCircle className="catalog-spinner" /> : <Check />} Approve release</Button>
              </div>
            </article>
          );
        })}
        {!reviews.length && <div className="admin-empty"><ClipboardCheck /><h2>The queue is clear</h2><p>New artist submissions will appear here for a human publication decision.</p></div>}
        {reviews.length > 0 && !visibleReviews.length && <div className="admin-empty"><Search /><h2>No matching reviews</h2><p>Try a different search or filter.</p></div>}
      </section>
    </main>
  );
}

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

function classificationLabel(value: ReviewRelease["aiClassification"]) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
