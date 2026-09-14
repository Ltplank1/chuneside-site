import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getAdminGate } from "@/app/admin-auth";
import { appSignInPath } from "@/app/auth/paths";
import { getDb } from "@/db";
import { listFeatureFlags } from "@/lib/feature-flags";
import { FeatureFlagsClient } from "./feature-flags-client";

export const dynamic = "force-dynamic";

export default async function FeatureFlagsPage() {
  const gate = await getAdminGate();

  if (gate.status === "anonymous") {
    redirect(appSignInPath("/admin/feature-flags"));
  }

  if (gate.status === "forbidden") {
    return (
      <main className="admin-shell">
        <section className="admin-access-card">
          <Link href="/" className="admin-brand" aria-label="Back to ChuneSide">
            <Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority />
          </Link>
          <span>Admin access</span>
          <h1>Feature Control is protected.</h1>
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

  const flags = await listFeatureFlags(getDb());
  return <FeatureFlagsClient adminAccessSource={gate.source} initialFlags={flags} />;
}
