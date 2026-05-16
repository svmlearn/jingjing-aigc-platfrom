import "server-only";

import type { ContentDraftBundleDto, ContentDraftDto, ContentVariantDto } from "@/contracts/draft";
import type { Platform } from "@/contracts/import";
import { cloudSupabaseRequiredError } from "@/lib/db/cloud-supabase-required";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { ApiError } from "@/server/api/errors";

type ContentDraftRow = {
  id: string;
  source_item_id: string;
  merchant_id: string;
  created_by_user_id: string | null;
  working_title: string | null;
  rewrite_goal: string | null;
  input_snapshot: Record<string, unknown> | null;
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
  production_scenes?: unknown;
  review_status: ContentVariantDto["reviewStatus"];
  created_at: string;
  updated_at: string;
};

type ContentVariantAccessRow = ContentVariantRow & {
  content_drafts:
    | {
        id: string;
        merchant_id: string;
        created_by_user_id: string | null;
        input_snapshot: Record<string, unknown> | null;
      }
    | Array<{
        id: string;
        merchant_id: string;
        created_by_user_id: string | null;
        input_snapshot: Record<string, unknown> | null;
      }>
    | null;
};

export async function createManualSourceItem(input: {
  merchantId: string;
  platform: Platform;
  title: string;
  bodyText?: string | null;
  scriptText?: string | null;
  tracePayload?: Record<string, unknown>;
}) {
  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError();
  }

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
  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError();
  }

  const supabase = createSupabaseAdminClient();
  const { data: draftData, error: draftError } = await supabase
    .from("content_drafts")
    .insert({
      source_item_id: input.sourceItemId,
      merchant_id: input.merchantId,
      created_by_user_id: input.createdByUserId ?? null,
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
        production_scenes: variant.productionScenes ?? [],
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
  createdByUserId?: string | null;
  limit?: number;
}): Promise<ContentDraftBundleDto[]> {
  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError();
  }

  const supabase = createSupabaseAdminClient();
  let draftQuery = supabase
    .from("content_drafts")
    .select(contentDraftSelect)
    .eq("merchant_id", input.merchantId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 50);

  if (input.createdByUserId) {
    draftQuery = draftQuery.eq("created_by_user_id", input.createdByUserId);
  }

  const { data: draftData, error: draftError } = await draftQuery;

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

export async function getDraftBundleByMerchant(input: {
  merchantId: string;
  draftId: string;
  createdByUserId?: string | null;
}): Promise<ContentDraftBundleDto> {
  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError();
  }

  const supabase = createSupabaseAdminClient();
  let draftQuery = supabase
    .from("content_drafts")
    .select(contentDraftSelect)
    .eq("id", input.draftId)
    .eq("merchant_id", input.merchantId);

  if (input.createdByUserId) {
    draftQuery = draftQuery.eq("created_by_user_id", input.createdByUserId);
  }

  const { data: draftData, error: draftError } = await draftQuery.single();

  if (draftError || !draftData) {
    throw new ApiError(404, "CONTENT_DRAFT_NOT_FOUND", "Content draft not found.");
  }

  const draft = mapContentDraft(draftData as unknown as ContentDraftRow);
  const { data: variantData, error: variantError } = await supabase
    .from("content_variants")
    .select(contentVariantSelect)
    .eq("draft_id", input.draftId)
    .order("version_no", { ascending: true });

  if (variantError) {
    throw new ApiError(500, "CONTENT_VARIANT_LIST_FAILED", variantError.message);
  }

  const variants = ((variantData ?? []) as unknown as ContentVariantRow[]).map(mapContentVariant);

  return {
    draft,
    variants,
    selectedVariant:
      variants.find((variant) => variant.id === draft.selectedVariantId) ?? variants[0] ?? null,
  };
}

