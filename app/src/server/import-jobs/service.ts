import "server-only";

import type { ImportErrorCode, ImportJobDto, ImportRequest } from "@/contracts/import";
import { getMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import {
  countRunningImportJobs,
  createImportJob,
  ensureSourceItemForComments,
  getImportJobById,
  listImportJobs,
  mapImportJob,
  updateImportJob,
  upsertImportedComments,
  upsertSourceItems,
} from "@/lib/db/import-repository";
import { ApiError } from "@/server/api/errors";
import { ApifyProviderAdapter } from "@/server/import-providers/apify/adapter";
import { ImportProviderError } from "@/server/import-providers/apify/errors";
import type {
  ImportProviderAdapter,
  NormalizedComment,
  NormalizedSourceItem,
  ProviderRun,
} from "@/server/import-providers/types";

type RunLog = {
  request: ImportRequest;
  runs: ProviderRun[];
  sourceItemIds: string[];
  commentCount: number;
  errors: Array<{
    code: ImportErrorCode;
    message: string;
  }>;
};

type ImportJobRowForService = Awaited<ReturnType<typeof getImportJobById>>;

const maxGlobalRunningJobs = 1;
const maxMerchantRunningJobs = 1;

export async function createAndRunImportJob(input: {
  userId: string;
  request: ImportRequest;
}): Promise<ImportJobDto> {
  const merchant = await getMerchantProfileByOwnerUserId(input.userId);
  await assertImportCapacity(merchant.id);

  const normalizedRequest = normalizeImportRequest(input.request);
  const job = await createImportJob({
    merchantId: merchant.id,
    request: normalizedRequest,
  });

  return runImportJob({
    merchantId: merchant.id,
    jobId: job.id,
    request: normalizedRequest,
  });
}

export async function listUserImportJobs(userId: string): Promise<ImportJobDto[]> {
  const merchant = await getMerchantProfileByOwnerUserId(userId);
  return listImportJobs(merchant.id);
}

export async function getUserImportJob(input: {
  userId: string;
  jobId: string;
}): Promise<ImportJobDto> {
  const merchant = await getMerchantProfileByOwnerUserId(input.userId);
  const job = await getImportJobById({
    merchantId: merchant.id,
    jobId: input.jobId,
  });

  if (job.status === "running") {
    return resumeRunningImportJob({
      merchantId: merchant.id,
      job,
    });
  }

  return mapImportJob(job);
}

export async function runUserImportJob(input: {
  userId: string;
  jobId: string;
}): Promise<ImportJobDto> {
  const merchant = await getMerchantProfileByOwnerUserId(input.userId);
  const job = await getImportJobById({
    merchantId: merchant.id,
    jobId: input.jobId,
  });

  if (job.status === "succeeded" || job.status === "partial") {
    return mapImportJob(job);
  }

  await assertImportCapacity(merchant.id, job.status === "running" ? job.id : undefined);

  return runImportJob({
    merchantId: merchant.id,
    jobId: job.id,
    request: requestFromJob(job),
  });
}

async function runImportJob(input: {
  merchantId: string;
  jobId: string;
  request: ImportRequest;
  adapter?: ImportProviderAdapter;
}): Promise<ImportJobDto> {
  const adapter = input.adapter ?? new ApifyProviderAdapter();
  const log: RunLog = {
    request: input.request,
    runs: [],
    sourceItemIds: [],
    commentCount: 0,
    errors: [],
  };

  await updateImportJob({
    jobId: input.jobId,
    status: "running",
    errorSummary: null,
    logPayload: log,
  });

  try {
    const primaryRun = await adapter.startImport(input.request);
    log.runs.push(primaryRun);

    if (!isProviderRunComplete(primaryRun)) {
      return updateImportJob({
        jobId: input.jobId,
        status: "running",
        logPayload: log,
      });
    }

    assertProviderRunSucceeded(primaryRun);

    const datasetItems = await adapter.getDatasetItems(primaryRun.datasetId);
    const saved = await persistDataset({
      merchantId: input.merchantId,
      jobId: input.jobId,
      request: input.request,
      datasetItems,
      adapter,
      log,
    });

    return updateImportJob({
      jobId: input.jobId,
      status: saved.status,
      totalItems: saved.totalItems,
      successItems: saved.successItems,
      errorSummary: saved.errorSummary,
      logPayload: log,
      finished: true,
    });
  } catch (error) {
    const mapped = mapImportError(error);
    log.errors.push({
      code: mapped.code,
      message: mapped.message,
    });

    return updateImportJob({
      jobId: input.jobId,
      status: "failed",
      totalItems: 0,
      successItems: 0,
      errorSummary: mapped.message,
      logPayload: log,
      finished: true,
    });
  }
}

async function resumeRunningImportJob(input: {
  merchantId: string;
  job: ImportJobRowForService;
}): Promise<ImportJobDto> {
  const log = parseRunLog(input.job.log_payload, requestFromJob(input.job));
  const primaryRun = log.runs[0];

  if (!primaryRun) {
    return runImportJob({
      merchantId: input.merchantId,
      jobId: input.job.id,
      request: requestFromJob(input.job),
    });
  }

  const adapter = new ApifyProviderAdapter();
  const providerRun = await adapter.getRun(primaryRun.runId);
  const runWithActor = {
    ...providerRun,
    actorId: primaryRun.actorId,
  };
  log.runs[0] = runWithActor;

  if (!isProviderRunComplete(runWithActor)) {
    return updateImportJob({
      jobId: input.job.id,
      status: "running",
      logPayload: log,
    });
  }

  try {
    assertProviderRunSucceeded(runWithActor);

    const datasetItems = await adapter.getDatasetItems(runWithActor.datasetId);
    const saved = await persistDataset({
      merchantId: input.merchantId,
      jobId: input.job.id,
      request: requestFromJob(input.job),
      datasetItems,
      adapter,
      log,
    });

    return updateImportJob({
      jobId: input.job.id,
      status: saved.status,
      totalItems: saved.totalItems,
      successItems: saved.successItems,
      errorSummary: saved.errorSummary,
      logPayload: log,
      finished: true,
    });
  } catch (error) {
    const mapped = mapImportError(error);
    log.errors.push({
      code: mapped.code,
      message: mapped.message,
    });

    return updateImportJob({
      jobId: input.job.id,
      status: "failed",
      totalItems: 0,
      successItems: 0,
      errorSummary: mapped.message,
      logPayload: log,
      finished: true,
    });
  }
}

async function persistDataset(input: {
  merchantId: string;
  jobId: string;
  request: ImportRequest;
  datasetItems: unknown[];
  adapter: ImportProviderAdapter;
  log: RunLog;
}): Promise<{
  status: "succeeded" | "partial";
  totalItems: number;
  successItems: number;
  errorSummary: string | null;
}> {
  if (input.datasetItems.length === 0) {
    throw new ImportProviderError(
      "EMPTY_DATASET",
      "Provider returned an empty dataset. Try a complete platform URL.",
      false,
    );
  }

  if (input.request.importType === "comments") {
    const comments = assertUsableComments(
      input.adapter.normalizeComments(input.request, input.datasetItems),
    );
    const sourceItem = await ensureSourceItemForComments({
      merchantId: input.merchantId,
      jobId: input.jobId,
      request: input.request,
    });
    const savedComments = await upsertImportedComments({
      sourceItemId: sourceItem.id,
      comments,
    });

    input.log.sourceItemIds = [sourceItem.id];
    input.log.commentCount = savedComments.length;

    return {
      status: "succeeded",
      totalItems: input.datasetItems.length,
      successItems: savedComments.length,
      errorSummary: null,
    };
  }

  const sourceItems = assertUsableSourceItems(
    input.adapter.normalizeSourceItems(input.request, input.datasetItems),
  );
  const savedSourceItems = await upsertSourceItems({
    merchantId: input.merchantId,
    jobId: input.jobId,
    items: sourceItems,
  });
  input.log.sourceItemIds = savedSourceItems.map((item) => item.id);

  if (input.request.options?.includeComments && savedSourceItems[0]) {
    const commentResult = await tryImportComments({
      request: {
        ...input.request,
        importType: "comments",
        options: {
          maxComments: input.request.options.maxComments,
        },
      },
      sourceItemId: savedSourceItems[0].id,
      adapter: input.adapter,
      log: input.log,
    });

    return {
      status: commentResult.ok ? "succeeded" : "partial",
      totalItems: input.datasetItems.length,
      successItems: savedSourceItems.length,
      errorSummary: commentResult.ok ? null : commentResult.errorSummary,
    };
  }

  return {
    status: "succeeded",
    totalItems: input.datasetItems.length,
    successItems: savedSourceItems.length,
    errorSummary: null,
  };
}

async function tryImportComments(input: {
  request: ImportRequest;
  sourceItemId: string;
  adapter: ImportProviderAdapter;
  log: RunLog;
}): Promise<{ ok: true } | { ok: false; errorSummary: string }> {
  try {
    const commentRun = await input.adapter.startImport(input.request);
    input.log.runs.push(commentRun);

    if (!isProviderRunComplete(commentRun)) {
      return {
        ok: false,
        errorSummary: "Comment import is still running.",
      };
    }

    assertProviderRunSucceeded(commentRun);

    const datasetItems = await input.adapter.getDatasetItems(commentRun.datasetId);
    const comments = assertUsableComments(input.adapter.normalizeComments(input.request, datasetItems));
    const savedComments = await upsertImportedComments({
      sourceItemId: input.sourceItemId,
      comments,
    });

    input.log.commentCount = savedComments.length;

    return { ok: true };
  } catch (error) {
    const mapped = mapImportError(error);
    input.log.errors.push({
      code: mapped.code,
      message: mapped.message,
    });

    return {
      ok: false,
      errorSummary: mapped.message,
    };
  }
}

async function assertImportCapacity(merchantId: string, currentJobId?: string) {
  const counts = await countRunningImportJobs(merchantId);
  const merchantRunning = currentJobId
    ? Math.max(counts.merchantRunning - 1, 0)
    : counts.merchantRunning;
  const globalRunning = currentJobId ? Math.max(counts.globalRunning - 1, 0) : counts.globalRunning;

  if (merchantRunning >= maxMerchantRunningJobs) {
    throw new ApiError(
      429,
      "MERCHANT_IMPORT_LIMIT_REACHED",
      "This merchant already has a running import job.",
    );
  }

  if (globalRunning >= maxGlobalRunningJobs) {
    throw new ApiError(429, "GLOBAL_IMPORT_LIMIT_REACHED", "Import service is busy.");
  }
}

function normalizeImportRequest(request: ImportRequest): ImportRequest {
  const maxComments = clamp(
    request.options?.maxComments,
    1,
    100,
    Number(process.env.DEFAULT_MAX_COMMENTS ?? 30),
  );
  const maxItems = clamp(
    request.options?.maxItems,
    1,
    50,
    Number(process.env.DEFAULT_CREATOR_POSTS ?? 20),
  );

  return {
    platform: request.platform,
    importType: request.importType,
    url: request.url.trim(),
    options: {
      includeComments: request.options?.includeComments ?? false,
      maxItems,
      maxComments,
    },
  };
}

function requestFromJob(job: ImportJobRowForService): ImportRequest {
  const payload = job.input_payload ?? {};
  const options =
    payload.options && typeof payload.options === "object" && !Array.isArray(payload.options)
      ? (payload.options as ImportRequest["options"])
      : undefined;

  return normalizeImportRequest({
    platform: job.platform,
    importType: job.import_type,
    url: typeof payload.url === "string" ? payload.url : "",
    options,
  });
}

function assertUsableSourceItems(items: NormalizedSourceItem[]): NormalizedSourceItem[] {
  const usable = items.filter(
    (item) =>
      item.externalItemId &&
      item.sourceUrl &&
      Boolean(item.title || item.bodyText || item.scriptText),
  );

  if (usable.length === 0) {
    throw new ImportProviderError(
      "LOW_QUALITY_RESULT",
      "Imported content is incomplete. Try copying the full platform URL again.",
      false,
      items,
    );
  }

  return usable;
}

function assertUsableComments(comments: NormalizedComment[]): NormalizedComment[] {
  const usable = comments.filter((comment) => comment.content.trim().length > 0);

  if (usable.length === 0) {
    throw new ImportProviderError(
      "EMPTY_DATASET",
      "No usable comments were imported.",
      false,
      comments,
    );
  }

  return usable;
}

function assertProviderRunSucceeded(run: ProviderRun) {
  if (run.status !== "SUCCEEDED") {
    throw new ImportProviderError(
      "PROVIDER_RUN_FAILED",
      `Provider run ended with status ${run.status}.`,
      run.status === "TIMED-OUT" || run.status === "FAILED",
      run.raw,
    );
  }
}

function isProviderRunComplete(run: ProviderRun) {
  return ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status);
}

