import type { MaterialPlatform, MaterialSourceKind, MaterialType } from "@/contracts/material";

export type TikHubBenchmarkFindMethod = "keyword" | "profile";

export type TikHubBenchmarkRequest = {
  platform: MaterialPlatform;
  findMethod: TikHubBenchmarkFindMethod;
  target: string;
  count: number;
};

export type TikHubMaterialItem = {
  platform: MaterialPlatform;
  materialType: MaterialType;
  sourceKind: MaterialSourceKind;
  sourceType: "search" | "creator";
  externalItemId?: string | null;
  sourceUrl?: string | null;
  creatorId?: string | null;
  creatorName?: string | null;
  title: string;
  description?: string | null;
  engagementSnapshot: Record<string, unknown>;
  structureSummary: Record<string, unknown>;
  tracePayload: Record<string, unknown>;
};

export type TikHubCachedResponse = {
  endpoint: string;
  method: "GET" | "POST";
  requestPayload: Record<string, unknown>;
  responsePayload: unknown;
};
