import "server-only";

import type { ContentDraftBundleDto, ContentDraftDto, ContentVariantDto } from "@/contracts/draft";
import type { Platform } from "@/contracts/import";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/server/api/errors";

type ContentDraftRow = {
  id: string;
  source_item_id: string;
  merchant_id: string;
  working_title: string | null;
  rewrite_goal: string | null;
  status: ContentDraftDto["status"];
  selected_variant_id: string | null;
  created_at: string;
  updated_at: string;
};

type ContentVariantRow = {
  id: string;
  draft_id: string;
  platform: Platform;
  variant_type: ContentVariantDto["variantType"];
  version_no: number;
  title: string | null;
  body_text: string | null;
  script_text: string | null;
  hashtags: unknown;
  cta_text: string | null;
  review_status: ContentVariantDto["reviewStatus"];
  created_at: string;
  updated_at: string;
};

export async function createManualSourceItem(input: {
  merchantId: string;
  platform: Platform;
  title: string;
  bodyText?: string | null;
  scriptText?: string | null;
  tracePayload?: Record<string, unknown>;
}) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("source_items")
    .insert({
      merchant_id: input.merchantId,
      platform: input.platform,
      source_type: "manual_text",
      title: input.title,
      body_text: input.bodyText ?? null,
      script_text: input.scriptText ?? null,
      trace_payload: input.tracePayload ?? {},
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new ApiError(500, "MANUAL_SOURCE_ITEM_CREATE_FAILED", error?.message ?? "Create failed.");
  }

  return {
    id: String((data as { id: string }).id),
  };
}

export async function createDraftWithVariants(input: {
  merchantId: string;
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
    reviewStatus?: ContentVariantDto["reviewStatus"];
  }>;
}): Promise<ContentDraftBundleDto> {
  const supabase = createSupabaseAdminClient();
  const { data: draftData, error: draftError } = await supabase
    .from("content_drafts")
    .insert({
      source_item_id: input.sourceItemId,
      merchant_id: input.merchantId,
      working_title: input.workingTitle,
      rewrite_goal: input.rewriteGoal ?? null,
      input_snapshot: input.inputSnapshot ?? {},
      comment_insights: input.commentInsights ?? {},
      status: input.status ?? "review_pending",
    })
    .select(contentDraftSelect)
    .single();

  if (draftError || !draftData) {
    throw new ApiError(500, "CONTENT_DRAFT_CREATE_FAILED", draftError?.message ?? "Create failed.");
  }

  const draft = mapContentDraft(draftData as unknown as ContentDraftRow);
  const { data: variantData, error: variantError } = await supabase
    .from("content_variants")
    .insert(
      input.variants.map((variant, index) => ({
        draft_id: draft.id,
        platform: variant.platform,
        variant_type: variant.variantType,
        version_no: index + 1,
        title: variant.title ?? null,
        body_text: variant.bodyText ?? null,
        script_text: variant.scriptText ?? null,
        hashtags: variant.hashtags ?? [],
        cta_text: variant.ctaText ?? null,
        review_status: variant.reviewStatus ?? "editing",
      })),
    )
    .select(contentVariantSelect)
    .order("version_no", { ascending: true });

  if (variantError || !variantData || variantData.length === 0) {
    throw new ApiError(
      500,
      "CONTENT_VARIANT_CREATE_FAILED",
      variantError?.message ?? "Create failed.",
    );
  }

  const variants = (variantData as unknown as ContentVariantRow[]).map(mapContentVariant);
  const selectedVariant = variants[0] ?? null;
  const { data: updatedDraftData, error: updateDraftError } = await supabase
    .from("content_drafts")
    .update({
      selected_variant_id: selectedVariant?.id ?? null,
    })
    .eq("id", draft.id)
    .select(contentDraftSelect)
    .single();

  if (updateDraftError || !updatedDraftData) {
    throw new ApiError(
      500,
      "CONTENT_DRAFT_SELECT_VARIANT_FAILED",
      updateDraftError?.message ?? "Update failed.",
    );
  }

  return {
    draft: mapContentDraft(updatedDraftData as unknown as ContentDraftRow),
    variants,
    selectedVariant,
  };
}

export async function listDraftBundlesByMerchant(input: {
  merchantId: string;
  limit?: number;
}): Promise<ContentDraftBundleDto[]> {
  const supabase = createSupabaseAdminClient();
  const { data: draftData, error: draftError } = await supabase
    .from("content_drafts")
    .select(contentDraftSelect)
    .eq("merchant_id", input.merchantId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 50);

  if (draftError) {
    throw new ApiError(500, "CONTENT_DRAFT_LIST_FAILED", draftError.message);
  }

  const drafts = ((draftData ?? []) as unknown as ContentDraftRow[]).map(mapContentDraft);

  if (drafts.length === 0) {
    return [];
  }

  const { data: variantData, error: variantError } = await supabase
    .from("content_variants")
    .select(contentVariantSelect)
    .in(
      "draft_id",
      drafts.map((draft) => draft.id),
    )
    .order("version_no", { ascending: true });

  if (variantError) {
    throw new ApiError(500, "CONTENT_VARIANT_LIST_FAILED", variantError.message);
  }

  const groupedVariants = new Map<string, ContentVariantDto[]>();

  for (const variant of ((variantData ?? []) as unknown as ContentVariantRow[]).map(
    mapContentVariant,
  )) {
    const current = groupedVariants.get(variant.draftId) ?? [];
    current.push(variant);
    groupedVariants.set(variant.draftId, current);
  }

  return drafts.map((draft) => {
    const variants = groupedVariants.get(draft.id) ?? [];

    return {
      draft,
      variants,
      selectedVariant:
        variants.find((variant) => variant.id === draft.selectedVariantId) ?? variants[0] ?? null,
    };
  });
}

function mapContentDraft(row: ContentDraftRow): ContentDraftDto {
  return {
    id: row.id,
    sourceItemId: row.source_item_id,
    merchantId: row.merchant_id,
    workingTitle: row.working_title,
    rewriteGoal: row.rewrite_goal,
    status: row.status,
    selectedVariantId: row.selected_variant_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapContentVariant(row: ContentVariantRow): ContentVariantDto {
  return {
    id: row.id,
    draftId: row.draft_id,
    platform: row.platform,
    variantType: row.variant_type,
    versionNo: row.version_no,
    title: row.title,
    bodyText: row.body_text,
    scriptText: row.script_text,
    hashtags: toStringArray(row.hashtags),
    ctaText: row.cta_text,
    reviewStatus: row.review_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

const contentDraftSelect = [
  "id",
  "source_item_id",
  "merchant_id",
  "working_title",
  "rewrite_goal",
  "status",
  "selected_variant_id",
  "created_at",
  "updated_at",
].join(", ");

const contentVariantSelect = [
  "id",
  "draft_id",
  "platform",
  "variant_type",
  "version_no",
  "title",
  "body_text",
  "script_text",
  "hashtags",
  "cta_text",
  "review_status",
  "created_at",
  "updated_at",
].join(", ");
