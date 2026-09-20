import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { defaultPublicFeatureSnapshot, getFeatureFlagMap } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

const featureResponse = (body: unknown) => NextResponse.json(body, {
  headers: { "cache-control": "private, max-age=15, stale-while-revalidate=30" },
});

export async function GET() {
  try {
    const flags = await getFeatureFlagMap(getDb());
    return featureResponse({
      features: Object.fromEntries(
        Object.entries(flags).map(([key, flag]) => [
          key,
          {
            state: flag.state,
            available: flag.state === "on",
          },
        ]),
      ),
    });
  } catch {
    return featureResponse({ features: defaultPublicFeatureSnapshot() });
  }
}
