import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireAdminUser } from "@/app/admin-auth";
import { getDb } from "@/db";
import { adminAuditLogs, members } from "@/db/schema";
import {
  isAccountRole,
  isAccountStatus,
  isArtistVerificationStatus,
  isMonetizationState,
} from "@/lib/accounts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  const rows = await getDb().select().from(members).orderBy(desc(members.lastSeenAt)).limit(200);
  const accounts = query
    ? rows.filter((member) =>
        `${member.email} ${member.displayName} ${member.accountRole} ${member.accountStatus}`
          .toLowerCase()
          .includes(query),
      )
    : rows;

  return NextResponse.json({ accounts });
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const body = await request.json().catch(() => null) as {
    memberId?: string;
    accountRole?: unknown;
    accountStatus?: unknown;
    artistVerificationStatus?: unknown;
    foundingArtist?: unknown;
    foundingStudioPartner?: unknown;
    monetizationState?: unknown;
    moderationNote?: unknown;
  } | null;

  if (!body?.memberId) {
    return NextResponse.json({ error: "Choose an account to update." }, { status: 400 });
  }

  if (
    !isAccountRole(body.accountRole) ||
    !isAccountStatus(body.accountStatus) ||
    !isArtistVerificationStatus(body.artistVerificationStatus) ||
    !isMonetizationState(body.monetizationState)
  ) {
    return NextResponse.json({ error: "Choose valid account settings." }, { status: 400 });
  }

  const db = getDb();
  const now = new Date();
  const changes = {
    accountRole: body.accountRole,
    accountStatus: body.accountStatus,
    artistVerificationStatus: body.artistVerificationStatus,
    foundingArtist: Boolean(body.foundingArtist),
    foundingStudioPartner: Boolean(body.foundingStudioPartner),
    monetizationState: body.monetizationState,
    moderationNote: typeof body.moderationNote === "string" ? body.moderationNote.trim().slice(0, 500) || null : null,
    statusUpdatedAt: now,
    statusUpdatedBy: admin.email,
  };

  await db.update(members).set(changes).where(eq(members.id, body.memberId));
  await db.insert(adminAuditLogs).values({
    id: randomUUID(),
    actorId: admin.id,
    actorEmail: admin.email,
    action: "account.update",
    entityType: "member",
    entityId: body.memberId,
    details: JSON.stringify(changes),
    createdAt: now,
  });

  const [updated] = await db.select().from(members).where(eq(members.id, body.memberId)).limit(1);
  return NextResponse.json({ account: updated });
}
