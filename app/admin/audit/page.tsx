import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { getAdminGate } from "@/app/admin-auth";
import { appSignInPath } from "@/app/auth/paths";
import { getDb } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { AuditClient } from "./audit-client";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const gate = await getAdminGate();
  if (gate.status === "anonymous") redirect(appSignInPath("/admin/audit"));
  if (gate.status === "forbidden") return <main className="admin-shell"><section className="admin-access-card"><Link href="/" className="admin-brand" aria-label="Back to ChuneSide"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link><span>Admin access</span><h1>Audit tools are protected.</h1><p>{gate.configured ? `${gate.user.email} does not have ChuneSide admin access.` : "Configure an owner email or active database admin role before using this screen."}</p><Link href="/">Return to ChuneSide</Link></section></main>;
  const rows = await getDb().select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(200);
  return <AuditClient adminAccessSource={gate.source} initialLogs={rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))} />;
}
