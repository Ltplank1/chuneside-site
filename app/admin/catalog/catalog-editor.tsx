"use client";

import { FormEvent, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
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
          stageName: form.get("stageName"),
          slug: form.get("slug"),
          biography: form.get("biography"),
          countryRegion: form.get("countryRegion"),
          primaryGenre: form.get("primaryGenre"),
          profilePhotoUrl: form.get("profilePhotoUrl"),
          coverImageUrl: form.get("coverImageUrl"),
          websiteUrl: form.get("websiteUrl"),
          instagramUrl: form.get("instagramUrl"),
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
          genre: form.get("genre"),
          region: form.get("region"),
          discoveryLane: form.get("discoveryLane"),
          creationType: form.get("creationType"),
          aiClassification: form.get("aiClassification"),
          mood: form.get("mood"),
          durationSeconds: form.get("durationSeconds") ? Number(form.get("durationSeconds")) : null,
          explicitStatus: form.get("explicitStatus"),
          downloadEligibility: form.get("downloadEligibility"),
          approvalStatus: form.get("approvalStatus"),
          featured: form.get("featured") === "on",
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
              : <ReleaseFields release={editor.item} artists={artists} />}
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
      <Field label="Country or region"><Input name="countryRegion" required maxLength={120} defaultValue={artist?.countryRegion ?? ""} /></Field>
      <Field label="Primary genre"><Input name="primaryGenre" required maxLength={80} defaultValue={artist?.primaryGenre ?? ""} /></Field>
      <Field label="Visibility"><Choice name="visibility" value={artist?.visibility ?? "draft"} options={["draft", "public", "disabled"]} /></Field>
      <Field label="Verification"><Choice name="verificationStatus" value={artist?.verificationStatus ?? "unverified"} options={["unverified", "pending", "verified", "rejected"]} /></Field>
      <Field label="Owner account"><Choice name="ownerMemberId" value={artist?.ownerMemberId ?? "__none__"} options={[["__none__", "Not linked"], ...ownerAccounts.map((account): [string, string] => [account.id, account.displayName + " · " + account.email])]} /></Field>
      <Field label="Profile photo URL"><Input name="profilePhotoUrl" type="url" defaultValue={artist?.profilePhotoUrl ?? ""} /></Field>
      <Field label="Cover image URL"><Input name="coverImageUrl" type="url" defaultValue={artist?.coverImageUrl ?? ""} /></Field>
      <Field label="Website"><Input name="websiteUrl" type="url" defaultValue={socialLinks.Website ?? ""} /></Field>
      <Field label="Instagram"><Input name="instagramUrl" type="url" defaultValue={socialLinks.Instagram ?? ""} /></Field>
      <Field label="YouTube"><Input name="youtubeUrl" type="url" defaultValue={socialLinks.YouTube ?? ""} /></Field>
      <label className="catalog-check"><input name="foundingArtist" type="checkbox" defaultChecked={artist?.foundingArtist ?? false} /><span>Founding Artist</span></label>
      <Field label="Biography" wide><Textarea name="biography" maxLength={2000} defaultValue={artist?.biography ?? ""} /></Field>
    </div>
  );
}

function ReleaseFields({ release, artists }: { release: AdminRelease | null; artists: AdminArtist[] }) {
  return (
    <div className="catalog-form-grid">
      <Field label="Artist"><Choice name="artistProfileId" value={release?.artistProfileId ?? artists[0]?.id ?? ""} options={artists.map((artist) => [artist.id, artist.stageName])} /></Field>
      <Field label="Release title"><Input name="title" required maxLength={160} defaultValue={release?.title ?? ""} /></Field>
      <Field label="Release slug"><Input name="slug" required maxLength={80} placeholder="release-title" defaultValue={release?.slug ?? ""} /></Field>
      <Field label="Featuring artist"><Input name="featuringArtist" maxLength={160} defaultValue={release?.featuringArtist ?? ""} /></Field>
      <Field label="Genre"><Input name="genre" required maxLength={80} defaultValue={release?.genre ?? ""} /></Field>
      <Field label="Region"><Input name="region" required maxLength={120} defaultValue={release?.region ?? ""} /></Field>
      <Field label="Discovery lane"><Choice name="discoveryLane" value={release?.discoveryLane ?? "wadadli"} options={["wadadli", "caribbean", "ai", "world"]} /></Field>
      <Field label="Creation disclosure"><Choice name="creationType" value={release?.creationType ?? "artist_made"} options={[["artist_made", "Artist-made"], ["ai_assisted", "AI-assisted"]]} /></Field>
      <Field label="AI classification"><Choice name="aiClassification" value={release?.aiClassification ?? "human_created"} options={[["human_created", "Human-created"], ["ai_assisted", "AI-assisted"], ["primarily_ai_generated", "Primarily AI-generated"], ["classification_pending", "Classification pending"]]} /></Field>
      <Field label="Mood"><Input name="mood" maxLength={120} defaultValue={release?.mood ?? ""} /></Field>
      <Field label="Duration in seconds"><Input name="durationSeconds" type="number" min={1} max={86400} defaultValue={release?.durationSeconds ?? ""} /></Field>
      <Field label="Content label"><Choice name="explicitStatus" value={release?.explicitStatus ?? "clean"} options={["clean", "explicit"]} /></Field>
      <Field label="Downloads"><Choice name="downloadEligibility" value={release?.downloadEligibility ?? "streaming_only"} options={[["streaming_only", "Streaming only"], ["free_download", "Free download"], ["paid_download", "Paid download"]]} /></Field>
      <Field label="Approval"><Choice name="approvalStatus" value={release?.approvalStatus ?? "draft"} options={["draft", "pending", "approved", "rejected", "disabled"]} /></Field>
      <label className="catalog-check"><input name="featured" type="checkbox" defaultChecked={release?.featured ?? false} /><span>Featured release</span></label>
    </div>
  );
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

export type { EditorState };
