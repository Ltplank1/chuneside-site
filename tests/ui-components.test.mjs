import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the ChuneSide interface and responsive styles", async () => {
  const css = [
    await readCssTree(path.join(root, "dist")),
    await readFile(path.join(root, "app", "globals.css"), "utf8"),
  ].join("\n");

  assert.match(css, /\.site-header/);
  assert.match(css, /\.cinema-hero/);
  assert.match(css, /\.track-grid/);
  assert.match(css, /\.leaderboard/);
  assert.match(css, /\.now-playing/);
  assert.match(css, /\.community-news-bar/);
  assert.match(css, /\.announcement-admin-list/);
  assert.match(css, /\.account-roster-filters/);
  assert.match(css, /\.preview-readiness/);
  assert.match(css, /\.account-note/);
  assert.match(css, /\.workspace-ai-policy/);
  assert.match(css, /\.home-stage-section/);
  assert.match(css, /\.stage-filter-bar/);
  assert.match(css, /\.stage-admin-filters/);
  assert.match(css, /\.stage-admin-list/);
  assert.match(css, /\.stage-placement/);
  assert.match(css, /\.stage-metrics/);
  assert.match(css, /\.review-filters/);
  assert.match(css, /\.audit-filters/);
  assert.match(css, /\.audit-log-list/);
  assert.match(css, /\.catalog-filters/);
  assert.match(css, /\.catalog-region-filter/);
  assert.match(css, /\.catalog-sort-filter/);
  assert.match(css, /\.catalog-result-count/);
  assert.match(css, /\.artist-stage-grid/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /@media\s*\(width<=/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

test("keeps the public catalogue fallback complete and formats duration", async () => {
  const { demoTracks, formatTrackDuration } = await vite.ssrLoadModule(
    "/lib/public-catalog.ts",
  );

  assert.equal(demoTracks.length, 8);
  assert.equal(new Set(demoTracks.map((track) => track.id)).size, 8);
  assert.equal(formatTrackDuration(198), "3:18");
  assert.equal(formatTrackDuration(null), "0:00");
});

test("provides a stable artist slug for every demo track", async () => {
  const { demoTracks } = await vite.ssrLoadModule("/lib/public-catalog.ts");

  assert.ok(demoTracks.every((track) => /^[a-z0-9-]+$/.test(track.artistSlug)));
  assert.equal(demoTracks.find((track) => track.id === 3).artistSlug, "nia-vale");
});

test("blocks release approval until rights and AI disclosures are complete", async () => {
  const { releaseReviewBlockers } = await vite.ssrLoadModule("/lib/release-policy.ts");

  assert.deepEqual(releaseReviewBlockers({ rightsConfirmed: false, creationType: "artist_made", aiDisclosure: null }), ["Rights confirmation is required."]);
  assert.deepEqual(releaseReviewBlockers({ rightsConfirmed: true, creationType: "ai_assisted", aiDisclosure: "  " }), ["AI-involved releases require a disclosure note."]);
  assert.deepEqual(releaseReviewBlockers({ rightsConfirmed: true, creationType: "artist_made", aiClassification: "primarily_ai_generated", aiDisclosure: "  " }), ["AI-involved releases require a disclosure note."]);
  assert.deepEqual(releaseReviewBlockers({ rightsConfirmed: true, creationType: "ai_assisted", aiDisclosure: "Voice cleanup and stem separation." }), []);
});

test("validates uploaded media by size, type, and file signature", async () => {
  const { parseByteRange, validateMediaFile } = await vite.ssrLoadModule("/lib/media-policy.ts");
  const mp3Header = Uint8Array.from([0x49, 0x44, 0x33, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const pngHeader = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
  const webmHeader = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);

  assert.equal(validateMediaFile("audio", { size: 1024, type: "audio/mpeg" }, mp3Header), null);
  assert.equal(validateMediaFile("cover", { size: 1024, type: "image/png" }, pngHeader), null);
  assert.equal(validateMediaFile("video", { size: 1024, type: "video/webm" }, webmHeader), null);
  assert.equal(validateMediaFile("video", { size: 1024, type: "video/webm" }, mp3Header), "The video file contents do not match its type.");
  assert.equal(validateMediaFile("cover", { size: 1024, type: "image/png" }, mp3Header), "The cover file contents do not match its type.");
  assert.equal(validateMediaFile("audio", { size: 1024, type: "application/octet-stream" }, mp3Header), "Unsupported audio file type.");
  assert.deepEqual(parseByteRange("bytes=100-199", 1000), { offset: 100, length: 100 });
  assert.deepEqual(parseByteRange("bytes=-250", 1000), { offset: 750, length: 250 });
  assert.deepEqual(parseByteRange("bytes=900-", 1000), { offset: 900, length: 100 });
  assert.equal(parseByteRange("bytes=1000-1001", 1000), null);
});

test("provisions the D1 member record after Supabase authentication completes", async () => {
  const [callback, confirmation, provisioner] = await Promise.all([
    readFile(path.join(root, "app", "auth", "callback", "route.ts"), "utf8"),
    readFile(path.join(root, "app", "auth", "confirm", "route.ts"), "utf8"),
    readFile(path.join(root, "lib", "member-provisioning.ts"), "utf8"),
  ]);

  assert.match(callback, /await provisionMember\(data\.user\)/);
  assert.match(confirmation, /await provisionMember\(data\.user\)/);
  assert.match(provisioner, /lower\(\$\{members\.email\}\) = lower\(\$\{email\}\)/);
});

test("loads the public Supabase browser configuration from the production runtime when needed", async () => {
  const [client, route] = await Promise.all([
    readFile(path.join(root, "lib", "supabase", "client.ts"), "utf8"),
    readFile(path.join(root, "app", "api", "auth", "config", "route.ts"), "utf8"),
  ]);

  assert.match(client, /fetch\("\/api\/auth\/config"/);
  assert.match(route, /Cache-Control": "no-store"/);
  assert.doesNotMatch(route, /SERVICE_ROLE|R2_|SMTP|ADMIN_EMAILS/);
});

test("registers configurable admin-test controls for Stage, AI limits, and the news bar", async () => {
  const { featureFlagDefinitions, defaultPublicFeatureSnapshot } = await vite.ssrLoadModule("/lib/feature-flags.ts");
  const byKey = new Map(featureFlagDefinitions.map((flag) => [flag.key, flag]));
  const publicSnapshot = defaultPublicFeatureSnapshot();

  assert.equal(byKey.get("chuneside_stage")?.label, "ChuneSide Stage");
  assert.equal(byKey.get("ai_upload_restriction")?.state, "admin_test");
  assert.equal(byKey.get("community_news_bar")?.state, "admin_test");
  assert.equal(publicSnapshot.community_news_bar.available, false);
  assert.equal(publicSnapshot.chuneside_stage.available, false);
});

test("classifies AI releases for configurable upload limits", async () => {
  const {
    classificationQualifiesForRestriction,
    creationTypeFromAiClassification,
    aiClassificationFromCreationType,
  } = await vite.ssrLoadModule("/lib/ai-upload-policy.ts");

  assert.equal(aiClassificationFromCreationType("artist_made"), "human_created");
  assert.equal(aiClassificationFromCreationType("ai_assisted"), "ai_assisted");
  assert.equal(creationTypeFromAiClassification("human_created"), "artist_made");
  assert.equal(creationTypeFromAiClassification("primarily_ai_generated"), "ai_assisted");
  assert.equal(classificationQualifiesForRestriction("human_created", "both"), false);
  assert.equal(classificationQualifiesForRestriction("ai_assisted", "ai_generated"), false);
  assert.equal(classificationQualifiesForRestriction("primarily_ai_generated", "ai_generated"), true);
  assert.equal(classificationQualifiesForRestriction("ai_assisted", "both"), true);
  assert.equal(classificationQualifiesForRestriction("classification_pending", "ai_generated"), true);
});

test("parses Stage videos and enforces publication consent policy", async () => {
  const { extractYouTubeVideoId, parseSongsPerformed, stageStatusNeedsConsent } = await vite.ssrLoadModule("/lib/stage-policy.ts");

  assert.equal(extractYouTubeVideoId("abcdefghijk"), "abcdefghijk");
  assert.equal(extractYouTubeVideoId("https://youtu.be/abcdefghijk"), "abcdefghijk");
  assert.equal(extractYouTubeVideoId("https://www.youtube.com/watch?v=abcdefghijk"), "abcdefghijk");
  assert.equal(extractYouTubeVideoId("https://www.youtube.com/shorts/abcdefghijk"), "abcdefghijk");
  assert.deepEqual(parseSongsPerformed("Song one\nSong two, Song three"), ["Song one", "Song two", "Song three"]);
  assert.equal(stageStatusNeedsConsent("draft"), false);
  assert.equal(stageStatusNeedsConsent("approved"), true);
  assert.equal(stageStatusNeedsConsent("featured"), true);
});

test("orders public Stage performances by active home placement", async () => {
  const { isPlacementActive, sortPublicStagePerformances } = await vite.ssrLoadModule("/lib/public-stage-sort.ts");
  const now = new Date("2026-09-08T12:00:00.000Z");
  const base = {
    description: "",
    artistStageName: "Artist",
    artistSlug: "artist",
    youtubeVideoId: "abcdefghijk",
    youtubeUrl: null,
    thumbnailUrl: null,
    durationMinutes: 12,
    songsPerformed: [],
    genre: "Soca",
    region: "Antigua & Barbuda",
    performanceDate: "2026-09-01T00:00:00.000Z",
    status: "published",
    featureStartAt: null,
    featureEndAt: null,
    viewCount: 0,
    favoriteCount: 0,
  };
  const normal = { ...base, slug: "normal", title: "Normal", homePlacement: "none" };
  const expired = { ...base, slug: "expired", title: "Expired", homePlacement: "featured", featureEndAt: "2026-09-07T00:00:00.000Z" };
  const latest = { ...base, slug: "latest", title: "Latest", homePlacement: "latest", featureStartAt: "2026-09-01T00:00:00.000Z" };
  const featured = { ...base, slug: "featured", title: "Featured", homePlacement: "featured", featureStartAt: "2026-09-01T00:00:00.000Z" };

  assert.equal(isPlacementActive(featured, now), true);
  assert.equal(isPlacementActive(expired, now), false);
  assert.deepEqual(
    sortPublicStagePerformances([normal, latest, expired, featured], now).map((performance) => performance.slug),
    ["featured", "latest", "expired", "normal"],
  );
});
