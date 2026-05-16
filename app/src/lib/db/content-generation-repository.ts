import "server-only";

import { randomUUID } from "node:crypto";

import type {
  ContentGenerationBatchDto,
  ContentGenerationBatchSource,
  ContentGenerationBatchStatus,
  ContentGenerationJobDto,
  ContentGenerationJobStatus,
  ContentGenerationProvider,
} from "@/contracts/content-generation";
import {
  isAppPostgresConfigured,
  isAppPostgresPreferred,
  queryAppDb,
  withAppDbTransaction,
} from "@/lib/server-db/postgres";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { ApiError } from "@/server/api/errors";

type Timestamp = string | Date;

type ContentGenerationBatchRow = {
  id: string;
  merchant_id: string;
  created_by_user_id: string | null;
  source: ContentGenerationBatchSource;
  calendar_snapshot: Record<string, unknown> | null;
  member_scope_snapshot: Record<string, unknown> | null;
  total_jobs: number;
  succeeded_jobs: number;
  failed_jobs: number;
  running_jobs: number;
  status: ContentGenerationBatchStatus;
  workflow_provider: ContentGenerationProvider;
  workflow_version: string;
  started_at: Timestamp | null;
  finished_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type ContentGenerationJobRow = {
  id: string;
  batch_id: string;
  merchant_id: string;
  member_user_id: string;
  daily_task_id: string;
  task_date: string;
  calendar_item_id: string | null;
  idempotency_key: string;
  status: ContentGenerationJobStatus;
  current_stage: string | null;
  attempt_count: number;
  max_attempts: number;
  input_snapshot: Record<string, unknown> | null;
  output_json: Record<string, unknown> | null;
  quality_review: Record<string, unknown> | null;
  error_message: string | null;
  workflow_provider: ContentGenerationProvider;
  workflow_version: string;
  dify_workflow_run_id: string | null;
  content_draft_id: string | null;
  article_variant_id: string | null;
  video_variant_id: string | null;
  started_at: Timestamp | null;
  finished_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

const batchSelect = [
  "id",
  "merchant_id",
  "created_by_user_id",
  "source",
  "calendar_snapshot",
  "member_scope_snapshot",
  "total_jobs",
  "succeeded_jobs",
  "failed_jobs",
  "running_jobs",
  "status",
  "workflow_provider",
  "workflow_version",
  "started_at",
  "finished_at",
  "created_at",
  "updated_at",
].join(", ");

const jobSelect = [
  "id",
  "batch_id",
  "merchant_id",
  "member_user_id",
  "daily_task_id",
  "task_date",
  "calendar_item_id",
  "idempotency_key",
  "status",
  "current_stage",
  "attempt_count",
  "max_attempts",
  "input_snapshot",
  "output_json",
  "quality_review",
  "error_message",
  "workflow_provider",
  "workflow_version",
  "dify_workflow_run_id",
  "content_draft_id",
  "article_variant_id",
  "video_variant_id",
  "started_at",
  "finished_at",
  "created_at",
  "updated_at",
].join(", ");

type DemoStore = {
  batches: Map<string, ContentGenerationBatchDto>;
  jobs: Map<string, ContentGenerationJobDto>;
};

const globalDemoStore = globalThis as typeof globalThis & {
  __jingjingContentGenerationStore?: DemoStore;
};

const demoStore =
  globalDemoStore.__jingjingContentGenerationStore ??
  (globalDemoStore.__jingjingContentGenerationStore = {
    batches: new Map<string, ContentGenerationBatchDto>(),
    jobs: new Map<string, ContentGenerationJobDto>(),
  });

export async function createContentGenerationBatch(input: {
  merchantId: string;
  createdByUserId?: string | null;
  source: ContentGenerationBatchSource;
  calendarSnapshot?: Record<string, unknown>;
  memberScopeSnapshot?: Record<string, unknown>;
  workflowProvider: ContentGenerationProvider;
  workflowVersion: string;
  jobs: Array<{
    memberUserId: string;
    dailyTaskId: string;
    taskDate: string;
    calendarItemId?: string | null;
    idempotencyKey: string;
    inputSnapshot: Record<string, unknown>;
  }>;
}): Promise<{ batch: ContentGenerationBatchDto; jobs: ContentGenerationJobDto[] }> {
  if (!input.jobs.length) {
    throw new ApiError(400, "CONTENT_GENERATION_EMPTY_BATCH", "生成批次至少需要一个任务。");
  }

  if (isPostgresContentGenerationEnabled()) {
    return withAppDbTransaction(async (client) => {
      const batchResult = await client.query<ContentGenerationBatchRow>(
        `
        insert into public.content_generation_batches (
          merchant_id,
          created_by_user_id,
          source,
          calendar_snapshot,
          member_scope_snapshot,
          total_jobs,
          status,
          workflow_provider,
          workflow_version
        ) values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, 'pending', $7, $8)
        returning ${batchSelect}
        `,
        [
          input.merchantId,
          input.createdByUserId ?? null,
          input.source,
          JSON.stringify(input.calendarSnapshot ?? {}),
          JSON.stringify(input.memberScopeSnapshot ?? {}),
          input.jobs.length,
          input.workflowProvider,
          input.workflowVersion,
        ],
      );
      const batch = mapBatch(batchResult.rows[0]);
      const jobs: ContentGenerationJobDto[] = [];

      for (const job of input.jobs) {
        const jobResult = await client.query<ContentGenerationJobRow>(
          `
          insert into public.content_generation_jobs (
            batch_id,
            merchant_id,
            member_user_id,
            daily_task_id,
            task_date,
            calendar_item_id,
            idempotency_key,
            input_snapshot,
            workflow_provider,
            workflow_version,
            current_stage
          ) values ($1, $2, $3, $4, $5::date, $6, $7, $8::jsonb, $9, $10, 'queued')
          returning ${jobSelect}
          `,
          [
            batch.id,
            input.merchantId,
            job.memberUserId,
            job.dailyTaskId,
            job.taskDate,
            job.calendarItemId ?? null,
            job.idempotencyKey,
            JSON.stringify(job.inputSnapshot),
            input.workflowProvider,
            input.workflowVersion,
          ],
        );

        jobs.push(mapJob(jobResult.rows[0]));
      }

      return { batch, jobs };
    });
  }

  if (!isSupabaseAdminConfigured()) {
    const now = new Date().toISOString();
    const batch: ContentGenerationBatchDto = {
      id: randomUUID(),
      merchantId: input.merchantId,
      createdByUserId: input.createdByUserId ?? null,
      source: input.source,
      calendarSnapshot: input.calendarSnapshot ?? {},
      memberScopeSnapshot: input.memberScopeSnapshot ?? {},
      totalJobs: input.jobs.length,
      succeededJobs: 0,
      failedJobs: 0,
      runningJobs: 0,
      status: "pending",
      workflowProvider: input.workflowProvider,
      workflowVersion: input.workflowVersion,
      startedAt: null,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const jobs = input.jobs.map((job): ContentGenerationJobDto => ({
      id: randomUUID(),
      batchId: batch.id,
      merchantId: input.merchantId,
      memberUserId: job.memberUserId,
      dailyTaskId: job.dailyTaskId,
      taskDate: job.taskDate,
      calendarItemId: job.calendarItemId ?? null,
      idempotencyKey: job.idempotencyKey,
      status: "pending",
      currentStage: "queued",
      attemptCount: 0,
      maxAttempts: 2,
      inputSnapshot: job.inputSnapshot,
      outputJson: null,
      qualityReview: null,
      errorMessage: null,
      workflowProvider: input.workflowProvider,
      workflowVersion: input.workflowVersion,
      difyWorkflowRunId: null,
      contentDraftId: null,
      articleVariantId: null,
      videoVariantId: null,
      startedAt: null,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    }));

    demoStore.batches.set(batch.id, batch);
    for (const job of jobs) {
      demoStore.jobs.set(job.id, job);
    }

    return { batch, jobs };
  }

  const supabase = createSupabaseAdminClient();
  const { data: batchData, error: batchError } = await supabase
    .from("content_generation_batches")
    .insert({
      merchant_id: input.merchantId,
      created_by_user_id: input.createdByUserId ?? null,
      source: input.source,
      calendar_snapshot: input.calendarSnapshot ?? {},
      member_scope_snapshot: input.memberScopeSnapshot ?? {},
      total_jobs: input.jobs.length,
      status: "pending",
      workflow_provider: input.workflowProvider,
      workflow_version: input.workflowVersion,
    })
    .select(batchSelect)
    .single();

  if (batchError || !batchData) {
    throw new ApiError(
      500,
      "CONTENT_GENERATION_BATCH_CREATE_FAILED",
      batchError?.message ?? "Create failed.",
    );
  }

  const batch = mapBatch(batchData as unknown as ContentGenerationBatchRow);
  const { data: jobData, error: jobError } = await supabase
    .from("content_generation_jobs")
    .insert(
      input.jobs.map((job) => ({
        batch_id: batch.id,
        merchant_id: input.merchantId,
        member_user_id: job.memberUserId,
        daily_task_id: job.dailyTaskId,
        task_date: job.taskDate,
        calendar_item_id: job.calendarItemId ?? null,
        idempotency_key: job.idempotencyKey,
        input_snapshot: job.inputSnapshot,
        workflow_provider: input.workflowProvider,
        workflow_version: input.workflowVersion,
        current_stage: "queued",
      })),
    )
    .select(jobSelect)
    .order("task_date", { ascending: true });

  if (jobError || !jobData) {
    throw new ApiError(
      500,
      "CONTENT_GENERATION_JOBS_CREATE_FAILED",
      jobError?.message ?? "Create failed.",
    );
  }

  return {
    batch,
    jobs: (jobData as unknown as ContentGenerationJobRow[]).map(mapJob),
  };
}

export async function claimNextContentGenerationJob(input: {
  provider?: ContentGenerationProvider;
} = {}): Promise<ContentGenerationJobDto | null> {
  if (isPostgresContentGenerationEnabled()) {
    const updated = await withAppDbTransaction(async (client) => {
      const params: unknown[] = [];
      let providerSql = "";

      if (input.provider) {
        params.push(input.provider);
        providerSql = `and workflow_provider = $${params.length}`;
      }

      const pendingResult = await client.query<ContentGenerationJobRow>(
        `
        select ${jobSelect}
        from public.content_generation_jobs
        where status = 'pending'
          ${providerSql}
        order by created_at asc
        for update skip locked
        limit 1
        `,
        params,
      );
      const pending = pendingResult.rows[0];

      if (!pending) {
        return null;
      }

      const updateResult = await client.query<ContentGenerationJobRow>(
        `
        update public.content_generation_jobs
        set status = 'running',
            current_stage = 'calling_dify',
            attempt_count = attempt_count + 1,
            started_at = coalesce(started_at, timezone('utc', now())),
            error_message = null,
            updated_at = timezone('utc', now())
        where id = $1 and status = 'pending'
        returning ${jobSelect}
        `,
        [pending.id],
      );

      return updateResult.rows[0] ? mapJob(updateResult.rows[0]) : null;
    });

    if (updated) {
      await recomputeContentGenerationBatch(updated.batchId);
    }

    return updated;
  }

  if (!isSupabaseAdminConfigured()) {
    const job = Array.from(demoStore.jobs.values())
      .filter((item) => item.status === "pending")
      .filter((item) => !input.provider || item.workflowProvider === input.provider)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

    return job ? markLocalJobRunning(job) : null;
  }

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("content_generation_jobs")
    .select(jobSelect)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  if (input.provider) {
    query = query.eq("workflow_provider", input.provider);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new ApiError(500, "CONTENT_GENERATION_JOB_CLAIM_LOOKUP_FAILED", error.message);
  }

  if (!data) {
    return null;
  }

  const job = mapJob(data as unknown as ContentGenerationJobRow);
  const { data: updatedData, error: updateError } = await supabase
    .from("content_generation_jobs")
    .update({
      status: "running",
      current_stage: "calling_dify",
      attempt_count: job.attemptCount + 1,
      started_at: job.startedAt ?? new Date().toISOString(),
      error_message: null,
    })
    .eq("id", job.id)
    .eq("status", "pending")
    .select(jobSelect)
    .maybeSingle();

  if (updateError) {
    throw new ApiError(500, "CONTENT_GENERATION_JOB_CLAIM_FAILED", updateError.message);
  }

  if (!updatedData) {
    return null;
  }

  const updated = mapJob(updatedData as unknown as ContentGenerationJobRow);
  await recomputeContentGenerationBatch(updated.batchId);
  return updated;
}

export async function markContentGenerationJobSucceeded(input: {
  jobId: string;
  outputJson: Record<string, unknown>;
  qualityReview?: Record<string, unknown> | null;
  difyWorkflowRunId?: string | null;
  contentDraftId?: string | null;
  articleVariantId?: string | null;
  videoVariantId?: string | null;
}): Promise<ContentGenerationJobDto> {
  const now = new Date().toISOString();

  if (isPostgresContentGenerationEnabled()) {
    const result = await queryAppDb<ContentGenerationJobRow>(
      `
      update public.content_generation_jobs
      set status = 'succeeded',
          current_stage = 'persisted',
          output_json = $2::jsonb,
          quality_review = $3::jsonb,
          dify_workflow_run_id = $4,
          content_draft_id = $5,
          article_variant_id = $6,
          video_variant_id = $7,
          error_message = null,
          finished_at = $8::timestamptz,
          updated_at = timezone('utc', now())
      where id = $1
      returning ${jobSelect}
      `,
      [
        input.jobId,
        JSON.stringify(input.outputJson),
        input.qualityReview ? JSON.stringify(input.qualityReview) : null,
        input.difyWorkflowRunId ?? null,
        input.contentDraftId ?? null,
        input.articleVariantId ?? null,
        input.videoVariantId ?? null,
        now,
      ],
    );

    if (!result.rows[0]) {
      throw new ApiError(500, "CONTENT_GENERATION_JOB_SUCCEED_FAILED", "Update failed.");
    }

    const job = mapJob(result.rows[0]);
    await recomputeContentGenerationBatch(job.batchId);
    return job;
  }

  if (!isSupabaseAdminConfigured()) {
    const job = assertLocalJob(input.jobId);
    const updated: ContentGenerationJobDto = {
      ...job,
      status: "succeeded",
      currentStage: "persisted",
      outputJson: input.outputJson,
      qualityReview: input.qualityReview ?? null,
      difyWorkflowRunId: input.difyWorkflowRunId ?? null,
      contentDraftId: input.contentDraftId ?? null,
      articleVariantId: input.articleVariantId ?? null,
      videoVariantId: input.videoVariantId ?? null,
      errorMessage: null,
      finishedAt: now,
      updatedAt: now,
    };
    demoStore.jobs.set(updated.id, updated);
    recomputeLocalBatch(updated.batchId);
    return updated;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("content_generation_jobs")
    .update({
      status: "succeeded",
      current_stage: "persisted",
      output_json: input.outputJson,
      quality_review: input.qualityReview ?? null,
      dify_workflow_run_id: input.difyWorkflowRunId ?? null,
      content_draft_id: input.contentDraftId ?? null,
      article_variant_id: input.articleVariantId ?? null,
      video_variant_id: input.videoVariantId ?? null,
      error_message: null,
      finished_at: now,
    })
    .eq("id", input.jobId)
    .select(jobSelect)
    .single();

  if (error || !data) {
    throw new ApiError(
      500,
      "CONTENT_GENERATION_JOB_SUCCEED_FAILED",
      error?.message ?? "Update failed.",
    );
  }

  const job = mapJob(data as unknown as ContentGenerationJobRow);
  await recomputeContentGenerationBatch(job.batchId);
  return job;
}

export async function markContentGenerationJobFailed(input: {
  jobId: string;
  errorMessage: string;
  retryable?: boolean;
}): Promise<ContentGenerationJobDto> {
  const now = new Date().toISOString();
  const nextStatus: ContentGenerationJobStatus = input.retryable ? "failed_retryable" : "failed_manual";

  if (isPostgresContentGenerationEnabled()) {
    const result = await queryAppDb<ContentGenerationJobRow>(
      `
      update public.content_generation_jobs
      set status = $2,
          current_stage = 'failed',
          error_message = $3,
          finished_at = $4::timestamptz,
          updated_at = timezone('utc', now())
      where id = $1
      returning ${jobSelect}
      `,
      [input.jobId, nextStatus, input.errorMessage, now],
    );

    if (!result.rows[0]) {
      throw new ApiError(500, "CONTENT_GENERATION_JOB_FAIL_FAILED", "Update failed.");
    }

    const job = mapJob(result.rows[0]);
    await recomputeContentGenerationBatch(job.batchId);
    return job;
  }

  if (!isSupabaseAdminConfigured()) {
    const job = assertLocalJob(input.jobId);
    const updated: ContentGenerationJobDto = {
      ...job,
      status: nextStatus,
      currentStage: "failed",
      errorMessage: input.errorMessage,
      finishedAt: now,
      updatedAt: now,
    };
    demoStore.jobs.set(updated.id, updated);
    recomputeLocalBatch(updated.batchId);
    return updated;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("content_generation_jobs")
    .update({
      status: nextStatus,
      current_stage: "failed",
      error_message: input.errorMessage,
      finished_at: now,
    })
    .eq("id", input.jobId)
    .select(jobSelect)
    .single();

  if (error || !data) {
    throw new ApiError(
      500,
      "CONTENT_GENERATION_JOB_FAIL_FAILED",
      error?.message ?? "Update failed.",
    );
  }

  const job = mapJob(data as unknown as ContentGenerationJobRow);
  await recomputeContentGenerationBatch(job.batchId);
  return job;
}

export async function getContentGenerationBatchById(
  batchId: string,
): Promise<ContentGenerationBatchDto> {
  if (isPostgresContentGenerationEnabled()) {
    const result = await queryAppDb<ContentGenerationBatchRow>(
      `
      select ${batchSelect}
      from public.content_generation_batches
      where id = $1
      limit 1
      `,
      [batchId],
    );

    if (!result.rows[0]) {
      throw new ApiError(404, "CONTENT_GENERATION_BATCH_NOT_FOUND", "生成批次不存在。");
    }

    return mapBatch(result.rows[0]);
  }

  if (!isSupabaseAdminConfigured()) {
    const batch = demoStore.batches.get(batchId);

    if (!batch) {
      throw new ApiError(404, "CONTENT_GENERATION_BATCH_NOT_FOUND", "生成批次不存在。");
    }

    return batch;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("content_generation_batches")
    .select(batchSelect)
    .eq("id", batchId)
    .single();

  if (error || !data) {
    throw new ApiError(404, "CONTENT_GENERATION_BATCH_NOT_FOUND", "生成批次不存在。");
  }

  return mapBatch(data as unknown as ContentGenerationBatchRow);
}

async function recomputeContentGenerationBatch(batchId: string) {
  if (isPostgresContentGenerationEnabled()) {
    const result = await queryAppDb<{ status: ContentGenerationJobStatus }>(
      `
      select status
      from public.content_generation_jobs
      where batch_id = $1
      `,
      [batchId],
    );

    const statuses = result.rows.map((row) => row.status);
    const counts = countJobStatuses(statuses);
    const status = deriveBatchStatus(statuses);
    const now = new Date().toISOString();
    const startedAt = statuses.some((item) => item !== "pending") ? now : null;
    const finishedAt =
      status === "completed" || status === "completed_with_errors" || status === "canceled"
        ? now
        : null;

    await queryAppDb(
      `
      update public.content_generation_batches
      set succeeded_jobs = $2,
          failed_jobs = $3,
          running_jobs = $4,
          status = $5,
          started_at = coalesce(started_at, $6::timestamptz),
          finished_at = $7::timestamptz,
          updated_at = timezone('utc', now())
      where id = $1
      `,
      [batchId, counts.succeeded, counts.failed, counts.running, status, startedAt, finishedAt],
    );
    return;
  }

  if (!isSupabaseAdminConfigured()) {
    recomputeLocalBatch(batchId);
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("content_generation_jobs")
    .select("status")
    .eq("batch_id", batchId);

  if (error) {
    throw new ApiError(500, "CONTENT_GENERATION_BATCH_RECOUNT_FAILED", error.message);
  }

  const statuses = ((data ?? []) as Array<{ status: ContentGenerationJobStatus }>).map(
    (row) => row.status,
  );
  const counts = countJobStatuses(statuses);
  const status = deriveBatchStatus(statuses);
  const now = new Date().toISOString();
  const startedAt = statuses.some((item) => item !== "pending") ? now : null;
  const finishedAt =
    status === "completed" || status === "completed_with_errors" || status === "canceled"
      ? now
      : null;
  const { error: updateError } = await supabase
    .from("content_generation_batches")
    .update({
      succeeded_jobs: counts.succeeded,
      failed_jobs: counts.failed,
      running_jobs: counts.running,
      status,
      started_at: startedAt,
      finished_at: finishedAt,
    })
    .eq("id", batchId);

  if (updateError) {
    throw new ApiError(500, "CONTENT_GENERATION_BATCH_UPDATE_FAILED", updateError.message);
  }
}

function markLocalJobRunning(job: ContentGenerationJobDto): ContentGenerationJobDto {
  const now = new Date().toISOString();
  const updated: ContentGenerationJobDto = {
    ...job,
    status: "running",
    currentStage: "calling_dify",
    attemptCount: job.attemptCount + 1,
    errorMessage: null,
    startedAt: job.startedAt ?? now,
    updatedAt: now,
  };
  demoStore.jobs.set(updated.id, updated);
  recomputeLocalBatch(updated.batchId);
  return updated;
}

function recomputeLocalBatch(batchId: string) {
  const batch = demoStore.batches.get(batchId);

  if (!batch) {
    return;
  }

  const statuses = Array.from(demoStore.jobs.values())
    .filter((job) => job.batchId === batchId)
    .map((job) => job.status);
  const counts = countJobStatuses(statuses);
  const now = new Date().toISOString();
  const status = deriveBatchStatus(statuses);
  const updated: ContentGenerationBatchDto = {
    ...batch,
    succeededJobs: counts.succeeded,
    failedJobs: counts.failed,
    runningJobs: counts.running,
    status,
    startedAt: batch.startedAt ?? (statuses.some((item) => item !== "pending") ? now : null),
    finishedAt:
      status === "completed" || status === "completed_with_errors" || status === "canceled"
        ? now
        : null,
    updatedAt: now,
  };
  demoStore.batches.set(batchId, updated);
}

function countJobStatuses(statuses: ContentGenerationJobStatus[]) {
  return {
    succeeded: statuses.filter((status) => status === "succeeded").length,
    failed: statuses.filter((status) => status === "failed_retryable" || status === "failed_manual").length,
    running: statuses.filter((status) => status === "running").length,
  };
}

function deriveBatchStatus(statuses: ContentGenerationJobStatus[]): ContentGenerationBatchStatus {
  if (!statuses.length) {
    return "completed";
  }

  if (statuses.every((status) => status === "canceled")) {
    return "canceled";
  }

  if (statuses.some((status) => status === "pending" || status === "running")) {
    return statuses.some((status) => status === "running") ? "running" : "pending";
  }

  return statuses.some((status) => status === "failed_retryable" || status === "failed_manual")
    ? "completed_with_errors"
    : "completed";
}

function assertLocalJob(jobId: string): ContentGenerationJobDto {
  const job = demoStore.jobs.get(jobId);

  if (!job) {
    throw new ApiError(404, "CONTENT_GENERATION_JOB_NOT_FOUND", "生成任务不存在。");
  }

  return job;
}

function mapBatch(row: ContentGenerationBatchRow): ContentGenerationBatchDto {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    createdByUserId: row.created_by_user_id,
    source: row.source,
    calendarSnapshot: row.calendar_snapshot ?? {},
    memberScopeSnapshot: row.member_scope_snapshot ?? {},
    totalJobs: row.total_jobs,
    succeededJobs: row.succeeded_jobs,
    failedJobs: row.failed_jobs,
    runningJobs: row.running_jobs,
    status: row.status,
    workflowProvider: row.workflow_provider,
    workflowVersion: row.workflow_version,
    startedAt: row.started_at ? toIsoString(row.started_at) : null,
    finishedAt: row.finished_at ? toIsoString(row.finished_at) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapJob(row: ContentGenerationJobRow): ContentGenerationJobDto {
  return {
    id: row.id,
    batchId: row.batch_id,
    merchantId: row.merchant_id,
    memberUserId: row.member_user_id,
    dailyTaskId: row.daily_task_id,
    taskDate: row.task_date,
    calendarItemId: row.calendar_item_id,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    currentStage: row.current_stage,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    inputSnapshot: row.input_snapshot ?? {},
    outputJson: row.output_json,
    qualityReview: row.quality_review,
    errorMessage: row.error_message,
    workflowProvider: row.workflow_provider,
    workflowVersion: row.workflow_version,
    difyWorkflowRunId: row.dify_workflow_run_id,
    contentDraftId: row.content_draft_id,
    articleVariantId: row.article_variant_id,
    videoVariantId: row.video_variant_id,
    startedAt: row.started_at ? toIsoString(row.started_at) : null,
    finishedAt: row.finished_at ? toIsoString(row.finished_at) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function isPostgresContentGenerationEnabled() {
  return isAppPostgresPreferred() && isAppPostgresConfigured();
}

function toIsoString(value: Timestamp) {
  return value instanceof Date ? value.toISOString() : value;
}
