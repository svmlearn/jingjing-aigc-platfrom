import type { MaterialPlatform, MaterialSourceKind, MaterialType } from "@/contracts/material";
import type { NormalizedComment } from "@/server/import-providers/types";

export type TikHubBenchmarkFindMethod = "keyword" | "profile" | "detail";

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
  sourceType: "detail" | "search" | "creator";
  externalItemId?: string | null;
  sourceUrl?: string | null;
  creatorId?: string | null;
  creatorName?: string | null;
  title: string;
  description?: string | null;
  engagementSnapshot: Record<string, unknown>;
  structureSummary: Record<string, unknown>;
  tracePayload: Record<string, unknown>;
  comments?: NormalizedComment[];
};

export type TikHubCachedResponse = {
  endpoint: string;
  method: "GET" | "POST";
  requestPayload: Record<string, unknown>;
  responsePayload: unknown;
};
