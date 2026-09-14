import { eq } from "drizzle-orm";
import { getCurrentMemberUser } from "@/app/member-auth";
import { getDb } from "@/db";
import { members } from "@/db/schema";
import { isFeatureAvailable } from "@/lib/feature-flags";

export async function getArtistWorkspaceAccess() {
  const user = await getCurrentMemberUser();
  if (!user) return { status: "anonymous" as const };

  try {
    const db = getDb();
    const [account] = await db.select().from(members).where(eq(members.id, user.id)).limit(1);
    if (!account || account.accountStatus !== "active" || !["artist", "studio", "admin"].includes(account.accountRole)) {
      return { status: "ineligible" as const, user, account: account ?? null };
    }

    const audience = account.accountRole === "admin" ? "admin" : "public";
    if (!await isFeatureAvailable(db, "artist_workspace", audience)) {
      return { status: "disabled" as const, user, account };
    }

    return { status: "allowed" as const, user, account };
  } catch {
    return { status: "disabled" as const, user, account: null };
  }
}
