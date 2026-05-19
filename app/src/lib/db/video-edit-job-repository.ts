import "server-only";

import type { ContentVariantDto } from "@/contracts/draft";
import type {
  CreateVideoEditJobRequest,
  VideoEditJobDto,
  VideoEditJobStatus,
  VideoEditJobTriggerSource,
} from "@/contracts/video";
import {
  VIDEO_EDIT_JOB_IN_FLIGHT_STATUSES,
} from "@/contracts/video";
import {
  cancelLocalRealChainVideoEditJob,
  createLocalRealChainVideoEditJob,
  getLocalRealChainVideoEditJobById,
  isLocalRealChainEnabled,
  listLocalRealChainVideoEditJobs,
  retryLocalRealChainVideoEditJob,
} from "@/lib/db/local-real-chain-repository";
import {
  isPostgresVideoChainEnabled,
  pgAssertVideoScriptVariantAccess,
  pgCancelVideoEditJob,
  pgCreateVideoEditJob,
  pgFindInFlightVideoEditJobForScope,
  pgGetVideoEditJobById,
  pgListVideoEditJobs,
  pgRetryVideoEditJob,
} from "@/lib/db/postgres-video-chain-repository";
import { cloudSupabaseRequiredError } from "@/lib/db/cloud-supabase-required";
import { normalizeVideoProgressModules } from "@/lib/ui/video-progress-modules";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { ApiError } from "@/server/api/errors";

type VideoEditJobRow = {
  id: string;
  merchant_id: string;
  created_by_user_id: string | null;
  draft_id: string;
  content_variant_id: string;
  status: VideoEditJobStatus;
  current_stage: string | null;
  trigger_source: VideoEditJobTriggerSource;
  instruction_text: string | null;
  input_payload: Record<string, unknown>;
  runtime_payload: Record<string, unknown>;
  progress_pct: number;
  retry_count: number;
  failure_reason: string | null;
  result_payload: Record<string, unknown>;
  log_payload: Record<string, unknown>;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

type ContentVariantContextRow = {
  id: string;
  draft_id: string;
  variant_type: ContentVariantDto["variantType"];
  title: string | null;
  script_text: string | null;
  hashtags: unknown;
  cta_text: string | null;
  production_scenes?: unknown;
  review_status: ContentVariantDto["reviewStatus"];
};

type ContentDraftContextRow = {
  id: string;
  merchant_id: string;
  created_by_user_id: string | null;
};

export type VideoEditJobListFilters = {
  status?: VideoEditJobStatus;
  createdByUserId?: string | null;
  limit?: number;
};

export type VideoEditJobDeduplicationScope = {
  merchantId: string;
  createdByUserId?: string | null;
  draftId: string;
  contentVariantId: string;
};

export async function assertVideoScriptVariantAccess(input: {
  merchantId: string;
  createdByUserId?: string | null;
  contentVariantId: string;
}): Promise<{
  merchantId: string;
  createdByUserId?: string | null;
  draftId: string;
  contentVariantId: string;
  variantType: ContentVariantDto["variantType"];
  title?: string | null;
  scriptText?: string | null;
  hashtags?: string[];
  ctaText?: string | null;
  productionScenes?: ContentVariantDto["productionScenes"];
  reviewStatus: ContentVariantDto["reviewStatus"];
}> {
  if (isPostgresVideoChainEnabled()) {
    return pgAssertVideoScriptVariantAccess(input);
  }

  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError();
  }

  const supabase = createSupabaseAdminClient();
  const { data: variantData, error: variantError } = await supabase
    .from("content_variants")
    .select(
      "id, draft_id, variant_type, title, script_text, hashtags, cta_text, production_scenes, review_status",
    )
    .eq("id", input.contentVariantId)
    .single();

  if (variantError || !variantData) {
    throw new ApiError(404, "CONTENT_VARIANT_NOT_FOUND", "Content variant not found.");
  }

  const variant = variantData as unknown as ContentVariantContextRow;
  let draftQuery = supabase
    .from("content_drafts")
    .select("id, merchant_id, created_by_user_id")
    .eq("id", variant.draft_id)
    .eq("merchant_id", input.merchantId);

  if (input.createdByUserId) {
    draftQuery = draftQuery.eq("created_by_user_id", input.createdByUserId);
  }

  const { data: draftData, error: draftError } = await draftQuery.single();

  if (draftError || !draftData) {
    throw new ApiError(404, "CONTENT_VARIANT_NOT_FOUND", "Content variant is not accessible.");
  }

  if (variant.variant_type !== "video_script") {
    throw new ApiError(
      409,
      "CONTENT_VARIANT_NOT_VIDEO_SCRIPT",
      "Only video_script variants can create video edit jobs.",
    );
  }

  const draft = draftData as unknown as ContentDraftContextRow;
  return {
    merchantId: draft.merchant_id,
    createdByUserId: draft.created_by_user_id ?? null,
    draftId: draft.id,
    contentVariantId: variant.id,
    variantType: variant.variant_type,
    title: variant.title,
    scriptText: variant.script_text,
    hashtags: toStringArray(variant.hashtags),
    ctaText: variant.cta_text,
    productionScenes: toProductionScenes(variant.production_scenes),
    reviewStatus: variant.review_status,
  };
}

