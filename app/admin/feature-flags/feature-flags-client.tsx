"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Save, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { FeatureFlagRecord, FeatureFlagState } from "@/lib/feature-flags";

const stateLabels: Record<FeatureFlagState, string> = {
  off: "Off",
  admin_test: "Admin test only",
  on: "On for everyone",
};

export function FeatureFlagsClient({
  adminAccessSource,
  initialFlags,
}: {
  adminAccessSource: "allowlist" | "role";
  initialFlags: FeatureFlagRecord[];
}) {
  const [flags, setFlags] = useState(initialFlags);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const grouped = useMemo(() => {
    return flags.reduce<Record<string, FeatureFlagRecord[]>>((groups, flag) => {
      groups[flag.category] ??= [];
      groups[flag.category].push(flag);
      return groups;
    }, {});
  }, [flags]);

  async function updateFlag(key: string, state: FeatureFlagState) {
    setBusyKey(key);
    setMessage("");

    const response = await fetch("/api/admin/feature-flags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, state }),
    });

    if (!response.ok) {
      setMessage("That feature switch could not be saved.");
      setBusyKey(null);
      return;
    }

    const data = await response.json() as { flag: FeatureFlagRecord };
    setFlags((current) => current.map((flag) => flag.key === key ? data.flag : flag));
    setMessage("Feature control updated.");
    setBusyKey(null);
  }

  return (
    <main className="admin-shell">
      <header className="admin-hero">
        <Link href="/" className="admin-brand" aria-label="Back to ChuneSide">
          <Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority />
        </Link>
        <div>
          <span><ShieldCheck /> Admin foundation</span>
          <h1>Feature Control</h1>
          <p>Switch major ChuneSide modules without deleting code. Money, uploads, payouts, and experimental systems start locked down.</p>
          <small className="admin-access-source">Access granted by {adminAccessSource === "allowlist" ? "owner email allowlist" : "database admin role"}.</small>
        </div>
      </header>

      <nav className="admin-toolbar admin-nav-actions" aria-label="Admin sections">
        <Button asChild variant="outline"><Link href="/admin/accounts">Accounts</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/catalog">Catalogue</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/analytics">Analytics</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/reviews">Review Queue</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/announcements">News Bar</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/advertising">Advertising</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/ai-controls">AI Controls</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/visualizer">Visualizer</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/stage">Stage</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/trophies">Trophy Case</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/audit">Audit Log</Link></Button>
      </nav>

      <section className="admin-summary" aria-label="Feature control summary">
        <div><strong>{flags.filter((flag) => flag.state === "on").length}</strong><span>On for everyone</span></div>
        <div><strong>{flags.filter((flag) => flag.state === "admin_test").length}</strong><span>Admin test only</span></div>
        <div><strong>{flags.filter((flag) => flag.state === "off").length}</strong><span>Off</span></div>
      </section>

      {message && <p className="admin-message">{message}</p>}

      <div className="feature-control-grid">
        {Object.entries(grouped).map(([category, categoryFlags]) => (
          <section className="feature-category" key={category}>
            <div className="feature-category-heading">
              <SlidersHorizontal />
              <h2>{category}</h2>
            </div>
            <div className="feature-list">
              {categoryFlags.map((flag) => (
                <article className="feature-row" key={flag.key}>
                  <div>
                    <h3>{flag.label}</h3>
                    <p>{flag.description}</p>
                    <small>{flag.allowArtistOverride ? "Artist-level override can be added" : "Global control only"}</small>
                  </div>
                  <label>
                    <span className={`flag-state ${flag.state}`}>{stateLabels[flag.state]}</span>
                    <NativeSelect
                      value={flag.state}
                      disabled={busyKey === flag.key}
                      onChange={(event) => updateFlag(flag.key, event.target.value as FeatureFlagState)}
                      aria-label={`Set ${flag.label} availability`}
                    >
                      <NativeSelectOption value="off">Off</NativeSelectOption>
                      <NativeSelectOption value="admin_test">Admin test only</NativeSelectOption>
                      <NativeSelectOption value="on">On for everyone</NativeSelectOption>
                    </NativeSelect>
                  </label>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="admin-footer">
        <Button asChild variant="outline">
          <Link href="/">Back to ChuneSide</Link>
        </Button>
        <span><Save /> Every saved change is written to the admin audit log.</span>
      </footer>
    </main>
  );
}
