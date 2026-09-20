import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { getAdminGate } from "@/app/admin-auth";
import { appSignInPath } from "@/app/auth/paths";
import { getDb } from "@/db";
import { artistProfiles, releases, stagePerformances, stageTracklistEntries } from "@/db/schema";
import { StageClient } from "./stage-client";

export const dynamic = "force-dynamic";

export default async function AdminStagePage() {
  const gate = await getAdminGate();
  if (gate.status === "anonymous") redirect(appSignInPath("/admin/stage"));

  if (gate.status === "forbidden") {
    return (
      <main className="admin-shell"><section className="admin-access-card">
        <Link href="/" className="admin-brand" aria-label="Back to ChuneSide"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link>
        <span>Admin access</span><h1>ChuneSide Stage is protected.</h1>
        <p>{gate.configured ? `${gate.user.email} does not have ChuneSide admin access.` : "Configure an owner email or active database admin role before using this screen."}</p>
        <Link href="/">Return to ChuneSide</Link>
      </section></main>
    );
  }

  let storageReady = true;
  let performances: Array<typeof stagePerformances.$inferSelect> = [];
  let artists: Array<{ id: string; stageName: string }> = [];
  let releasesForLinking: Array<{ id: string; title: string; artistProfileId: string }> = [];
  let tracklistRows: Array<typeof stageTracklistEntries.$inferSelect> = [];

  try {
    const db = getDb();
    [performances, artists, releasesForLinking, tracklistRows] = await Promise.all([
      db.select().from(stagePerformances).orderBy(asc(stagePerformances.createdAt)),
      db.select({ id: artistProfiles.id, stageName: artistProfiles.stageName }).from(artistProfiles).orderBy(asc(artistProfiles.stageName)),
      db.select({ id: releases.id, title: releases.title, artistProfileId: releases.artistProfileId }).from(releases).orderBy(asc(releases.title)),
      db.select().from(stageTracklistEntries).orderBy(asc(stageTracklistEntries.position)),
    ]);
  } catch {
    storageReady = false;
  }

  return (
    <StageClient
      adminAccessSource={gate.source}
      storageReady={storageReady}
      artists={artists}
      releases={releasesForLinking}
      initialPerformances={performances.map((item) => ({
        ...item,
        performanceDate: item.performanceDate?.toISOString() ?? null,
        featureStartAt: item.featureStartAt?.toISOString() ?? null,
        featureEndAt: item.featureEndAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        tracklist: tracklistRows.filter((entry) => entry.performanceId === item.id).map((entry) => ({
          id: entry.id,
          title: entry.title,
          externalArtistName: entry.externalArtistName,
          artistProfileId: entry.artistProfileId,
          releaseId: entry.releaseId,
          externalInfo: entry.externalInfo,
        })),
      }))}
    />
  );
}
