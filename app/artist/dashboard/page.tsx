import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { BriefcaseBusiness } from "lucide-react";
import { getDb } from "@/db";
import { adminAuditLogs, artistProfiles, releaseMedia, releases, stagePerformances } from "@/db/schema";
import { getAiLimitPolicy } from "@/lib/ai-upload-policy";
import { getArtistWorkspaceAccess } from "@/lib/artist-access";
import { appSignInPath } from "@/app/auth/paths";
import { isFeatureAvailable } from "@/lib/feature-flags";
import { ArtistDashboardClient } from "./artist-dashboard-client";

export const dynamic = "force-dynamic";

export default async function ArtistDashboardPage({ searchParams }: { searchParams?: Promise<{ confirmDelete?: string }> }) {
  const params = await searchParams;
  const access = await getArtistWorkspaceAccess();
  if (access.status === "anonymous") {
    redirect(appSignInPath("/artist/dashboard"));
  }

  if (access.status !== "allowed") {
    return (
      <main className="artist-workspace">
        <section className="artist-workspace-access">
          <Link href="/" className="admin-brand" aria-label="Back to ChuneSide">
            <Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority />
          </Link>
          <BriefcaseBusiness />
          <h1>{access.status === "disabled" ? "Artist workspace is in private testing." : "Workspace access is not active yet."}</h1>
          <p>{access.status === "disabled" ? "An administrator can enable the Artist workspace from Feature Control when the submission workflow is ready." : "Your account must be active with the Artist or Studio role before a profile can be linked to this workspace."}</p>
          <Link href="/">Return to ChuneSide</Link>
        </section>
      </main>
    );
  }

  const db = getDb();
  const profiles = await db.select().from(artistProfiles).where(eq(artistProfiles.ownerMemberId, access.user.id)).orderBy(asc(artistProfiles.stageName));
  const releaseRows = profiles.length
    ? await db.select().from(releases).where(inArray(releases.artistProfileId, profiles.map((profile) => profile.id))).orderBy(asc(releases.createdAt))
    : [];
  const [mediaRows, mediaUploadsAvailable, stageSubmissionsAvailable] = await Promise.all([
    releaseRows.length
      ? db.select().from(releaseMedia).where(inArray(releaseMedia.releaseId, releaseRows.map((release) => release.id))).orderBy(asc(releaseMedia.createdAt))
      : [],
    isFeatureAvailable(db, "artist_media_uploads", access.account.accountRole === "admin" ? "admin" : "public"),
    isFeatureAvailable(db, "chuneside_stage", access.account.accountRole === "admin" ? "admin" : "public"),
  ]);
  const stageRows = stageSubmissionsAvailable && profiles.length
    ? await db.select().from(stagePerformances).where(inArray(stagePerformances.artistProfileId, profiles.map((profile) => profile.id))).orderBy(asc(stagePerformances.createdAt))
    : [];
  const stageReviewLogs = stageRows.length
    ? await db.select({ entityId: adminAuditLogs.entityId, details: adminAuditLogs.details }).from(adminAuditLogs).where(and(
      eq(adminAuditLogs.entityType, "stage_performance"),
      eq(adminAuditLogs.action, "stage.performance_update"),
      inArray(adminAuditLogs.entityId, stageRows.map((performance) => performance.id)),
    )).orderBy(desc(adminAuditLogs.createdAt))
    : [];
  const stageReviewNotes = new Map<string, string>();
  for (const log of stageReviewLogs) {
    if (stageReviewNotes.has(log.entityId)) continue;
    const details = parseAuditDetails(log.details);
    if (details.status === "rejected" && typeof details.reviewNote === "string" && details.reviewNote) stageReviewNotes.set(log.entityId, details.reviewNote);
  }
  const aiPolicies = await Promise.all(profiles.map(async (profile) => {
    try {
      const policy = await getAiLimitPolicy(db, profile.id);
      return { artistProfileId: profile.id, ...policy };
    } catch {
      return { artistProfileId: profile.id, restrictionEnabled: true, trackLimit: 1, periodDays: 14, scope: "ai_generated" as const, adminOverrideEnabled: true, exceptionId: null };
    }
  }));

  return (
    <ArtistDashboardClient
      displayName={access.user.displayName}
      profiles={profiles.map((profile) => ({ ...profile, profilePhotoUrl: profile.profilePhotoUrl }))}
      aiPolicies={aiPolicies}
      mediaUploadsAvailable={mediaUploadsAvailable}
      stageSubmissionsAvailable={stageSubmissionsAvailable}
      initialMedia={mediaRows.filter((media) => media.status !== "deleted").map((media) => ({ ...media, createdAt: media.createdAt.toISOString(), updatedAt: media.updatedAt.toISOString() }))}
      initialStagePerformances={stageRows.map((performance) => ({ ...performance, performanceDate: performance.performanceDate?.toISOString() ?? null, createdAt: performance.createdAt.toISOString(), updatedAt: performance.updatedAt.toISOString(), reviewNote: stageReviewNotes.get(performance.id) ?? null }))}
      initialReleases={releaseRows.map((release) => ({
        ...release,
        releaseDate: release.releaseDate?.toISOString() ?? null,
        createdAt: release.createdAt.toISOString(),
        updatedAt: release.updatedAt.toISOString(),
      }))}
      pendingDeleteId={params?.confirmDelete}
    />
  );
}

function parseAuditDetails(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
