"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ClipboardList, Search, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type AuditLog = { id: string; actorId: string; actorEmail: string; action: string; entityType: string; entityId: string; details: string; createdAt: string };

export function AuditClient({ adminAccessSource, initialLogs }: { adminAccessSource: "allowlist" | "role"; initialLogs: AuditLog[] }) {
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const visibleLogs = useMemo(() => initialLogs.filter((log) => {
    const text = [log.actorEmail, log.action, log.entityType, log.entityId, log.details].join(" ").toLowerCase();
    return (!query.trim() || text.includes(query.trim().toLowerCase())) && (actionFilter === "all" || log.action === actionFilter) && (entityFilter === "all" || log.entityType === entityFilter);
  }), [actionFilter, entityFilter, initialLogs, query]);
  const actions = [...new Set(initialLogs.map((log) => log.action))];
  const entityTypes = [...new Set(initialLogs.map((log) => log.entityType))];
  return <main className="admin-shell"><header className="admin-hero"><Link href="/" className="admin-brand" aria-label="Back to ChuneSide"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link><div><span><ClipboardList /> Admin history</span><h1>Audit Log</h1><p>Review privileged changes, release decisions, and the reasons recorded by Admin users.</p><small className="admin-access-source">Access granted by {adminAccessSource === "allowlist" ? "owner email allowlist" : "database admin role"}.</small></div></header><nav className="admin-toolbar admin-nav-actions" aria-label="Admin sections"><Link className="button button-outline" href="/admin/accounts">Accounts</Link><Link className="button button-outline" href="/admin/catalog">Catalogue</Link><Link className="button button-outline" href="/admin/reviews">Review Queue</Link><Link className="button button-outline" href="/admin/stage">Stage</Link></nav><section className="admin-summary" aria-label="Audit summary"><div><strong>{initialLogs.length}</strong><span>Recent events</span></div><div><strong>{new Set(initialLogs.map((log) => log.actorId)).size}</strong><span>Admin actors</span></div><div><strong>{visibleLogs.length}</strong><span>Showing</span></div></section><section className="audit-filters" aria-label="Filter audit history"><label><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search actor, action, entity or reason" aria-label="Search audit history" /></label><NativeSelect value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} aria-label="Filter audit actions"><NativeSelectOption value="all">All actions</NativeSelectOption>{actions.map((action) => <NativeSelectOption key={action} value={action}>{label(action)}</NativeSelectOption>)}</NativeSelect><NativeSelect value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)} aria-label="Filter audit entities"><NativeSelectOption value="all">All entity types</NativeSelectOption>{entityTypes.map((entity) => <NativeSelectOption key={entity} value={entity}>{label(entity)}</NativeSelectOption>)}</NativeSelect></section><section className="audit-log-list" aria-label="Audit events">{visibleLogs.map((log) => <article key={log.id}><div className="audit-log-icon"><ShieldCheck /></div><div><strong>{label(log.action)}</strong><p>{log.actorEmail} · {label(log.entityType)} · {log.entityId}</p><small>{formatDate(log.createdAt)}</small><pre>{formatDetails(log.details)}</pre></div></article>)}{!visibleLogs.length && <div className="admin-empty"><Search /><h2>No matching audit events</h2><p>Try a different search or action.</p></div>}</section></main>;
}

function label(value: string) { return value.replaceAll("_", " ").replaceAll(".", " / ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: string) { return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
function formatDetails(value: string) { try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; } }
