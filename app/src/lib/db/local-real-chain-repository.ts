import "server-only";

import { randomUUID } from "node:crypto";

import type { QueryResultRow } from "pg";

import type { ContentDraftBundleDto } from "@/contracts/draft";
import type {
  MediaAssetDto,
  MediaAssetType,
  MediaOwnerType,
  MediaStorageProvider,
} from "@/contracts/media";
import type {
  VideoEditJobDto,
  VideoEditJobStatus,
  VideoEditJobTriggerSource,
} from "@/contracts/video";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import {
  getAppPostgresPool,
  mapPostgresError,
  queryAppDb,
} from "@/lib/server-db/postgres";
import { ApiError } from "@/server/api/errors";

const defaultLocalRealChainMerchantId = "00000000-0000-4000-8000-000000000101";
const defaultLocalRealChainMerchantName = "Local Real Chain Smoke Test";

type SourceItemInput = {
  id: string;
  platform: string;
  title: string;
  bodyText?: string | null;
  scriptText?: string | null;
  tracePayload?: Record<string, unknown>;
};

type AssetRow = {
  id: string;
  owner_type: MediaOwnerType;
  owner_id: string;
  asset_type: MediaAssetType;
  storage_provider: MediaStorageProvider;
  bucket_name: string | null;
  storage_key: string;
  origin_url: string | null;
  mime_type: string | null;
  file_size_bytes: number | string | null;
  etag: string | null;
  sort_order: number;
  created_at: string | Date;
  updated_at: string | Date | null;
};

