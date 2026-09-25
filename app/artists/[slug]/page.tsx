import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Award, BadgeCheck, CalendarDays, Disc3, ExternalLink, MapPin, Play, PlaySquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPublicArtistProfile } from "@/lib/artist-profile";
import { isSpokenWordGenre } from "@/lib/submission-options";
import { getPublishedSiteContent } from "@/lib/site-content";
import { publicContentStyle } from "@/lib/site-content-shared";
import { ArtistReleaseList } from "./artist-release-list";
import styles from "./artist-trophy-case.module.css";

type ArtistPageProps = { params: Promise<{ slug: string }>; searchParams?: Promise<{ trophies?: string }> };

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

export default async function ArtistPage({ params, searchParams }: ArtistPageProps) {
  const { slug } = await params;
  const requestedPage = Number((await searchParams)?.trophies ?? "1");
  const trophyPage = Number.isSafeInteger(requestedPage) ? Math.min(1000, Math.max(1, requestedPage)) : 1;
  const artist = await getPublicArtistProfile(slug, trophyPage);
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
                  <small>{performance.songsPerformed.length} {isSpokenWordGenre(performance.genre) ? (performance.songsPerformed.length === 1 ? "piece" : "pieces") : (performance.songsPerformed.length === 1 ? "song" : "songs")} · {performance.durationMinutes ?? "--"} min · {performance.region}</small>
                  <Button asChild variant="outline"><Link href={`/stage/${performance.slug}`}><Play fill="currentColor" /> Watch performance</Link></Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {artist.trophyCaseEnabled && (
        <section className={styles.section} aria-labelledby="artist-trophies-heading">
          <div className="artist-release-heading">
            <div><p className="kicker"><Award /> ChuneSide achievements</p><h2 id="artist-trophies-heading">Trophy Case</h2></div>
            <span>{artist.trophies.length} {artist.trophies.length === 1 ? "achievement" : "achievements"}{artist.trophyPage > 1 ? ` · Page ${artist.trophyPage}` : ""}</span>
          </div>
          {artist.trophies.length ? <div className={styles.grid}>
            {artist.trophies.map((trophy) => (
              <article className={styles.item} key={trophy.id}>
                <div className={styles.art}>
                  {trophy.artworkUrl
                    ? <Image src={trophy.artworkUrl} alt={`${trophy.title} trophy artwork`} width={88} height={88} unoptimized />
                    : <Award aria-hidden="true" />}
                </div>
                <div className={styles.copy}>
                  <span>{trophy.category.replaceAll("_", " ")}</span>
                  <h3>{trophy.title}</h3>
                  {trophy.description && <p>{trophy.description}</p>}
                  <small><CalendarDays aria-hidden="true" /> {new Date(trophy.awardedAt).toLocaleDateString("en", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}</small>
                  {trophy.releaseTitle && <small><Disc3 aria-hidden="true" /> {trophy.releaseTitle}</small>}
                  {trophy.sourceEventTitle && <small><Award aria-hidden="true" /> {trophy.sourceEventTitle}{trophy.sourceEventDate ? ` · ${new Date(trophy.sourceEventDate).toLocaleDateString("en", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}` : ""}</small>}
                </div>
              </article>
            ))}
          </div> : <p className={styles.emptyState}>{artist.trophyPage > 1 ? "No more achievements on this page." : "This artist has not received any ChuneSide trophies yet."}</p>}
          {(artist.trophyPage > 1 || artist.trophyHasMore) && <nav className={styles.pager} aria-label="Trophy Case pages">
            {artist.trophyPage > 1 && <Button asChild variant="outline"><Link href={`/artists/${encodeURIComponent(slug)}?trophies=${artist.trophyPage - 1}#artist-trophies-heading`}>Newer trophies</Link></Button>}
            {artist.trophyHasMore && <Button asChild variant="outline"><Link href={`/artists/${encodeURIComponent(slug)}?trophies=${artist.trophyPage + 1}#artist-trophies-heading`}>Older trophies</Link></Button>}
          </nav>}
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
