import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production" || process.env.CHUNESIDE_ENABLE_LOCAL_AUTH !== "1") {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const requestHeaders = await headers();
  return NextResponse.json({
    enabled: true,
    nodeEnv: process.env.NODE_ENV,
    localUserId: requestHeaders.get("x-chuneside-local-user-id"),
    localUserEmail: requestHeaders.get("x-chuneside-local-user-email"),
    sitesUserId: requestHeaders.get("oai-authenticated-user-id"),
    sitesUserEmail: requestHeaders.get("oai-authenticated-user-email"),
  });
}
