import "server-only";

import type { ImportedCommentDto, SourceItemDto } from "@/contracts/content";
import type { ImportJobDto, ImportJobStatus, ImportRequest } from "@/contracts/import";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/server/api/errors";
import type {
  NormalizedComment,
  NormalizedSourceItem,
} from "@/server/import-providers/types";

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
  created_at: string;
  finished_at: string | null;
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
  created_at: string;
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
  published_at: string | null;
  created_at: string;
};

export async function createImportJob(input: {
  merchantId: string;
  request: ImportRequest;
}): Promise<ImportJobDto> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("import_jobs")
    .insert({
      merchant_id: input.merchantId,
      platform: input.request.platform,
      import_type: input.request.importType,
      input_payload: {
        url: input.request.url,
        options: input.request.options ?? {},
      },
    })
    .select(importJobSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "IMPORT_JOB_CREATE_FAILED", error?.message ?? "Create failed.");
  }

  return mapImportJob(data as unknown as ImportJobRow);
}

export async function getImportJobById(input: {
  merchantId: string;
  jobId: string;
}): Promise<ImportJobRow> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("import_jobs")
    .select(importJobSelect)
    .eq("id", input.jobId)
    .eq("merchant_id", input.merchantId)
    .single();

  if (error || !data) {
    throw new ApiError(404, "IMPORT_JOB_NOT_FOUND", "Import job not found.");
  }

  return data as unknown as ImportJobRow;
}

export async function listImportJobs(merchantId: string): Promise<ImportJobDto[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("import_jobs")
    .select(importJobSelect)
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new ApiError(500, "IMPORT_JOB_LIST_FAILED", error.message);
  }

  return ((data ?? []) as unknown as ImportJobRow[]).map(mapImportJob);
}

export async function countRunningImportJobs(merchantId: string): Promise<{
  merchantRunning: number;
  globalRunning: number;
}> {
  const supabase = createSupabaseAdminClient();
  const [merchantResult, globalResult] = await Promise.all([
    supabase
      .from("import_jobs")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchantId)
      .eq("status", "running"),
    supabase.from("import_jobs").select("id", { count: "exact", head: true }).eq("status", "running"),
  ]);

  if (merchantResult.error) {
    throw new ApiError(500, "IMPORT_JOB_LIMIT_CHECK_FAILED", merchantResult.error.message);
  }

  if (globalResult.error) {
    throw new ApiError(500, "IMPORT_JOB_LIMIT_CHECK_FAILED", globalResult.error.message);
  }

  return {
    merchantRunning: merchantResult.count ?? 0,
    globalRunning: globalResult.count ?? 0,
  };
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
  const supabase = createSupabaseAdminClient();
  const update: Record<string, unknown> = {};

  if (input.status !== undefined) update.status = input.status;
  if (input.totalItems !== undefined) update.total_items = input.totalItems;
  if (input.successItems !== undefined) update.success_items = input.successItems;
  if (input.errorSummary !== undefined) update.error_summary = input.errorSummary;
  if (input.logPayload !== undefined) update.log_payload = input.logPayload;
  if (input.finished) update.finished_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("import_jobs")
    .update(update)
    .eq("id", input.jobId)
    .select(importJobSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "IMPORT_JOB_UPDATE_FAILED", error?.message ?? "Update failed.");
  }

  return mapImportJob(data as unknown as ImportJobRow);
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

  const supabase = createSupabaseAdminClient();
  const withExternalIds = rows.filter((row) => row.external_item_id);
  const withoutExternalIds = rows.filter((row) => !row.external_item_id);
  const saved: SourceItemDto[] = [];

  if (withExternalIds.length > 0) {
    const { data, error } = await supabase
      .from("source_items")
      .upsert(withExternalIds, { onConflict: "platform,external_item_id" })
      .select(sourceItemSelect);

    if (error) {
      throw new ApiError(500, "SOURCE_ITEM_SAVE_FAILED", error.message);
    }

    saved.push(...((data ?? []) as unknown as SourceItemRow[]).map(mapSourceItem));
  }

  if (withoutExternalIds.length > 0) {
    const { data, error } = await supabase
      .from("source_items")
      .upsert(withoutExternalIds, { onConflict: "source_url" })
      .select(sourceItemSelect);

    if (error) {
      throw new ApiError(500, "SOURCE_ITEM_SAVE_FAILED", error.message);
    }

    saved.push(...((data ?? []) as unknown as SourceItemRow[]).map(mapSourceItem));
  }

  return saved;
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

  const supabase = createSupabaseAdminClient();
  const withExternalIds = rows.filter((row) => row.external_comment_id);
  const withoutExternalIds = rows.filter((row) => !row.external_comment_id);
  const saved: ImportedCommentDto[] = [];

  if (withExternalIds.length > 0) {
    const { data, error } = await supabase
      .from("imported_comments")
      .upsert(withExternalIds, { onConflict: "source_item_id,external_comment_id" })
      .select(commentSelect);

    if (error) {
      throw new ApiError(500, "IMPORTED_COMMENT_SAVE_FAILED", error.message);
    }

    saved.push(...((data ?? []) as unknown as ImportedCommentRow[]).map(mapImportedComment));
  }

  if (withoutExternalIds.length > 0) {
    const { data, error } = await supabase
      .from("imported_comments")
      .insert(withoutExternalIds)
      .select(commentSelect);

    if (error) {
      throw new ApiError(500, "IMPORTED_COMMENT_SAVE_FAILED", error.message);
    }

    saved.push(...((data ?? []) as unknown as ImportedCommentRow[]).map(mapImportedComment));
  }

  return saved;
}

export async function listSourceItems(input: {
  merchantId: string;
  platform?: ImportRequest["platform"];
  limit?: number;
}): Promise<SourceItemDto[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("source_items")
    .select(sourceItemSelect)
    .eq("merchant_id", input.merchantId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 50);

  if (input.platform) {
    query = query.eq("platform", input.platform);
  }

  const { data, error } = await query;

  if (error) {
    throw new ApiError(500, "SOURCE_ITEM_LIST_FAILED", error.message);
  }

  return ((data ?? []) as unknown as SourceItemRow[]).map(mapSourceItem);
}

export async function getSourceItemById(input: {
  merchantId: string;
  sourceItemId: string;
}): Promise<SourceItemDto> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("source_items")
    .select(sourceItemSelect)
    .eq("id", input.sourceItemId)
    .eq("merchant_id", input.merchantId)
    .single();

  if (error || !data) {
    throw new ApiError(404, "SOURCE_ITEM_NOT_FOUND", "Source item not found.");
  }

  return mapSourceItem(data as unknown as SourceItemRow);
}

export async function listImportedComments(input: {
  merchantId: string;
  sourceItemId: string;
  limit?: number;
}): Promise<ImportedCommentDto[]> {
  await getSourceItemById({
    merchantId: input.merchantId,
    sourceItemId: input.sourceItemId,
  });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("imported_comments")
    .select(commentSelect)
    .eq("source_item_id", input.sourceItemId)
    .order("sort_score", { ascending: false, nullsFirst: false })
    .limit(input.limit ?? 100);

  if (error) {
    throw new ApiError(500, "IMPORTED_COMMENT_LIST_FAILED", error.message);
  }

  return ((data ?? []) as unknown as ImportedCommentRow[]).map(mapImportedComment);
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
    createdAt: row.created_at,
    finishedAt: row.finished_at,
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
    createdAt: row.created_at,
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
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
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
