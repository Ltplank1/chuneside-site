import { getDb } from "@/db";
import { siteContent } from "@/db/schema";
import { defaultSiteContent, getSiteContentDefinition, type SiteContentStyle } from "@/lib/site-content-shared";
export * from "@/lib/site-content-shared";

function parseStyle(row: { fontFamily: string; size: string; weight: string; align: string }, fallback: SiteContentStyle): SiteContentStyle {
  return { fontFamily: ["sans", "display", "mono"].includes(row.fontFamily) ? row.fontFamily as SiteContentStyle["fontFamily"] : fallback.fontFamily, size: ["small", "medium", "large", "hero"].includes(row.size) ? row.size as SiteContentStyle["size"] : fallback.size, weight: ["normal", "semibold", "bold"].includes(row.weight) ? row.weight as SiteContentStyle["weight"] : fallback.weight, align: ["left", "center"].includes(row.align) ? row.align as SiteContentStyle["align"] : fallback.align };
}
export async function getPublishedSiteContent() {
  const defaults = defaultSiteContent();
  const rows = await getDb().select().from(siteContent).catch(() => []);
  for (const row of rows) { const definition = getSiteContentDefinition(row.key); if (!definition) continue; defaults[row.key] = { value: row.publishedValue, style: parseStyle({ fontFamily: row.publishedFontFamily, size: row.publishedSize, weight: row.publishedWeight, align: row.publishedAlign }, definition.defaultStyle) }; }
  return defaults;
}
