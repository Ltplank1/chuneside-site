import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { members } from "@/db/schema";

type AuthenticatedMember = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

export async function provisionMember(authenticatedMember: AuthenticatedMember) {
  const email = authenticatedMember.email?.trim();
  if (!email) throw new Error("Authenticated user has no email address.");

  const displayName = displayNameFor(authenticatedMember, email);
  const db = getDb();
  const now = new Date();
  const [byId] = await db.select({ id: members.id }).from(members).where(eq(members.id, authenticatedMember.id)).limit(1);
  const [byEmail] = byId ? [] : await db.select({ id: members.id }).from(members).where(sql`lower(${members.email}) = lower(${email})`).limit(1);
  const memberId = byId?.id ?? byEmail?.id;

  if (memberId) {
    await db.update(members).set({ email, displayName, lastSeenAt: now }).where(eq(members.id, memberId));
    return memberId;
  }

  await db.insert(members).values({ id: authenticatedMember.id, email, displayName, createdAt: now, lastSeenAt: now });
  return authenticatedMember.id;
}

function displayNameFor(member: AuthenticatedMember, email: string) {
  const metadata = member.user_metadata ?? {};
  const displayName = metadata.display_name ?? metadata.full_name ?? metadata.name;
  return typeof displayName === "string" && displayName.trim() ? displayName.trim().slice(0, 80) : email.split("@")[0];
}
