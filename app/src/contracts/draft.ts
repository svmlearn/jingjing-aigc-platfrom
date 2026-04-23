import type { Platform } from "./import";

export type ContentDraftStatus =
  | "drafting"
  | "review_pending"
  | "ready_to_publish"
  | "publishing"
  | "published"
  | "archived";

export type ContentDraftDto = {
  id: string;
  sourceItemId: string;
  merchantId: string;
  workingTitle?: string | null;
  rewriteGoal?: string | null;
  status: ContentDraftStatus;
  selectedVariantId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContentVariantDto = {
  id: string;
  draftId: string;
  platform: Platform;
  variantType: "note" | "video_script";
  versionNo: number;
  title?: string | null;
  bodyText?: string | null;
  scriptText?: string | null;
  hashtags: string[];
  ctaText?: string | null;
  reviewStatus: "editing" | "review_pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
};
