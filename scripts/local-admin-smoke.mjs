const baseUrl = process.env.CHUNESIDE_SMOKE_BASE_URL ?? "http://localhost:5178";
const testUser = {
  id: process.env.CHUNESIDE_SMOKE_USER_ID ?? "codex-admin-local",
  email: process.env.CHUNESIDE_SMOKE_USER_EMAIL ?? "codex-admin@chuneside.local",
  name: process.env.CHUNESIDE_SMOKE_USER_NAME ?? "Codex Admin",
};
const suffix = Date.now().toString(36);
const headers = {
  "content-type": "application/json",
  "x-chuneside-local-user-id": testUser.id,
  "x-chuneside-local-user-email": testUser.email,
  "x-chuneside-local-user-full-name": testUser.name,
};

async function main() {
  const summary = [];

  const diagnostic = await request("GET", "/api/local-dev-auth-check");
  assert(diagnostic.enabled === true, "Local auth diagnostic must be enabled.");
  assert(diagnostic.localUserEmail === testUser.email, "Local auth headers were not received.");
  summary.push("local auth diagnostic");

  for (const path of ["/admin/accounts", "/admin/catalog", "/admin/feature-flags", "/admin/announcements", "/admin/reviews", "/admin/ai-controls", "/admin/stage", "/admin/audit"]) {
    const response = await requestRaw("GET", path, { authenticated: false, redirect: "manual", expectStatus: 307 });
    assert(response.headers.get("location")?.includes("/signin-with-chatgpt"), `Anonymous Admin route ${path} did not redirect to sign-in.`);
  }
  summary.push("anonymous Admin route redirects");

  await request("POST", "/api/member-state", { action: "like", trackId: 1, artist: "Kaia Rivers" });
  const account = await request("POST", "/api/admin/accounts", {
    memberId: testUser.id,
    accountRole: "admin",
    accountStatus: "active",
    artistVerificationStatus: "verified",
    foundingArtist: false,
    foundingStudioPartner: false,
    monetizationState: "not_applied",
    moderationNote: "Local Admin smoke test account.",
  });
  assert(account.account?.accountRole === "admin", "Local test account was not promoted to admin.");
  summary.push("admin account update");

  for (const [path, marker] of [["/admin/accounts", "Accounts"], ["/admin/reviews", "Review Queue"], ["/admin/ai-controls", "AI Music Controls"], ["/admin/stage", "Stage Management"], ["/admin/audit", "Audit Log"]]) {
    const html = await requestText("GET", path);
    assert(html.includes(marker), `Authorized Admin route ${path} did not render its expected heading.`);
  }
  summary.push("authorized Admin page rendering");

  const notedAccount = await request("POST", "/api/admin/accounts", {
    memberId: testUser.id,
    accountRole: "admin",
    accountStatus: "active",
    artistVerificationStatus: "verified",
    foundingArtist: false,
    foundingStudioPartner: false,
    monetizationState: "not_applied",
    moderationNote: `Private preview note ${suffix}`,
  });
  assert(notedAccount.account?.moderationNote === `Private preview note ${suffix}`, "Private preview account note was not saved.");
  summary.push("account preview note update");

  const seeded = await request("POST", "/api/admin/catalog-seed");
  assert(seeded.artists?.length >= 8, "Baseline artists were not seeded.");
  assert(seeded.releases?.length >= 8, "Baseline releases were not seeded.");
  summary.push("catalog seed");

  const artist = await request("POST", "/api/admin/catalog", {
    entity: "artist",
    ownerMemberId: testUser.id,
    stageName: `Codex Smoke Artist ${suffix}`,
    slug: `codex-smoke-artist-${suffix}`,
    biography: "Local Admin smoke-test artist.",
    countryRegion: "Antigua & Barbuda",
    primaryGenre: "Electronic",
    profilePhotoUrl: "",
    coverImageUrl: "",
    websiteUrl: "",
    instagramUrl: "",
    youtubeUrl: "",
    verificationStatus: "verified",
    foundingArtist: false,
    visibility: "public",
  });
  assert(artist.item?.ownerMemberId === testUser.id, "Smoke artist was not linked to the local test account.");
  summary.push("artist create/link");

  const artistStageSubmission = await request("POST", "/api/artist/stage", {
    artistProfileId: artist.item.id,
    title: `Codex Artist Stage ${suffix}`,
    slug: `codex-artist-stage-${suffix}`,
    description: "Artist-submitted local Stage smoke-test performance.",
    youtubeUrl: "https://youtu.be/zyxwvutsrqp",
    thumbnailUrl: "",
    durationMinutes: 7,
    songsPerformed: "Artist Smoke Song",
    genre: "Electronic",
    region: "Antigua & Barbuda",
    performanceDate: "",
    originalSubmissionInfo: "Submitted from the artist workspace.",
    artistConsent: true,
  });
  assert(artistStageSubmission.performance?.status === "submitted", "Artist Stage submission did not enter the review queue.");
  assert(artistStageSubmission.performance?.artistConsent === true, "Artist Stage submission did not record consent.");
  summary.push("artist Stage submission");
  const rejectedArtistStage = await request("POST", "/api/admin/stage", {
    ...stagePayloadFrom(artistStageSubmission.performance),
    status: "rejected",
    reviewNote: "Correct the performance metadata before resubmitting.",
  });
  assert(rejectedArtistStage.performance?.status === "rejected", "Admin Stage rejection did not set rejected status.");
  const stageAuditHtml = await requestText("GET", "/admin/audit");
  assert(stageAuditHtml.includes("Correct the performance metadata before resubmitting."), "Audit Log did not show the Stage rejection note.");
  summary.push("Stage rejection reason audit");
  const correctedArtistStage = await request("PATCH", `/api/artist/stage/${artistStageSubmission.performance.id}`, {
    title: `Codex Corrected Artist Stage ${suffix}`,
    slug: `codex-corrected-artist-stage-${suffix}`,
    description: "Corrected after Stage review feedback.",
    youtubeUrl: "https://youtu.be/zyxwvutsrqp",
    thumbnailUrl: "",
    durationMinutes: 7,
    songsPerformed: "Artist Smoke Song",
    genre: "Electronic",
    region: "Antigua & Barbuda",
    performanceDate: "",
    originalSubmissionInfo: "Corrected from the artist workspace.",
    artistConsent: true,
  });
  assert(correctedArtistStage.performance?.status === "submitted", "Corrected Stage performance did not return to the review queue.");
  assert(correctedArtistStage.performance?.title === `Codex Corrected Artist Stage ${suffix}`, "Corrected Stage performance did not save its new title.");
  await request("PATCH", `/api/artist/stage/${artistStageSubmission.performance.id}`, {
    title: `Codex Corrected Artist Stage ${suffix}`,
    slug: `codex-corrected-artist-stage-${suffix}`,
    description: "Corrected after Stage review feedback.",
    youtubeUrl: "https://youtu.be/zyxwvutsrqp",
    thumbnailUrl: "",
    durationMinutes: 7,
    songsPerformed: "Artist Smoke Song",
    genre: "Electronic",
    region: "Antigua & Barbuda",
    performanceDate: "",
    originalSubmissionInfo: "Corrected from the artist workspace.",
    artistConsent: true,
  }, { expectStatus: 409 });
  summary.push("rejected Stage correction and protected resubmission");

  const announcement = await request("POST", "/api/admin/announcements", {
    action: "save",
    message: `Codex smoke announcement ${suffix}`,
    linkUrl: "",
    category: "stage",
    enabled: true,
    sortOrder: 12,
    scrollSpeedSeconds: 28,
    textSize: "medium",
    fontStyle: "bold",
    startAt: "",
    endAt: "",
  });
  assert(announcement.announcement?.message?.includes(suffix), "Announcement was not saved.");
  summary.push("announcement create");

  const pausedAnnouncement = await request("POST", "/api/admin/announcements", {
    action: "save",
    id: announcement.announcement.id,
    message: `${announcement.announcement.message} paused`,
    linkUrl: "",
    category: "stage",
    enabled: false,
    sortOrder: 14,
    scrollSpeedSeconds: 32,
    textSize: "small",
    fontStyle: "wide",
    startAt: "",
    endAt: "",
  });
  assert(pausedAnnouncement.announcement?.enabled === false, "Announcement update did not pause the item.");
  assert(pausedAnnouncement.announcement?.fontStyle === "wide", "Announcement update did not persist style changes.");
  summary.push("announcement update");

  const aiSettings = await request("POST", "/api/admin/ai-controls", {
    action: "settings",
    restrictionEnabled: true,
    trackLimit: 1,
    periodDays: 14,
    scope: "ai_generated",
    adminOverrideEnabled: true,
  });
  assert(aiSettings.settings?.trackLimit === 1, "AI settings were not saved.");
  summary.push("AI settings update");

  const stageDraft = await request("POST", "/api/admin/stage", {
    action: "save",
    artistProfileId: artist.item.id,
    slug: `codex-stage-smoke-${suffix}`,
    title: `Codex Stage Smoke ${suffix}`,
    description: "Local Stage smoke-test performance.",
    youtubeUrl: "https://youtu.be/abcdefghijk",
    thumbnailUrl: "",
    durationMinutes: 12,
    songsPerformed: "Opening Chune, Second Chune",
    genre: artist.item.primaryGenre,
    region: artist.item.countryRegion,
    performanceDate: "",
    status: "draft",
    artistConsent: false,
    originalSubmissionInfo: "Created by local Admin smoke script.",
    homePlacement: "none",
    featureStartAt: "",
    featureEndAt: "",
    stageFeeLabel: "",
    feeStatus: "not_required",
  });
  assert(stageDraft.performance?.youtubeVideoId === "abcdefghijk", "Stage YouTube ID was not parsed.");
  summary.push("Stage draft create");

  const rejectedStage = await request("POST", "/api/admin/stage", {
    ...stagePayloadFrom(stageDraft.performance),
    status: "published",
    artistConsent: false,
    homePlacement: "featured",
  }, { expectStatus: 400 });
  assert(/Artist consent/.test(rejectedStage.error), "Stage publication without consent was not blocked.");
  summary.push("Stage consent rejection");

  const publishedStage = await request("POST", "/api/admin/stage", {
    ...stagePayloadFrom(stageDraft.performance),
    status: "published",
    artistConsent: true,
    homePlacement: "featured",
  });
  assert(publishedStage.performance?.status === "published", "Consented Stage performance was not published.");
  summary.push("Stage consented publication");

  const adminStageHtml = await requestText("GET", "/stage");
  assert(adminStageHtml.includes(`Codex Stage Smoke ${suffix}`), "Admin-test Stage page did not show the published smoke performance.");
  summary.push("Admin-test public Stage visibility");

  const stageFeed = await request("GET", `/api/stage?limit=3&q=${encodeURIComponent(suffix)}`);
  const stageFeedItem = stageFeed.performances?.find((performance) => performance.slug === stageDraft.performance.slug);
  assert(stageFeedItem, "Stage feed did not include the published smoke performance.");
  summary.push("Stage homepage feed");

  const stageView = await request("POST", "/api/stage", {
    action: "view",
    slug: stageDraft.performance.slug,
  });
  assert(stageView.viewCount === stageFeedItem.viewCount + 1, "Stage view counter did not increment.");
  const updatedStageFeed = await request("GET", `/api/stage?limit=3&q=${encodeURIComponent(suffix)}`);
  assert(updatedStageFeed.performances?.find((performance) => performance.slug === stageDraft.performance.slug)?.viewCount === stageView.viewCount, "Stage feed did not return the updated view count.");
  summary.push("Stage view counter");

  const filteredStageHtml = await requestText("GET", `/stage?q=${encodeURIComponent(suffix)}`);
  assert(filteredStageHtml.includes(`Codex Stage Smoke ${suffix}`), "Filtered Stage page did not show the matching smoke performance.");
  summary.push("Stage filtered browsing");

  const archivedStage = await request("POST", "/api/admin/stage", {
    action: "archive",
    id: stageDraft.performance.id,
  });
  assert(archivedStage.performance?.status === "archived", "Stage archive did not set archived status.");
  const archivedStageFeed = await request("GET", `/api/stage?limit=3&q=${encodeURIComponent(suffix)}`);
  assert(!archivedStageFeed.performances?.some((performance) => performance.slug === stageDraft.performance.slug), "Archived Stage performance remained in the public feed.");
  summary.push("Stage archive hides public record");

  const firstSubmission = await request("POST", "/api/artist/releases", {
    artistProfileId: artist.item.id,
    title: `Codex AI Limit One ${suffix}`,
    slug: `codex-ai-limit-one-${suffix}`,
    featuringArtist: "",
    genre: "Electronic",
    region: "Antigua & Barbuda",
    discoveryLane: "ai",
    creationType: "ai_assisted",
    aiClassification: "primarily_ai_generated",
    mood: "Backend smoke test",
    durationSeconds: 126,
    explicitStatus: "clean",
    rightsConfirmed: true,
    aiDisclosure: "Generated for local AI upload limit smoke testing.",
    submissionNotes: "First qualifying AI submission should pass.",
  });
  assert(firstSubmission.release?.approvalStatus === "pending", "First AI submission did not enter pending review.");

  const missingMediaReview = await request("POST", "/api/admin/reviews", {
    releaseId: firstSubmission.release.id,
    decision: "approve",
    reviewNote: "Attempting approval before media upload.",
  }, { expectStatus: 400 });
  assert(missingMediaReview.blockers?.includes("An audio master is required."), "Review did not block approval without an audio master.");
  assert(missingMediaReview.blockers?.includes("Cover artwork is required."), "Review did not block approval without cover artwork.");
  summary.push("review blocks missing media");

  const audioMedia = await uploadMedia(firstSubmission.release.id, "audio", makeAudioFile(suffix));
  assert(audioMedia.media?.kind === "audio", "Audio upload did not save media metadata.");
  const coverMedia = await uploadMedia(firstSubmission.release.id, "cover", makeCoverFile(suffix));
  assert(coverMedia.media?.kind === "cover", "Cover upload did not save media metadata.");
  summary.push("artist media upload");

  await requestRaw("GET", `/api/media/${audioMedia.media.id}`, { expectStatus: 403, authenticated: false });
  summary.push("pending media remains private");

  const approvedRelease = await request("POST", "/api/admin/reviews", {
    releaseId: firstSubmission.release.id,
    decision: "approve",
    reviewNote: "Approved by local Admin smoke test.",
  });
  assert(approvedRelease.release?.approvalStatus === "approved", "Review approval did not approve the release.");
  assert(approvedRelease.release?.audioUrl?.startsWith("/api/media/"), "Approved release did not receive an audio URL.");
  assert(approvedRelease.release?.coverImageUrl?.startsWith("/api/media/"), "Approved release did not receive a cover image URL.");
  summary.push("review approval publishes media");

  const catalogue = await request("GET", "/api/catalog");
  const approvedTrack = catalogue.tracks?.find((track) => track.title === firstSubmission.release.title);
  assert(approvedTrack?.audioUrl?.startsWith("/api/media/"), "Approved release did not appear in the catalogue with audio.");
  assert(approvedTrack?.coverImageUrl?.startsWith("/api/media/"), "Approved release did not appear in the catalogue with cover art.");
  summary.push("approved release catalogue playback");

  const publicAudio = await requestRaw("GET", `/api/media/${audioMedia.media.id}`, { authenticated: false });
  assert(publicAudio.headers.get("content-type")?.startsWith("audio/mpeg"), "Approved audio was not publicly delivered with its media type.");
  const audioRange = await requestRaw("GET", `/api/media/${audioMedia.media.id}`, { authenticated: false, headers: { range: "bytes=0-7" }, expectStatus: 206 });
  assert(audioRange.headers.get("content-range")?.startsWith("bytes 0-7/"), "Approved audio did not return the requested byte range.");
  const invalidAudioRange = await requestRaw("GET", `/api/media/${audioMedia.media.id}`, { authenticated: false, headers: { range: "bytes=999-1000" }, expectStatus: 416 });
  assert(invalidAudioRange.headers.get("content-range")?.startsWith("bytes */"), "Invalid audio range did not return the media size in its 416 response.");
  const publicCover = await requestRaw("GET", `/api/media/${coverMedia.media.id}`, { authenticated: false });
  assert(publicCover.headers.get("content-type")?.startsWith("image/png"), "Approved cover was not publicly delivered with its media type.");
  summary.push("approved media public delivery");

  const missingTakedownNote = await request("POST", "/api/admin/reviews", { releaseId: firstSubmission.release.id, decision: "takedown", reviewNote: "" }, { expectStatus: 400 });
  assert(/note/i.test(missingTakedownNote.error), "API allowed a release takedown without a reason.");
  summary.push("takedown reason enforcement");
  const takedown = await request("POST", "/api/admin/reviews", {
    releaseId: firstSubmission.release.id,
    decision: "takedown",
    reviewNote: "Removed by local Admin takedown smoke test.",
  });
  assert(takedown.release?.approvalStatus === "disabled", "Approved release takedown did not disable the release.");
  assert(takedown.release?.audioUrl === null && takedown.release?.coverImageUrl === null, "Release takedown did not clear public media URLs.");
  const takedownCatalogue = await request("GET", "/api/catalog");
  assert(!takedownCatalogue.tracks?.some((track) => track.title === firstSubmission.release.title), "Taken-down release appeared in the public catalogue.");
  await requestRaw("GET", `/api/media/${audioMedia.media.id}`, { authenticated: false, expectStatus: 404 });
  summary.push("release takedown removes public access");
  const auditHtml = await requestText("GET", "/admin/audit");
  assert(auditHtml.includes("catalog.release_takedown"), "Audit Log did not show the release takedown event.");
  assert(auditHtml.includes("Removed by local Admin takedown smoke test."), "Audit Log did not show the takedown reason.");
  summary.push("Audit Log records takedown reason");
  const missingReinstateNote = await request("POST", "/api/admin/reviews", {
    releaseId: firstSubmission.release.id,
    decision: "reinstate",
    reviewNote: "",
  }, { expectStatus: 400 });
  assert(/note/i.test(missingReinstateNote.error), "API allowed a release reinstatement without a reason.");
  const reinstated = await request("POST", "/api/admin/reviews", {
    releaseId: firstSubmission.release.id,
    decision: "reinstate",
    reviewNote: "Rights question resolved; return for fresh review.",
  });
  assert(reinstated.release?.approvalStatus === "pending", "Reinstated release did not return to pending review.");
  assert(reinstated.release?.audioUrl === null && reinstated.release?.coverImageUrl === null, "Reinstated release regained public media URLs.");
  await requestRaw("GET", `/api/media/${audioMedia.media.id}`, { authenticated: false, expectStatus: 404 });
  summary.push("release reinstatement returns to private review");

  const rejectionSubmission = await request("POST", "/api/artist/releases", {
    artistProfileId: artist.item.id,
    title: `Codex Reject Me ${suffix}`,
    slug: `codex-reject-me-${suffix}`,
    featuringArtist: "",
    genre: "Electronic",
    region: "Antigua & Barbuda",
    discoveryLane: "wadadli",
    creationType: "artist_made",
    aiClassification: "human_created",
    mood: "Backend smoke test",
    durationSeconds: 118,
    explicitStatus: "clean",
    rightsConfirmed: true,
    aiDisclosure: "",
    submissionNotes: "Release should be rejected by local Admin smoke testing.",
  });
  assert(rejectionSubmission.release?.approvalStatus === "pending", "Rejection-path release did not enter pending review.");
  const rejectedAudioMedia = await uploadMedia(rejectionSubmission.release.id, "audio", makeAudioFile(`${suffix}-reject`));
  await uploadMedia(rejectionSubmission.release.id, "cover", makeCoverFile(`${suffix}-reject`));

  const missingRejectNote = await request("POST", "/api/admin/reviews", {
    releaseId: rejectionSubmission.release.id,
    decision: "reject",
    reviewNote: "",
  }, { expectStatus: 400 });
  assert(/note/i.test(missingRejectNote.error), "Review rejection did not require an explanatory note.");

  const rejectedRelease = await request("POST", "/api/admin/reviews", {
    releaseId: rejectionSubmission.release.id,
    decision: "reject",
    reviewNote: "Rejected by local Admin smoke test.",
  });
  assert(rejectedRelease.release?.approvalStatus === "rejected", "Review rejection did not reject the release.");
  assert(rejectedRelease.release?.reviewNote === "Rejected by local Admin smoke test.", "Review rejection did not persist the note.");
  const rejectedCatalogue = await request("GET", "/api/catalog");
  assert(!rejectedCatalogue.tracks?.some((track) => track.title === rejectionSubmission.release.title), "Rejected release appeared in the public catalogue.");
  await requestRaw("GET", rejectedAudioMedia.media.id ? `/api/media/${rejectedAudioMedia.media.id}` : "/api/media/missing", { expectStatus: 403, authenticated: false });
  summary.push("review rejection keeps media private");

  const correctedRelease = await request("PATCH", `/api/artist/releases/${rejectionSubmission.release.id}`, {
    title: `Codex Corrected Release ${suffix}`,
    slug: `codex-corrected-release-${suffix}`,
    featuringArtist: "",
    genre: "Electronic",
    region: "Antigua & Barbuda",
    discoveryLane: "wadadli",
    aiClassification: "human_created",
    mood: "Corrected after review feedback",
    durationSeconds: 118,
    explicitStatus: "clean",
    rightsConfirmed: true,
    aiDisclosure: "",
    submissionNotes: "Corrected by local Admin smoke testing.",
  });
  assert(correctedRelease.release?.approvalStatus === "pending", "Corrected release did not return to pending review.");
  assert(correctedRelease.release?.title === `Codex Corrected Release ${suffix}`, "Corrected release did not save its updated title.");
  assert(correctedRelease.release?.reviewNote === null, "Corrected release retained a resolved rejection note.");
  await request("PATCH", `/api/artist/releases/${rejectionSubmission.release.id}`, {
    title: `Codex Corrected Release ${suffix}`,
    slug: `codex-corrected-release-${suffix}`,
    featuringArtist: "",
    genre: "Electronic",
    region: "Antigua & Barbuda",
    discoveryLane: "wadadli",
    aiClassification: "human_created",
    mood: "Corrected after review feedback",
    durationSeconds: 118,
    explicitStatus: "clean",
    rightsConfirmed: true,
    aiDisclosure: "",
    submissionNotes: "Corrected by local Admin smoke testing.",
  }, { expectStatus: 409 });
  summary.push("rejected release correction and protected resubmission");

  const secondSubmission = await request("POST", "/api/artist/releases", {
    artistProfileId: artist.item.id,
    title: `Codex AI Limit Two ${suffix}`,
    slug: `codex-ai-limit-two-${suffix}`,
    featuringArtist: "",
    genre: "Electronic",
    region: "Antigua & Barbuda",
    discoveryLane: "ai",
    creationType: "ai_assisted",
    aiClassification: "primarily_ai_generated",
    mood: "Backend smoke test",
    durationSeconds: 128,
    explicitStatus: "clean",
    rightsConfirmed: true,
    aiDisclosure: "Generated for local AI upload limit smoke testing.",
    submissionNotes: "Second qualifying AI submission should be blocked.",
  }, { expectStatus: 429 });
  assert(secondSubmission.nextEligibleAt, "Blocked AI submission did not return a next eligible date.");
  summary.push("AI upload limit enforcement");

  const exception = await request("POST", "/api/admin/ai-controls", {
    action: "exception",
    artistProfileId: artist.item.id,
    restrictionEnabled: true,
    trackLimit: 2,
    periodDays: 14,
    scope: "ai_generated",
    notes: "Local smoke exception allowing one extra AI release.",
  });
  assert(exception.exception?.trackLimit === 2, "AI artist exception did not save a custom track limit.");
  summary.push("AI artist exception update");

  const exceptionSubmission = await request("POST", "/api/artist/releases", {
    artistProfileId: artist.item.id,
    title: `Codex AI Exception Two ${suffix}`,
    slug: `codex-ai-exception-two-${suffix}`,
    featuringArtist: "",
    genre: "Electronic",
    region: "Antigua & Barbuda",
    discoveryLane: "ai",
    creationType: "ai_assisted",
    aiClassification: "primarily_ai_generated",
    mood: "Backend smoke test",
    durationSeconds: 130,
    explicitStatus: "clean",
    rightsConfirmed: true,
    aiDisclosure: "Generated for local AI upload exception smoke testing.",
    submissionNotes: "Artist exception should allow this second qualifying AI submission.",
  });
  assert(exceptionSubmission.release?.approvalStatus === "pending", "Artist exception did not allow the second qualifying AI submission.");

  const exceptionBlockedSubmission = await request("POST", "/api/artist/releases", {
    artistProfileId: artist.item.id,
    title: `Codex AI Exception Three ${suffix}`,
    slug: `codex-ai-exception-three-${suffix}`,
    featuringArtist: "",
    genre: "Electronic",
    region: "Antigua & Barbuda",
    discoveryLane: "ai",
    creationType: "ai_assisted",
    aiClassification: "primarily_ai_generated",
    mood: "Backend smoke test",
    durationSeconds: 132,
    explicitStatus: "clean",
    rightsConfirmed: true,
    aiDisclosure: "Generated for local AI upload exception smoke testing.",
    submissionNotes: "Third qualifying AI submission should be blocked by the two-track exception.",
  }, { expectStatus: 429 });
  assert(exceptionBlockedSubmission.nextEligibleAt, "Blocked exception-era AI submission did not return a next eligible date.");
  summary.push("AI artist exception enforcement");

  const deletedAnnouncement = await request("POST", "/api/admin/announcements", {
    action: "delete",
    id: announcement.announcement.id,
  });
  assert(deletedAnnouncement.deleted === announcement.announcement.id, "Announcement delete did not return the deleted id.");
  summary.push("announcement delete");

  const studioUser = {
    id: `codex-studio-local-${suffix}`,
    email: `codex-studio-${suffix}@chuneside.local`,
    name: "Codex Studio",
  };
  const studioHeaders = {
    "content-type": "application/json",
    "x-chuneside-local-user-id": studioUser.id,
    "x-chuneside-local-user-email": studioUser.email,
    "x-chuneside-local-user-full-name": studioUser.name,
  };
  await request("POST", "/api/member-state", { action: "follow", artist: "Marlon Tide" }, { headers: studioHeaders });
  const studioAccount = await request("POST", "/api/admin/accounts", {
    memberId: studioUser.id,
    accountRole: "studio",
    accountStatus: "active",
    artistVerificationStatus: "unverified",
    foundingArtist: false,
    foundingStudioPartner: true,
    monetizationState: "not_applied",
    moderationNote: "Local smoke Studio workspace account.",
  });
  assert(studioAccount.account?.accountRole === "studio", "Local test account was not assigned the Studio role.");
  const studioArtist = await request("POST", "/api/admin/catalog", {
    entity: "artist",
    ownerMemberId: studioUser.id,
    stageName: `Codex Studio Artist ${suffix}`,
    slug: `codex-studio-artist-${suffix}`,
    biography: "Studio-owned local smoke-test artist.",
    countryRegion: "Antigua & Barbuda",
    primaryGenre: "Electronic",
    profilePhotoUrl: "",
    coverImageUrl: "",
    websiteUrl: "",
    instagramUrl: "",
    youtubeUrl: "",
    verificationStatus: "unverified",
    foundingArtist: false,
    visibility: "draft",
  });
  assert(studioArtist.item?.ownerMemberId === studioUser.id, "Studio account could not be linked as an artist profile owner.");
  const featureFlags = await request("GET", "/api/admin/feature-flags");
  const previousWorkspaceState = featureFlags.flags?.find((flag) => flag.key === "artist_workspace")?.state ?? "admin_test";
  await request("POST", "/api/admin/feature-flags", { key: "artist_workspace", state: "on" });
  const studioWorkspaceHtml = await requestText("GET", "/artist/dashboard", { headers: studioHeaders });
  assert(studioWorkspaceHtml.includes(`Codex Studio Artist ${suffix}`), "Studio workspace did not render its explicitly linked artist profile.");
  await request("POST", "/api/admin/feature-flags", { key: "artist_workspace", state: previousWorkspaceState });
  summary.push("Studio-owned artist workspace access");

  console.log("Local Admin smoke passed:");
  for (const item of summary) console.log(`- ${item}`);
}

