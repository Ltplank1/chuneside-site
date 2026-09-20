import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { supportChunesideSettings } from "@/db/schema";

export const supportChunesideDefaults = {
  enabled: false,
  name: "Support ChuneSide",
  message: "Keep ChuneSide free and help us keep independent music moving.",
  buttonText: "Support ChuneSide",
  iconUrl: null as string | null,
  suggestedAmounts: [5, 10, 20],
  startsAt: null as Date | null,
  endsAt: null as Date | null,
};

export type SupportChunesideDraft = typeof supportChunesideDefaults;

function amounts(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(Number).filter((item) => Number.isInteger(item) && item >= 1 && item <= 500).slice(0, 6) : supportChunesideDefaults.suggestedAmounts;
  } catch { return supportChunesideDefaults.suggestedAmounts; }
}

export async function getSupportChuneside(mode: "draft" | "published" = "published"): Promise<SupportChunesideDraft> {
  const [row] = await getDb().select().from(supportChunesideSettings).where(eq(supportChunesideSettings.id, "default")).limit(1);
  if (!row) return supportChunesideDefaults;
  const prefix = mode === "draft" ? "draft" : "published";
  return {
    enabled: row[`${prefix}Enabled`], name: row[`${prefix}Name`], message: row[`${prefix}Message`], buttonText: row[`${prefix}ButtonText`], iconUrl: row[`${prefix}IconUrl`], suggestedAmounts: amounts(row[`${prefix}SuggestedAmountsJson`]), startsAt: row[`${prefix}StartsAt`], endsAt: row[`${prefix}EndsAt`],
  } as SupportChunesideDraft;
}

export function isSupportCampaignLive(settings: SupportChunesideDraft, now = new Date()) {
  return settings.enabled && (!settings.startsAt || settings.startsAt <= now) && (!settings.endsAt || settings.endsAt >= now);
}

export function supportChunesideRow(settings: SupportChunesideDraft, now = new Date()) {
  return { id: "default", draftEnabled: settings.enabled, publishedEnabled: settings.enabled, draftName: settings.name, publishedName: settings.name, draftMessage: settings.message, publishedMessage: settings.message, draftButtonText: settings.buttonText, publishedButtonText: settings.buttonText, draftIconUrl: settings.iconUrl, publishedIconUrl: settings.iconUrl, draftSuggestedAmountsJson: JSON.stringify(settings.suggestedAmounts), publishedSuggestedAmountsJson: JSON.stringify(settings.suggestedAmounts), draftStartsAt: settings.startsAt, publishedStartsAt: settings.startsAt, draftEndsAt: settings.endsAt, publishedEndsAt: settings.endsAt, updatedAt: now, publishedAt: now };
}
