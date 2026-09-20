import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { visualizerSettings } from "@/db/schema";
import { defaultVisualizerSettings, normalizeVisualizerSettings } from "@/lib/visualizer";

export const dynamic = "force-dynamic";

const visualizerResponse = (body: unknown) => NextResponse.json(body, {
  headers: { "cache-control": "private, max-age=30, stale-while-revalidate=60" },
});

export async function GET() {
  try {
    const [row] = await getDb().select().from(visualizerSettings).where(eq(visualizerSettings.id, "global")).limit(1);
    const allowedThemes = row ? JSON.parse(row.allowedThemesJson) as string[] : defaultVisualizerSettings.allowedThemes;
    return visualizerResponse(normalizeVisualizerSettings({
      id: "global",
      enabled: row?.enabled,
      defaultTheme: row?.defaultTheme,
      allowedThemes: allowedThemes as never[],
      updatedAt: row?.updatedAt,
      updatedBy: null,
    }));
  } catch {
    return visualizerResponse(defaultVisualizerSettings);
  }
}
