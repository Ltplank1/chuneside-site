"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Bot, BriefcaseBusiness, Disc3, Edit3, FileAudio, ImageIcon, LoaderCircle, PlaySquare, Plus, Send, Upload, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

type WorkspaceProfile = {
  id: string;
  slug: string;
  stageName: string;
  countryRegion: string;
  primaryGenre: string;
  verificationStatus: "unverified" | "pending" | "verified" | "rejected";
  foundingArtist: boolean;
  visibility: "draft" | "public" | "disabled";
  profilePhotoUrl: string | null;
  coverImageUrl: string | null;
  biography: string;
  socialLinksJson: string;
};

type WorkspaceRelease = {
  id: string;
  artistProfileId: string;
  legacyTrackId: number | null;
  title: string;
  slug: string;
  featuringArtist: string | null;
  genre: string;
  region: string;
  discoveryLane: "wadadli" | "caribbean" | "ai" | "world";
  creationType: "artist_made" | "ai_assisted";
  aiClassification: "human_created" | "ai_assisted" | "primarily_ai_generated" | "classification_pending";
  mood: string | null;
  durationSeconds: number | null;
  explicitStatus: "clean" | "explicit";
  approvalStatus: "draft" | "pending" | "approved" | "rejected" | "disabled";
  rightsConfirmed: boolean;
  aiDisclosure: string | null;
  submissionNotes: string | null;
  reviewNote: string | null;
};

type WorkspaceMedia = {
  id: string;
  releaseId: string;
  kind: "audio" | "cover" | "video";
  originalName: string;
  sizeBytes: number;
  status: "pending" | "ready" | "rejected" | "deleted";
};

type AiPolicySummary = {
  artistProfileId: string;
  restrictionEnabled: boolean;
  trackLimit: number;
  periodDays: number;
  scope: "ai_generated" | "ai_assisted" | "both";
  adminOverrideEnabled: boolean;
  exceptionId: string | null;
};

type WorkspaceStagePerformance = {
  id: string;
  artistProfileId: string;
  title: string;
  slug: string;
  description: string;
  youtubeUrl: string | null;
  thumbnailUrl: string | null;
  durationMinutes: number | null;
  songsPerformedJson: string;
  originalSubmissionInfo: string | null;
  genre: string;
  region: string;
  status: "draft" | "submitted" | "pending_review" | "approved" | "scheduled" | "published" | "featured" | "rejected" | "archived";
  performanceDate: string | null;
  reviewNote: string | null;
};