export async function createVideoEditJob(input: {
  merchantId: string;
  createdByUserId?: string | null;
  draftId: string;
  contentVariantId: string;
  triggerSource?: VideoEditJobTriggerSource;
  instructionText?: CreateVideoEditJobRequest["instructionText"];
  inputPayload?: Record<string, unknown>;
  runtimePayload?: Record<string, unknown>;
}): Promise<VideoEditJobDto> {
  if (isPostgresVideoChainEnabled()) {
    const existingInFlightJob = await findInFlightVideoEditJobForScope({
      merchantId: input.merchantId,
      createdByUserId: input.createdByUserId,
      draftId: input.draftId,
      contentVariantId: input.contentVariantId,
    });

    if (existingInFlightJob) {
      return existingInFlightJob;
    }

    return pgCreateVideoEditJob(input);
  }

  const existingInFlightJob = await findInFlightVideoEditJobForScope({
    merchantId: input.merchantId,
    createdByUserId: input.createdByUserId,
    draftId: input.draftId,
    contentVariantId: input.contentVariantId,
  });

  if (existingInFlightJob) {
    return existingInFlightJob;
  }

  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError();
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("video_edit_jobs")
    .insert({
      merchant_id: input.merchantId,
      created_by_user_id: input.createdByUserId ?? null,
      draft_id: input.draftId,
      content_variant_id: input.contentVariantId,
      trigger_source: input.triggerSource ?? "manual",
      instruction_text: input.instructionText ?? null,
      input_payload: input.inputPayload ?? {},
      runtime_payload: input.runtimePayload ?? {},
      result_payload: {},
      log_payload: {},
      progress_pct: 0,
      retry_count: 0,
      status: "pending",
      current_stage: null,
      failure_reason: null,
      started_at: null,
      finished_at: null,
    })
    .select(videoEditJobSelect)
    .single();

  if (error || !data) {
    if (isUniqueViolation(error)) {
      const inFlightJob = await findInFlightVideoEditJobForScope({
        merchantId: input.merchantId,
        createdByUserId: input.createdByUserId,
        draftId: input.draftId,
        contentVariantId: input.contentVariantId,
      });

      if (inFlightJob) {
        return inFlightJob;
      }
    }

    throw new ApiError(500, "VIDEO_EDIT_JOB_CREATE_FAILED", error?.message ?? "Create failed.");
  }

  return mapVideoEditJob(data as unknown as VideoEditJobRow);
}

export async function findInFlightVideoEditJobForScope(
  input: VideoEditJobDeduplicationScope,
): Promise<VideoEditJobDto | null> {
  if (isPostgresVideoChainEnabled()) {
    return pgFindInFlightVideoEditJobForScope(input);
  }

  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError();
  }

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("video_edit_jobs")
    .select(videoEditJobSelect)
    .eq("merchant_id", input.merchantId)
    .eq("draft_id", input.draftId)
    .eq("content_variant_id", input.contentVariantId)
    .in("status", [...VIDEO_EDIT_JOB_IN_FLIGHT_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1);

  if (input.createdByUserId !== undefined) {
    if (input.createdByUserId) {
      query = query.eq("created_by_user_id", input.createdByUserId);
    } else {
      query = query.is("created_by_user_id", null);
    }
  }

  const { data, error } = await query;

  if (error) {
    throw new ApiError(500, "VIDEO_EDIT_JOB_LOOKUP_FAILED", error.message);
  }

  const row = (data?.[0] ?? null) as unknown as VideoEditJobRow | null;

  return row ? mapVideoEditJob(row) : null;
}

export async function listVideoEditJobs(
  merchantId: string,
  filters: VideoEditJobListFilters = {},
): Promise<VideoEditJobDto[]> {
  if (isPostgresVideoChainEnabled()) {
    return pgListVideoEditJobs(merchantId, filters);
  }

  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError();
  }

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("video_edit_jobs")
    .select(videoEditJobSelect)
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 50);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.createdByUserId) {
    query = query.eq("created_by_user_id", filters.createdByUserId);
  } else if (filters.createdByUserId === null) {
    query = query.is("created_by_user_id", null);
  }

  const { data, error } = await query;

  if (error) {
    throw new ApiError(500, "VIDEO_EDIT_JOB_LIST_FAILED", error.message);
  }

  return ((data ?? []) as unknown as VideoEditJobRow[]).map(mapVideoEditJob);
}

