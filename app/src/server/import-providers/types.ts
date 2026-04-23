import type { ImportRequest, Platform } from "@/contracts/import";

export type ProviderRun = {
  provider: "apify";
  actorId: string;
  runId: string;
  datasetId: string;
  status:
    | "READY"
    | "RUNNING"
    | "SUCCEEDED"
    | "FAILED"
    | "ABORTING"
    | "ABORTED"
    | "TIMING-OUT"
    | "TIMED-OUT";
  usageTotalUsd?: number;
  raw?: unknown;
};

export type NormalizedSourceItem = {
  platform: Platform;
  sourceType: "detail" | "creator" | "search" | "manual_text";
  externalItemId?: string;
  sourceUrl: string;
  creatorId?: string;
  creatorName?: string;
  title?: string;
  bodyText?: string;
  scriptText?: string;
  engagementSnapshot?: Record<string, unknown>;
  structureSummary?: Record<string, unknown>;
  tracePayload: unknown;
};

export type NormalizedComment = {
  externalCommentId?: string;
  parentExternalCommentId?: string;
  authorName?: string;
  content: string;
  likeCount?: number;
  replyCount?: number;
  publishedAt?: string;
  tracePayload?: unknown;
};

export type ImportProviderAdapter = {
  startImport(request: ImportRequest): Promise<ProviderRun>;
  getRun(runId: string): Promise<ProviderRun>;
  getDatasetItems(datasetId: string): Promise<unknown[]>;
  normalizeSourceItems(
    request: ImportRequest,
    items: unknown[],
  ): NormalizedSourceItem[];
  normalizeComments(request: ImportRequest, items: unknown[]): NormalizedComment[];
};
