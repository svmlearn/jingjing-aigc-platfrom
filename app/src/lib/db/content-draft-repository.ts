import "server-only";

import type { ContentDraftBundleDto, ContentDraftDto, ContentVariantDto } from "@/contracts/draft";
import type { Platform } from "@/contracts/import";
import {
  pgAppendContentDraftRevisionTrace,
  pgAppendContentVariantToDraft,
  pgApproveContentVariant,
  pgAssertContentVariantAccess,
  pgCreateDraftWithVariants,
  pgCreateManualSourceItem,
  pgGetDraftBundleByMerchant,
  pgListDraftBundlesByMerchant,
  pgUpdateContentVariantScript,
} from "@/lib/db/postgres-video-chain-repository";

export async function createManualSourceItem(input: {
  merchantId: string;
  platform: Platform;
  title: string;
  bodyText?: string | null;
  scriptText?: string | null;
  tracePayload?: Record<string, unknown>;
}) {
  return pgCreateManualSourceItem(input);
}

export async function createDraftWithVariants(input: {
  merchantId: string;
  createdByUserId?: string | null;
  sourceItemId: string;
  workingTitle: string;
  rewriteGoal?: string | null;
  inputSnapshot?: Record<string, unknown>;
  commentInsights?: Record<string, unknown>;
  status?: ContentDraftDto["status"];
  variants: Array<{
    platform: Platform;
    variantType: ContentVariantDto["variantType"];
    title?: string | null;
    bodyText?: string | null;
    scriptText?: string | null;
    hashtags?: string[];
    ctaText?: string | null;
    productionScenes?: ContentVariantDto["productionScenes"];
    reviewStatus?: ContentVariantDto["reviewStatus"];
  }>;
}): Promise<ContentDraftBundleDto> {
  return pgCreateDraftWithVariants(input);
}

export async function listDraftBundlesByMerchant(input: {
  merchantId: string;
  createdByUserId?: string | null;
  limit?: number;
}): Promise<ContentDraftBundleDto[]> {
  return pgListDraftBundlesByMerchant(input);
}

export async function getDraftBundleByMerchant(input: {
  merchantId: string;
  draftId: string;
  createdByUserId?: string | null;
}): Promise<ContentDraftBundleDto> {
  return pgGetDraftBundleByMerchant(input);
}

export async function approveContentVariant(input: {
  merchantId: string;
  createdByUserId?: string | null;
  contentVariantId: string;
}): Promise<ContentVariantDto> {
  return pgApproveContentVariant(input);
}

export async function appendContentVariantToDraft(input: {
  merchantId: string;
  createdByUserId?: string | null;
  draftId: string;
  platform: Platform;
  variantType: ContentVariantDto["variantType"];
  title?: string | null;
  bodyText?: string | null;
  scriptText?: string | null;
  hashtags?: string[];
  ctaText?: string | null;
  productionScenes?: ContentVariantDto["productionScenes"];
  reviewStatus?: ContentVariantDto["reviewStatus"];
}): Promise<ContentVariantDto> {
  return pgAppendContentVariantToDraft(input);
}

export async function updateContentVariantScript(input: {
  merchantId: string;
  createdByUserId?: string | null;
  contentVariantId: string;
  title?: string | null;
  scriptText: string;
  hashtags?: string[];
  ctaText?: string | null;
  reviewStatus?: ContentVariantDto["reviewStatus"];
}): Promise<ContentVariantDto> {
  return pgUpdateContentVariantScript(input);
}

export async function assertContentVariantAccess(input: {
  merchantId: string;
  createdByUserId?: string | null;
  contentVariantId: string;
  variantType?: ContentVariantDto["variantType"];
}): Promise<{
  merchantId: string;
  createdByUserId?: string | null;
  draftId: string;
  contentVariantId: string;
  variantType: ContentVariantDto["variantType"];
  title?: string | null;
  bodyText?: string | null;
  scriptText?: string | null;
  hashtags: string[];
  ctaText?: string | null;
  reviewStatus: ContentVariantDto["reviewStatus"];
  inputSnapshot: Record<string, unknown> | null;
}> {
  return pgAssertContentVariantAccess(input);
}

export async function appendContentDraftRevisionTrace(input: {
  merchantId: string;
  createdByUserId?: string | null;
  draftId: string;
  trace: Record<string, unknown>;
}) {
  return pgAppendContentDraftRevisionTrace(input);
}
