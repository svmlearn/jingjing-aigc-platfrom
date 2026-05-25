import "server-only";

import type { ImportedCommentDto, SourceItemDto } from "@/contracts/content";
import type { ImportJobDto, ImportJobStatus, ImportRequest } from "@/contracts/import";
import {
  mapPostgresError,
  queryAppDb,
  withAppDbTransaction,
  type DatabaseClient,
} from "@/lib/server-db/postgres";
import { ApiError } from "@/server/api/errors";
import type {
  NormalizedComment,
  NormalizedSourceItem,
} from "@/server/import-providers/types";

type Timestamp = string | Date;

type ImportJobRow = {
  id: string;
  merchant_id: string;
  platform: ImportRequest["platform"];
  import_type: ImportRequest["importType"];
  input_payload: Record<string, unknown>;
  status: ImportJobStatus;
  total_items: number | null;
  success_items: number;
  error_summary: string | null;
  log_payload: Record<string, unknown>;
  created_at: Timestamp;
  finished_at: Timestamp | null;
};

type SourceItemRow = {
  id: string;
  platform: SourceItemDto["platform"];
  source_type: SourceItemDto["sourceType"];
  external_item_id: string | null;
  source_url: string | null;
  creator_id: string | null;
  creator_name: string | null;
  title: string | null;
  body_text: string | null;
  script_text: string | null;
  engagement_snapshot: Record<string, unknown>;
  structure_summary: Record<string, unknown>;
  is_selected_for_rewrite: boolean;
  created_at: Timestamp;
};

type ImportedCommentRow = {
  id: string;
  source_item_id: string;
  external_comment_id: string | null;
  parent_external_comment_id: string | null;
  author_name: string | null;
  content: string;
  like_count: number;
  reply_count: number;
  published_at: Timestamp | null;
  created_at: Timestamp;
};

type SourceItemWriteRow = {
  merchant_id: string;
  import_job_id: string;
  platform: NormalizedSourceItem["platform"];
  source_type: NormalizedSourceItem["sourceType"];
  external_item_id: string | null;
  source_url: string;
  creator_id: string | null;
  creator_name: string | null;
  title: string | null;
  body_text: string | null;
  script_text: string | null;
  engagement_snapshot: Record<string, unknown>;
  structure_summary: Record<string, unknown>;
  trace_payload: unknown;
};

type ImportedCommentWriteRow = {
  source_item_id: string;
  external_comment_id: string | null;
  parent_external_comment_id: string | null;
  author_name: string | null;
  content: string;
  like_count: number;
  reply_count: number;
  published_at: string | null;
  sort_score: number;
  trace_payload: unknown;
};

export async function createImportJob(input: {
  merchantId: string;
  request: ImportRequest;
}): Promise<ImportJobDto> {
  try {
    const result = await queryAppDb<ImportJobRow>(
      `
      insert into public.import_jobs (
        merchant_id,
        platform,
        import_type,
        input_payload
      ) values ($1, $2, $3, $4::jsonb)
      returning ${importJobSelect}
      `,
      [
        input.merchantId,
        input.request.platform,
        input.request.importType,
        JSON.stringify({
          url: input.request.url,
          options: input.request.options ?? {},
        }),
      ],
    );

    return mapImportJob(result.rows[0]);
  } catch (error) {
    throw mapPostgresError(error, "IMPORT_JOB_CREATE_FAILED");
  }
}

export async function getImportJobById(input: {
  merchantId: string;
  jobId: string;
}): Promise<ImportJobRow> {
  try {
    return await pgGetImportJobById(input);
  } catch (error) {
    throw mapPostgresError(error, "IMPORT_JOB_FETCH_FAILED");
  }
}

export async function listImportJobs(merchantId: string): Promise<ImportJobDto[]> {
  try {
    const result = await queryAppDb<ImportJobRow>(
      `
      select ${importJobSelect}
      from public.import_jobs
      where merchant_id = $1
      order by created_at desc
      limit 50
      `,
      [merchantId],
    );

    return result.rows.map(mapImportJob);
  } catch (error) {
    throw mapPostgresError(error, "IMPORT_JOB_LIST_FAILED");
  }
}

