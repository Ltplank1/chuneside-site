import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { defaultPublicFeatureSnapshot, getFeatureFlagMap } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const flags = await getFeatureFlagMap(getDb());
    return NextResponse.json({
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
    return NextResponse.json({ features: defaultPublicFeatureSnapshot() });
  }
}
