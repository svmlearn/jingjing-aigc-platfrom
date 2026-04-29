import "server-only";

import { randomUUID } from "node:crypto";

import type { ContentVariantDto } from "@/contracts/draft";
import type {
  CreateVideoEditJobRequest,
  VideoEditJobDto,
  VideoEditJobStatus,
  VideoEditJobTriggerSource,
} from "@/contracts/video";
import { getLocalDemoContentVariantContext } from "@/lib/db/content-draft-repository";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { ApiError } from "@/server/api/errors";

type VideoEditJobRow = {
  id: string;
  merchant_id: string;
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
  cta_text: string | null;
  review_status: ContentVariantDto["reviewStatus"];
};

type ContentDraftContextRow = {
  id: string;
  merchant_id: string;
};

export type VideoEditJobListFilters = {
  status?: VideoEditJobStatus;
  limit?: number;
};

const demoVideoEditJobs = new Map<string, VideoEditJobDto>();
const LOCAL_DEMO_JOB_TIMELINE = [
  {
    elapsedMs: 0,
    status: "pending",
    currentStage: "local_demo_pending_worker",
    progressPct: 0,
  },
  {
    elapsedMs: 1500,
    status: "queued",
    currentStage: "local_demo_claimed",
    progressPct: 20,
  },
  {
    elapsedMs: 3000,
    status: "preparing",
    currentStage: "local_demo_preparing_inputs",
    progressPct: 45,
  },
  {
    elapsedMs: 5000,
    status: "running",
    currentStage: "local_demo_rendering_placeholder",
    progressPct: 80,
  },
  {
    elapsedMs: 8000,
    status: "succeeded",
    currentStage: "local_demo_completed",
    progressPct: 100,
  },
] as const satisfies Array<{
  elapsedMs: number;
  status: VideoEditJobStatus;
  currentStage: string;
  progressPct: number;
}>;

export async function assertVideoScriptVariantAccess(input: {
  merchantId: string;
  contentVariantId: string;
}): Promise<{
  merchantId: string;
  draftId: string;
  contentVariantId: string;
  variantType: ContentVariantDto["variantType"];
  title?: string | null;
  scriptText?: string | null;
  ctaText?: string | null;
  reviewStatus: ContentVariantDto["reviewStatus"];
}> {
  if (!isSupabaseAdminConfigured()) {
    const variant = getLocalDemoContentVariantContext(input.contentVariantId);

    if (!variant || variant.merchantId !== input.merchantId) {
      throw new ApiError(404, "CONTENT_VARIANT_NOT_FOUND", "Content variant is not accessible.");
    }

    if (variant.variantType !== "video_script") {
      throw new ApiError(
        409,
        "CONTENT_VARIANT_NOT_VIDEO_SCRIPT",
        "Only video_script variants can create video edit jobs.",
      );
    }

    return {
      merchantId: variant.merchantId,
      draftId: variant.draftId,
      contentVariantId: variant.contentVariantId,
      variantType: variant.variantType,
      title: variant.title,
      scriptText: variant.scriptText,
      ctaText: variant.ctaText,
      reviewStatus: variant.reviewStatus,
    };
  }

  const supabase = createSupabaseAdminClient();
  const { data: variantData, error: variantError } = await supabase
    .from("content_variants")
    .select("id, draft_id, variant_type, title, script_text, cta_text, review_status")
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
    variantType: variant.variant_type,
    title: variant.title,
    scriptText: variant.script_text,
    ctaText: variant.cta_text,
    reviewStatus: variant.review_status,
  };
}