function stagePayloadFrom(performance) {
  return {
    action: "save",
    id: performance.id,
    artistProfileId: performance.artistProfileId,
    slug: performance.slug,
    title: performance.title,
    description: performance.description,
    youtubeUrl: performance.youtubeUrl,
    thumbnailUrl: performance.thumbnailUrl ?? "",
    durationMinutes: performance.durationMinutes,
    songsPerformed: JSON.parse(performance.songsPerformedJson).join(", "),
    genre: performance.genre,
    region: performance.region,
    performanceDate: "",
    originalSubmissionInfo: performance.originalSubmissionInfo ?? "",
    featureStartAt: "",
    featureEndAt: "",
    stageFeeLabel: performance.stageFeeLabel ?? "",
    feeStatus: performance.feeStatus,
  };
}

async function request(method, path, body, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: options.headers ?? headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  const expected = options.expectStatus ?? 200;
  if (response.status !== expected) {
    throw new Error(`${method} ${path} expected ${expected}, got ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function requestText(method, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: options.headers ?? headers });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} expected 2xx, got ${response.status}: ${text.slice(0, 200)}`);
  }
  return text;
}

async function requestRaw(method, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    redirect: options.redirect ?? "follow",
    headers: options.authenticated === false ? options.headers : { ...headers, ...options.headers },
  });
  const expected = options.expectStatus ?? 200;
  if (response.status !== expected) {
    const text = await response.text().catch(() => "");
    throw new Error(`${method} ${path} expected ${expected}, got ${response.status}: ${text.slice(0, 200)}`);
  }
  return response;
}

async function uploadMedia(releaseId, kind, file) {
  const form = new FormData();
  form.set("releaseId", releaseId);
  form.set("kind", kind);
  form.set("file", file);
  const response = await fetch(`${baseUrl}/api/artist/media`, {
    method: "POST",
    headers: withoutContentType(headers),
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status !== 200) {
    throw new Error(`POST /api/artist/media expected 200, got ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

function withoutContentType(source) {
  const rest = { ...source };
  delete rest["content-type"];
  return rest;
}

function makeAudioFile(unique) {
  const bytes = new Uint8Array([
    0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x0f, 0x54, 0x49, 0x54, 0x32, 0x00, 0x00,
    0x00, 0x05, 0x00, 0x00, 0x53, 0x6d, 0x6f, 0x6b,
    0x65,
  ]);
  return new File([bytes], `smoke-audio-${unique}.mp3`, { type: "audio/mpeg" });
}

function makeCoverFile(unique) {
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde,
  ]);
  return new File([bytes], `smoke-cover-${unique}.png`, { type: "image/png" });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
