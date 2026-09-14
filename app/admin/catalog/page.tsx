import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { asc, eq, or } from "drizzle-orm";
import { getAdminGate } from "@/app/admin-auth";
import { appSignInPath } from "@/app/auth/paths";
import { getDb } from "@/db";
import { artistProfiles, members, releases } from "@/db/schema";
import { CatalogClient } from "./catalog-client";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const gate = await getAdminGate();

  if (gate.status === "anonymous") {
    redirect(appSignInPath("/admin/catalog"));
  }

  if (gate.status === "forbidden") {
    return (
      <main className="admin-shell">
        <section className="admin-access-card">
          <Link href="/" className="admin-brand" aria-label="Back to ChuneSide">
            <Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority />
          </Link>
          <span>Admin access</span>
          <h1>Catalogue tools are protected.</h1>
          <p>{gate.configured ? `${gate.user.email} does not have ChuneSide admin access.` : "Configure an owner email or active database admin role before using this screen."}</p>
          <Link href="/">Return to ChuneSide</Link>
        </section>
      </main>
    );
  }

  const db = getDb();
  const [artists, releaseRows, ownerAccounts] = await Promise.all([
    db.select().from(artistProfiles).orderBy(asc(artistProfiles.stageName)),
    db.select().from(releases).orderBy(asc(releases.legacyTrackId), asc(releases.title)),
    db.select({
      id: members.id,
      displayName: members.displayName,
      email: members.email,
      accountRole: members.accountRole,
    }).from(members).where(or(eq(members.accountRole, "artist"), eq(members.accountRole, "studio"), eq(members.accountRole, "admin"))).orderBy(asc(members.displayName)),
  ]);

  return (
    <CatalogClient
      adminAccessSource={gate.source}
      ownerAccounts={ownerAccounts as Array<{ id: string; displayName: string; email: string; accountRole: "artist" | "studio" | "admin" }>}
      initialArtists={artists.map((artist) => ({ ...artist, createdAt: artist.createdAt.toISOString(), updatedAt: artist.updatedAt.toISOString() }))}
      initialReleases={releaseRows.map((release) => ({ ...release, releaseDate: release.releaseDate?.toISOString() ?? null, reviewedAt: release.reviewedAt?.toISOString() ?? null, createdAt: release.createdAt.toISOString(), updatedAt: release.updatedAt.toISOString() }))}
    />
  );
}