export async function createVideoEditJob(input: {
  merchantId: string;
  draftId: string;
  contentVariantId: string;
  triggerSource?: VideoEditJobTriggerSource;
  instructionText?: CreateVideoEditJobRequest["instructionText"];
  inputPayload?: CreateVideoEditJobRequest["inputPayload"];
  runtimePayload?: Record<string, unknown>;
}): Promise<VideoEditJobDto> {
  if (!isSupabaseAdminConfigured()) {
    const now = new Date().toISOString();
    const job: VideoEditJobDto = {
      id: randomUUID(),
      merchantId: input.merchantId,
      draftId: input.draftId,
      contentVariantId: input.contentVariantId,
      status: "pending",
      currentStage: "local_demo_pending_worker",
      triggerSource: input.triggerSource ?? "manual",
      instructionText: input.instructionText ?? null,
      inputPayload: input.inputPayload ?? {},
      runtimePayload: input.runtimePayload ?? {
        mode: "local_demo_memory",
      },
      progressPct: 0,
      retryCount: 0,
      failureReason: null,
      resultPayload: {},
      logPayload: {},
      startedAt: now,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    demoVideoEditJobs.set(job.id, job);

    return job;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("video_edit_jobs")
    .insert({
      merchant_id: input.merchantId,
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
    throw new ApiError(500, "VIDEO_EDIT_JOB_CREATE_FAILED", error?.message ?? "Create failed.");
  }

  return mapVideoEditJob(data as unknown as VideoEditJobRow);
}

export async function listVideoEditJobs(
  merchantId: string,
  filters: VideoEditJobListFilters = {},
): Promise<VideoEditJobDto[]> {
  if (!isSupabaseAdminConfigured()) {
    return Array.from(demoVideoEditJobs.values())
      .map(advanceLocalDemoVideoJob)
      .filter((job) => job.merchantId === merchantId)
      .filter((job) => !filters.status || job.status === filters.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, filters.limit ?? 50);
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
  if (!isSupabaseAdminConfigured()) {
    const job = demoVideoEditJobs.get(input.jobId);

    if (!job || job.merchantId !== input.merchantId) {
      throw new ApiError(404, "VIDEO_EDIT_JOB_NOT_FOUND", "Video edit job not found.");
    }

    return advanceLocalDemoVideoJob(job);
  }

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

  if (!isSupabaseAdminConfigured()) {
    const now = new Date().toISOString();
    const updated: VideoEditJobDto = {
      ...current,
      status: "pending",
      currentStage: "local_demo_pending_worker",
      progressPct: 0,
      failureReason: null,
      runtimePayload: {},
      resultPayload: {},
      logPayload: {},
      startedAt: now,
      finishedAt: null,
      retryCount: current.retryCount + 1,
      updatedAt: now,
    };

    demoVideoEditJobs.set(input.jobId, updated);

    return updated;
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

  if (!isSupabaseAdminConfigured()) {
    const now = new Date().toISOString();
    const updated: VideoEditJobDto = {
      ...current,
      status: "cancelled",
      currentStage: current.currentStage ?? "cancelled",
      finishedAt: now,
      updatedAt: now,
    };

    demoVideoEditJobs.set(input.jobId, updated);

    return updated;
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
    triggerSource: row.trigger_source,
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

function advanceLocalDemoVideoJob(job: VideoEditJobDto): VideoEditJobDto {
  if (!["pending", "queued", "preparing", "running"].includes(job.status)) {
    return job;
  }

  const startedAt = Date.parse(job.startedAt ?? job.updatedAt ?? job.createdAt);
  if (!Number.isFinite(startedAt)) {
    return job;
  }

  const elapsedMs = Date.now() - startedAt;
  const step =
    [...LOCAL_DEMO_JOB_TIMELINE]
      .reverse()
      .find((item) => elapsedMs >= item.elapsedMs) ?? LOCAL_DEMO_JOB_TIMELINE[0];
  if (
    job.status === step.status &&
    job.currentStage === step.currentStage &&
    job.progressPct === step.progressPct
  ) {
    return job;
  }

  const now = new Date().toISOString();
  const succeeded = step.status === "succeeded";
  const updated: VideoEditJobDto = {
    ...job,
    status: step.status,
    currentStage: step.currentStage,
    progressPct: step.progressPct,
    runtimePayload: {
      ...job.runtimePayload,
      mode: "local_demo_memory",
      simulatedWorker: true,
    },
    resultPayload: succeeded
      ? buildLocalDemoResultPayload(job)
      : job.resultPayload,
    logPayload: {
      ...job.logPayload,
      local_demo: {
        simulated: true,
        stage: step.currentStage,
        note: "Local demo mode simulates worker progress without rendering media.",
      },
    },
    finishedAt: succeeded ? (job.finishedAt ?? now) : null,
    updatedAt: now,
  };

  demoVideoEditJobs.set(job.id, updated);

  return updated;
}

function buildLocalDemoResultPayload(job: VideoEditJobDto): Record<string, unknown> {
  const directive = readRecord(job.inputPayload.productionDirective);
  const desiredOutputs = Array.isArray(directive.desiredOutputs)
    ? directive.desiredOutputs
    : ["final_video"];

  return {
    engine: "local-demo-worker",
    engine_adapter: "local_demo",
    execution_mode: "local_demo_memory",
    script_locked: readRecord(job.inputPayload.script).locked === true,
    desired_outputs: desiredOutputs,
    outputs: {},
    uploaded_assets: [],
    preview_notice:
      "Local demo mode does not render media. Configure Supabase, COS, and video-worker for real output assets.",
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const videoEditJobSelect = [
  "id",
  "merchant_id",
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