export async function countRunningImportJobs(merchantId: string): Promise<{
  merchantRunning: number;
  globalRunning: number;
}> {
  try {
    const result = await queryAppDb<{
      merchant_running: string | number;
      global_running: string | number;
    }>(
      `
      select
        count(*) filter (
          where merchant_id = $1 and status = 'running'
        )::text as merchant_running,
        count(*) filter (
          where status = 'running'
        )::text as global_running
      from public.import_jobs
      `,
      [merchantId],
    );
    const row = result.rows[0];

    return {
      merchantRunning: Number(row?.merchant_running ?? 0),
      globalRunning: Number(row?.global_running ?? 0),
    };
  } catch (error) {
    throw mapPostgresError(error, "IMPORT_JOB_LIMIT_CHECK_FAILED");
  }
}

export async function updateImportJob(input: {
  jobId: string;
  status?: ImportJobStatus;
  totalItems?: number | null;
  successItems?: number;
  errorSummary?: string | null;
  logPayload?: Record<string, unknown>;
  finished?: boolean;
}): Promise<ImportJobDto> {
  try {
    const hasUpdate =
      input.status !== undefined ||
      input.totalItems !== undefined ||
      input.successItems !== undefined ||
      input.errorSummary !== undefined ||
      input.logPayload !== undefined ||
      input.finished === true;

    if (!hasUpdate) {
      return mapImportJob(await pgGetImportJobByIdOnly(input.jobId));
    }

    const result = await queryAppDb<ImportJobRow>(
      `
      update public.import_jobs
      set status = case when $2::boolean then $3 else status end,
          total_items = case when $4::boolean then $5 else total_items end,
          success_items = case when $6::boolean then $7 else success_items end,
          error_summary = case when $8::boolean then $9 else error_summary end,
          log_payload = case when $10::boolean then $11::jsonb else log_payload end,
          finished_at = case when $12::boolean then timezone('utc', now()) else finished_at end
      where id = $1
      returning ${importJobSelect}
      `,
      [
        input.jobId,
        input.status !== undefined,
        input.status ?? null,
        input.totalItems !== undefined,
        input.totalItems ?? null,
        input.successItems !== undefined,
        input.successItems ?? null,
        input.errorSummary !== undefined,
        input.errorSummary ?? null,
        input.logPayload !== undefined,
        JSON.stringify(input.logPayload ?? {}),
        input.finished === true,
      ],
    );
    const row = result.rows[0];

    if (!row) {
      throw new ApiError(404, "IMPORT_JOB_NOT_FOUND", "Import job not found.");
    }

    return mapImportJob(row);
  } catch (error) {
    throw mapPostgresError(error, "IMPORT_JOB_UPDATE_FAILED");
  }
}

export async function upsertSourceItems(input: {
  merchantId: string;
  jobId: string;
  items: NormalizedSourceItem[];
}): Promise<SourceItemDto[]> {
  const rows = input.items.map((item) => ({
    merchant_id: input.merchantId,
    import_job_id: input.jobId,
    platform: item.platform,
    source_type: item.sourceType,
    external_item_id: item.externalItemId ?? null,
    source_url: item.sourceUrl,
    creator_id: item.creatorId ?? null,
    creator_name: item.creatorName ?? null,
    title: item.title ?? null,
    body_text: item.bodyText ?? null,
    script_text: item.scriptText ?? null,
    engagement_snapshot: item.engagementSnapshot ?? {},
    structure_summary: item.structureSummary ?? {},
    trace_payload: item.tracePayload,
  }));

  if (rows.length === 0) {
    return [];
  }

  try {
    return await withAppDbTransaction(async (client) => {
      const saved: SourceItemDto[] = [];

      for (const row of rows) {
        const result = row.external_item_id
          ? await pgUpsertSourceItemWithExternalId(client, row)
          : await pgUpsertSourceItemWithSourceUrl(client, row);

        saved.push(mapSourceItem(result));
      }

      return saved;
    });
  } catch (error) {
    throw mapPostgresError(error, "SOURCE_ITEM_SAVE_FAILED");
  }
}

export async function ensureSourceItemForComments(input: {
  merchantId: string;
  jobId: string;
  request: ImportRequest;
}): Promise<SourceItemDto> {
  const [sourceItem] = await upsertSourceItems({
    merchantId: input.merchantId,
    jobId: input.jobId,
    items: [
      {
        platform: input.request.platform,
        sourceType: "detail",
        sourceUrl: input.request.url,
        tracePayload: {
          createdFrom: "comments_import",
          url: input.request.url,
        },
      },
    ],
  });

  if (!sourceItem) {
    throw new ApiError(500, "SOURCE_ITEM_SAVE_FAILED", "Failed to create comment source item.");
  }

  return sourceItem;
}

