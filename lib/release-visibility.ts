import { and, eq, lte, or } from "drizzle-orm";
import { releases } from "@/db/schema";

export function publicReleaseCondition(now = new Date()) {
  return and(
    eq(releases.approvalStatus, "approved"),
    or(
      eq(releases.publicationStatus, "published"),
      and(eq(releases.publicationStatus, "scheduled"), lte(releases.publicationAt, now)),
    ),
  );
}
