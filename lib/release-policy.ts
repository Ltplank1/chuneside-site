export type ReleaseDisclosure = {
  rightsConfirmed: boolean;
  radioReadyConfirmed: boolean;
  explicitStatus?: "clean" | "explicit";
  creationType: "artist_made" | "ai_assisted";
  aiClassification?: "human_created" | "ai_assisted" | "primarily_ai_generated" | "classification_pending";
  aiDisclosure: string | null;
};

export function releaseReviewBlockers(release: ReleaseDisclosure) {
  const blockers: string[] = [];

  if (!release.rightsConfirmed) {
    blockers.push("Rights confirmation is required.");
  }

  if (!release.radioReadyConfirmed) {
    blockers.push("Clean radio-ready confirmation is required.");
  }

  if (release.explicitStatus === "explicit") {
    blockers.push("ChuneSide submissions must use the clean radio-ready version.");
  }

  const needsAiDisclosure = release.creationType === "ai_assisted" || (release.aiClassification && release.aiClassification !== "human_created");
  if (needsAiDisclosure && !release.aiDisclosure?.trim()) {
    blockers.push("AI-involved releases require a disclosure note.");
  }

  return blockers;
}
