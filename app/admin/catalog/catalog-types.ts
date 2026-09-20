export type AdminArtist = {
  id: string;
  ownerMemberId: string | null;
  studioMemberId: string | null;
  slug: string;
  stageName: string;
  biography: string;
  countryRegion: string;
  primaryGenre: string;
  profilePhotoUrl: string | null;
  coverImageUrl: string | null;
  socialLinksJson: string;
  verificationStatus: "unverified" | "pending" | "verified" | "rejected";
  foundingArtist: boolean;
  visibility: "draft" | "public" | "disabled";
};

export type OwnerAccount = {
  id: string;
  displayName: string;
  email: string;
  accountRole: "artist" | "studio" | "admin";
};

export type AdminRelease = {
  id: string;
  artistProfileId: string;
  legacyTrackId: number | null;
  slug: string;
  title: string;
  featuringArtist: string | null;
  genre: string;
  region: string;
  discoveryLane: "wadadli" | "caribbean" | "ai" | "world";
  creationType: "artist_made" | "ai_assisted";
  aiClassification: "human_created" | "ai_assisted" | "primarily_ai_generated" | "classification_pending";
  mood: string | null;
  durationSeconds: number | null;
  explicitStatus: "clean" | "explicit";
  downloadEligibility: "streaming_only" | "free_download" | "paid_download";
  approvalStatus: "draft" | "pending" | "approved" | "rejected" | "disabled";
  publicationStatus: "unpublished" | "scheduled" | "published" | "archived";
  publicationAt: string | null;
  rightsConfirmed: boolean;
  aiDisclosure: string | null;
  submissionNotes: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  featured: boolean;
  artistCredits?: Array<{ artistProfileId: string; role: "featured" | "co_artist" }>;
  additionalCredits?: Array<{ role: string; contributorName: string; artistProfileId: string | null }>;
};

export type CatalogSaveResponse =
  | { entity: "artist"; item: AdminArtist }
  | { entity: "release"; item: AdminRelease };
