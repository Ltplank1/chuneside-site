import { eq } from "drizzle-orm";
import { getCurrentMemberUser } from "@/app/member-auth";
import { getDb } from "@/db";
import { members } from "@/db/schema";

export type AdminGate =
  | { status: "anonymous" }
  | { status: "forbidden"; user: AdminUser; configured: boolean }
  | { status: "allowed"; user: AdminUser; source: "allowlist" | "role" };

export type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  accountRole: "member" | "artist" | "dj" | "studio" | "admin";
  accountStatus: "active" | "frozen" | "blocked" | "disabled";
};

export async function getAdminGate(): Promise<AdminGate> {
  const currentMember = await getCurrentMemberUser();
  if (!currentMember) return { status: "anonymous" };
  const { id, email, displayName } = currentMember;

  const baseUser = {
    id,
    email,
    displayName: displayName ?? email.split("@")[0],
  };
  const adminEmails = configuredAdminEmails();
  const allowlisted = adminEmails.has(email.toLowerCase());
  const memberAccount = await findMemberAccount(id);
  const user: AdminUser = {
    ...baseUser,
    accountRole: memberAccount?.accountRole ?? "member",
    accountStatus: memberAccount?.accountStatus ?? "active",
  };

  if (allowlisted && user.accountStatus !== "blocked" && user.accountStatus !== "disabled") {
    return { status: "allowed", user, source: "allowlist" };
  }

  if (user.accountRole === "admin" && user.accountStatus === "active") {
    return { status: "allowed", user, source: "role" };
  }

  if (!allowlisted) {
    return {
      status: "forbidden",
      user,
      configured: adminEmails.size > 0,
    };
  }

  return {
    status: "forbidden",
    user,
    configured: adminEmails.size > 0,
  };
}

export async function requireAdminUser() {
  const gate = await getAdminGate();
  if (gate.status !== "allowed") return null;
  return gate.user;
}

function configuredAdminEmails() {
  return new Set(
    (process.env.CHUNESIDE_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function findMemberAccount(id: string) {
  try {
    const [member] = await getDb().select({
      accountRole: members.accountRole,
      accountStatus: members.accountStatus,
    }).from(members).where(eq(members.id, id)).limit(1);
    return member ?? null;
  } catch {
    return null;
  }
}