type VideoEditJobRow = {
  id: string;
  merchant_id: string;
  draft_id: string;
  content_variant_id: string;
  status: VideoEditJobStatus;
  current_stage: string | null;
  trigger_source: VideoEditJobTriggerSource;
  instruction_text: string | null;
  input_payload: Record<string, unknown> | null;
  runtime_payload: Record<string, unknown> | null;
  progress_pct: number;
  retry_count: number;
  failure_reason: string | null;
  result_payload: Record<string, unknown> | null;
  log_payload: Record<string, unknown> | null;
  started_at: string | Date | null;
  finished_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

export function isLocalRealChainEnabled() {
  return !isSupabaseAdminConfigured() && Boolean(process.env.LOCAL_REAL_CHAIN_DB_URL?.trim());
}

export function getLocalRealChainMerchantId() {
  return process.env.LOCAL_REAL_CHAIN_MERCHANT_ID?.trim() || defaultLocalRealChainMerchantId;
}

export async function upsertLocalRealChainSourceItem(input: SourceItemInput) {
  if (!isLocalRealChainEnabled()) {
    return;
  }

  await ensureLocalRealChainMerchant();
  await query(
    `
    insert into public.source_items (
      id,
      merchant_id,
      platform,
      source_type,
      title,
      body_text,
      script_text,
      trace_payload
    ) values ($1, $2, $3, 'manual_text', $4, $5, $6, $7::jsonb)
    on conflict (id) do update set
      merchant_id = excluded.merchant_id,
      platform = excluded.platform,
      title = excluded.title,
      body_text = excluded.body_text,
      script_text = excluded.script_text,
      trace_payload = excluded.trace_payload
    `,
    [
      input.id,
      getLocalRealChainMerchantId(),
      input.platform,
      input.title,
      input.bodyText ?? null,
      input.scriptText ?? null,
      JSON.stringify(input.tracePayload ?? {}),
    ],
  );
}

export async function upsertLocalRealChainDraftBundle(bundle: ContentDraftBundleDto) {
  if (!isLocalRealChainEnabled()) {
    return;
  }

  await ensureLocalRealChainMerchant();
  const client = await getPool().connect();

  try {
    await client.query("begin");
    await client.query(
      `
      insert into public.content_drafts (
        id,
        source_item_id,
        merchant_id,
        working_title,
        rewrite_goal,
        input_snapshot,
        comment_insights,
        status,
        selected_variant_id
      ) values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, null)
      on conflict (id) do update set
        source_item_id = excluded.source_item_id,
        merchant_id = excluded.merchant_id,
        working_title = excluded.working_title,
        rewrite_goal = excluded.rewrite_goal,
        input_snapshot = excluded.input_snapshot,
        comment_insights = excluded.comment_insights,
        status = excluded.status,
        updated_at = timezone('utc', now())
      `,
      [
        bundle.draft.id,
        bundle.draft.sourceItemId,
        getLocalRealChainMerchantId(),
        bundle.draft.workingTitle,
        bundle.draft.rewriteGoal,
        JSON.stringify({ local_real_chain: true }),
        JSON.stringify({ local_real_chain: true }),
        bundle.draft.status,
      ],
    );

    for (const variant of bundle.variants) {
      await client.query(
        `
        insert into public.content_variants (
          id,
          draft_id,
          platform,
          variant_type,
          version_no,
          title,
          body_text,
          script_text,
          hashtags,
          cta_text,
          review_status
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
        on conflict (id) do update set
          draft_id = excluded.draft_id,
          platform = excluded.platform,
          variant_type = excluded.variant_type,
          version_no = excluded.version_no,
          title = excluded.title,
          body_text = excluded.body_text,
          script_text = excluded.script_text,
          hashtags = excluded.hashtags,
          cta_text = excluded.cta_text,
          review_status = excluded.review_status,
          updated_at = timezone('utc', now())
        `,
        [
          variant.id,
          variant.draftId,
          variant.platform,
          variant.variantType,
          variant.versionNo,
          variant.title,
          variant.bodyText,
          variant.scriptText,
          JSON.stringify(variant.hashtags),
          variant.ctaText,
          variant.reviewStatus,
        ],
      );
    }

    await client.query(
      `
      update public.content_drafts
      set selected_variant_id = $2,
          updated_at = timezone('utc', now())
      where id = $1
      `,
      [bundle.draft.id, bundle.selectedVariant?.id ?? null],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw mapLocalRealChainError(error, "LOCAL_REAL_CHAIN_DRAFT_SYNC_FAILED");
  } finally {
    client.release();
  }
}

export async function assertLocalRealChainMediaOwner(input: {
  ownerType: MediaOwnerType;
  ownerId: string;
}) {
  if (!isLocalRealChainEnabled()) {
    return null;
  }

  const table =
    input.ownerType === "source_item"
      ? "source_items"
      : input.ownerType === "content_draft"
        ? "content_drafts"
        : "content_variants";
  const result = await query<{ id: string }>(
    `select id from public.${table} where id = $1 limit 1`,
    [input.ownerId],
  );

  if (!result.rows[0]) {
    throw new ApiError(404, "LOCAL_REAL_CHAIN_OWNER_NOT_FOUND", "Local test owner was not synced.");
  }

  return {
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    merchantId: getLocalRealChainMerchantId(),
  };
}

export async function createLocalRealChainAssetObject(input: {
  ownerType: MediaOwnerType;
  ownerId: string;
  assetType: MediaAssetType;
  storageProvider: MediaStorageProvider;
  bucketName?: string | null;
  storageKey: string;
  originUrl?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  etag?: string | null;
  sortOrder?: number;
}) {
  const sortOrder =
    input.sortOrder ??
    Number(
      (
        await query<{ sort_order: number }>(
          `
          select coalesce(max(sort_order), -1) + 1 as sort_order
          from public.asset_objects
          where owner_type = $1 and owner_id = $2
          `,
          [input.ownerType, input.ownerId],
        )
      ).rows[0]?.sort_order ?? 0,
    );
  const result = await query<AssetRow>(
    `
    insert into public.asset_objects (
      id,
      owner_type,
      owner_id,
      asset_type,
      storage_provider,
      bucket_name,
      storage_key,
      origin_url,
      mime_type,
      file_size_bytes,
      etag,
      sort_order
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    returning ${assetObjectSelect}
    `,
    [
      randomUUID(),
      input.ownerType,
      input.ownerId,
      input.assetType,
      input.storageProvider,
      input.bucketName ?? null,
      input.storageKey,
      input.originUrl ?? null,
      input.mimeType ?? null,
      input.fileSizeBytes ?? null,
      input.etag ?? null,
      sortOrder,
    ],
  );

  return mapAssetObject(result.rows[0]);
}

export async function listLocalRealChainAssetObjectsByOwner(input: {
  ownerType: MediaOwnerType;
  ownerId: string;
}) {
  const result = await query<AssetRow>(
    `
    select ${assetObjectSelect}
    from public.asset_objects
    where owner_type = $1 and owner_id = $2
    order by sort_order asc, created_at asc
    `,
    [input.ownerType, input.ownerId],
  );

  return result.rows.map(mapAssetObject);
}

export async function createLocalRealChainVideoEditJob(input: {
  draftId: string;
  contentVariantId: string;
  triggerSource?: VideoEditJobTriggerSource;
  instructionText?: string | null;
  inputPayload?: Record<string, unknown>;
}) {
  const result = await query<VideoEditJobRow>(
    `
    insert into public.video_edit_jobs (
      merchant_id,
      draft_id,
      content_variant_id,
      trigger_source,
      instruction_text,
      input_payload,
      runtime_payload,
      result_payload,
      log_payload,
      progress_pct,
      retry_count,
      status,
      current_stage,
      failure_reason,
      started_at,
      finished_at
    ) values ($1, $2, $3, $4, $5, $6::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 0, 0, 'pending', null, null, null, null)
    returning ${videoEditJobSelect}
    `,
    [
      getLocalRealChainMerchantId(),
      input.draftId,
      input.contentVariantId,
      input.triggerSource ?? "manual",
      input.instructionText ?? null,
      JSON.stringify(input.inputPayload ?? {}),
    ],
  );

  return mapVideoEditJob(result.rows[0]);
}

export async function listLocalRealChainVideoEditJobs(filters: {
  status?: VideoEditJobStatus;
  limit?: number;
} = {}) {
  const params: unknown[] = [getLocalRealChainMerchantId(), filters.limit ?? 50];
  const statusSql = filters.status ? "and status = $3" : "";

  if (filters.status) {
    params.push(filters.status);
  }

  const result = await query<VideoEditJobRow>(
    `
    select ${videoEditJobSelect}
    from public.video_edit_jobs
    where merchant_id = $1
    ${statusSql}
    order by created_at desc
    limit $2
    `,
    params,
  );

  return result.rows.map(mapVideoEditJob);
}

export async function getLocalRealChainVideoEditJobById(jobId: string) {
  const result = await query<VideoEditJobRow>(
    `
    select ${videoEditJobSelect}
    from public.video_edit_jobs
    where id = $1 and merchant_id = $2
    limit 1
    `,
    [jobId, getLocalRealChainMerchantId()],
  );

  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, "VIDEO_EDIT_JOB_NOT_FOUND", "Video edit job not found.");
  }

  return mapVideoEditJob(row);
}

