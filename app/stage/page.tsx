import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Disc3, ExternalLink, MapPin, Play, PlaySquare, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { filterPublicStagePerformances, getPublicStagePerformances } from "@/lib/public-stage";
import { getPublishedSiteContent } from "@/lib/site-content";
import { publicContentStyle } from "@/lib/site-content-shared";
import { StageViewTracker } from "./stage-view-tracker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ChuneSide Stage | ChuneSide",
  description: "Watch consented ChuneSide Stage performances from featured artists.",
};

type StageSearchParams = {
  q?: string | string[];
  region?: string | string[];
  genre?: string | string[];
  type?: string | string[];
  sort?: string | string[];
};

export default async function StagePage({ searchParams }: { searchParams?: Promise<StageSearchParams> }) {
  const params = searchParams ? await searchParams : {};
  const filters = {
    query: firstParam(params.q).trim(),
    region: firstParam(params.region).trim(),
    genre: firstParam(params.genre).trim(),
    type: firstParam(params.type).trim(),
  };
  const sort = stageSort(firstParam(params.sort));
  const { performances: allPerformances, available, source } = await getPublicStagePerformances();
  const content = await getPublishedSiteContent();
  const performances = sortStagePerformances(filterPublicStagePerformances(allPerformances, filters), sort);
  const featured = performances.find((performance) => performance.status === "featured") ?? performances[0] ?? allPerformances[0];
  const regions = uniqueValues(allPerformances.map((performance) => performance.region));
  const genres = uniqueValues(allPerformances.map((performance) => performance.genre));
  const filterCount = Number(Boolean(filters.query)) + Number(Boolean(filters.region)) + Number(Boolean(filters.genre)) + Number(Boolean(filters.type)) + Number(sort !== "curated");
  const showcaseSections = [
    ["Featured on ChuneSide Stage", performances.filter((performance) => performance.status === "featured" || performance.homePlacement === "featured")],
    ["Latest performances", [...performances].sort((a, b) => dateValue(b.performanceDate) - dateValue(a.performanceDate)).slice(0, 3)],
    ["Most watched", [...performances].sort((a, b) => b.viewCount - a.viewCount).slice(0, 3)],
    ["Wadadli Stage", performances.filter((performance) => performance.homePlacement === "wadadli" || performance.region === "Antigua & Barbuda")],
    ["Caribbean Stage", performances.filter((performance) => performance.homePlacement === "caribbean" || performance.region !== "Antigua & Barbuda")],
  ].filter(([, items]) => items.length > 0) as Array<[string, typeof performances]>;

  return (
    <main className="stage-page">
      <header className="artist-site-header stage-site-header">
        <Link href="/" className="brand brand-image" aria-label="ChuneSide home">
          <Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized />
        </Link>
        <Button asChild variant="ghost"><Link href="/#discover"><ArrowLeft /> Back to Discovery</Link></Button>
      </header>

      <section className="stage-hero">
        <div className="stage-hero-copy">
          <p className="kicker"><Sparkles /> ChuneSide Stage</p>
          <h1 style={publicContentStyle(content["stage.heading"].style)}>{content["stage.heading"].value}</h1>
          <p style={publicContentStyle(content["stage.description"].style)}>{content["stage.description"].value}</p>
          {featured && <Button asChild><Link href={`/stage/${featured.slug}`}><Play fill="currentColor" /> Watch featured</Link></Button>}
        </div>
        <div className="stage-hero-frame">
          {featured ? (
            <iframe
              src={`https://www.youtube.com/embed/${featured.youtubeVideoId}`}
              title={featured.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <div><PlaySquare /><span>{available ? "No performances published yet" : "Stage is not public yet"}</span></div>
          )}
        </div>
      </section>

      {available && showcaseSections.length > 0 && <section className="stage-showcase" aria-label="Stage highlights">
        {showcaseSections.map(([title, items]) => <div className="stage-showcase-row" key={title}>
          <div className="stage-showcase-heading"><p className="kicker"><PlaySquare /> Stage selection</p><h2>{title}</h2></div>
          <div className="stage-showcase-grid">{items.slice(0, 3).map((performance) => <Link className="stage-showcase-card" href={`/stage/${performance.slug}`} key={performance.slug}><div className="stage-showcase-media">{performance.thumbnailUrl ? <Image src={performance.thumbnailUrl} alt="" fill sizes="(max-width: 760px) 100vw, 320px" unoptimized /> : <PlaySquare />}<span><Play fill="currentColor" /> Watch</span></div><div><strong>{performance.artistStageName}</strong><h3>{performance.title}</h3><small>{performance.genre} · {performance.region} · {performance.viewCount.toLocaleString()} views</small></div></Link>)}</div>
        </div>)}
      </section>}

      <section className="stage-directory">
        <div className="artist-release-heading">
          <div><p className="kicker"><PlaySquare /> Performance directory</p><h2>ChuneSide Stage</h2></div>
          <span>{performances.length} of {allPerformances.length} {allPerformances.length === 1 ? "performance" : "performances"}</span>
        </div>

        {available && allPerformances.length > 0 && (
          <><nav className="stage-type-tabs" aria-label="Filter by performance type"><Link className={!filters.type ? "active" : ""} href="/stage">All Stage</Link><Link className={filters.type === "artist" ? "active" : ""} href="/stage?type=artist">Artists</Link><Link className={filters.type === "dj" ? "active" : ""} href="/stage?type=dj">DJs</Link></nav><form className="stage-filter-bar">
            <label><Search /><input name="q" defaultValue={filters.query} placeholder="Search artist, song or title" aria-label="Search Stage performances" /></label>
            <input type="hidden" name="type" value={filters.type} />
            <select name="region" defaultValue={filters.region} aria-label="Filter Stage by region">
              <option value="">All regions</option>
              {regions.map((region) => <option key={region} value={region}>{region}</option>)}
            </select>
            <select name="genre" defaultValue={filters.genre} aria-label="Filter Stage by genre">
              <option value="">All genres</option>
              {genres.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
            </select>
            <select name="sort" defaultValue={sort} aria-label="Sort Stage performances">
              <option value="curated">Curated order</option>
              <option value="newest">Newest performances</option>
              <option value="watched">Most watched</option>
            </select>
            <Button type="submit">Filter</Button>
            {filterCount > 0 && <Button asChild type="button" variant="outline"><Link href="/stage">Clear</Link></Button>}
          </form></>
        )}

        {!available && (
          <div className="stage-empty"><PlaySquare /><h3>Stage is in Admin Test.</h3><p>Turn `chuneside_stage` on from Feature Control when the public destination is ready.</p></div>
        )}
        {available && source === "storage_unavailable" && (
          <div className="stage-empty"><Disc3 /><h3>Stage storage is not ready.</h3><p>Apply migration `0008` before loading published performance records.</p></div>
        )}
        {available && source === "database" && performances.length === 0 && (
          <div className="stage-empty"><PlaySquare /><h3>{allPerformances.length ? "No Stage performances match." : "No Stage performances are public yet."}</h3><p>{allPerformances.length ? "Try another artist, region or genre." : "Publish a consented performance from Admin Stage to fill this page."}</p></div>
        )}

        <div className="stage-card-grid">
          {performances.map((performance) => (
            <article className="stage-public-card" id={performance.slug} data-stage-slug={performance.slug} key={performance.slug}>
              <div className="stage-public-media">
                {performance.thumbnailUrl ? <Image src={performance.thumbnailUrl} alt="" fill sizes="(max-width: 760px) 100vw, 420px" unoptimized /> : <PlaySquare />}
              </div>
              <div className="stage-public-copy">
                <strong>{performance.status === "featured" ? "Featured" : "Published"} · {performance.performanceType === "dj" ? "DJ Performance" : "Artist Performance"}</strong>
                <h3><Link href={`/stage/${performance.slug}`}>{performance.title}</Link></h3>
                <Link href={`/artists/${performance.artistSlug}`}>{performance.artistStageName}</Link>
                <p>{performance.description || `${performance.genre} performance from ${performance.region}.`}</p>
                <small><MapPin /> {performance.region} · {performance.durationMinutes ?? "--"} min · {performance.performanceType === "dj" ? performance.tracklist.length : performance.songsPerformed.length} {performance.performanceType === "dj" ? "tracks" : "songs"} · {performance.viewCount.toLocaleString()} views</small>
                <div className="stage-card-actions"><Button asChild><Link href={`/stage/${performance.slug}`}><Play /> Watch performance</Link></Button><Button asChild variant="outline"><a href={performance.youtubeUrl ?? `https://www.youtube.com/watch?v=${performance.youtubeVideoId}`} target="_blank" rel="noreferrer"><ExternalLink /> Open YouTube</a></Button></div>
              </div>
            </article>
          ))}
        </div>
        <StageViewTracker slugs={performances.map((performance) => performance.slug)} />
      </section>
    </main>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function dateValue(value: string | null) {
  return value ? Date.parse(value) || 0 : 0;
}

function stageSort(value: string) {
  return ["curated", "newest", "watched"].includes(value) ? value as "curated" | "newest" | "watched" : "curated";
}

function sortStagePerformances<T extends { title: string; performanceDate: string | null; viewCount: number }>(performances: T[], sort: "curated" | "newest" | "watched") {
  if (sort === "newest") return [...performances].sort((a, b) => dateValue(b.performanceDate) - dateValue(a.performanceDate) || a.title.localeCompare(b.title));
  if (sort === "watched") return [...performances].sort((a, b) => b.viewCount - a.viewCount || dateValue(b.performanceDate) - dateValue(a.performanceDate));
  return performances;
}
