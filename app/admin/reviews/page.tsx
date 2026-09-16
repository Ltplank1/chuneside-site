import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { asc, eq, ne } from "drizzle-orm";
import { getAdminGate } from "@/app/admin-auth";
import { appSignInPath } from "@/app/auth/paths";
import { getDb } from "@/db";
import { artistProfiles, releaseMedia, releases } from "@/db/schema";
import { isFeatureAvailable } from "@/lib/feature-flags";
import { ReviewQueueClient } from "./review-queue-client";

export const dynamic = "force-dynamic";

export default async function ReviewQueuePage() {
  const gate = await getAdminGate();
  if (gate.status === "anonymous") redirect(appSignInPath("/admin/reviews"));

  if (gate.status === "forbidden") {
    return (
      <main className="admin-shell"><section className="admin-access-card">
        <Link href="/" className="admin-brand" aria-label="Back to ChuneSide"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority /></Link>
        <span>Admin access</span><h1>The review queue is protected.</h1>
        <p>{gate.configured ? `${gate.user.email} does not have ChuneSide admin access.` : "Configure an owner email or active database admin role before using this screen."}</p>
        <Link href="/">Return to ChuneSide</Link>
      </section></main>
    );
  }

  const db = getDb();
  const [rows, mediaRows, mediaUploadsAvailable] = await Promise.all([db.select({
    id: releases.id,
    artistProfileId: releases.artistProfileId,
    artistName: artistProfiles.stageName,
    title: releases.title,
    genre: releases.genre,
    region: releases.region,
    discoveryLane: releases.discoveryLane,
    creationType: releases.creationType,
    aiClassification: releases.aiClassification,
    explicitStatus: releases.explicitStatus,
    rightsConfirmed: releases.rightsConfirmed,
    radioReadyConfirmed: releases.radioReadyConfirmed,
    aiDisclosure: releases.aiDisclosure,
    submissionNotes: releases.submissionNotes,
    createdAt: releases.createdAt,
  }).from(releases)
    .innerJoin(artistProfiles, eq(releases.artistProfileId, artistProfiles.id))
    .where(eq(releases.approvalStatus, "pending"))
    .orderBy(asc(releases.createdAt)),
  db.select({ id: releaseMedia.id, releaseId: releaseMedia.releaseId, kind: releaseMedia.kind, originalName: releaseMedia.originalName, contentType: releaseMedia.contentType, sizeBytes: releaseMedia.sizeBytes, status: releaseMedia.status })
    .from(releaseMedia).where(ne(releaseMedia.status, "deleted")).orderBy(asc(releaseMedia.createdAt)),
  isFeatureAvailable(db, "artist_media_uploads", "admin"),
  ]);

  return <ReviewQueueClient adminAccessSource={gate.source} mediaRequired={mediaUploadsAvailable} initialReviews={rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    media: mediaRows.filter((media) => media.releaseId === row.id),
  }))} />;
}
