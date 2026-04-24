export type MaterialPlatform = "xiaohongshu" | "douyin";

export type MaterialType = "article" | "video";

export type MaterialSourceKind = "uploaded" | "benchmark";

export type MaterialStatus = "ready" | "parsing" | "failed" | "archived";

export type MaterialWorkbenchTarget = "article" | "video";

export type MaterialLibraryItemDto = {
  id: string;
  merchantId: string;
  sourceItemId?: string | null;
  platform: MaterialPlatform;
  materialType: MaterialType;
  sourceKind: MaterialSourceKind;
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
  createdAt: string;
};