export async function approveContentVariant(input: {
  merchantId: string;
  createdByUserId?: string | null;
  contentVariantId: string;
}): Promise<ContentVariantDto> {
  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError();
  }

  const supabase = createSupabaseAdminClient();
  const { data: variantData, error: variantError } = await supabase
    .from("content_variants")
    .select(contentVariantSelect)
    .eq("id", input.contentVariantId)
    .single();

  if (variantError || !variantData) {
    throw new ApiError(404, "CONTENT_VARIANT_NOT_FOUND", "Content variant not found.");
  }

  const currentVariant = mapContentVariant(variantData as unknown as ContentVariantRow);
  let draftQuery = supabase
    .from("content_drafts")
    .select("id, merchant_id, created_by_user_id")
    .eq("id", currentVariant.draftId)
    .eq("merchant_id", input.merchantId);

  if (input.createdByUserId) {
    draftQuery = draftQuery.eq("created_by_user_id", input.createdByUserId);
  }

  const { data: draftData, error: draftError } = await draftQuery.single();

  if (draftError || !draftData) {
    throw new ApiError(404, "CONTENT_VARIANT_NOT_FOUND", "Content variant is not accessible.");
  }

  const { data: approvedData, error: approveError } = await supabase
    .from("content_variants")
    .update({
      review_status: "approved",
    })
    .eq("id", input.contentVariantId)
    .select(contentVariantSelect)
    .single();

  if (approveError || !approvedData) {
    throw new ApiError(
      500,
      "CONTENT_VARIANT_APPROVE_FAILED",
      approveError?.message ?? "Approve failed.",
    );
  }

  let selectVariantQuery = supabase
    .from("content_drafts")
    .update({
      selected_variant_id: input.contentVariantId,
    })
    .eq("id", currentVariant.draftId)
    .eq("merchant_id", input.merchantId);

  if (input.createdByUserId) {
    selectVariantQuery = selectVariantQuery.eq("created_by_user_id", input.createdByUserId);
  }

  const { error: selectVariantError } = await selectVariantQuery;

  if (selectVariantError) {
    throw new ApiError(
      500,
      "CONTENT_DRAFT_SELECT_VARIANT_FAILED",
      selectVariantError.message,
    );
  }

  return mapContentVariant(approvedData as unknown as ContentVariantRow);
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
  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError();
  }

  const supabase = createSupabaseAdminClient();
  let draftQuery = supabase
    .from("content_drafts")
    .select("id, merchant_id, created_by_user_id")
    .eq("id", input.draftId)
    .eq("merchant_id", input.merchantId);

  if (input.createdByUserId) {
    draftQuery = draftQuery.eq("created_by_user_id", input.createdByUserId);
  }

  const { data: draftData, error: draftError } = await draftQuery.single();

  if (draftError || !draftData) {
    throw new ApiError(404, "CONTENT_DRAFT_NOT_FOUND", "Content draft not found.");
  }

  const { data: existingData, error: existingError } = await supabase
    .from("content_variants")
    .select("version_no")
    .eq("draft_id", input.draftId)
    .order("version_no", { ascending: false })
    .limit(1);

  if (existingError) {
    throw new ApiError(500, "CONTENT_VARIANT_VERSION_LOOKUP_FAILED", existingError.message);
  }

  const nextVersion =
    Number((existingData?.[0] as { version_no?: number } | undefined)?.version_no ?? 0) + 1;
  const { data: variantData, error: variantError } = await supabase
    .from("content_variants")
    .insert({
      draft_id: input.draftId,
      platform: input.platform,
      variant_type: input.variantType,
      version_no: nextVersion,
      title: input.title ?? null,
      body_text: input.bodyText ?? null,
      script_text: input.scriptText ?? null,
      hashtags: input.hashtags ?? [],
      cta_text: input.ctaText ?? null,
      production_scenes: input.productionScenes ?? [],
      review_status: input.reviewStatus ?? "review_pending",
    })
    .select(contentVariantSelect)
    .single();

  if (variantError || !variantData) {
    throw new ApiError(
      500,
      "CONTENT_VARIANT_APPEND_FAILED",
      variantError?.message ?? "Create failed.",
    );
  }

  const variant = mapContentVariant(variantData as unknown as ContentVariantRow);
  let selectQuery = supabase
    .from("content_drafts")
    .update({
      selected_variant_id: variant.id,
    })
    .eq("id", input.draftId)
    .eq("merchant_id", input.merchantId);

  if (input.createdByUserId) {
    selectQuery = selectQuery.eq("created_by_user_id", input.createdByUserId);
  }

  const { error: selectError } = await selectQuery;

  if (selectError) {
    throw new ApiError(500, "CONTENT_DRAFT_SELECT_VARIANT_FAILED", selectError.message);
  }

  return variant;
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
  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError();
  }

  const currentVariant = await assertContentVariantAccess({
    merchantId: input.merchantId,
    createdByUserId: input.createdByUserId,
    contentVariantId: input.contentVariantId,
    variantType: "video_script",
  });
  const supabase = createSupabaseAdminClient();
  const { data: variantData, error: variantError } = await supabase
    .from("content_variants")
    .update({
      title: input.title ?? currentVariant.title ?? null,
      script_text: input.scriptText,
      hashtags: input.hashtags ?? currentVariant.hashtags,
      cta_text: input.ctaText ?? currentVariant.ctaText ?? null,
      review_status: input.reviewStatus ?? "review_pending",
    })
    .eq("id", input.contentVariantId)
    .select(contentVariantSelect)
    .single();

  if (variantError || !variantData) {
    throw new ApiError(
      500,
      "CONTENT_VARIANT_UPDATE_FAILED",
      variantError?.message ?? "Update failed.",
    );
  }

  let selectQuery = supabase
    .from("content_drafts")
    .update({
      selected_variant_id: input.contentVariantId,
    })
    .eq("id", currentVariant.draftId)
    .eq("merchant_id", input.merchantId);

  if (input.createdByUserId) {
    selectQuery = selectQuery.eq("created_by_user_id", input.createdByUserId);
  }

  const { error: selectError } = await selectQuery;

  if (selectError) {
    throw new ApiError(500, "CONTENT_DRAFT_SELECT_VARIANT_FAILED", selectError.message);
  }

  return mapContentVariant(variantData as unknown as ContentVariantRow);
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
  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError();
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("content_variants")
    .select(
      `${contentVariantSelect}, content_drafts!inner(id, merchant_id, created_by_user_id, input_snapshot)`,
    )
    .eq("id", input.contentVariantId)
    .single();

  if (error || !data) {
    throw new ApiError(404, "CONTENT_VARIANT_NOT_FOUND", "Content variant not found.");
  }

  const row = data as unknown as ContentVariantAccessRow;
  const draft = Array.isArray(row.content_drafts)
    ? row.content_drafts[0]
    : row.content_drafts;

  if (
    !draft ||
    draft.merchant_id !== input.merchantId ||
    (input.createdByUserId && draft.created_by_user_id !== input.createdByUserId)
  ) {
    throw new ApiError(404, "CONTENT_VARIANT_NOT_FOUND", "Content variant is not accessible.");
  }

  const variant = mapContentVariant(row);

  if (input.variantType && variant.variantType !== input.variantType) {
    throw new ApiError(
      409,
      "CONTENT_VARIANT_TYPE_MISMATCH",
      "当前内容版本类型和操作要求不一致。",
    );
  }

  return {
    merchantId: draft.merchant_id,
    createdByUserId: draft.created_by_user_id ?? null,
    draftId: draft.id,
    contentVariantId: variant.id,
    variantType: variant.variantType,
    title: variant.title,
    bodyText: variant.bodyText,
    scriptText: variant.scriptText,
    hashtags: variant.hashtags,
    ctaText: variant.ctaText,
    reviewStatus: variant.reviewStatus,
    inputSnapshot: draft.input_snapshot ?? null,
  };
}