export async function retryLocalRealChainVideoEditJob(jobId: string) {
  const result = await query<VideoEditJobRow>(
    `
    update public.video_edit_jobs
    set status = 'pending',
        current_stage = null,
        progress_pct = 0,
        failure_reason = null,
        runtime_payload = '{}'::jsonb,
        result_payload = '{}'::jsonb,
        log_payload = '{}'::jsonb,
        started_at = null,
        finished_at = null,
        retry_count = retry_count + 1,
        updated_at = timezone('utc', now())
    where id = $1 and merchant_id = $2
    returning ${videoEditJobSelect}
    `,
    [jobId, getLocalRealChainMerchantId()],
  );

  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, "VIDEO_EDIT_JOB_NOT_FOUND", "Video edit job not found.");
  }

  return mapVideoEditJob(row);
}

export async function cancelLocalRealChainVideoEditJob(jobId: string) {
  const result = await query<VideoEditJobRow>(
    `
    update public.video_edit_jobs
    set status = 'cancelled',
        current_stage = coalesce(current_stage, 'cancelled'),
        finished_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where id = $1 and merchant_id = $2
    returning ${videoEditJobSelect}
    `,
    [jobId, getLocalRealChainMerchantId()],
  );

  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, "VIDEO_EDIT_JOB_NOT_FOUND", "Video edit job not found.");
  }

  return mapVideoEditJob(row);
}

async function ensureLocalRealChainMerchant() {
  await query(
    `
    insert into public.merchant_profiles (
      id,
      owner_user_id,
      name,
      industry,
      service_items,
      default_cta,
      forbidden_words,
      status,
      plan
    ) values ($1, null, $2, 'local-real-chain-test', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'active', 'plus')
    on conflict (id) do update set
      name = excluded.name,
      status = 'active',
      plan = 'plus',
      updated_at = timezone('utc', now())
    `,
    [
      getLocalRealChainMerchantId(),
      process.env.LOCAL_REAL_CHAIN_MERCHANT_NAME?.trim() || defaultLocalRealChainMerchantName,
    ],
  );
}

async function query<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
  try {
    return await queryAppDb<T>(sql, params);
  } catch (error) {
    throw mapLocalRealChainError(error, "LOCAL_REAL_CHAIN_DB_FAILED");
  }
}

function getPool() {
  return getAppPostgresPool();
}

function mapLocalRealChainError(error: unknown, code: string) {
  if (error instanceof ApiError) {
    return error;
  }

  return mapPostgresError(error, code);
}

function mapAssetObject(row: AssetRow): MediaAssetDto {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    assetType: row.asset_type,
    storageProvider: row.storage_provider,
    bucketName: row.bucket_name,
    storageKey: row.storage_key,
    originUrl: row.origin_url,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes === null ? null : Number(row.file_size_bytes),
    etag: row.etag,
    sortOrder: row.sort_order,
    createdAt: toIsoString(row.created_at),
    updatedAt: row.updated_at ? toIsoString(row.updated_at) : null,
  };
}

function mapVideoEditJob(row: VideoEditJobRow): VideoEditJobDto {
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
    startedAt: row.started_at ? toIsoString(row.started_at) : null,
    finishedAt: row.finished_at ? toIsoString(row.finished_at) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

const assetObjectSelect = [
  "id",
  "owner_type",
  "owner_id",
  "asset_type",
  "storage_provider",
  "bucket_name",
  "storage_key",
  "origin_url",
  "mime_type",
  "file_size_bytes",
  "etag",
  "sort_order",
  "created_at",
  "updated_at",
].join(", ");

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