export function ArtistDashboardClient({ displayName, profiles, aiPolicies, initialReleases, initialMedia, initialStagePerformances, mediaUploadsAvailable, stageSubmissionsAvailable }: {
  displayName: string;
  profiles: WorkspaceProfile[];
  aiPolicies: AiPolicySummary[];
  initialReleases: WorkspaceRelease[];
  initialMedia: WorkspaceMedia[];
  initialStagePerformances: WorkspaceStagePerformance[];
  mediaUploadsAvailable: boolean;
  stageSubmissionsAvailable: boolean;
}) {
  const [profileRows, setProfileRows] = useState(profiles);
  const [releaseRows, setReleaseRows] = useState(initialReleases);
  const [mediaRows, setMediaRows] = useState(initialMedia);
  const [stageRows, setStageRows] = useState(initialStagePerformances);
  const [open, setOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [stageEditOpen, setStageEditOpen] = useState<WorkspaceStagePerformance | null>(null);
  const [profileOpen, setProfileOpen] = useState<WorkspaceProfile | null>(null);
  const [releaseEditOpen, setReleaseEditOpen] = useState<WorkspaceRelease | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const profileNames = new Map(profileRows.map((profile) => [profile.id, profile.stageName]));
  const policyByProfile = new Map(aiPolicies.map((policy) => [policy.artistProfileId, policy]));

  async function submitRelease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/artist/releases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        artistProfileId: form.get("artistProfileId"),
        title: form.get("title"),
        slug: form.get("slug"),
        featuringArtist: form.get("featuringArtist"),
        genre: form.get("genre"),
        region: form.get("region"),
        discoveryLane: form.get("discoveryLane"),
        creationType: form.get("creationType"),
        aiClassification: form.get("aiClassification"),
        mood: form.get("mood"),
        durationSeconds: form.get("durationSeconds") ? Number(form.get("durationSeconds")) : null,
        explicitStatus: form.get("explicitStatus"),
        rightsConfirmed: form.get("rightsConfirmed") === "on",
        aiDisclosure: form.get("aiDisclosure"),
        submissionNotes: form.get("submissionNotes"),
      }),
    });
    const data = await response.json() as { release?: WorkspaceRelease; error?: string };
    if (!response.ok || !data.release) {
      setError(data.error ?? "The release could not be submitted.");
      setBusy(false);
      return;
    }

    setReleaseRows((current) => [...current, data.release as WorkspaceRelease]);
    setMessage(data.release.title + " was submitted for review.");
    setBusy(false);
    setOpen(false);
  }

  async function uploadMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const releaseId = String(form.get("releaseId") ?? "");
    const files = (["audio", "cover", "video"] as const).map((kind) => ({ kind, file: form.get(kind) })).filter((item): item is { kind: "audio" | "cover" | "video"; file: File } => item.file instanceof File && item.file.size > 0);
    if (!files.length) { setError("Choose an audio master, cover artwork, or release video."); return; }

    setBusy(true);
    setError("");
    for (const item of files) {
      const payload = new FormData();
      payload.set("releaseId", releaseId);
      payload.set("kind", item.kind);
      payload.set("file", item.file);
      const response = await fetch("/api/artist/media", { method: "POST", body: payload });
      const data = await response.json() as { media?: WorkspaceMedia; error?: string };
      if (!response.ok || !data.media) {
        setError(data.error ?? `${item.kind} upload failed.`);
        setBusy(false);
        return;
      }
      setMediaRows((current) => [...current.filter((media) => media.releaseId !== releaseId || media.kind !== item.kind), data.media as WorkspaceMedia]);
    }
    setReleaseRows((current) => current.map((release) => release.id === releaseId ? { ...release, approvalStatus: "pending", reviewNote: null } : release));
    setMessage("Release media uploaded and returned to the review queue.");
    setBusy(false);
    setMediaOpen(false);
  }

  async function uploadProfileMedia(event: FormEvent<HTMLInputElement>, artistProfileId: string, kind: "profile" | "cover") {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    const payload = new FormData();
    payload.set("artistProfileId", artistProfileId);
    payload.set("kind", kind);
    payload.set("file", file);
    const response = await fetch("/api/artist/profile-media", { method: "POST", body: payload });
    const data = await response.json() as { profilePhotoUrl?: string; coverImageUrl?: string; error?: string };
    const mediaUrl = kind === "profile" ? data.profilePhotoUrl : data.coverImageUrl;
    if (!response.ok || !mediaUrl) {
      setError(data.error ?? `${kind === "profile" ? "Profile photo" : "Cover image"} upload failed.`);
      setBusy(false);
      return;
    }
    setProfileRows((current) => current.map((profile) => profile.id === artistProfileId ? { ...profile, ...(kind === "profile" ? { profilePhotoUrl: mediaUrl } : { coverImageUrl: mediaUrl }) } : profile));
    setMessage(`${kind === "profile" ? "Profile photo" : "Cover image"} updated.`);
    setBusy(false);
  }

  async function resubmitRelease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!releaseEditOpen) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/artist/releases/${releaseEditOpen.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        slug: form.get("slug"),
        featuringArtist: form.get("featuringArtist"),
        genre: form.get("genre"),
        region: form.get("region"),
        discoveryLane: form.get("discoveryLane"),
        aiClassification: form.get("aiClassification"),
        mood: form.get("mood"),
        durationSeconds: form.get("durationSeconds") ? Number(form.get("durationSeconds")) : null,
        explicitStatus: form.get("explicitStatus"),
        rightsConfirmed: form.get("rightsConfirmed") === "on",
        aiDisclosure: form.get("aiDisclosure"),
        submissionNotes: form.get("submissionNotes"),
      }),
    });
    const data = await response.json() as { release?: WorkspaceRelease; error?: string };
    if (!response.ok || !data.release) {
      setError(data.error ?? "The release could not be resubmitted.");
      setBusy(false);
      return;
    }
    setReleaseRows((current) => current.map((release) => release.id === data.release?.id ? { ...release, ...data.release } : release));
    setMessage(`${data.release.title} was returned to private review.`);
    setBusy(false);
    setReleaseEditOpen(null);
  }

  async function submitStagePerformance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/artist/stage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(stageSubmissionPayload(form)),
    });
    const data = await response.json() as { performance?: WorkspaceStagePerformance; error?: string };
    if (!response.ok || !data.performance) {
      setError(data.error ?? "The Stage performance could not be submitted.");
      setBusy(false);
      return;
    }
    setStageRows((current) => [...current, data.performance as WorkspaceStagePerformance]);
    setMessage(`${data.performance.title} was submitted to the Stage review queue.`);
    setBusy(false);
    setStageOpen(false);
  }

  async function resubmitStagePerformance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stageEditOpen) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/artist/stage/${stageEditOpen.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(stageSubmissionPayload(new FormData(event.currentTarget))),
    });
    const data = await response.json() as { performance?: WorkspaceStagePerformance; error?: string };
    if (!response.ok || !data.performance) {
      setError(data.error ?? "The Stage performance could not be resubmitted.");
      setBusy(false);
      return;
    }
    setStageRows((current) => current.map((performance) => performance.id === data.performance?.id ? { ...performance, ...data.performance } : performance));
    setMessage(`${data.performance.title} was returned to the Stage review queue.`);
    setBusy(false);
    setStageEditOpen(null);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profileOpen) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/artist/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        artistProfileId: profileOpen.id,
        biography: form.get("biography"),
        countryRegion: form.get("countryRegion"),
        primaryGenre: form.get("primaryGenre"),
        websiteUrl: form.get("websiteUrl"),
        instagramUrl: form.get("instagramUrl"),
        youtubeUrl: form.get("youtubeUrl"),
      }),
    });
    const data = await response.json() as { profile?: WorkspaceProfile; error?: string };
    if (!response.ok || !data.profile) {
      setError(data.error ?? "The profile could not be saved.");
      setBusy(false);
      return;
    }
    setProfileRows((current) => current.map((profile) => profile.id === data.profile?.id ? { ...profile, ...data.profile } : profile));
    setMessage("Artist profile updated.");
    setBusy(false);
    setProfileOpen(null);
  }

  return (
    <main className="artist-workspace">
      <header className="artist-workspace-header">
        <Link href="/" className="admin-brand" aria-label="Back to ChuneSide">
          <Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority />
        </Link>
        <div><span><BriefcaseBusiness /> Artist &amp; Studio workspace</span><h1>Your music desk</h1><p>Welcome, {displayName}. Review profile readiness and send release metadata to ChuneSide for approval.</p></div>
      </header>

      {profileRows.length ? (
        <>
          <section className="artist-workspace-toolbar">
            <div><strong>{profileRows.length}</strong><span>Linked {profileRows.length === 1 ? "profile" : "profiles"}</span></div>
            <div><strong>{releaseRows.filter((release) => release.approvalStatus === "pending").length}</strong><span>Awaiting review</span></div>
            <div><strong>{releaseRows.filter((release) => release.approvalStatus === "approved").length}</strong><span>Approved</span></div>
            <div className="workspace-toolbar-actions">{mediaUploadsAvailable && <Button variant="outline" onClick={() => setMediaOpen(true)} disabled={!releaseRows.length}><Upload /> Upload media</Button>}{stageSubmissionsAvailable && <Button variant="outline" onClick={() => setStageOpen(true)}><PlaySquare /> Submit Stage</Button>}<Button onClick={() => setOpen(true)}><Plus /> Submit release</Button></div>
          </section>
          {message && <p className="admin-message" role="status">{message}</p>}
          <section className="workspace-profile-list">
            {profileRows.map((profile) => (
              <article key={profile.id}>
                <div className="workspace-profile-avatar" aria-hidden="true" style={profile.profilePhotoUrl ? { backgroundImage: "url(" + JSON.stringify(profile.profilePhotoUrl) + ")" } : undefined}>
                  {!profile.profilePhotoUrl && <b>{profile.stageName.slice(0, 2).toUpperCase()}</b>}
                </div>
                <div><h2>{profile.stageName} {profile.verificationStatus === "verified" && <BadgeCheck />}</h2><p>{profile.primaryGenre} · {profile.countryRegion}</p><small>{profile.visibility} · {profile.verificationStatus}</small></div>
                {mediaUploadsAvailable && <div className="workspace-media-upload-actions"><label className="workspace-photo-upload" title="Upload profile photo"><Upload /><span>Photo</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => uploadProfileMedia(event, profile.id, "profile")} /></label><label className="workspace-photo-upload" title="Upload cover image"><Upload /><span>Cover</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => uploadProfileMedia(event, profile.id, "cover")} /></label></div>}
                <div className="workspace-profile-actions"><Button variant="outline" onClick={() => setProfileOpen(profile)}><Edit3 /> Edit profile</Button><Button asChild variant="outline"><Link href={"/artists/" + profile.slug}>View profile</Link></Button></div>
              </article>
            ))}
          </section>
          <section className="workspace-ai-policy" aria-label="AI submission limits">
            <div className="catalog-section-heading"><Bot /><div><h2>AI submission limits</h2><p>Current policy shown before you submit AI-assisted or AI-generated music.</p></div></div>
            <div className="workspace-ai-policy-grid">
              {profileRows.map((profile) => {
                const policy = policyByProfile.get(profile.id);
                return <article key={profile.id}>
                  <strong>{profile.stageName}</strong>
                  <p>{aiPolicyText(policy)}</p>
                  <small>{policy?.exceptionId ? "Artist exception active" : "Global policy"} · {policy?.adminOverrideEnabled ? "Admin override available" : "No admin override"}</small>
                </article>;
              })}
            </div>
          </section>
          <section className="workspace-release-section">
            <div className="catalog-section-heading"><Disc3 /><div><h2>Release activity</h2><p>Only ChuneSide administrators can approve and publish submitted records.</p></div></div>
            <div className="workspace-release-list">
              {releaseRows.map((release) => (
                <article key={release.id}>
                  <span>{release.legacyTrackId ? String(release.legacyTrackId).padStart(2, "0") : "--"}</span>
                  <div><h3>{release.title}</h3><p>{profileNames.get(release.artistProfileId)} · {release.genre}</p>{release.reviewNote && <em>{release.reviewNote}</em>}</div>
                  <small className="workspace-media-state"><span><FileAudio /> {mediaRows.some((media) => media.releaseId === release.id && media.kind === "audio") ? "Audio ready" : "No audio"}</span><span><ImageIcon /> {mediaRows.some((media) => media.releaseId === release.id && media.kind === "cover") ? "Cover ready" : "No cover"}</span><span><Video /> {mediaRows.some((media) => media.releaseId === release.id && media.kind === "video") ? "Video ready" : "No video"}</span></small>
                  <strong className={"workspace-status " + release.approvalStatus}>{release.approvalStatus}</strong>
                  {release.approvalStatus === "rejected" && <Button type="button" variant="outline" size="sm" className="workspace-resubmit-button" onClick={() => { setError(""); setReleaseEditOpen(release); }}><Edit3 /> Correct</Button>}
                </article>
              ))}
              {!releaseRows.length && <div className="catalog-empty"><Disc3 /><p>No releases have been submitted from this workspace.</p></div>}
            </div>
          </section>
          {stageSubmissionsAvailable && <section className="workspace-release-section workspace-stage-submissions">
            <div className="catalog-section-heading"><PlaySquare /><div><h2>Stage submissions</h2><p>Consented performances remain private until a ChuneSide administrator reviews and publishes them.</p></div></div>
            <div className="workspace-release-list">
              {stageRows.map((performance) => <article key={performance.id}><span>ST</span><div><h3>{performance.title}</h3><p>{profileNames.get(performance.artistProfileId)} · {performance.genre} · {performance.region}</p>{performance.status === "rejected" && performance.reviewNote && <em>{performance.reviewNote}</em>}</div><small>{performance.performanceDate ? new Date(performance.performanceDate).toLocaleDateString() : "Date not set"}</small><strong className={"workspace-status " + performance.status}>{performance.status.replaceAll("_", " ")}</strong>{performance.status === "rejected" && <Button type="button" variant="outline" size="sm" className="workspace-resubmit-button" onClick={() => { setError(""); setStageEditOpen(performance); }}><Edit3 /> Correct</Button>}</article>)}
              {!stageRows.length && <div className="catalog-empty"><PlaySquare /><p>No Stage performances have been submitted from this workspace.</p></div>}
            </div>
          </section>}
        </>
      ) : (
        <section className="artist-workspace-empty">
          <BriefcaseBusiness />
          <h2>No artist profile is linked yet</h2>
          <p>An administrator can link your Artist or Studio account from Catalogue → Edit artist → Owner account.</p>
          <Button asChild variant="outline"><Link href="/">Return to ChuneSide</Link></Button>
        </section>
      )}

      <ReleaseDialog open={open} profiles={profiles} busy={busy} error={error} onClose={() => setOpen(false)} onSubmit={submitRelease} />
      <MediaDialog open={mediaOpen} releases={releaseRows.filter((release) => !["approved", "disabled"].includes(release.approvalStatus))} busy={busy} error={error} onClose={() => setMediaOpen(false)} onSubmit={uploadMedia} />
      <ProfileDialog profile={profileOpen} busy={busy} error={error} onClose={() => setProfileOpen(null)} onSubmit={saveProfile} />
      <ReleaseCorrectionDialog release={releaseEditOpen} busy={busy} error={error} onClose={() => setReleaseEditOpen(null)} onSubmit={resubmitRelease} />
      <StageSubmissionDialog open={stageOpen} profiles={profileRows} busy={busy} error={error} onClose={() => setStageOpen(false)} onSubmit={submitStagePerformance} />
      <StageSubmissionDialog open={Boolean(stageEditOpen)} profiles={profileRows} performance={stageEditOpen} busy={busy} error={error} onClose={() => setStageEditOpen(null)} onSubmit={resubmitStagePerformance} />
    </main>
  );
}