export async function getVideoEditJobById(input: {
  merchantId: string;
  createdByUserId?: string | null;
  jobId: string;
}): Promise<VideoEditJobDto> {
  if (isPostgresVideoChainEnabled()) {
    return pgGetVideoEditJobById(input);
  }

  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError();
  }

  const supabase = createSupabaseAdminClient();
  let jobQuery = supabase
    .from("video_edit_jobs")
    .select(videoEditJobSelect)
    .eq("id", input.jobId)
    .eq("merchant_id", input.merchantId);

  if (input.createdByUserId) {
    jobQuery = jobQuery.eq("created_by_user_id", input.createdByUserId);
  }

  const { data, error } = await jobQuery.single();

  if (error || !data) {
    throw new ApiError(404, "VIDEO_EDIT_JOB_NOT_FOUND", "Video edit job not found.");
  }

  return mapVideoEditJob(data as unknown as VideoEditJobRow);
}

export async function retryVideoEditJob(input: {
  merchantId: string;
  createdByUserId?: string | null;
  jobId: string;
}): Promise<VideoEditJobDto> {
  if (isPostgresVideoChainEnabled()) {
    return pgRetryVideoEditJob(input);
  }

  const current = await getVideoEditJobById(input);

  if (!["failed_retryable", "failed_manual"].includes(current.status)) {
    throw new ApiError(
      409,
      "VIDEO_EDIT_JOB_RETRY_NOT_ALLOWED",
      "Only failed jobs can be retried after manual review.",
    );
  }

  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError();
  }

  const supabase = createSupabaseAdminClient();
  let retryQuery = supabase
    .from("video_edit_jobs")
    .update({
      status: "pending",
      current_stage: null,
      progress_pct: 0,
      failure_reason: null,
      runtime_payload: {},
      result_payload: {},
      log_payload: {},
      started_at: null,
      finished_at: null,
      retry_count: current.retryCount + 1,
    })
    .eq("id", input.jobId)
    .eq("merchant_id", input.merchantId);

  if (input.createdByUserId) {
    retryQuery = retryQuery.eq("created_by_user_id", input.createdByUserId);
  }

  const { data, error } = await retryQuery.select(videoEditJobSelect).single();

  if (error || !data) {
    throw new ApiError(500, "VIDEO_EDIT_JOB_RETRY_FAILED", error?.message ?? "Retry failed.");
  }

  return mapVideoEditJob(data as unknown as VideoEditJobRow);
}

export async function cancelVideoEditJob(input: {
  merchantId: string;
  createdByUserId?: string | null;
  jobId: string;
}): Promise<VideoEditJobDto> {
  if (isPostgresVideoChainEnabled()) {
    return pgCancelVideoEditJob(input);
  }

  const current = await getVideoEditJobById(input);

  if (!["pending", "queued", "preparing", "running"].includes(current.status)) {
    throw new ApiError(
      409,
      "VIDEO_EDIT_JOB_CANCEL_NOT_ALLOWED",
      "Only in-flight jobs can be cancelled.",
    );
  }

  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError();
  }

  const supabase = createSupabaseAdminClient();
  let cancelQuery = supabase
    .from("video_edit_jobs")
    .update({
      status: "cancelled",
      current_stage: current.currentStage ?? "cancelled",
      finished_at: new Date().toISOString(),
    })
    .eq("id", input.jobId)
    .eq("merchant_id", input.merchantId);

  if (input.createdByUserId) {
    cancelQuery = cancelQuery.eq("created_by_user_id", input.createdByUserId);
  }

  const { data, error } = await cancelQuery.select(videoEditJobSelect).single();

  if (error || !data) {
    throw new ApiError(500, "VIDEO_EDIT_JOB_CANCEL_FAILED", error?.message ?? "Cancel failed.");
  }

  return mapVideoEditJob(data as unknown as VideoEditJobRow);
}

export function mapVideoEditJob(row: VideoEditJobRow): VideoEditJobDto {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    createdByUserId: row.created_by_user_id ?? null,
    draftId: row.draft_id,
    contentVariantId: row.content_variant_id,
    status: row.status,
    currentStage: row.current_stage,
    triggerSource: row.trigger_source,
    instructionText: row.instruction_text,
    inputPayload: row.input_payload ?? {},
    runtimePayload: row.runtime_payload ?? {},
    progressPct: row.progress_pct,
    retryCount: row.retry_count,
    failureReason: row.failure_reason,
    resultPayload: row.result_payload ?? {},
    logPayload: row.log_payload ?? {},
    progressModules: normalizeVideoProgressModules({
      status: row.status,
      currentStage: row.current_stage,
      progressPct: row.progress_pct,
      runtimePayload: row.runtime_payload ?? {},
      resultPayload: row.result_payload ?? {},
      logPayload: row.log_payload ?? {},
    }),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505",
  );
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

const videoEditJobSelect = [
  "id",
  "merchant_id",
  "created_by_user_id",
  "draft_id",
  "content_variant_id",
  "status",
  "current_stage",
  "trigger_source",
  "instruction_text",
  "input_payload",
  "runtime_payload",
  "progress_pct",
  "retry_count",
  "failure_reason",
  "result_payload",
  "log_payload",
  "started_at",
  "finished_at",
  "created_at",
  "updated_at",
].join(", ");
