import { NextResponse } from "next/server";
import { and, desc, eq, inArray, isNull, like, ne, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { requireAdminUser } from "@/app/admin-auth";
import { getDb } from "@/db";
import { artistProfiles, audioReviewCases, audioReviewFindings, audioReviewReports, releaseMedia, releases } from "@/db/schema";
import { addAdminAudioFinding, AudioReviewError, createAudioReviewCase, recordAudioReviewDecision } from "@/lib/audio-review";
import { isFeatureAvailable } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

const uuid = z.string().uuid();
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_case"), mediaId: uuid }),
  z.object({ action: z.literal("decision"), reviewId: uuid,
    decision: z.enum(["reviewed", "follow_up", "replacement_requested"]), note: z.string().trim().max(1000).nullable() }),
  z.object({ action: z.literal("add_finding"), reviewId: uuid,
    category: z.enum(["technical", "clean", "ai", "other"]), severity: z.enum(["info", "warning", "critical"]),
    message: z.string().trim().min(1).max(500), offsetSeconds: z.number().int().min(0).max(86400).nullable() }),
]);

async function adminDb() {
  const admin = await requireAdminUser();
  if (!admin) return null;
  const db = getDb();
  if (!await isFeatureAvailable(db, "audio_review", "admin")) return null;
  return { admin, db };
}

export async function GET(request: Request) {
  const access = await adminDb();
  if (!access) return NextResponse.json({ error: "Audio Review is unavailable for this admin account." }, { status: 403 });
  const { db } = access;
  const url = new URL(request.url);
  const caseId = url.searchParams.get("caseId");
  try {
    if (caseId !== null) {
      if (!uuid.safeParse(caseId).success) return NextResponse.json({ error: "Invalid review ID." }, { status: 400 });
      const [review] = await db.select().from(audioReviewCases).where(eq(audioReviewCases.id, caseId)).limit(1);
      if (!review) return NextResponse.json({ error: "Audio review not found." }, { status: 404 });
      const [findings, history, reports] = await Promise.all([
        db.select().from(audioReviewFindings).where(eq(audioReviewFindings.caseId, caseId)).orderBy(desc(audioReviewFindings.createdAt)).limit(100),
        db.select().from(audioReviewCases).where(eq(audioReviewCases.releaseIdSnapshot, review.releaseIdSnapshot))
          .orderBy(desc(audioReviewCases.createdAt)).limit(50),
        db.select({ id: audioReviewReports.id, reason: audioReviewReports.reason, status: audioReviewReports.status,
          offsetSeconds: audioReviewReports.offsetSeconds, createdAt: audioReviewReports.createdAt })
          .from(audioReviewReports).where(eq(audioReviewReports.mediaIdSnapshot, review.mediaIdSnapshot))
          .orderBy(desc(audioReviewReports.createdAt)).limit(50),
      ]);
      return NextResponse.json({ review, findings, history, reports });
    }

    const search = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
    const filter = url.searchParams.get("filter") ?? "pending";
    const allowedFilters = ["all", "pending", "needs_review", "warning", "failed", "completed", "technical", "clean", "ai"];
    if (!allowedFilters.includes(filter)) return NextResponse.json({ error: "Invalid queue filter." }, { status: 400 });
    const offsetText = url.searchParams.get("offset") ?? "0";
    const offset = Number(offsetText);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000) return NextResponse.json({ error: "Invalid queue offset." }, { status: 400 });

    const conditions: SQL[] = [eq(releaseMedia.kind, "audio"), inArray(releaseMedia.status, ["pending", "ready"])];
    if (search) conditions.push(or(like(releases.title, `%${search}%`), like(artistProfiles.stageName, `%${search}%`))!);
    if (filter === "pending") conditions.push(or(isNull(audioReviewCases.id), eq(audioReviewCases.status, "pending"))!);
    if (filter === "needs_review") conditions.push(eq(audioReviewCases.status, "needs_review"));
    if (filter === "completed") conditions.push(eq(audioReviewCases.status, "completed"));
    if (filter === "warning") conditions.push(or(eq(audioReviewCases.technicalStatus, "warning"), eq(audioReviewCases.cleanStatus, "warning"), eq(audioReviewCases.aiStatus, "warning"))!);
    if (filter === "failed") conditions.push(or(eq(audioReviewCases.technicalStatus, "fail"), eq(audioReviewCases.cleanStatus, "fail"), eq(audioReviewCases.aiStatus, "fail"))!);
    if (filter === "technical") conditions.push(inArray(audioReviewCases.technicalStatus, ["warning", "needs_review", "fail", "inconclusive"]));
    if (filter === "clean") conditions.push(inArray(audioReviewCases.cleanStatus, ["warning", "needs_review", "fail", "inconclusive"]));
    if (filter === "ai") conditions.push(inArray(audioReviewCases.aiStatus, ["warning", "needs_review", "fail", "inconclusive"]));

    const rows = await db.select({
      mediaId: releaseMedia.id, releaseId: releases.id, mediaVersion: releaseMedia.version,
      mediaVariant: releaseMedia.variant, mediaName: releaseMedia.originalName,
      contentType: releaseMedia.contentType, mediaCreatedAt: releaseMedia.createdAt,
      releaseTitle: releases.title, artistName: artistProfiles.stageName,
      radioReadyConfirmed: releases.radioReadyConfirmed, aiClassification: releases.aiClassification,
      reviewId: audioReviewCases.id, status: audioReviewCases.status,
      technicalStatus: audioReviewCases.technicalStatus, cleanStatus: audioReviewCases.cleanStatus,
      aiStatus: audioReviewCases.aiStatus, reviewCreatedAt: audioReviewCases.createdAt,
    }).from(releaseMedia)
      .innerJoin(releases, eq(releaseMedia.releaseId, releases.id))
      .innerJoin(artistProfiles, eq(releases.artistProfileId, artistProfiles.id))
      .leftJoin(audioReviewCases, and(eq(audioReviewCases.mediaIdSnapshot, releaseMedia.id), ne(audioReviewCases.status, "superseded")))
      .where(and(...conditions)).orderBy(desc(releaseMedia.createdAt), desc(releaseMedia.id)).limit(51).offset(offset);
    return NextResponse.json({ items: rows.slice(0, 50), hasMore: rows.length > 50, offset });
  } catch {
    return NextResponse.json({ error: "Audio Review storage is not ready." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const access = await adminDb();
  if (!access) return NextResponse.json({ error: "Audio Review is unavailable for this admin account." }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the Audio Review fields." }, { status: 400 });
  const { db, admin } = access;
  try {
    if (parsed.data.action === "create_case") {
      const result = await createAudioReviewCase(db, parsed.data.mediaId, admin);
      return NextResponse.json(result, { status: result.created ? 201 : 200 });
    }
    if (parsed.data.action === "decision") {
      const review = await recordAudioReviewDecision(db, { ...parsed.data, actor: admin });
      return NextResponse.json({ review });
    }
    const id = await addAdminAudioFinding(db, { ...parsed.data, actor: admin });
    return NextResponse.json({ findingId: id }, { status: 201 });
  } catch (error) {
    if (error instanceof AudioReviewError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "The Audio Review change could not be saved." }, { status: 503 });
  }
}
