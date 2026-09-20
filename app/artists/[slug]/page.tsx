import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, Disc3, ExternalLink, MapPin, Play, PlaySquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPublicArtistProfile } from "@/lib/artist-profile";
import { getPublishedSiteContent } from "@/lib/site-content";
import { publicContentStyle } from "@/lib/site-content-shared";
import { ArtistReleaseList } from "./artist-release-list";

type ArtistPageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ArtistPageProps): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getPublicArtistProfile(slug);
  if (!artist) return { title: "Artist not found | ChuneSide" };

  const title = artist.stageName + " | ChuneSide";
  const description = artist.biography || "Listen to " + artist.stageName + " on ChuneSide.";
  return {
    title,
    description,
    openGraph: { title, description, images: [] },
    twitter: { card: "summary", title, description, images: [] },
  };
}

export default async function ArtistPage({ params }: ArtistPageProps) {
  const { slug } = await params;
  const artist = await getPublicArtistProfile(slug);
  if (!artist) notFound();
  const content = await getPublishedSiteContent();

  const leadRelease = artist.releases[0];
  const visualClass = leadRelease?.colors ?? "from-[#242832] via-[#171a21] to-[#090a0d]";
  const mark = leadRelease?.mark ?? artist.stageName.slice(0, 2).toUpperCase();

  return (
    <main className="artist-page">
      <header className="artist-site-header">
        <Link href="/" className="brand brand-image" aria-label="ChuneSide home">
          <Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized />
        </Link>
        <Button asChild variant="ghost"><Link href="/#discover"><ArrowLeft /> Back to Discovery</Link></Button>
      </header>

      <section className="artist-profile-hero">
        <div className={"artist-profile-art bg-gradient-to-br " + visualClass}>
          {artist.coverImageUrl && <div className="artist-profile-cover" aria-hidden="true" style={{ backgroundImage: "url(" + JSON.stringify(artist.coverImageUrl) + ")" }} />}
          {artist.profilePhotoUrl ? <div className="artist-profile-photo" role="img" aria-label={artist.stageName + " profile photo"} style={{ backgroundImage: "url(" + JSON.stringify(artist.profilePhotoUrl) + ")" }} /> : <><div className="cover-grid" /><Disc3 /><span>{mark}</span></>}
        </div>
        <div className="artist-profile-copy">
          <p className="kicker"><Sparkles /> ChuneSide artist</p>
          <div className="artist-profile-title">
            <h1>{artist.stageName}</h1>
            {artist.verificationStatus === "verified" && <BadgeCheck aria-label="Verified artist" />}
          </div>
          <div className="artist-profile-facts">
            <span><MapPin /> {artist.countryRegion}</span>
            <span><Disc3 /> {artist.primaryGenre}</span>
            {artist.foundingArtist && <span className="founding-label"><BadgeCheck /> Founding Artist</span>}
          </div>
          <p className="artist-biography">{artist.biography}</p>
          <div className="artist-profile-actions">
            <Button asChild><Link href="#releases"><Play fill="currentColor" /> Hear the music</Link></Button>
            {Object.entries(artist.socialLinks).map(([label, href]) => (
              <Button asChild variant="outline" key={href}>
                <a href={href} target="_blank" rel="noreferrer">{label}<ExternalLink /></a>
              </Button>
            ))}
          </div>
          {artist.source === "demo" && <small>Preview profile · Catalogue information will update when the database rollout is enabled.</small>}
        </div>
      </section>

      {artist.stagePerformances.length > 0 && (
        <section className="artist-stage-section" id="stage">
          <div className="artist-release-heading">
            <div><p className="kicker"><PlaySquare /> ChuneSide Stage</p><h2>Live performances by {artist.stageName}</h2></div>
            <span>{artist.stagePerformances.length} {artist.stagePerformances.length === 1 ? "performance" : "performances"}</span>
          </div>

          <div className="artist-stage-grid">
            {artist.stagePerformances.map((performance) => (
              <article className="artist-stage-card" key={performance.slug}>
                <div className="artist-stage-media">
                  {performance.thumbnailUrl ? <Image src={performance.thumbnailUrl} alt="" fill sizes="(max-width: 760px) 100vw, 360px" unoptimized /> : <PlaySquare />}
                </div>
                <div className="artist-stage-copy">
                  <strong>{performance.status === "featured" ? "Featured" : "ChuneSide Stage"} - {performance.performanceType === "dj" ? "DJ performance" : "Artist performance"}</strong>
                  <h3><Link href={`/stage/${performance.slug}`}>{performance.title}</Link></h3>
                  <p>{performance.description || `${performance.genre} performance from ${performance.region}.`}</p>
                  <small>{performance.songsPerformed.length} {performance.songsPerformed.length === 1 ? "song" : "songs"} · {performance.durationMinutes ?? "--"} min · {performance.region}</small>
                  <Button asChild variant="outline"><Link href={`/stage/${performance.slug}`}><Play fill="currentColor" /> Watch performance</Link></Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="artist-release-section" id="releases">
        <div className="artist-release-heading">
          <div><p className="kicker" style={publicContentStyle(content["artists.releases_heading"].style)}><Disc3 /> {content["artists.releases_heading"].value}</p><h2>Music by {artist.stageName}</h2></div>
          <span>{artist.releases.length} {artist.releases.length === 1 ? "release" : "releases"}</span>
        </div>

        <ArtistReleaseList releases={artist.releases} />
      </section>
    </main>
  );
}
