import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { getAdminGate } from "@/app/admin-auth";
import { appSignInPath } from "@/app/auth/paths";
import { getDb } from "@/db";
import { members } from "@/db/schema";
import { AccountsClient } from "./accounts-client";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const gate = await getAdminGate();

  if (gate.status === "anonymous") {
    redirect(appSignInPath("/admin/accounts"));
  }

  if (gate.status === "forbidden") {
    return (
      <main className="admin-shell">
        <section className="admin-access-card">
          <Link href="/" className="admin-brand" aria-label="Back to ChuneSide">
            <Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority />
          </Link>
          <span>Admin access</span>
          <h1>Accounts are protected.</h1>
          <p>
            {gate.configured
              ? `${gate.user.email} is signed in, but is not listed as a ChuneSide admin.`
              : "No admin email allowlist is configured yet. Add CHUNESIDE_ADMIN_EMAILS before using this screen."}
          </p>
          <Link href="/">Return to ChuneSide</Link>
        </section>
      </main>
    );
  }

  const accounts = (await getDb().select().from(members).orderBy(desc(members.lastSeenAt)).limit(200))
    .map((account) => ({
      ...account,
      createdAt: account.createdAt.toISOString(),
      lastSeenAt: account.lastSeenAt.toISOString(),
      statusUpdatedAt: account.statusUpdatedAt?.toISOString() ?? null,
    }));
  return <AccountsClient adminAccessSource={gate.source} initialAccounts={accounts} />;
}
