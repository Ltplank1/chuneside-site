import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3, ExternalLink, MapPin, PlaySquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPublicStagePerformance } from "@/lib/public-stage";
import { StageViewTracker } from "../stage-view-tracker";
import { ShareStageButton } from "./share-stage-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const performance = await getPublicStagePerformance((await params).slug);
  return performance ? { title: `${performance.title} | ChuneSide Stage`, description: performance.description || `${performance.artistStageName} performing on ChuneSide Stage.` } : { title: "Stage performance | ChuneSide" };
}

export default async function StagePerformancePage({ params }: { params: Promise<{ slug: string }> }) {
  const performance = await getPublicStagePerformance((await params).slug);
  if (!performance) return <main className="stage-detail-page"><header className="artist-site-header stage-site-header"><Link href="/" className="brand brand-image" aria-label="ChuneSide home"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link><Button asChild variant="ghost"><Link href="/stage"><ArrowLeft /> Back to Stage</Link></Button></header><section className="stage-detail-empty"><PlaySquare /><h1>Performance not found</h1><p>This Stage feature is no longer public or does not exist.</p><Button asChild><Link href="/stage">Browse ChuneSide Stage</Link></Button></section></main>;

  const date = performance.performanceDate ? new Date(performance.performanceDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "Date to be announced";
  return <main className="stage-detail-page"><header className="artist-site-header stage-site-header"><Link href="/" className="brand brand-image" aria-label="ChuneSide home"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link><Button asChild variant="ghost"><Link href="/stage"><ArrowLeft /> Back to Stage</Link></Button></header><section className="stage-detail-hero"><div className="stage-detail-video"><iframe src={`https://www.youtube.com/embed/${performance.youtubeVideoId}`} title={performance.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div><div className="stage-detail-copy"><p className="kicker"><PlaySquare /> ChuneSide Stage · {performance.status}</p><h1>{performance.title}</h1><Link className="stage-detail-artist" href={`/artists/${performance.artistSlug}`}>{performance.artistStageName}</Link><p>{performance.description || `${performance.genre} performance from ${performance.region}.`}</p><div className="stage-detail-meta"><span><MapPin /> {performance.region}</span><span><CalendarDays /> {date}</span><span><Clock3 /> {performance.durationMinutes ?? "--"} min</span><span><PlaySquare /> {performance.viewCount.toLocaleString()} views</span></div><div className="stage-detail-actions"><ShareStageButton title={performance.title} /><Button asChild variant="outline"><a href={performance.youtubeUrl ?? `https://www.youtube.com/watch?v=${performance.youtubeVideoId}`} target="_blank" rel="noreferrer"><ExternalLink /> Open YouTube</a></Button></div></div></section><section className="stage-detail-information"><div><p className="kicker">Performance notes</p><h2>The setlist</h2>{performance.songsPerformed.length ? <ol>{performance.songsPerformed.map((song) => <li key={song}>{song}</li>)}</ol> : <p>Songs performed will be listed here.</p>}</div><aside><span>Genre</span><strong>{performance.genre}</strong><span>Region</span><strong>{performance.region}</strong><span>Artist profile</span><Link href={`/artists/${performance.artistSlug}`}>Meet {performance.artistStageName}</Link></aside></section><StageViewTracker slugs={[performance.slug]} /></main>;
}
