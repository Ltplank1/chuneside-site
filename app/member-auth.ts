import { getAuthenticatedUser } from "@/app/auth-headers";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { members } from "@/db/schema";

export type CurrentMemberUser = {
  id: string;
  email: string;
  displayName: string;
};

export async function getCurrentMemberUser(): Promise<CurrentMemberUser | null> {
  const { id, email, displayName } = await getAuthenticatedUser();
  if (!id || !email) return null;

  try {
    const db = getDb();
    const [byId] = await db.select({ id: members.id }).from(members).where(eq(members.id, id)).limit(1);
    const [byEmail] = byId ? [] : await db.select({ id: members.id }).from(members).where(sql`lower(${members.email}) = lower(${email})`).limit(1);
    return { id: byId?.id ?? byEmail?.id ?? id, email, displayName: displayName ?? email.split("@")[0] };
  } catch {
    return { id, email, displayName: displayName ?? email.split("@")[0] };
  }
}