export async function upsertImportedComments(input: {
  sourceItemId: string;
  comments: NormalizedComment[];
}): Promise<ImportedCommentDto[]> {
  const rows = input.comments.map((comment) => ({
    source_item_id: input.sourceItemId,
    external_comment_id: comment.externalCommentId ?? null,
    parent_external_comment_id: comment.parentExternalCommentId ?? null,
    author_name: comment.authorName ?? null,
    content: comment.content,
    like_count: comment.likeCount ?? 0,
    reply_count: comment.replyCount ?? 0,
    published_at: comment.publishedAt ?? null,
    sort_score: calculateCommentSortScore(comment),
    trace_payload: comment.tracePayload ?? {},
  }));

  if (rows.length === 0) {
    return [];
  }

  try {
    return await withAppDbTransaction(async (client) => {
      const saved: ImportedCommentDto[] = [];

      for (const row of rows) {
        const result = row.external_comment_id
          ? await pgUpsertImportedCommentWithExternalId(client, row)
          : await pgInsertImportedComment(client, row);

        saved.push(mapImportedComment(result));
      }

      return saved;
    });
  } catch (error) {
    throw mapPostgresError(error, "IMPORTED_COMMENT_SAVE_FAILED");
  }
}

export async function listSourceItems(input: {
  merchantId: string;
  platform?: ImportRequest["platform"];
  limit?: number;
}): Promise<SourceItemDto[]> {
  try {
    return await pgListSourceItems(input);
  } catch (error) {
    throw mapPostgresError(error, "SOURCE_ITEM_LIST_FAILED");
  }
}

export async function getSourceItemById(input: {
  merchantId: string;
  sourceItemId: string;
}): Promise<SourceItemDto> {
  try {
    return await pgGetSourceItemById(input);
  } catch (error) {
    throw mapPostgresError(error, "SOURCE_ITEM_FETCH_FAILED");
  }
}

export async function listImportedComments(input: {
  merchantId: string;
  sourceItemId: string;
  limit?: number;
}): Promise<ImportedCommentDto[]> {
  try {
    return await pgListImportedComments(input);
  } catch (error) {
    throw mapPostgresError(error, "IMPORTED_COMMENT_LIST_FAILED");
  }
}

async function pgGetImportJobById(input: {
  merchantId: string;
  jobId: string;
}): Promise<ImportJobRow> {
  const result = await queryAppDb<ImportJobRow>(
    `
    select ${importJobSelect}
    from public.import_jobs
    where id = $1 and merchant_id = $2
    limit 1
    `,
    [input.jobId, input.merchantId],
  );
  const row = result.rows[0];

  if (!row) {
    throw new ApiError(404, "IMPORT_JOB_NOT_FOUND", "Import job not found.");
  }

  return row;
}

async function pgGetImportJobByIdOnly(jobId: string): Promise<ImportJobRow> {
  const result = await queryAppDb<ImportJobRow>(
    `
    select ${importJobSelect}
    from public.import_jobs
    where id = $1
    limit 1
    `,
    [jobId],
  );
  const row = result.rows[0];

  if (!row) {
    throw new ApiError(404, "IMPORT_JOB_NOT_FOUND", "Import job not found.");
  }

  return row;
}

async function pgListSourceItems(input: {
  merchantId: string;
  platform?: ImportRequest["platform"];
  limit?: number;
}): Promise<SourceItemDto[]> {
  const params: unknown[] = [input.merchantId, input.limit ?? 50];
  const platformSql = input.platform ? `and platform = $${params.length + 1}` : "";
  if (input.platform) {
    params.push(input.platform);
  }
  const result = await queryAppDb<SourceItemRow>(
    `
    select ${sourceItemSelect}
    from public.source_items
    where merchant_id = $1
    ${platformSql}
    order by created_at desc
    limit $2
    `,
    params,
  );

  return result.rows.map(mapSourceItem);
}

