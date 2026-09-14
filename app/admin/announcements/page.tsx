import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { getAdminGate } from "@/app/admin-auth";
import { appSignInPath } from "@/app/auth/paths";
import { getDb } from "@/db";
import { communityAnnouncements } from "@/db/schema";
import { AnnouncementsClient } from "./announcements-client";

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const gate = await getAdminGate();

  if (gate.status === "anonymous") {
    redirect(appSignInPath("/admin/announcements"));
  }

  if (gate.status === "forbidden") {
    return (
      <main className="admin-shell">
        <section className="admin-access-card">
          <Link href="/" className="admin-brand" aria-label="Back to ChuneSide">
            <Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized />
          </Link>
          <span>Admin access</span>
          <h1>Announcement tools are protected.</h1>
          <p>{gate.configured ? `${gate.user.email} does not have ChuneSide admin access.` : "Configure an owner email or active database admin role before using this screen."}</p>
          <Link href="/">Return to ChuneSide</Link>
        </section>
      </main>
    );
  }

  const rows = await getDb().select().from(communityAnnouncements).orderBy(
    asc(communityAnnouncements.sortOrder),
    asc(communityAnnouncements.createdAt),
  ).catch(() => []);

  return (
    <AnnouncementsClient
      adminAccessSource={gate.source}
      initialAnnouncements={rows.map((row) => ({
        ...row,
        startAt: row.startAt?.toISOString() ?? null,
        endAt: row.endAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }))}
    />
  );
}
