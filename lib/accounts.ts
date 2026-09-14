export const accountRoles = ["member", "artist", "dj", "studio", "admin"] as const;
export const accountStatuses = ["active", "frozen", "blocked", "disabled"] as const;
export const artistVerificationStatuses = ["unverified", "pending", "verified", "rejected"] as const;
export const monetizationStates = ["not_applied", "pending", "approved", "suspended", "rejected"] as const;

export type AccountRole = typeof accountRoles[number];
export type AccountStatus = typeof accountStatuses[number];
export type ArtistVerificationStatus = typeof artistVerificationStatuses[number];
export type MonetizationState = typeof monetizationStates[number];

export const roleLabels: Record<AccountRole, string> = {
  member: "Listener / Member",
  artist: "Artist",
  dj: "DJ",
  studio: "Studio / Producer",
  admin: "Admin",
};

export const statusLabels: Record<AccountStatus, string> = {
  active: "Active",
  frozen: "Frozen",
  blocked: "Blocked",
  disabled: "Disabled",
};

export const verificationLabels: Record<ArtistVerificationStatus, string> = {
  unverified: "Unverified",
  pending: "Verification pending",
  verified: "Verified",
  rejected: "Rejected",
};

export const monetizationLabels: Record<MonetizationState, string> = {
  not_applied: "Not applied",
  pending: "Application pending",
  approved: "Approved",
  suspended: "Suspended",
  rejected: "Rejected",
};

export function isAccountRole(value: unknown): value is AccountRole {
  return accountRoles.includes(value as AccountRole);
}

export function isAccountStatus(value: unknown): value is AccountStatus {
  return accountStatuses.includes(value as AccountStatus);
}

export function isArtistVerificationStatus(value: unknown): value is ArtistVerificationStatus {
  return artistVerificationStatuses.includes(value as ArtistVerificationStatus);
}

export function isMonetizationState(value: unknown): value is MonetizationState {
  return monetizationStates.includes(value as MonetizationState);
}