function ProfileDialog({ profile, busy, error, onClose, onSubmit }: { profile: WorkspaceProfile | null; busy: boolean; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const links = readSocialLinks(profile?.socialLinksJson);
  return <Dialog open={Boolean(profile)} onOpenChange={(next) => !next && onClose()}>
    <DialogContent className="catalog-editor-dialog">
      <DialogHeader><DialogTitle>Edit artist profile</DialogTitle><DialogDescription>Keep your public artist details current. Name, verification, visibility, and ownership remain administrator-controlled.</DialogDescription></DialogHeader>
      {profile && <form className="catalog-editor-form" onSubmit={onSubmit}>
        <div className="catalog-form-grid">
          <Field label="Country or region"><Input name="countryRegion" required maxLength={120} defaultValue={profile.countryRegion} /></Field>
          <Field label="Primary genre"><Input name="primaryGenre" required maxLength={80} defaultValue={profile.primaryGenre} /></Field>
          <Field label="Website"><Input name="websiteUrl" type="url" defaultValue={links.Website ?? ""} /></Field>
          <Field label="Instagram"><Input name="instagramUrl" type="url" defaultValue={links.Instagram ?? ""} /></Field>
          <Field label="YouTube"><Input name="youtubeUrl" type="url" defaultValue={links.YouTube ?? ""} /></Field>
          <Field label="Biography" wide><Textarea name="biography" maxLength={2000} defaultValue={profile.biography} /></Field>
        </div>
        {error && <p className="catalog-editor-error" role="alert">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="catalog-spinner" /> : <Edit3 />} Save profile</Button></DialogFooter>
      </form>}
    </DialogContent>
  </Dialog>;
}

function MediaDialog({ open, releases, busy, error, onClose, onSubmit }: { open: boolean; releases: WorkspaceRelease[]; busy: boolean; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="catalog-editor-dialog">
        <DialogHeader><DialogTitle>Upload release media</DialogTitle><DialogDescription>Audio, artwork, and video remain private in R2 while the release is reviewed. Uploading a replacement returns the release to pending review.</DialogDescription></DialogHeader>
        <form className="catalog-editor-form" onSubmit={onSubmit}>
          <Field label="Release"><Select name="releaseId" options={releases.map((release) => [release.id, release.title])} /></Field>
          <div className="catalog-form-grid">
            <Field label="Audio master (40 MB max)"><Input name="audio" type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/ogg" /></Field>
            <Field label="Cover artwork (8 MB max)"><Input name="cover" type="file" accept="image/jpeg,image/png,image/webp" /></Field>
            <Field label="Release video (optional, 100 MB max)"><Input name="video" type="file" accept="video/mp4,video/webm,video/quicktime" /></Field>
          </div>
          {error && <p className="catalog-editor-error" role="alert">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !releases.length}>{busy ? <LoaderCircle className="catalog-spinner" /> : <Upload />} Upload media</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReleaseDialog({ open, profiles, busy, error, onClose, onSubmit }: {
  open: boolean;
  profiles: WorkspaceProfile[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="catalog-editor-dialog">
        <DialogHeader><DialogTitle>Submit a release</DialogTitle><DialogDescription>Submit metadata for human review, then attach audio and artwork from the upload panel before approval.</DialogDescription></DialogHeader>
        <form className="catalog-editor-form" onSubmit={onSubmit}>
          <div className="catalog-form-grid">
            <Field label="Artist"><Select name="artistProfileId" options={profiles.map((profile) => [profile.id, profile.stageName])} /></Field>
            <Field label="Release title"><Input name="title" required maxLength={160} /></Field>
            <Field label="Release slug"><Input name="slug" required maxLength={80} placeholder="release-title" /></Field>
            <Field label="Featuring artist"><Input name="featuringArtist" maxLength={160} /></Field>
            <Field label="Genre"><Input name="genre" required maxLength={80} /></Field>
            <Field label="Country or region"><Input name="region" required maxLength={120} /></Field>
            <Field label="Discovery lane"><Select name="discoveryLane" options={["wadadli", "caribbean", "ai", "world"]} /></Field>
            <Field label="Creation disclosure"><Select name="creationType" options={[["artist_made", "Artist-made"], ["ai_assisted", "AI-assisted"]]} /></Field>
            <Field label="AI classification"><Select name="aiClassification" options={[["human_created", "Human-created"], ["ai_assisted", "AI-assisted"], ["primarily_ai_generated", "Primarily AI-generated"], ["classification_pending", "Classification pending"]]} /></Field>
            <Field label="Mood"><Input name="mood" maxLength={120} /></Field>
            <Field label="Duration in seconds"><Input name="durationSeconds" type="number" min={1} max={86400} /></Field>
            <Field label="Content label"><Select name="explicitStatus" options={["clean", "explicit"]} /></Field>
            <Field label="AI use disclosure"><Textarea name="aiDisclosure" maxLength={1000} placeholder="Required for AI-assisted releases: describe the tools used and what they contributed." /></Field>
            <Field label="Submission notes"><Textarea name="submissionNotes" maxLength={1000} placeholder="Optional context for the ChuneSide review team." /></Field>
          </div>
          <label className="catalog-check rights-confirmation"><input name="rightsConfirmed" type="checkbox" required /><span>I confirm I own or have permission to use the music, samples, artwork, voices, and likenesses in this submission.</span></label>
          {error && <p className="catalog-editor-error" role="alert">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="catalog-spinner" /> : <Send />} Submit for review</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReleaseCorrectionDialog({ release, busy, error, onClose, onSubmit }: { release: WorkspaceRelease | null; busy: boolean; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <Dialog open={Boolean(release)} onOpenChange={(next) => !next && onClose()}>
    <DialogContent className="catalog-editor-dialog">
      <DialogHeader><DialogTitle>Correct and resubmit</DialogTitle><DialogDescription>{release?.reviewNote ?? "Update the release details, then return it to private human review."}</DialogDescription></DialogHeader>
      {release && <form className="catalog-editor-form" onSubmit={onSubmit}>
        <div className="catalog-form-grid">
          <Field label="Release title"><Input name="title" required maxLength={160} defaultValue={release.title} /></Field>
          <Field label="Release slug"><Input name="slug" required maxLength={80} defaultValue={release.slug} /></Field>
          <Field label="Featuring artist"><Input name="featuringArtist" maxLength={160} defaultValue={release.featuringArtist ?? ""} /></Field>
          <Field label="Genre"><Input name="genre" required maxLength={80} defaultValue={release.genre} /></Field>
          <Field label="Country or region"><Input name="region" required maxLength={120} defaultValue={release.region} /></Field>
          <Field label="Discovery lane"><Select name="discoveryLane" options={["wadadli", "caribbean", "ai", "world"]} defaultValue={release.discoveryLane} /></Field>
          <Field label="AI classification"><Select name="aiClassification" options={[["human_created", "Human-created"], ["ai_assisted", "AI-assisted"], ["primarily_ai_generated", "Primarily AI-generated"], ["classification_pending", "Classification pending"]]} defaultValue={release.aiClassification} /></Field>
          <Field label="Mood"><Input name="mood" maxLength={120} defaultValue={release.mood ?? ""} /></Field>
          <Field label="Duration in seconds"><Input name="durationSeconds" type="number" min={1} max={86400} defaultValue={release.durationSeconds ?? ""} /></Field>
          <Field label="Content label"><Select name="explicitStatus" options={["clean", "explicit"]} defaultValue={release.explicitStatus} /></Field>
          <Field label="AI use disclosure"><Textarea name="aiDisclosure" maxLength={1000} defaultValue={release.aiDisclosure ?? ""} /></Field>
          <Field label="Submission notes"><Textarea name="submissionNotes" maxLength={1000} defaultValue={release.submissionNotes ?? ""} /></Field>
        </div>
        <label className="catalog-check rights-confirmation"><input name="rightsConfirmed" type="checkbox" required defaultChecked={release.rightsConfirmed} /><span>I confirm I own or have permission to use the music, samples, artwork, voices, and likenesses in this submission.</span></label>
        {error && <p className="catalog-editor-error" role="alert">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="catalog-spinner" /> : <Send />} Return to review</Button></DialogFooter>
      </form>}
    </DialogContent>
  </Dialog>;
}

function StageSubmissionDialog({ open, profiles, performance, busy, error, onClose, onSubmit }: { open: boolean; profiles: WorkspaceProfile[]; performance?: WorkspaceStagePerformance | null; busy: boolean; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
    <DialogContent className="catalog-editor-dialog stage-editor-dialog">
      <DialogHeader><DialogTitle>{performance ? "Correct and resubmit Stage performance" : "Submit a Stage performance"}</DialogTitle><DialogDescription>{performance ? "Correct the performance details, then return it to private ChuneSide review." : "Submit a completed YouTube performance for private review. ChuneSide will not publish it until the review is complete."}</DialogDescription></DialogHeader>
      <form className="catalog-editor-form" onSubmit={onSubmit}>
        <div className="catalog-form-grid">
          <Field label="Artist"><Select name="artistProfileId" options={profiles.map((profile) => [profile.id, profile.stageName])} defaultValue={performance?.artistProfileId} /></Field>
          <Field label="Performance title"><Input name="title" required maxLength={160} defaultValue={performance?.title ?? ""} /></Field>
          <Field label="Slug"><Input name="slug" required maxLength={90} placeholder="artist-stage-performance" defaultValue={performance?.slug ?? ""} /></Field>
          <Field label="YouTube URL or ID"><Input name="youtubeUrl" required maxLength={500} defaultValue={performance?.youtubeUrl ?? ""} /></Field>
          <Field label="Thumbnail URL"><Input name="thumbnailUrl" type="url" defaultValue={performance?.thumbnailUrl ?? ""} /></Field>
          <Field label="Duration minutes"><Input name="durationMinutes" type="number" min={1} max={180} defaultValue={performance?.durationMinutes ?? ""} /></Field>
          <Field label="Genre"><Input name="genre" required maxLength={80} defaultValue={performance?.genre ?? ""} /></Field>
          <Field label="Region"><Input name="region" required maxLength={120} defaultValue={performance?.region ?? ""} /></Field>
          <Field label="Performance date"><Input name="performanceDate" type="datetime-local" defaultValue={dateTimeLocal(performance?.performanceDate)} /></Field>
          <Field label="Songs performed" wide><Textarea name="songsPerformed" maxLength={1000} defaultValue={songsText(performance?.songsPerformedJson)} placeholder={"Song one\nSong two\nSong three"} /></Field>
          <Field label="Description" wide><Textarea name="description" maxLength={2000} defaultValue={performance?.description ?? ""} /></Field>
          <Field label="Submission context" wide><Textarea name="originalSubmissionInfo" maxLength={2000} defaultValue={performance?.originalSubmissionInfo ?? ""} placeholder="Optional information for the Stage review team." /></Field>
        </div>
        <label className="catalog-check rights-confirmation"><input name="artistConsent" type="checkbox" required defaultChecked={performance ? true : undefined} /><span>I consent to ChuneSide reviewing this performance and, if approved, publishing it on ChuneSide Stage and potential official ChuneSide YouTube channels.</span></label>
        {error && <p className="catalog-editor-error" role="alert">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="catalog-spinner" /> : <Send />} {performance ? "Return to review" : "Submit to Stage"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="catalog-field"><span>{label}</span>{children}</label>;
}

function Select({ name, options, defaultValue }: { name: string; options: Array<string | [string, string]>; defaultValue?: string }) {
  return <NativeSelect name={name} required defaultValue={defaultValue}>{options.map((option) => {
    const [value, label] = Array.isArray(option) ? option : [option, option.replaceAll("_", " ")];
    return <NativeSelectOption value={value} key={value}>{label}</NativeSelectOption>;
  })}</NativeSelect>;
}

function aiPolicyText(policy?: AiPolicySummary) {
  if (!policy) return "One qualifying AI-generated release every 14 days while the policy is loading.";
  if (!policy.restrictionEnabled) return "AI submission throttling is currently off for this artist.";
  const scope = policy.scope === "both"
    ? "AI-assisted and primarily AI-generated releases"
    : policy.scope === "ai_assisted"
      ? "AI-assisted releases"
      : "primarily AI-generated releases";
  return `${policy.trackLimit} ${policy.trackLimit === 1 ? "qualifying release" : "qualifying releases"} every ${policy.periodDays} ${policy.periodDays === 1 ? "day" : "days"} for ${scope}.`;
}

function readSocialLinks(value?: string) {
  try {
    const parsed = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function stageSubmissionPayload(form: FormData) {
  return {
    artistProfileId: form.get("artistProfileId"),
    title: form.get("title"),
    slug: form.get("slug"),
    description: form.get("description"),
    youtubeUrl: form.get("youtubeUrl"),
    thumbnailUrl: form.get("thumbnailUrl"),
    durationMinutes: form.get("durationMinutes") ? Number(form.get("durationMinutes")) : null,
    songsPerformed: form.get("songsPerformed"),
    genre: form.get("genre"),
    region: form.get("region"),
    performanceDate: form.get("performanceDate"),
    originalSubmissionInfo: form.get("originalSubmissionInfo"),
    artistConsent: form.get("artistConsent") === "on",
  };
}

function songsText(value?: string | null) {
  try {
    const songs = JSON.parse(value ?? "[]");
    return Array.isArray(songs) ? songs.filter((song) => typeof song === "string").join("\n") : "";
  } catch {
    return "";
  }
}

function dateTimeLocal(value?: string | null) {
  return value ? value.slice(0, 16) : "";
}
