import { NextResponse } from "next/server";
import { z } from "zod";
import { filterPublicStagePerformances, getPublicStagePerformances, isPlacementActive, recordStagePerformanceView } from "@/lib/public-stage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 12);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(24, Math.floor(requestedLimit))) : 12;
  const filters = {
    query: url.searchParams.get("q") ?? "",
    region: url.searchParams.get("region") ?? "",
    genre: url.searchParams.get("genre") ?? "",
  };
  const placement = url.searchParams.get("placement") ?? "";
  const hasFilters = Boolean(filters.query || filters.region || filters.genre);
  const result = await getPublicStagePerformances(hasFilters || placement === "home" ? 60 : limit);
  const filtered = hasFilters ? filterPublicStagePerformances(result.performances, filters) : result.performances;
  const performances = placement === "home"
    ? filtered.filter((performance) => isPlacementActive(performance)).slice(0, limit)
    : filtered.slice(0, limit);

  return NextResponse.json({ ...result, performances });
}

const viewInput = z.object({
  action: z.literal("view"),
  slug: z.string().min(1).max(90),
});

export async function POST(request: Request) {
  const parsed = viewInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Stage view event." }, { status: 400 });

  const result = await recordStagePerformanceView(parsed.data.slug);
  if (result.status === "not_found") return NextResponse.json({ error: "Stage performance not found." }, { status: 404 });
  if (result.status === "storage_unavailable") return NextResponse.json({ error: "Stage storage is not ready." }, { status: 503 });

  return NextResponse.json({ ok: true, viewCount: result.viewCount });
}
