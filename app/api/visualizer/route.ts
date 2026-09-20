import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { visualizerSettings } from "@/db/schema";
import { defaultVisualizerSettings, normalizeVisualizerSettings } from "@/lib/visualizer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [row] = await getDb().select().from(visualizerSettings).where(eq(visualizerSettings.id, "global")).limit(1);
    const allowedThemes = row ? JSON.parse(row.allowedThemesJson) as string[] : defaultVisualizerSettings.allowedThemes;
    return NextResponse.json(normalizeVisualizerSettings({
      id: "global",
      enabled: row?.enabled,
      defaultTheme: row?.defaultTheme,
      allowedThemes: allowedThemes as never[],
      updatedAt: row?.updatedAt,
      updatedBy: null,
    }));
  } catch {
    return NextResponse.json(defaultVisualizerSettings);
  }
}
