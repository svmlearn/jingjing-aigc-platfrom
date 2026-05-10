export type MaterialPlatform = "xiaohongshu" | "douyin";

export type MaterialType = "article" | "video";

export type MaterialSourceKind = "uploaded" | "benchmark";

export type MaterialStatus = "ready" | "parsing" | "failed" | "archived";

export type MaterialWorkbenchTarget = "article" | "video";

export type MaterialUsageType =
  | "text_knowledge"
  | "viral_reference"
  | "image_asset"
  | "video_asset";

export type MaterialRetrievalTarget =
  | "copy_context"
  | "script_context"
  | "article_image_asset"
  | "video_edit_asset";

export type MaterialLibraryItemDto = {
  id: string;
  merchantId: string;
  sourceItemId?: string | null;
  platform: MaterialPlatform;
  materialType: MaterialType;
  sourceKind: MaterialSourceKind;
  usageType: MaterialUsageType;
  retrievalTargets: MaterialRetrievalTarget[];
  status: MaterialStatus;
  title: string;
  description?: string | null;
  originalUrl?: string | null;
  creatorName?: string | null;
  engagementLabel?: string | null;
  analysisPayload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type MaterialWorkbenchReferenceDto = {
  id: string;
  merchantId: string;
  materialItemId: string;
  targetWorkbench: MaterialWorkbenchTarget;
  status: "pending" | "consumed";
  draftId?: string | null;
  createdAt: string;
  consumedAt?: string | null;
};