async function pgUpsertSourceItemWithExternalId(
  client: DatabaseClient,
  row: SourceItemWriteRow,
): Promise<SourceItemRow> {
  const result = await client.query<SourceItemRow>(
    `
    insert into public.source_items (
      merchant_id,
      import_job_id,
      platform,
      source_type,
      external_item_id,
      source_url,
      creator_id,
      creator_name,
      title,
      body_text,
      script_text,
      engagement_snapshot,
      structure_summary,
      trace_payload
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb
    )
    on conflict (merchant_id, platform, external_item_id) where external_item_id is not null
    do update set
      import_job_id = excluded.import_job_id,
      source_url = excluded.source_url,
      creator_id = excluded.creator_id,
      creator_name = excluded.creator_name,
      title = excluded.title,
      body_text = excluded.body_text,
      script_text = excluded.script_text,
      engagement_snapshot = excluded.engagement_snapshot,
      structure_summary = excluded.structure_summary,
      trace_payload = excluded.trace_payload
    returning ${sourceItemSelect}
    `,
    buildSourceItemParams(row),
  );

  return result.rows[0];
}

async function pgUpsertSourceItemWithSourceUrl(
  client: DatabaseClient,
  row: SourceItemWriteRow,
): Promise<SourceItemRow> {
  const result = await client.query<SourceItemRow>(
    `
    insert into public.source_items (
      merchant_id,
      import_job_id,
      platform,
      source_type,
      external_item_id,
      source_url,
      creator_id,
      creator_name,
      title,
      body_text,
      script_text,
      engagement_snapshot,
      structure_summary,
      trace_payload
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb
    )
    on conflict (merchant_id, source_url) where source_url is not null
    do update set
      import_job_id = excluded.import_job_id,
      platform = excluded.platform,
      source_type = excluded.source_type,
      creator_id = excluded.creator_id,
      creator_name = excluded.creator_name,
      title = excluded.title,
      body_text = excluded.body_text,
      script_text = excluded.script_text,
      engagement_snapshot = excluded.engagement_snapshot,
      structure_summary = excluded.structure_summary,
      trace_payload = excluded.trace_payload
    returning ${sourceItemSelect}
    `,
    buildSourceItemParams(row),
  );

  return result.rows[0];
}

function buildSourceItemParams(row: SourceItemWriteRow) {
  return [
    row.merchant_id,
    row.import_job_id,
    row.platform,
    row.source_type,
    row.external_item_id,
    row.source_url,
    row.creator_id,
    row.creator_name,
    row.title,
    row.body_text,
    row.script_text,
    JSON.stringify(row.engagement_snapshot ?? {}),
    JSON.stringify(row.structure_summary ?? {}),
    JSON.stringify(row.trace_payload ?? {}),
  ];
}

async function pgGetSourceItemById(input: {
  merchantId: string;
  sourceItemId: string;
}): Promise<SourceItemDto> {
  const result = await queryAppDb<SourceItemRow>(
    `
    select ${sourceItemSelect}
    from public.source_items
    where id = $1 and merchant_id = $2
    limit 1
    `,
    [input.sourceItemId, input.merchantId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, "SOURCE_ITEM_NOT_FOUND", "Source item not found.");
  }

  return mapSourceItem(row);
}

async function pgUpsertImportedCommentWithExternalId(
  client: DatabaseClient,
  row: ImportedCommentWriteRow,
): Promise<ImportedCommentRow> {
  const result = await client.query<ImportedCommentRow>(
    `
    insert into public.imported_comments (
      source_item_id,
      external_comment_id,
      parent_external_comment_id,
      author_name,
      content,
      like_count,
      reply_count,
      published_at,
      sort_score,
      trace_payload
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
    on conflict (source_item_id, external_comment_id)
    do update set
      parent_external_comment_id = excluded.parent_external_comment_id,
      author_name = excluded.author_name,
      content = excluded.content,
      like_count = excluded.like_count,
      reply_count = excluded.reply_count,
      published_at = excluded.published_at,
      sort_score = excluded.sort_score,
      trace_payload = excluded.trace_payload
    returning ${commentSelect}
    `,
    buildImportedCommentParams(row),
  );

  return result.rows[0];
}

