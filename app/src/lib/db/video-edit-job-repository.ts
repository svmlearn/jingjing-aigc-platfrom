import "server-only";

import type { ContentVariantDto } from "@/contracts/draft";
import type { CreateVideoEditJobRequest, VideoEditJobDto, VideoEditJobStatus } from "@/contracts/video";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/server/api/errors";

type VideoEditJobRow = {
  id: string;
  merchant_id: string;
  draft_id: string;
  content_variant_id: string;
  status: VideoEditJobStatus;
  current_stage: string | null;
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
};

type ContentDraftContextRow = {
  id: string;
  merchant_id: string;
};

export type VideoEditJobListFilters = {
  status?: VideoEditJobStatus;
  limit?: number;
};

export async function assertVideoScriptVariantAccess(input: {
  merchantId: string;
  contentVariantId: string;
}): Promise<{
  merchantId: string;
  draftId: string;
  contentVariantId: string;
}> {
  const supabase = createSupabaseAdminClient();
  const { data: variantData, error: variantError } = await supabase
    .from("content_variants")
    .select("id, draft_id, variant_type")
    .eq("id", input.contentVariantId)
    .single();

  if (variantError || !variantData) {
    throw new ApiError(404, "CONTENT_VARIANT_NOT_FOUND", "Content variant not found.");
  }

  const variant = variantData as unknown as ContentVariantContextRow;
  const { data: draftData, error: draftError } = await supabase
    .from("content_drafts")
    .select("id, merchant_id")
    .eq("id", variant.draft_id)
    .eq("merchant_id", input.merchantId)
    .single();

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
    draftId: draft.id,
    contentVariantId: variant.id,
  };
}

export async function createVideoEditJob(input: {
  merchantId: string;
  draftId: string;
  contentVariantId: string;
  instructionText?: CreateVideoEditJobRequest["instructionText"];
  inputPayload?: CreateVideoEditJobRequest["inputPayload"];
}): Promise<VideoEditJobDto> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("video_edit_jobs")
    .insert({
      merchant_id: input.merchantId,
      draft_id: input.draftId,
      content_variant_id: input.contentVariantId,
      instruction_text: input.instructionText ?? null,
      input_payload: input.inputPayload ?? {},
      runtime_payload: {},
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
    throw new ApiError(500, "VIDEO_EDIT_JOB_CREATE_FAILED", error?.message ?? "Create failed.");
  }

  return mapVideoEditJob(data as unknown as VideoEditJobRow);
}

export async function listVideoEditJobs(
  merchantId: string,
  filters: VideoEditJobListFilters = {},
): Promise<VideoEditJobDto[]> {
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

  const { data, error } = await query;

  if (error) {
    throw new ApiError(500, "VIDEO_EDIT_JOB_LIST_FAILED", error.message);
  }

  return ((data ?? []) as unknown as VideoEditJobRow[]).map(mapVideoEditJob);
}

export async function getVideoEditJobById(input: {
  merchantId: string;
  jobId: string;
}): Promise<VideoEditJobDto> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("video_edit_jobs")
    .select(videoEditJobSelect)
    .eq("id", input.jobId)
    .eq("merchant_id", input.merchantId)
    .single();

  if (error || !data) {
    throw new ApiError(404, "VIDEO_EDIT_JOB_NOT_FOUND", "Video edit job not found.");
  }

  return mapVideoEditJob(data as unknown as VideoEditJobRow);
}

export async function retryVideoEditJob(input: {
  merchantId: string;
  jobId: string;
}): Promise<VideoEditJobDto> {
  const current = await getVideoEditJobById(input);

  if (current.status !== "failed_retryable") {
    throw new ApiError(
      409,
      "VIDEO_EDIT_JOB_RETRY_NOT_ALLOWED",
      "Only failed_retryable jobs can be retried.",
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
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
    .eq("merchant_id", input.merchantId)
    .select(videoEditJobSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "VIDEO_EDIT_JOB_RETRY_FAILED", error?.message ?? "Retry failed.");
  }

  return mapVideoEditJob(data as unknown as VideoEditJobRow);
}

export async function cancelVideoEditJob(input: {
  merchantId: string;
  jobId: string;
}): Promise<VideoEditJobDto> {
  const current = await getVideoEditJobById(input);

  if (!["pending", "queued", "preparing", "running"].includes(current.status)) {
    throw new ApiError(
      409,
      "VIDEO_EDIT_JOB_CANCEL_NOT_ALLOWED",
      "Only in-flight jobs can be cancelled.",
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("video_edit_jobs")
    .update({
      status: "cancelled",
      current_stage: current.currentStage ?? "cancelled",
      finished_at: new Date().toISOString(),
    })
    .eq("id", input.jobId)
    .eq("merchant_id", input.merchantId)
    .select(videoEditJobSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "VIDEO_EDIT_JOB_CANCEL_FAILED", error?.message ?? "Cancel failed.");
  }

  return mapVideoEditJob(data as unknown as VideoEditJobRow);
}

export function mapVideoEditJob(row: VideoEditJobRow): VideoEditJobDto {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    draftId: row.draft_id,
    contentVariantId: row.content_variant_id,
    status: row.status,
    currentStage: row.current_stage,
    instructionText: row.instruction_text,
    inputPayload: row.input_payload ?? {},
    runtimePayload: row.runtime_payload ?? {},
    progressPct: row.progress_pct,
    retryCount: row.retry_count,
    failureReason: row.failure_reason,
    resultPayload: row.result_payload ?? {},
    logPayload: row.log_payload ?? {},
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const videoEditJobSelect = [
  "id",
  "merchant_id",
  "draft_id",
  "content_variant_id",
  "status",
  "current_stage",
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
