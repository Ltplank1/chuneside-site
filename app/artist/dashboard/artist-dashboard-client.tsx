"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Bell, Bot, BriefcaseBusiness, ChevronRight, Disc3, Edit3, FileAudio, ImageIcon, KeyRound, LoaderCircle, PlaySquare, Plus, Send, Trash2, Upload, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { PasswordInput } from "@/app/auth/password-input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { commonCountries, countryOptions, genrePresets, moodPresets } from "@/lib/submission-options";

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
  radioReadyConfirmed: boolean;
  aiDisclosure: string | null;
  submissionNotes: string | null;
  reviewNote: string | null;
};

type WorkspaceMedia = {
  id: string;
  releaseId: string;
  kind: "audio" | "cover" | "video";
  variant?: "master" | "stream";
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

export function ArtistDashboardClient({ displayName, profiles, aiPolicies, initialReleases, initialMedia, initialStagePerformances, mediaUploadsAvailable, stageSubmissionsAvailable, pendingDeleteId }: {
  displayName: string;
  profiles: WorkspaceProfile[];
  aiPolicies: AiPolicySummary[];
  initialReleases: WorkspaceRelease[];
  initialMedia: WorkspaceMedia[];
  initialStagePerformances: WorkspaceStagePerformance[];
  mediaUploadsAvailable: boolean;
  stageSubmissionsAvailable: boolean;
  pendingDeleteId?: string;
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
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceRelease | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteVerification, setDeleteVerification] = useState<"password" | "google" | "google-verified">("password");
  const [notificationRead, setNotificationRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const profileNames = new Map(profileRows.map((profile) => [profile.id, profile.stageName]));
  const policyByProfile = new Map(aiPolicies.map((policy) => [policy.artistProfileId, policy]));
  const reviewNotifications = releaseRows.filter((release) => release.approvalStatus === "rejected" && release.reviewNote || release.approvalStatus === "approved");

  useEffect(() => {
    setNotificationRead(window.sessionStorage.getItem("chuneside-review-notification-read") === "true");
  }, []);

  function openReviewNotifications() {
    setNotificationRead(true);
    window.sessionStorage.setItem("chuneside-review-notification-read", "true");
    document.getElementById("release-activity")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    const release = pendingDeleteId ? releaseRows.find((item) => item.id === pendingDeleteId) : null;
    if (release) {
      setDeleteVerification("google-verified");
      setDeleteTarget(release);
    }
  }, [pendingDeleteId, releaseRows]);

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
        genre: presetValue(form, "genre"),
        region: form.get("region"),
        discoveryLane: form.get("discoveryLane"),
        creationType: form.get("creationType"),
        aiClassification: form.get("aiClassification"),
        mood: presetValue(form, "mood"),
        durationSeconds: durationFromForm(form),
        explicitStatus: "clean",
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
    if (form.get("radioReadyConfirmed") !== "on") {
      setError("Confirm that this is the clean radio-ready version before uploading.");
      return;
    }
    const files = (["audio", "cover", "video"] as const).map((kind) => ({ kind, file: form.get(kind) })).filter((item): item is { kind: "audio" | "cover" | "video"; file: File } => item.file instanceof File && item.file.size > 0);
    if (!files.length) { setError("Choose an audio master, cover artwork, or release video."); return; }
    const audioFile = files.find((item) => item.kind === "audio")?.file;
    const isMp3 = Boolean(audioFile && (audioFile.type === "audio/mpeg" || audioFile.name.toLowerCase().endsWith(".mp3")));
    if (isMp3 && form.get("mp3QualityAcknowledged") !== "on") {
      setError("Acknowledge that MP3 quality cannot be restored before uploading an MP3.");
      return;
    }

    setBusy(true);
    setError("");
    for (const item of files) {
      // Keep release files out of multipart form data. Vinext reserves multipart POST
      // requests for Server Actions and applies its small action-body limit before an
      // API route can receive the file. The endpoint still authenticates every upload
      // and streams the bytes privately to R2.
      let detectedDuration: number | null = null;
      try {
        detectedDuration = item.kind === "audio" ? await detectAudioDuration(item.file) : null;
        const isWav = item.kind === "audio" && (item.file.type === "audio/wav" || item.file.type === "audio/x-wav" || item.file.name.toLowerCase().endsWith(".wav"));
        const masterData = await uploadArtistMedia(item.file, releaseId, item.kind, detectedDuration, isWav ? { audioVariant: "master" } : { audioVariant: item.kind === "audio" ? "stream" : undefined, mp3Acknowledged: isMp3 });
        setMediaRows((current) => [...current.filter((media) => media.releaseId !== releaseId || media.kind !== item.kind || (item.kind === "audio" && media.variant !== "stream")), masterData.media]);
        if (item.kind === "audio" && isWav) {
          const mp3 = await encodeWavToMp3(item.file);
          const streamData = await uploadArtistMedia(mp3, releaseId, "audio", detectedDuration, { audioVariant: "stream", sourceMediaId: masterData.media.id });
          setMediaRows((current) => [...current.filter((media) => media.releaseId !== releaseId || media.kind !== "audio" || media.variant !== "stream"), streamData.media]);
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : `${item.kind} upload or WAV conversion failed. Please try again.`);
        setBusy(false);
        return;
      }
      if (item.kind === "audio") {
        if (detectedDuration) setReleaseRows((current) => current.map((release) => release.id === releaseId ? { ...release, durationSeconds: detectedDuration } : release));
      }
    }
    setReleaseRows((current) => current.map((release) => release.id === releaseId ? { ...release, approvalStatus: "pending", reviewNote: null } : release));
    setMessage("Release media uploaded and returned to the review queue.");
    setBusy(false);
    setMediaOpen(false);
  }

  async function deleteRelease(release: WorkspaceRelease) {
    if (!window.confirm(`Delete "${release.title}" permanently? This removes it from ChuneSide and cannot be undone.`)) return;
    setDeletePassword("");
    setDeleteVerification("password");
    setDeleteTarget(release);
    try {
      const { data: { user } } = await (await createSupabaseBrowserClient()).auth.getUser();
      if (user?.app_metadata?.provider === "google") setDeleteVerification("google");
    } catch {
      // Keep the password option available if provider metadata is unavailable.
    }
  }

  async function confirmDeleteRelease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deleteTarget || (deleteVerification === "password" && !deletePassword)) return;
    if (deleteVerification === "google") {
      setBusy(true);
      setError("");
      try {
        const returnTo = `/artist/dashboard?confirmDelete=${encodeURIComponent(deleteTarget.id)}`;
        const { error: oauthError } = await (await createSupabaseBrowserClient()).auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`, queryParams: { prompt: "login" } },
        });
        if (oauthError) throw oauthError;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Google verification could not be started.");
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    setError("");
    if (deleteVerification === "password") {
      try {
        const supabase = await createSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) throw new Error("Sign in again before deleting a release.");
        const { error: passwordError } = await supabase.auth.signInWithPassword({ email: user.email, password: deletePassword });
        if (passwordError) throw new Error("That password was not accepted.");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Password verification failed.");
        setBusy(false);
        return;
      }
    }
    const response = await fetch(`/api/artist/releases/${deleteTarget.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "The release could not be deleted.");
      setBusy(false);
      return;
    }
    setReleaseRows((current) => current.filter((item) => item.id !== deleteTarget.id));
    setMediaRows((current) => current.filter((item) => item.releaseId !== deleteTarget.id));
    setMessage(deleteTarget.title + " was deleted from ChuneSide.");
    setDeleteTarget(null);
    setDeletePassword("");
    setBusy(false);
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
        genre: presetValue(form, "genre"),
        region: form.get("region"),
        discoveryLane: form.get("discoveryLane"),
        aiClassification: form.get("aiClassification"),
        mood: presetValue(form, "mood"),
        durationSeconds: durationFromForm(form),
        explicitStatus: "clean",
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
        spotifyUrl: form.get("spotifyUrl"),
        appleMusicUrl: form.get("appleMusicUrl"),
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
          {reviewNotifications.length > 0 && !notificationRead && <section className="workspace-notification" role="status">
            <Bell />
            <div><strong>{reviewNotifications[0].approvalStatus === "approved" ? "Your release was approved" : reviewNotifications.length === 1 ? "Your release needs attention" : `${reviewNotifications.length} releases need attention`}</strong><p>{reviewNotifications[0].approvalStatus === "approved" ? `${reviewNotifications[0].title} is now live on ChuneSide.` : `${reviewNotifications[0].title} was returned with a reviewer note: ${reviewNotifications[0].reviewNote}`}</p></div>
            <Button type="button" variant="outline" onClick={openReviewNotifications}>View activity <ChevronRight /></Button>
          </section>}
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
          <section className="workspace-release-section" id="release-activity">
            <div className="catalog-section-heading"><Disc3 /><div><h2>Release activity</h2><p>Only ChuneSide administrators can approve and publish submitted records.</p></div></div>
            <div className="workspace-release-list">
              {releaseRows.map((release) => (
                <article key={release.id}>
                  <span>{release.legacyTrackId ? String(release.legacyTrackId).padStart(2, "0") : "--"}</span>
                  <div><h3>{release.title}</h3><p>{profileNames.get(release.artistProfileId)} · {release.genre}</p>{release.reviewNote && <em>{release.reviewNote}</em>}</div>
                  <small className="workspace-media-state"><span><FileAudio /> {mediaRows.some((media) => media.releaseId === release.id && media.kind === "audio") ? "Audio ready" : "No audio"}</span><span><ImageIcon /> {mediaRows.some((media) => media.releaseId === release.id && media.kind === "cover") ? "Cover ready" : "No cover"}</span><span><Video /> {mediaRows.some((media) => media.releaseId === release.id && media.kind === "video") ? "Video ready" : "No video"}</span></small>
                  <strong className={"workspace-status " + release.approvalStatus}>{release.approvalStatus}</strong>
                  {release.approvalStatus === "rejected" && <Button type="button" variant="outline" size="sm" className="workspace-resubmit-button" onClick={() => { setError(""); setReleaseEditOpen(release); }}><Edit3 /> Correct</Button>}
                  <Button type="button" variant="outline" size="sm" className="workspace-resubmit-button workspace-delete-button" disabled={busy} onClick={() => deleteRelease(release)}><Trash2 /> Delete</Button>
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
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(next) => !next && !busy && setDeleteTarget(null)}>
        <DialogContent className="catalog-editor-dialog">
          <DialogHeader><DialogTitle>Confirm release deletion</DialogTitle><DialogDescription>{deleteVerification === "google" ? "Continue with Google to verify your identity before permanently removing " : deleteVerification === "google-verified" ? "Google verification is complete. Click Delete permanently to remove " : "Enter your ChuneSide account password to permanently remove "}{deleteTarget?.title ?? "this release"} from ChuneSide and delete its stored media.</DialogDescription></DialogHeader>
          <form className="catalog-editor-form" onSubmit={confirmDeleteRelease}>
            {deleteVerification === "password" && <><label className="catalog-field"><span>ChuneSide account password</span><PasswordInput value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} autoComplete="current-password" required /></label><Link className="auth-switch" href="/auth/reset-password?returnTo=%2Fartist%2Fdashboard"><KeyRound /> Set or change your ChuneSide password</Link></>}
            {error && <p className="catalog-editor-error" role="alert">{error}</p>}
            <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setDeleteTarget(null)}>Cancel</Button><Button type="submit" className="workspace-delete-button" disabled={busy || (deleteVerification === "password" && !deletePassword)}>{busy ? <LoaderCircle className="catalog-spinner" /> : deleteVerification === "google" ? <KeyRound /> : <Trash2 />} {deleteVerification === "google" ? "Continue with Google" : "Delete permanently"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
          <Field label="Spotify"><Input name="spotifyUrl" type="url" defaultValue={links.Spotify ?? ""} /></Field>
          <Field label="Apple Music"><Input name="appleMusicUrl" type="url" defaultValue={links["Apple Music"] ?? ""} /></Field>
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
          <p className="radio-ready-copy"><strong>Create freely. Submit clean. Get discovered.</strong> ChuneSide is a launch pad for radio, DJs, promoters, and bigger stages. Your submitted files should be the clean, radio-ready version.</p>
          <div className="catalog-form-grid">
            <Field label="Audio master (WAV preferred, 40 MB max)"><Input name="audio" type="file" accept="audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav" /></Field>
            <Field label="Cover artwork (8 MB max)"><Input name="cover" type="file" accept="image/jpeg,image/png,image/webp" /></Field>
            <Field label="Release video (optional, 100 MB max)"><Input name="video" type="file" accept="video/mp4,video/webm,video/quicktime" /></Field>
          </div>
          <label className="catalog-check rights-confirmation"><input name="mp3QualityAcknowledged" type="checkbox" /><span>I understand that MP3 quality cannot be restored. Use MP3 only when a WAV master is unavailable.</span></label>
          <label className="catalog-check rights-confirmation"><input name="radioReadyConfirmed" type="checkbox" required /><span>I confirm these files are the clean, radio-ready version prepared for radio, DJs, promoters, and bigger stages.</span></label>
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
          <p className="radio-ready-copy"><strong>Create freely. Submit clean. Get discovered.</strong> ChuneSide is a launch pad for radio, DJs, promoters, and bigger stages. Your uploaded files must be the clean, radio-ready version.</p>
          <div className="catalog-form-grid">
            <Field label="Artist"><Select name="artistProfileId" options={profiles.map((profile) => [profile.id, profile.stageName])} /></Field>
            <Field label="Release title"><Input name="title" required maxLength={160} /></Field>
            <Field label="Release slug"><Input name="slug" required maxLength={80} placeholder="release-title" /></Field>
            <Field label="Featuring artist"><Input name="featuringArtist" maxLength={160} /></Field>
            <PresetField label="Genre" name="genre" presets={genrePresets} required />
            <CountryField label="Country or region" name="region" required />
            <Field label="Discovery lane"><Select name="discoveryLane" options={["wadadli", "caribbean", "ai", "world"]} /></Field>
            <Field label="Creation disclosure"><Select name="creationType" options={[["artist_made", "Artist-made"], ["ai_assisted", "AI-assisted"]]} /></Field>
            <Field label="AI classification"><Select name="aiClassification" options={[["human_created", "Human-created"], ["ai_assisted", "AI-assisted"], ["primarily_ai_generated", "Primarily AI-generated"], ["classification_pending", "Classification pending"]]} /></Field>
            <PresetField label="Mood" name="mood" presets={moodPresets} />
            <DurationFields />
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
          <PresetField label="Genre" name="genre" presets={genrePresets} required defaultValue={release.genre} />
          <CountryField label="Country or region" name="region" required defaultValue={release.region} />
          <Field label="Discovery lane"><Select name="discoveryLane" options={["wadadli", "caribbean", "ai", "world"]} defaultValue={release.discoveryLane} /></Field>
          <Field label="AI classification"><Select name="aiClassification" options={[["human_created", "Human-created"], ["ai_assisted", "AI-assisted"], ["primarily_ai_generated", "Primarily AI-generated"], ["classification_pending", "Classification pending"]]} defaultValue={release.aiClassification} /></Field>
          <PresetField label="Mood" name="mood" presets={moodPresets} defaultValue={release.mood ?? ""} />
          <DurationFields defaultValue={release.durationSeconds} />
          <Field label="AI use disclosure"><Textarea name="aiDisclosure" maxLength={1000} defaultValue={release.aiDisclosure ?? ""} /></Field>
          <Field label="Submission notes"><Textarea name="submissionNotes" maxLength={1000} defaultValue={release.submissionNotes ?? ""} /></Field>
        </div>
        <p className="radio-ready-copy"><strong>Create freely. Submit clean. Get discovered.</strong> For ChuneSide, resubmit the clean radio-ready version prepared for opportunity.</p>
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
          <Field label="Performance date"><DateTimeInput name="performanceDate" type="datetime-local" defaultValue={dateTimeLocal(performance?.performanceDate)} /></Field>
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

function PresetField({ label, name, presets, required = false, defaultValue = "" }: { label: string; name: string; presets: readonly string[]; required?: boolean; defaultValue?: string }) {
  const isKnown = presets.includes(defaultValue);
  const [choice, setChoice] = useState(isKnown ? defaultValue : defaultValue ? "Other" : "");
  const [other, setOther] = useState(isKnown ? "" : defaultValue);
  return <Field label={label}>
    <Input name={name} list={`${name}-presets`} required={required} maxLength={120} value={choice} placeholder="Search or choose a preset" onChange={(event) => setChoice(event.target.value)} />
    <datalist id={`${name}-presets`}>{presets.map((preset) => <option value={preset} key={preset} />)}<option value="Other" /></datalist>
    {choice === "Other" && <Input name={`${name}Other`} required={required} maxLength={120} value={other} placeholder={`Enter ${label.toLowerCase()}`} onChange={(event) => setOther(event.target.value)} />}
  </Field>;
}

function CountryField({ label, name, required = false, defaultValue = "" }: { label: string; name: string; required?: boolean; defaultValue?: string }) {
  const [options] = useState(() => countryOptions());
  return <Field label={label}>
    <Input name={name} list={`${name}-options`} required={required} maxLength={120} defaultValue={defaultValue} placeholder="Search countries" />
    <datalist id={`${name}-options`}>{[...commonCountries, ...options].filter((value, index, all) => all.indexOf(value) === index).map((country) => <option value={country} key={country} />)}</datalist>
  </Field>;
}

function DurationFields({ defaultValue = null }: { defaultValue?: number | null }) {
  const initial = Math.max(0, defaultValue ?? 0);
  const [minutes, setMinutes] = useState(String(Math.floor(initial / 60)));
  const [seconds, setSeconds] = useState(String(initial % 60).padStart(2, "0"));
  const total = (Number(minutes) || 0) * 60 + (Number(seconds) || 0);
  return <Field label="Duration">
    <div className="duration-inputs">
      <Input name="durationMinutes" type="number" min={0} max={1440} value={minutes} aria-label="Duration minutes" onChange={(event) => setMinutes(event.target.value)} />
      <span>:</span>
      <Input name="durationSecondsPart" type="number" min={0} max={59} value={seconds} aria-label="Duration seconds" onChange={(event) => setSeconds(event.target.value)} />
      <output aria-label="Formatted duration">{formatDuration(total)}</output>
    </div>
    <input type="hidden" name="durationSeconds" value={total || ""} />
    <small className="field-hint">Audio duration is detected automatically when reliable.</small>
  </Field>;
}

function Select({ name, options, defaultValue }: { name: string; options: Array<string | [string, string]>; defaultValue?: string }) {
  return <NativeSelect name={name} required defaultValue={defaultValue}>{options.map((option) => {
    const [value, label] = Array.isArray(option) ? option : [option, option.replaceAll("_", " ")];
    return <NativeSelectOption value={value} key={value}>{label}</NativeSelectOption>;
  })}</NativeSelect>;
}

function durationFromForm(form: FormData) {
  const minuteValue = form.get("durationMinutes");
  const secondValue = form.get("durationSecondsPart");
  if (minuteValue !== null || secondValue !== null) {
    const minutes = Number(minuteValue ?? 0);
    const seconds = Number(secondValue ?? 0);
    const total = Math.max(0, Math.floor(Number.isFinite(minutes) ? minutes : 0) * 60 + Math.floor(Number.isFinite(seconds) ? seconds : 0));
    return total || null;
  }
  const legacy = Number(form.get("durationSeconds") ?? 0);
  return Number.isFinite(legacy) && legacy > 0 ? Math.floor(legacy) : null;
}

function presetValue(form: FormData, name: string) {
  const choice = String(form.get(name) ?? "").trim();
  return choice === "Other" ? String(form.get(`${name}Other`) ?? "").trim() : choice;
}

function formatDuration(totalSeconds: number) {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

async function uploadArtistMedia(file: File, releaseId: string, kind: "audio" | "cover" | "video", durationSeconds: number | null, options: { audioVariant?: "master" | "stream"; sourceMediaId?: string; mp3Acknowledged?: boolean }) {
  const contentType = file.type || (file.name.toLowerCase().endsWith(".wav") ? "audio/wav" : file.name.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "");
  let response: Response;
  try {
    response = await fetch("/api/artist/media", {
      method: "POST",
      headers: {
        "content-type": contentType,
        "x-chuneside-release-id": releaseId,
        "x-chuneside-media-kind": kind,
        "x-chuneside-original-name": encodeURIComponent(file.name),
        "x-chuneside-radio-ready-confirmed": "true",
        ...(durationSeconds ? { "x-chuneside-duration-seconds": String(durationSeconds) } : {}),
        ...(options.audioVariant ? { "x-chuneside-audio-variant": options.audioVariant } : {}),
        ...(options.sourceMediaId ? { "x-chuneside-source-media-id": options.sourceMediaId } : {}),
        ...(options.mp3Acknowledged ? { "x-chuneside-mp3-acknowledged": "true" } : {}),
      },
      body: file,
    });
  } catch {
    throw new Error(`${kind} upload could not reach ChuneSide.`);
  }
  const data = await response.json().catch(() => ({})) as { media?: WorkspaceMedia; error?: string };
  if (!response.ok || !data.media) throw new Error(data.error ?? `${kind} upload failed.`);
  return { media: data.media };
}

async function encodeWavToMp3(file: File) {
  const audioContext = new AudioContext();
  try {
    const decoded = await audioContext.decodeAudioData(await file.arrayBuffer());
    const lame = await import("lamejs");
    const channels = Math.min(decoded.numberOfChannels, 2);
    const encoder = new lame.Mp3Encoder(channels, decoded.sampleRate, 320);
    const left = floatToInt16(decoded.getChannelData(0));
    const right = channels === 2 ? floatToInt16(decoded.getChannelData(1)) : undefined;
    const parts: BlobPart[] = [];
    for (let offset = 0; offset < left.length; offset += 1152) {
      const encoded = encoder.encodeBuffer(left.subarray(offset, offset + 1152), right?.subarray(offset, offset + 1152));
      if (encoded.length) parts.push(Uint8Array.from(encoded));
    }
    const tail = encoder.flush();
    if (tail.length) parts.push(Uint8Array.from(tail));
    return new File(parts, file.name.replace(/\.wav$/i, ".mp3"), { type: "audio/mpeg" });
  } finally {
    await audioContext.close();
  }
}

function floatToInt16(samples: Float32Array) {
  const output = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

async function detectAudioDuration(file: File) {
  if (!file.type.startsWith("audio/") && !/\.(wav|mp3|m4a|ogg)$/i.test(file.name)) return null;
  const url = URL.createObjectURL(file);
  try {
    const duration = await new Promise<number>((resolve) => {
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      audio.onloadedmetadata = () => resolve(audio.duration);
      audio.onerror = () => resolve(0);
      audio.src = url;
    });
    return Number.isFinite(duration) && duration > 0 && duration <= 86400 ? Math.round(duration) : null;
  } finally {
    URL.revokeObjectURL(url);
  }
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