async function pgInsertImportedComment(
  client: DatabaseClient,
  row: ImportedCommentWriteRow,
): Promise<ImportedCommentRow> {
  const result = await client.query<ImportedCommentRow>(
    `
    insert into public.imported_comments (
      source_item_id,
      external_comment_id,
      parent_external_comment_id,
      author_name,
      content,
      like_count,
      reply_count,
      published_at,
      sort_score,
      trace_payload
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
    returning ${commentSelect}
    `,
    buildImportedCommentParams(row),
  );

  return result.rows[0];
}

function buildImportedCommentParams(row: ImportedCommentWriteRow) {
  return [
    row.source_item_id,
    row.external_comment_id,
    row.parent_external_comment_id,
    row.author_name,
    row.content,
    row.like_count,
    row.reply_count,
    row.published_at,
    row.sort_score,
    JSON.stringify(row.trace_payload ?? {}),
  ];
}

async function pgListImportedComments(input: {
  merchantId: string;
  sourceItemId: string;
  limit?: number;
}): Promise<ImportedCommentDto[]> {
  await pgGetSourceItemById({
    merchantId: input.merchantId,
    sourceItemId: input.sourceItemId,
  });
  const result = await queryAppDb<ImportedCommentRow>(
    `
    select ${commentSelect}
    from public.imported_comments
    where source_item_id = $1
    order by sort_score desc nulls last, created_at asc
    limit $2
    `,
    [input.sourceItemId, input.limit ?? 100],
  );

  return result.rows.map(mapImportedComment);
}

export function mapImportJob(row: ImportJobRow): ImportJobDto {
  const sourceItemIds = Array.isArray(row.log_payload?.sourceItemIds)
    ? row.log_payload.sourceItemIds.filter((item): item is string => typeof item === "string")
    : [];
  const commentCount =
    typeof row.log_payload?.commentCount === "number" ? row.log_payload.commentCount : 0;

  return {
    id: row.id,
    platform: row.platform,
    importType: row.import_type,
    status: row.status,
    inputUrl: typeof row.input_payload?.url === "string" ? row.input_payload.url : "",
    totalItems: row.total_items,
    successItems: row.success_items,
    errorSummary: row.error_summary,
    sourceItemIds,
    commentCount,
    createdAt: toIsoString(row.created_at),
    finishedAt: row.finished_at ? toIsoString(row.finished_at) : null,
  };
}

function mapSourceItem(row: SourceItemRow): SourceItemDto {
  return {
    id: row.id,
    platform: row.platform,
    sourceType: row.source_type,
    externalItemId: row.external_item_id,
    sourceUrl: row.source_url,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    title: row.title,
    bodyText: row.body_text,
    scriptText: row.script_text,
    engagementSnapshot: row.engagement_snapshot ?? {},
    structureSummary: row.structure_summary ?? {},
    isSelectedForRewrite: row.is_selected_for_rewrite,
    createdAt: toIsoString(row.created_at),
  };
}

function mapImportedComment(row: ImportedCommentRow): ImportedCommentDto {
  return {
    id: row.id,
    sourceItemId: row.source_item_id,
    externalCommentId: row.external_comment_id,
    parentExternalCommentId: row.parent_external_comment_id,
    authorName: row.author_name,
    content: row.content,
    likeCount: row.like_count,
    replyCount: row.reply_count,
    publishedAt: row.published_at ? toIsoString(row.published_at) : null,
    createdAt: toIsoString(row.created_at),
  };
}

function toIsoString(value: Timestamp) {
  return value instanceof Date ? value.toISOString() : value;
}

function calculateCommentSortScore(comment: NormalizedComment) {
  return (comment.likeCount ?? 0) * 2 + (comment.replyCount ?? 0);
}

const importJobSelect = [
  "id",
  "merchant_id",
  "platform",
  "import_type",
  "input_payload",
  "status",
  "total_items",
  "success_items",
  "error_summary",
  "log_payload",
  "created_at",
  "finished_at",
].join(", ");

const sourceItemSelect = [
  "id",
  "platform",
  "source_type",
  "external_item_id",
  "source_url",
  "creator_id",
  "creator_name",
  "title",
  "body_text",
  "script_text",
  "engagement_snapshot",
  "structure_summary",
  "is_selected_for_rewrite",
  "created_at",
].join(", ");

const commentSelect = [
  "id",
  "source_item_id",
  "external_comment_id",
  "parent_external_comment_id",
  "author_name",
  "content",
  "like_count",
  "reply_count",
  "published_at",
  "created_at",
].join(", ");
