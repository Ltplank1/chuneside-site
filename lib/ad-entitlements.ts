import type { CurrentMemberUser } from "@/app/member-auth";

// Membership billing is intentionally outside this feature. Keep the future Pro bypass at one boundary.
export function hasAdFreeEntitlement(_member: CurrentMemberUser | null) {
  return false;
}