function parseRunLog(value: Record<string, unknown>, fallbackRequest: ImportRequest): RunLog {
  const runs = Array.isArray(value.runs)
    ? value.runs.filter(isProviderRun)
    : [];
  const sourceItemIds = Array.isArray(value.sourceItemIds)
    ? value.sourceItemIds.filter((item): item is string => typeof item === "string")
    : [];
  const commentCount = typeof value.commentCount === "number" ? value.commentCount : 0;

  return {
    request: fallbackRequest,
    runs,
    sourceItemIds,
    commentCount,
    errors: [],
  };
}

function isProviderRun(value: unknown): value is ProviderRun {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    record.provider === "apify" &&
    typeof record.actorId === "string" &&
    typeof record.runId === "string" &&
    typeof record.datasetId === "string" &&
    typeof record.status === "string"
  );
}

function mapImportError(error: unknown): { code: ImportErrorCode; message: string } {
  if (error instanceof ImportProviderError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof ApiError) {
    return {
      code: "PROVIDER_RUN_FAILED",
      message: error.message,
    };
  }

  return {
    code: "PROVIDER_RUN_FAILED",
    message: error instanceof Error ? error.message : "Import failed.",
  };
}

function clamp(value: number | undefined, min: number, max: number, fallback: number) {
  const candidate = Number.isFinite(value) ? Number(value) : fallback;
  const safeFallback = Number.isFinite(candidate) ? candidate : min;
  return Math.min(Math.max(safeFallback, min), max);
}
