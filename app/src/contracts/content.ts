import type { Platform } from "./import";

export type SourceItemDto = {
  id: string;
  platform: Platform;
  sourceType: "detail" | "creator" | "search" | "manual_text";
  externalItemId?: string | null;
  sourceUrl?: string | null;
  creatorId?: string | null;
  creatorName?: string | null;
  title?: string | null;
  bodyText?: string | null;
  scriptText?: string | null;
  engagementSnapshot: Record<string, unknown>;
  structureSummary: Record<string, unknown>;
  isSelectedForRewrite: boolean;
  createdAt: string;
};

export type ImportedCommentDto = {
  id: string;
  sourceItemId: string;
  externalCommentId?: string | null;
  parentExternalCommentId?: string | null;
  authorName?: string | null;
  content: string;
  likeCount: number;
  replyCount: number;
  publishedAt?: string | null;
  createdAt: string;
};