export async function appendContentDraftRevisionTrace(input: {
  merchantId: string;
  createdByUserId?: string | null;
  draftId: string;
  trace: Record<string, unknown>;
}) {
  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError();
  }

  const supabase = createSupabaseAdminClient();
  let draftQuery = supabase
    .from("content_drafts")
    .select("id, input_snapshot")
    .eq("id", input.draftId)
    .eq("merchant_id", input.merchantId);

  if (input.createdByUserId) {
    draftQuery = draftQuery.eq("created_by_user_id", input.createdByUserId);
  }

  const { data, error } = await draftQuery.single();

  if (error || !data) {
    throw new ApiError(404, "CONTENT_DRAFT_NOT_FOUND", "Content draft not found.");
  }

  const row = data as { input_snapshot?: Record<string, unknown> | null };
  const snapshot = row.input_snapshot ?? {};
  const traces = Array.isArray(snapshot.revisionTraces) ? snapshot.revisionTraces : [];
  let updateQuery = supabase
    .from("content_drafts")
    .update({
      input_snapshot: {
        ...snapshot,
        revisionTraces: [...traces, input.trace],
      },
    })
    .eq("id", input.draftId)
    .eq("merchant_id", input.merchantId);

  if (input.createdByUserId) {
    updateQuery = updateQuery.eq("created_by_user_id", input.createdByUserId);
  }

  const { error: updateError } = await updateQuery;

  if (updateError) {
    throw new ApiError(500, "CONTENT_DRAFT_TRACE_UPDATE_FAILED", updateError.message);
  }
}

function mapContentDraft(row: ContentDraftRow): ContentDraftDto {
  return {
    id: row.id,
    sourceItemId: row.source_item_id,
    merchantId: row.merchant_id,
    createdByUserId: row.created_by_user_id ?? null,
    workingTitle: row.working_title,
    rewriteGoal: row.rewrite_goal,
    inputSnapshot: row.input_snapshot ?? null,
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
    productionScenes: toProductionScenes(row.production_scenes),
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

function toProductionScenes(value: unknown): ContentVariantDto["productionScenes"] {
  if (!Array.isArray(value)) {
    return [];
  }

  const scenes: NonNullable<ContentVariantDto["productionScenes"]> = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    scenes.push({
      sceneNo: toPositiveInteger(record.sceneNo) ?? 0,
      timeRange: toStringValue(record.timeRange),
      sceneType: toNullableStringValue(record.sceneType),
      requiresUserUpload: toNullableBooleanValue(record.requiresUserUpload),
      shotRequirement: toStringValue(record.shotRequirement),
      visual: toStringValue(record.visual),
      voiceover: toStringValue(record.voiceover),
      subtitle: toStringValue(record.subtitle),
      materials: toStringArray(record.materials),
      cameraMovement: toStringValue(record.cameraMovement),
      purpose: toStringValue(record.purpose),
      fallbackShot: toStringValue(record.fallbackShot),
    });
  }

  return scenes;
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toNullableStringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function toNullableBooleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function toPositiveInteger(value: unknown) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

const contentDraftSelect = [
  "id",
  "source_item_id",
  "merchant_id",
  "created_by_user_id",
  "working_title",
  "rewrite_goal",
  "input_snapshot",
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
  "production_scenes",
  "review_status",
  "created_at",
  "updated_at",
].join(", ");
