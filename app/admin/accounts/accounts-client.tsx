"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, ListFilter, Save, Search, ShieldCheck, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  accountRoles,
  accountStatuses,
  artistVerificationStatuses,
  monetizationStates,
  monetizationLabels,
  roleLabels,
  statusLabels,
  verificationLabels,
  type AccountRole,
  type AccountStatus,
  type ArtistVerificationStatus,
  type MonetizationState,
} from "@/lib/accounts";

type AdminAccount = {
  id: string;
  email: string;
  displayName: string;
  accountRole: AccountRole;
  accountStatus: AccountStatus;
  artistVerificationStatus: ArtistVerificationStatus;
  foundingArtist: boolean;
  foundingStudioPartner: boolean;
  monetizationState: MonetizationState;
  moderationNote: string | null;
  createdAt: string | Date;
  lastSeenAt: string | Date;
};

export function AccountsClient({
  adminAccessSource,
  initialAccounts,
}: {
  adminAccessSource: "allowlist" | "role";
  initialAccounts: AdminAccount[];
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AccountRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | AccountStatus>("all");
  const [previewFilter, setPreviewFilter] = useState<"all" | "admins" | "active_artists" | "verified_artists" | "restricted" | "founding">("all");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialAccounts.map((account) => [account.id, account.moderationNote ?? ""])),
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const visibleAccounts = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return accounts.filter((account) => {
      const matchesQuery = !clean || `${account.email} ${account.displayName} ${account.accountRole} ${account.accountStatus} ${account.artistVerificationStatus}`
        .toLowerCase()
        .includes(clean);
      const matchesRole = roleFilter === "all" || account.accountRole === roleFilter;
      const matchesStatus = statusFilter === "all" || account.accountStatus === statusFilter;
      const matchesPreview =
        previewFilter === "all" ||
        (previewFilter === "admins" && account.accountRole === "admin" && account.accountStatus === "active") ||
        (previewFilter === "active_artists" && account.accountRole === "artist" && account.accountStatus === "active") ||
        (previewFilter === "verified_artists" && account.accountRole === "artist" && account.artistVerificationStatus === "verified" && account.accountStatus === "active") ||
        (previewFilter === "restricted" && account.accountStatus !== "active") ||
        (previewFilter === "founding" && (account.foundingArtist || account.foundingStudioPartner));
      return matchesQuery && matchesRole && matchesStatus && matchesPreview;
    });
  }, [accounts, previewFilter, query, roleFilter, statusFilter]);

  const activeAdmins = accounts.filter((account) => account.accountRole === "admin" && account.accountStatus === "active").length;
  const activeArtists = accounts.filter((account) => account.accountRole === "artist" && account.accountStatus === "active").length;
  const verifiedArtists = accounts.filter((account) => account.accountRole === "artist" && account.artistVerificationStatus === "verified" && account.accountStatus === "active").length;
  const restrictedAccounts = accounts.filter((account) => account.accountStatus !== "active").length;

  async function updateAccount(account: AdminAccount, patch: Partial<AdminAccount>) {
    const next = {
      ...account,
      ...patch,
      moderationNote: Object.hasOwn(patch, "moderationNote")
        ? patch.moderationNote ?? null
        : noteDrafts[account.id] ?? account.moderationNote,
    };
    setBusyId(account.id);
    setMessage("");

    const response = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        memberId: next.id,
        accountRole: next.accountRole,
        accountStatus: next.accountStatus,
        artistVerificationStatus: next.artistVerificationStatus,
        foundingArtist: next.foundingArtist,
        foundingStudioPartner: next.foundingStudioPartner,
        monetizationState: next.monetizationState,
        moderationNote: next.moderationNote,
      }),
    });

    if (!response.ok) {
      setMessage("That account update could not be saved.");
      setBusyId(null);
      return;
    }

    const data = await response.json() as { account: AdminAccount };
    setAccounts((current) => current.map((item) => item.id === account.id ? data.account : item));
    setNoteDrafts((current) => ({ ...current, [account.id]: data.account.moderationNote ?? "" }));
    setMessage("Account controls updated.");
    setBusyId(null);
  }

  return (
    <main className="admin-shell">
      <header className="admin-hero">
        <Link href="/" className="admin-brand" aria-label="Back to ChuneSide">
          <Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority />
        </Link>
        <div>
          <span><UserCog /> Admin foundation</span>
          <h1>Accounts</h1>
          <p>Manage roles, account status, artist verification, founding badges, and monetization readiness from one protected place.</p>
          <small className="admin-access-source">Access granted by {adminAccessSource === "allowlist" ? "owner email allowlist" : "database admin role"}.</small>
        </div>
      </header>

      <section className="admin-toolbar">
        <label className="admin-search">
          <Search />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search accounts" aria-label="Search accounts" />
        </label>
        <div className="admin-nav-actions">
          <Button asChild variant="outline"><Link href="/admin/catalog">Catalogue</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/reviews">Review Queue</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/feature-flags">Feature Control</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/announcements">News Bar</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/ai-controls">AI Controls</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/stage">Stage</Link></Button>
          <Button asChild variant="outline"><Link href="/admin/audit">Audit Log</Link></Button>
        </div>
      </section>

      <section className="account-roster-filters" aria-label="Private preview roster filters">
        <label>
          <span><ListFilter /> Role</span>
          <NativeSelect value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as "all" | AccountRole)}>
            <NativeSelectOption value="all">All roles</NativeSelectOption>
            {accountRoles.map((role) => <NativeSelectOption key={role} value={role}>{roleLabels[role]}</NativeSelectOption>)}
          </NativeSelect>
        </label>
        <label>
          <span>Status</span>
          <NativeSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | AccountStatus)}>
            <NativeSelectOption value="all">All statuses</NativeSelectOption>
            {accountStatuses.map((status) => <NativeSelectOption key={status} value={status}>{statusLabels[status]}</NativeSelectOption>)}
          </NativeSelect>
        </label>
        <label>
          <span>Preview roster</span>
          <NativeSelect value={previewFilter} onChange={(event) => setPreviewFilter(event.target.value as typeof previewFilter)}>
            <NativeSelectOption value="all">All accounts</NativeSelectOption>
            <NativeSelectOption value="admins">Active admins</NativeSelectOption>
            <NativeSelectOption value="active_artists">Active artists</NativeSelectOption>
            <NativeSelectOption value="verified_artists">Verified artists</NativeSelectOption>
            <NativeSelectOption value="restricted">Restricted accounts</NativeSelectOption>
            <NativeSelectOption value="founding">Founding testers</NativeSelectOption>
          </NativeSelect>
        </label>
      </section>

      <section className="admin-summary" aria-label="Account summary">
        <div><strong>{accounts.length}</strong><span>Known accounts</span></div>
        <div><strong>{activeAdmins}</strong><span>Active admins</span></div>
        <div><strong>{activeArtists}</strong><span>Active artists</span></div>
        <div><strong>{verifiedArtists}</strong><span>Verified artists</span></div>
        <div><strong>{restrictedAccounts}</strong><span>Restricted</span></div>
      </section>

      {message && <p className="admin-message">{message}</p>}

      <section className="account-list">
        {visibleAccounts.map((account) => (
          <article className="account-row" key={account.id}>
            <div className="account-identity">
              <b>{account.displayName.slice(0, 2).toUpperCase()}</b>
              <div>
                <h2>{account.displayName}</h2>
                <p>{account.email}</p>
                <small>{account.id}</small>
                <div className="preview-readiness" aria-label={`${account.displayName} preview readiness`}>
                  {account.accountRole === "admin" && account.accountStatus === "active" && <span>Admin tester</span>}
                  {account.accountRole === "artist" && account.accountStatus === "active" && <span>Artist tester</span>}
                  {account.accountRole === "artist" && account.artistVerificationStatus === "verified" && <span>Verified artist</span>}
                  {account.accountStatus !== "active" && <span className="restricted">Restricted</span>}
                  {(account.foundingArtist || account.foundingStudioPartner) && <span>Founding</span>}
                </div>
              </div>
            </div>

            <div className="account-controls">
              <label>
                <span>Role</span>
                <NativeSelect value={account.accountRole} disabled={busyId === account.id} onChange={(event) => updateAccount(account, { accountRole: event.target.value as AccountRole })}>
                  {accountRoles.map((role) => <NativeSelectOption key={role} value={role}>{roleLabels[role]}</NativeSelectOption>)}
                </NativeSelect>
              </label>
              <label>
                <span>Status</span>
                <NativeSelect value={account.accountStatus} disabled={busyId === account.id} onChange={(event) => updateAccount(account, { accountStatus: event.target.value as AccountStatus })}>
                  {accountStatuses.map((status) => <NativeSelectOption key={status} value={status}>{statusLabels[status]}</NativeSelectOption>)}
                </NativeSelect>
              </label>
              <label>
                <span>Verification</span>
                <NativeSelect value={account.artistVerificationStatus} disabled={busyId === account.id} onChange={(event) => updateAccount(account, { artistVerificationStatus: event.target.value as ArtistVerificationStatus })}>
                  {artistVerificationStatuses.map((status) => <NativeSelectOption key={status} value={status}>{verificationLabels[status]}</NativeSelectOption>)}
                </NativeSelect>
              </label>
              <label>
                <span>Monetization</span>
                <NativeSelect value={account.monetizationState} disabled={busyId === account.id} onChange={(event) => updateAccount(account, { monetizationState: event.target.value as MonetizationState })}>
                  {monetizationStates.map((state) => <NativeSelectOption key={state} value={state}>{monetizationLabels[state]}</NativeSelectOption>)}
                </NativeSelect>
              </label>
            </div>

            <div className="account-badges">
              <button className={account.foundingArtist ? "selected" : ""} disabled={busyId === account.id} onClick={() => updateAccount(account, { foundingArtist: !account.foundingArtist })}>
                <BadgeCheck /> Founding Artist
              </button>
              <button className={account.foundingStudioPartner ? "selected" : ""} disabled={busyId === account.id} onClick={() => updateAccount(account, { foundingStudioPartner: !account.foundingStudioPartner })}>
                <ShieldCheck /> Founding Studio
              </button>
            </div>

            <div className="account-note">
              <label>
                <span>Private preview note</span>
                <Textarea
                  value={noteDrafts[account.id] ?? ""}
                  maxLength={500}
                  disabled={busyId === account.id}
                  onChange={(event) => setNoteDrafts((current) => ({ ...current, [account.id]: event.target.value }))}
                  placeholder="Why this account is ready, blocked, or needs follow-up"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={busyId === account.id || (noteDrafts[account.id] ?? "") === (account.moderationNote ?? "")}
                onClick={() => updateAccount(account, { moderationNote: noteDrafts[account.id] ?? "" })}
              >
                <Save /> Save note
              </Button>
            </div>
          </article>
        ))}

        {visibleAccounts.length === 0 && (
          <div className="admin-empty">
            <UserCog />
            <h2>No accounts found</h2>
            <p>Members appear here after they sign in and take an account-backed action such as Like or Follow.</p>
          </div>
        )}
      </section>

      <footer className="admin-footer">
        <Button asChild variant="outline">
          <Link href="/">Back to ChuneSide</Link>
        </Button>
        <span><Save /> Account changes are written to the admin audit log.</span>
      </footer>
    </main>
  );
}
