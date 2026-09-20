"use client";

import { FormEvent, useEffect, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ContributorRoleField, CountryRegionField, DurationField, GenreField, MoodField } from "@/components/forms/shared-metadata-fields";
import type { AdminArtist, AdminRelease, CatalogSaveResponse, OwnerAccount } from "./catalog-types";

type EditorState =
  | { kind: "artist"; item: AdminArtist | null }
  | { kind: "release"; item: AdminRelease | null }
  | null;

export function CatalogEditor({ editor, artists, ownerAccounts, onClose, onSaved }: {
  editor: EditorState;
  artists: AdminArtist[];
  ownerAccounts: OwnerAccount[];
  onClose: () => void;
  onSaved: (result: CatalogSaveResponse) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [artistCredits, setArtistCredits] = useState<Array<{ artistProfileId: string; role: "featured" | "co_artist" }>>([]);
  const [additionalCredits, setAdditionalCredits] = useState<Array<{ role: string; contributorName: string; artistProfileId: string | null }>>([]);

  useEffect(() => {
    if (editor?.kind === "release") {
      setArtistCredits(editor.item?.artistCredits ?? []);
      setAdditionalCredits(editor.item?.additionalCredits ?? []);
    } else {
      setArtistCredits([]);
      setAdditionalCredits([]);
    }
  }, [editor?.kind, editor?.item?.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const body = editor.kind === "artist"
      ? {
          entity: "artist",
          id: editor.item?.id,
          ownerMemberId: form.get("ownerMemberId"),
          studioMemberId: form.get("studioMemberId"),
          stageName: form.get("stageName"),
          slug: form.get("slug"),
          biography: form.get("biography"),
          countryRegion: form.get("countryRegion"),
          primaryGenre: presetFieldValue(form, "primaryGenre"),
          profilePhotoUrl: form.get("profilePhotoUrl"),
          coverImageUrl: form.get("coverImageUrl"),
          websiteUrl: form.get("websiteUrl"),
          instagramUrl: form.get("instagramUrl"),
          spotifyUrl: form.get("spotifyUrl"),
          appleMusicUrl: form.get("appleMusicUrl"),
          youtubeUrl: form.get("youtubeUrl"),
          verificationStatus: form.get("verificationStatus"),
          foundingArtist: form.get("foundingArtist") === "on",
          visibility: form.get("visibility"),
        }
      : {
          entity: "release",
          id: editor.item?.id,
          artistProfileId: form.get("artistProfileId"),
          title: form.get("title"),
          slug: form.get("slug"),
          featuringArtist: form.get("featuringArtist"),
          genre: presetFieldValue(form, "genre"),
          region: form.get("region"),
          discoveryLane: form.get("discoveryLane"),
          creationType: form.get("creationType"),
          aiClassification: form.get("aiClassification"),
          mood: presetFieldValue(form, "mood"),
          durationSeconds: form.get("durationSeconds") ? Number(form.get("durationSeconds")) : null,
          explicitStatus: form.get("explicitStatus"),
          downloadEligibility: form.get("downloadEligibility"),
          approvalStatus: form.get("approvalStatus"),
          publicationStatus: form.get("publicationStatus"),
          publicationAt: form.get("publicationAt"),
          featured: form.get("featured") === "on",
          artistCredits,
          additionalCredits,
        };

    const response = await fetch("/api/admin/catalog", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json() as CatalogSaveResponse | { error?: string };
    if (!response.ok || !("entity" in data)) {
      setError("error" in data ? data.error ?? "The catalogue record could not be saved." : "The catalogue record could not be saved.");
      setBusy(false);
      return;
    }

    onSaved(data);
    setBusy(false);
    onClose();
  }

  const socialLinks = editor?.kind === "artist" ? readSocialLinks(editor.item?.socialLinksJson) : {};
  const title = editor?.kind === "artist"
    ? (editor.item ? "Edit artist" : "Create artist")
    : (editor?.item ? "Edit release" : "Create release");

  return (
    <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="catalog-editor-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Save controlled catalogue metadata. Media uploads and financial settings remain separate.</DialogDescription>
        </DialogHeader>
        {editor && (
          <form key={(editor.item?.id ?? "new") + editor.kind} onSubmit={submit} className="catalog-editor-form">
            {editor.kind === "artist"
              ? <ArtistFields artist={editor.item} socialLinks={socialLinks} ownerAccounts={ownerAccounts} />
              : <ReleaseFields release={editor.item} artists={artists} artistCredits={artistCredits} setArtistCredits={setArtistCredits} additionalCredits={additionalCredits} setAdditionalCredits={setAdditionalCredits} />}
            {error && <p className="catalog-editor-error" role="alert">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={busy}>
                {busy ? <LoaderCircle className="catalog-spinner" /> : <Save />}
                Save
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ArtistFields({ artist, socialLinks, ownerAccounts }: { artist: AdminArtist | null; socialLinks: Record<string, string>; ownerAccounts: OwnerAccount[] }) {
  return (
    <div className="catalog-form-grid">
      <Field label="Artist name"><Input name="stageName" required maxLength={120} defaultValue={artist?.stageName ?? ""} /></Field>
      <Field label="Profile slug"><Input name="slug" required maxLength={80} placeholder="artist-name" defaultValue={artist?.slug ?? ""} /></Field>
      <CountryRegionField name="countryRegion" label="Country/Region" value={artist?.countryRegion ?? ""} required />
      <GenreField name="primaryGenre" value={artist?.primaryGenre ?? ""} required />
      <Field label="Visibility"><Choice name="visibility" value={artist?.visibility ?? "draft"} options={["draft", "public", "disabled"]} /></Field>
      <Field label="Verification"><Choice name="verificationStatus" value={artist?.verificationStatus ?? "unverified"} options={["unverified", "pending", "verified", "rejected"]} /></Field>
      <Field label="Owner account"><Choice name="ownerMemberId" value={artist?.ownerMemberId ?? "__none__"} options={[["__none__", "Not linked"], ...ownerAccounts.map((account): [string, string] => [account.id, account.displayName + " · " + account.email])]} /></Field>
      <Field label="Associated studio (optional)"><Choice name="studioMemberId" value={artist?.studioMemberId ?? "__none__"} options={[["__none__", "No studio association"], ...ownerAccounts.filter((account) => account.accountRole === "studio").map((account): [string, string] => [account.id, account.displayName + " · " + account.email])]} /></Field>
      <Field label="Profile photo URL"><Input name="profilePhotoUrl" type="url" defaultValue={artist?.profilePhotoUrl ?? ""} /></Field>
      <Field label="Cover image URL"><Input name="coverImageUrl" type="url" defaultValue={artist?.coverImageUrl ?? ""} /></Field>
      <Field label="Website"><Input name="websiteUrl" type="url" defaultValue={socialLinks.Website ?? ""} /></Field>
      <Field label="Instagram"><Input name="instagramUrl" type="url" defaultValue={socialLinks.Instagram ?? ""} /></Field>
      <Field label="Spotify"><Input name="spotifyUrl" type="url" defaultValue={socialLinks.Spotify ?? ""} /></Field>
      <Field label="Apple Music"><Input name="appleMusicUrl" type="url" defaultValue={socialLinks["Apple Music"] ?? ""} /></Field>
      <Field label="YouTube"><Input name="youtubeUrl" type="url" defaultValue={socialLinks.YouTube ?? ""} /></Field>
      <label className="catalog-check"><input name="foundingArtist" type="checkbox" defaultChecked={artist?.foundingArtist ?? false} /><span>Founding Artist</span></label>
      <Field label="Biography" wide><Textarea name="biography" maxLength={2000} defaultValue={artist?.biography ?? ""} /></Field>
    </div>
  );
}

function ReleaseFields({ release, artists, artistCredits, setArtistCredits, additionalCredits, setAdditionalCredits }: {
  release: AdminRelease | null;
  artists: AdminArtist[];
  artistCredits: Array<{ artistProfileId: string; role: "featured" | "co_artist" }>;
  setArtistCredits: React.Dispatch<React.SetStateAction<Array<{ artistProfileId: string; role: "featured" | "co_artist" }>>>;
  additionalCredits: Array<{ role: string; contributorName: string; artistProfileId: string | null }>;
  setAdditionalCredits: React.Dispatch<React.SetStateAction<Array<{ role: string; contributorName: string; artistProfileId: string | null }>>>;
}) {
  return (
    <div className="catalog-form-grid">
      <Field label="Artist"><Choice name="artistProfileId" value={release?.artistProfileId ?? artists[0]?.id ?? ""} options={artists.map((artist) => [artist.id, artist.stageName])} /></Field>
      <Field label="Release title"><Input name="title" required maxLength={160} defaultValue={release?.title ?? ""} /></Field>
      <Field label="Release slug"><Input name="slug" required maxLength={80} placeholder="release-title" defaultValue={release?.slug ?? ""} /></Field>
      <Field label="Featuring artist"><Input name="featuringArtist" maxLength={160} defaultValue={release?.featuringArtist ?? ""} /></Field>
      <CreditFields artists={artists} artistCredits={artistCredits} setArtistCredits={setArtistCredits} additionalCredits={additionalCredits} setAdditionalCredits={setAdditionalCredits} />
      <GenreField name="genre" value={release?.genre ?? ""} required />
      <CountryRegionField name="region" value={release?.region ?? ""} required />
      <Field label="Discovery lane"><Choice name="discoveryLane" value={release?.discoveryLane ?? "wadadli"} options={["wadadli", "caribbean", "ai", "world"]} /></Field>
      <Field label="Creation disclosure"><Choice name="creationType" value={release?.creationType ?? "artist_made"} options={[["artist_made", "Artist-made"], ["ai_assisted", "AI-assisted"]]} /></Field>
      <Field label="AI classification"><Choice name="aiClassification" value={release?.aiClassification ?? "human_created"} options={[["human_created", "Human-created"], ["ai_assisted", "AI-assisted"], ["primarily_ai_generated", "Primarily AI-generated"], ["classification_pending", "Classification pending"]]} /></Field>
      <MoodField name="mood" value={release?.mood ?? ""} />
      <DurationField value={release?.durationSeconds} />
      <Field label="Content label"><Choice name="explicitStatus" value={release?.explicitStatus ?? "clean"} options={["clean", "explicit"]} /></Field>
      <Field label="Downloads"><Choice name="downloadEligibility" value={release?.downloadEligibility ?? "streaming_only"} options={[["streaming_only", "Streaming only"], ["free_download", "Free download"], ["paid_download", "Paid download"]]} /></Field>
      <Field label="Approval"><Choice name="approvalStatus" value={release?.approvalStatus ?? "draft"} options={["draft", "pending", "approved", "rejected", "disabled"]} /></Field>
      <Field label="Publication"><Choice name="publicationStatus" value={release?.publicationStatus ?? (release?.approvalStatus === "approved" ? "published" : "unpublished")} options={["unpublished", "scheduled", "published", "archived"]} /></Field>
      <Field label="Publish at"><Input name="publicationAt" type="datetime-local" defaultValue={release?.publicationAt ? new Date(release.publicationAt).toISOString().slice(0, 16) : ""} /></Field>
      <label className="catalog-check"><input name="featured" type="checkbox" defaultChecked={release?.featured ?? false} /><span>Featured release</span></label>
    </div>
  );
}

function CreditFields({ artists, artistCredits, setArtistCredits, additionalCredits, setAdditionalCredits }: {
  artists: AdminArtist[];
  artistCredits: Array<{ artistProfileId: string; role: "featured" | "co_artist" }>;
  setArtistCredits: React.Dispatch<React.SetStateAction<Array<{ artistProfileId: string; role: "featured" | "co_artist" }>>>;
  additionalCredits: Array<{ role: string; contributorName: string; artistProfileId: string | null }>;
  setAdditionalCredits: React.Dispatch<React.SetStateAction<Array<{ role: string; contributorName: string; artistProfileId: string | null }>>>;
}) {
  return <div className="catalog-credits-panel">
    <div className="catalog-section-heading"><div><span className="kicker">Release credits</span><h3>Collaborators and contributors</h3></div><small>All optional. Stats stay on this one release.</small></div>
    <p className="catalog-help-copy">Link featured artists and co-artists to existing profiles. Add producers or any other role below; a contributor profile can be linked when available.</p>
    <div className="catalog-credit-list">
      {artistCredits.map((credit, index) => <div className="catalog-credit-row" key={`${credit.artistProfileId}-${index}`}>
        <ArtistSearch value={credit.artistProfileId} artists={artists} onChange={(artistProfileId) => setArtistCredits((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, artistProfileId } : item))} />
        <NativeSelect value={credit.role} onChange={(event) => setArtistCredits((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value as "featured" | "co_artist" } : item))}><NativeSelectOption value="featured">Featured artist</NativeSelectOption><NativeSelectOption value="co_artist">Co-artist</NativeSelectOption></NativeSelect>
        <Button type="button" variant="ghost" size="icon" aria-label="Remove linked artist" onClick={() => setArtistCredits((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</Button>
      </div>)}
    </div>
    <Button type="button" variant="outline" onClick={() => setArtistCredits((current) => [...current, { artistProfileId: artists[0]?.id ?? "", role: "featured" }])} disabled={!artists.length}>Add linked artist</Button>
    <div className="catalog-credit-list">
      {additionalCredits.map((credit, index) => <div className="catalog-credit-row" key={`additional-${index}`}>
        <ContributorRoleField value={credit.role} onChange={(role) => setAdditionalCredits((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, role } : item))} />
        <Input value={credit.contributorName} onChange={(event) => setAdditionalCredits((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, contributorName: event.target.value } : item))} placeholder="Contributor name" aria-label="Contributor name" />
        <NativeSelect value={credit.artistProfileId ?? ""} onChange={(event) => setAdditionalCredits((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, artistProfileId: event.target.value || null } : item))}><NativeSelectOption value="">No linked profile</NativeSelectOption>{artists.map((artist) => <NativeSelectOption key={artist.id} value={artist.id}>{artist.stageName}</NativeSelectOption>)}</NativeSelect>
        <Button type="button" variant="ghost" size="icon" aria-label="Remove credit" onClick={() => setAdditionalCredits((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</Button>
      </div>)}
    </div>
    <Button type="button" variant="outline" onClick={() => setAdditionalCredits((current) => [...current, { role: "", contributorName: "", artistProfileId: null }])}>Add contributor credit</Button>
  </div>;
}

function ArtistSearch({ value, artists, onChange }: { value: string; artists: AdminArtist[]; onChange: (value: string) => void }) {
  const selected = artists.find((artist) => artist.id === value);
  const [query, setQuery] = useState(selected?.stageName ?? "");
  const matches = artists.filter((artist) => artist.stageName.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
  return <div className="catalog-artist-search"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search artist profile" aria-label="Search artist profile" />{query && matches.length > 0 && <div className="catalog-artist-suggestions">{matches.map((artist) => <button type="button" key={artist.id} onClick={() => { onChange(artist.id); setQuery(artist.stageName); }}>{artist.stageName}</button>)}</div>}</div>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "catalog-field wide" : "catalog-field"}><span>{label}</span>{children}</label>;
}

function Choice({ name, value, options }: { name: string; value: string; options: Array<string | [string, string]> }) {
  return (
    <NativeSelect name={name} defaultValue={value} required>
      {options.map((option) => {
        const [optionValue, label] = Array.isArray(option) ? option : [option, titleCase(option)];
        return <NativeSelectOption value={optionValue} key={optionValue}>{label}</NativeSelectOption>;
      })}
    </NativeSelect>
  );
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readSocialLinks(value?: string) {
  try {
    const parsed = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function presetFieldValue(form: FormData, name: string) {
  const value = String(form.get(name) ?? "").trim();
  return value === "__other__" ? String(form.get(`${name}Other`) ?? "").trim() : value;
}

export type { EditorState };
