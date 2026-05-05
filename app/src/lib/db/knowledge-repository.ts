import "server-only";

import { randomUUID } from "node:crypto";

import type {
  KnowledgeChunkDto,
  KnowledgeDocumentDto,
  KnowledgeDocumentStatus,
  KnowledgeDocumentWithStatsDto,
  KnowledgeIngestionJobDto,
  KnowledgeSearchMatchDto,
} from "@/contracts/knowledge";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { ApiError } from "@/server/api/errors";

type KnowledgeDocumentRow = {
  id: string;
  scope: KnowledgeDocumentDto["scope"];
  merchant_id: string | null;
  title: string;
  source_name: string | null;
  storage_provider: KnowledgeDocumentDto["storageProvider"];
  bucket_name: string | null;
  storage_key: string | null;
  mime_type: string | null;
  status: KnowledgeDocumentStatus;
  summary_text: string | null;
  metadata: unknown;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type KnowledgeChunkRow = {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  token_count: number;
  metadata: unknown;
  embedding?: unknown;
  created_at: string;
};

type KnowledgeVectorMatchRow = KnowledgeChunkRow & {
  score: number;
};

type KnowledgeIngestionJobRow = {
  id: string;
  document_id: string | null;
  merchant_id: string | null;
  job_type: KnowledgeIngestionJobDto["jobType"];
  status: KnowledgeIngestionJobDto["status"];
  input_payload: unknown;
  log_payload: unknown;
  error_summary: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

const demoKnowledgeDocuments = new Map<string, KnowledgeDocumentDto>();
const demoKnowledgeChunks = new Map<string, KnowledgeChunkDto[]>();
const demoKnowledgeJobs = new Map<string, KnowledgeIngestionJobDto>();

export async function listKnowledgeDocuments(input: {
  scope?: KnowledgeDocumentDto["scope"];
  merchantId?: string | null;
  limit?: number;
} = {}): Promise<KnowledgeDocumentWithStatsDto[]> {
  if (!isSupabaseAdminConfigured()) {
    const documents = Array.from(demoKnowledgeDocuments.values())
      .filter((document) => !input.scope || document.scope === input.scope)
      .filter((document) => {
        if (input.merchantId === undefined) {
          return true;
        }

        return input.merchantId === null
          ? document.merchantId === null
          : document.merchantId === input.merchantId;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, input.limit ?? 100);

    return attachKnowledgeDocumentStats(documents);
  }

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("knowledge_documents")
    .select(knowledgeDocumentSelect)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 100);

  if (input.scope) {
    query = query.eq("scope", input.scope);
  }

  if (input.merchantId !== undefined) {
    query =
      input.merchantId === null ? query.is("merchant_id", null) : query.eq("merchant_id", input.merchantId);
  }

  const { data, error } = await query;

  if (error) {
    throw new ApiError(500, "KNOWLEDGE_DOCUMENTS_LIST_FAILED", error.message);
  }

  const documents = ((data ?? []) as unknown as KnowledgeDocumentRow[]).map(mapKnowledgeDocument);

  return attachKnowledgeDocumentStats(documents);
}

export async function getKnowledgeDocumentById(
  documentId: string,
): Promise<KnowledgeDocumentWithStatsDto> {
  if (!isSupabaseAdminConfigured()) {
    const document = demoKnowledgeDocuments.get(documentId);

    if (!document) {
      throw new ApiError(404, "KNOWLEDGE_DOCUMENT_NOT_FOUND", "Knowledge document not found.");
    }

    const [documentWithStats] = await attachKnowledgeDocumentStats([document]);
    return documentWithStats;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select(knowledgeDocumentSelect)
    .eq("id", documentId)
    .single();

  if (error || !data) {
    throw new ApiError(404, "KNOWLEDGE_DOCUMENT_NOT_FOUND", "Knowledge document not found.");
  }

  const [document] = await attachKnowledgeDocumentStats([
    mapKnowledgeDocument(data as unknown as KnowledgeDocumentRow),
  ]);

  return document;
}

export async function createKnowledgeDocument(input: {
  id: string;
  scope: KnowledgeDocumentDto["scope"];
  merchantId?: string | null;
  title: string;
  sourceName?: string | null;
  storageProvider: KnowledgeDocumentDto["storageProvider"];
  bucketName?: string | null;
  storageKey?: string | null;
  mimeType?: string | null;
  status?: KnowledgeDocumentStatus;
  summaryText?: string | null;
  metadata?: Record<string, unknown>;
  createdByUserId?: string | null;
}): Promise<KnowledgeDocumentDto> {
  if (!isSupabaseAdminConfigured()) {
    const now = new Date().toISOString();
    const document: KnowledgeDocumentDto = {
      id: input.id,
      scope: input.scope,
      merchantId: input.merchantId ?? null,
      title: input.title,
      sourceName: input.sourceName ?? null,
      storageProvider: input.storageProvider,
      bucketName: input.bucketName ?? null,
      storageKey: input.storageKey ?? null,
      mimeType: input.mimeType ?? null,
      status: input.status ?? "uploaded",
      summaryText: input.summaryText ?? null,
      metadata: input.metadata ?? {},
      createdByUserId: input.createdByUserId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    demoKnowledgeDocuments.set(document.id, document);
    demoKnowledgeChunks.set(document.id, []);

    return document;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .insert({
      id: input.id,
      scope: input.scope,
      merchant_id: input.merchantId ?? null,
      title: input.title,
      source_name: input.sourceName ?? null,
      storage_provider: input.storageProvider,
      bucket_name: input.bucketName ?? null,
      storage_key: input.storageKey ?? null,
      mime_type: input.mimeType ?? null,
      status: input.status ?? "uploaded",
      summary_text: input.summaryText ?? null,
      metadata: input.metadata ?? {},
      created_by_user_id: input.createdByUserId ?? null,
    })
    .select(knowledgeDocumentSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "KNOWLEDGE_DOCUMENT_CREATE_FAILED", error?.message ?? "Create failed.");
  }

  return mapKnowledgeDocument(data as unknown as KnowledgeDocumentRow);
}

export async function updateKnowledgeDocument(input: {
  documentId: string;
  title?: string;
  sourceName?: string | null;
  status?: KnowledgeDocumentStatus;
  summaryText?: string | null;
  metadata?: Record<string, unknown>;
  bucketName?: string | null;
  storageKey?: string | null;
}): Promise<KnowledgeDocumentDto> {
  if (!isSupabaseAdminConfigured()) {
    const current = demoKnowledgeDocuments.get(input.documentId);

    if (!current) {
      throw new ApiError(404, "KNOWLEDGE_DOCUMENT_NOT_FOUND", "Knowledge document not found.");
    }

    const updated: KnowledgeDocumentDto = {
      ...current,
      title: input.title ?? current.title,
      sourceName: input.sourceName !== undefined ? input.sourceName : current.sourceName,
      status: input.status ?? current.status,
      summaryText: input.summaryText !== undefined ? input.summaryText : current.summaryText,
      metadata: input.metadata ?? current.metadata,
      bucketName: input.bucketName !== undefined ? input.bucketName : current.bucketName,
      storageKey: input.storageKey !== undefined ? input.storageKey : current.storageKey,
      updatedAt: new Date().toISOString(),
    };

    demoKnowledgeDocuments.set(input.documentId, updated);

    return updated;
  }

  const supabase = createSupabaseAdminClient();
  const patch: Record<string, unknown> = {};

  if (input.status !== undefined) patch.status = input.status;
  if (input.title !== undefined) patch.title = input.title;
  if (input.sourceName !== undefined) patch.source_name = input.sourceName;
  if (input.summaryText !== undefined) patch.summary_text = input.summaryText;
  if (input.metadata !== undefined) patch.metadata = input.metadata;
  if (input.bucketName !== undefined) patch.bucket_name = input.bucketName;
  if (input.storageKey !== undefined) patch.storage_key = input.storageKey;

  const { data, error } = await supabase
    .from("knowledge_documents")
    .update(patch)
    .eq("id", input.documentId)
    .select(knowledgeDocumentSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "KNOWLEDGE_DOCUMENT_UPDATE_FAILED", error?.message ?? "Update failed.");
  }

  return mapKnowledgeDocument(data as unknown as KnowledgeDocumentRow);
}

export async function deleteKnowledgeDocument(documentId: string): Promise<void> {
  if (!isSupabaseAdminConfigured()) {
    demoKnowledgeDocuments.delete(documentId);
    demoKnowledgeChunks.delete(documentId);

    for (const [jobId, job] of demoKnowledgeJobs.entries()) {
      if (job.documentId === documentId) {
        demoKnowledgeJobs.delete(jobId);
      }
    }

    return;
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("knowledge_documents").delete().eq("id", documentId);

  if (error) {
    throw new ApiError(500, "KNOWLEDGE_DOCUMENT_DELETE_FAILED", error.message);
  }
}

export async function createKnowledgeIngestionJob(input: {
  documentId: string;
  merchantId?: string | null;
  status?: KnowledgeIngestionJobDto["status"];
  inputPayload?: Record<string, unknown>;
  logPayload?: Record<string, unknown>;
}): Promise<KnowledgeIngestionJobDto> {
  if (!isSupabaseAdminConfigured()) {
    const now = new Date().toISOString();
    const job: KnowledgeIngestionJobDto = {
      id: randomUUID(),
      documentId: input.documentId,
      merchantId: input.merchantId ?? null,
      jobType: "document_ingestion",
      status: input.status ?? "pending",
      inputPayload: input.inputPayload ?? {},
      logPayload: input.logPayload ?? {},
      errorSummary: null,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    demoKnowledgeJobs.set(job.id, job);

    return job;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("knowledge_ingestion_jobs")
    .insert({
      document_id: input.documentId,
      merchant_id: input.merchantId ?? null,
      status: input.status ?? "pending",
      input_payload: input.inputPayload ?? {},
      log_payload: input.logPayload ?? {},
    })
    .select(knowledgeIngestionJobSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "KNOWLEDGE_INGESTION_JOB_CREATE_FAILED", error?.message ?? "Create failed.");
  }

  return mapKnowledgeIngestionJob(data as unknown as KnowledgeIngestionJobRow);
}

export async function updateKnowledgeIngestionJob(input: {
  jobId: string;
  status?: KnowledgeIngestionJobDto["status"];
  logPayload?: Record<string, unknown>;
  errorSummary?: string | null;
  finishedAt?: string | null;
}): Promise<KnowledgeIngestionJobDto> {
  if (!isSupabaseAdminConfigured()) {
    const current = demoKnowledgeJobs.get(input.jobId);

    if (!current) {
      throw new ApiError(404, "KNOWLEDGE_INGESTION_JOB_NOT_FOUND", "Knowledge job not found.");
    }

    const updated: KnowledgeIngestionJobDto = {
      ...current,
      status: input.status ?? current.status,
      logPayload: input.logPayload ?? current.logPayload,
      errorSummary:
        input.errorSummary !== undefined ? input.errorSummary : current.errorSummary,
      finishedAt: input.finishedAt !== undefined ? input.finishedAt : current.finishedAt,
      updatedAt: new Date().toISOString(),
    };

    demoKnowledgeJobs.set(input.jobId, updated);

    return updated;
  }

  const supabase = createSupabaseAdminClient();
  const patch: Record<string, unknown> = {};

  if (input.status !== undefined) patch.status = input.status;
  if (input.logPayload !== undefined) patch.log_payload = input.logPayload;
  if (input.errorSummary !== undefined) patch.error_summary = input.errorSummary;
  if (input.finishedAt !== undefined) patch.finished_at = input.finishedAt;

  const { data, error } = await supabase
    .from("knowledge_ingestion_jobs")
    .update(patch)
    .eq("id", input.jobId)
    .select(knowledgeIngestionJobSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "KNOWLEDGE_INGESTION_JOB_UPDATE_FAILED", error?.message ?? "Update failed.");
  }

  return mapKnowledgeIngestionJob(data as unknown as KnowledgeIngestionJobRow);
}

export async function replaceKnowledgeChunks(input: {
  documentId: string;
  chunks: Array<{
    chunkIndex: number;
    content: string;
    tokenCount: number;
    metadata?: Record<string, unknown>;
    embedding?: number[] | null;
  }>;
}): Promise<KnowledgeChunkDto[]> {
  if (!isSupabaseAdminConfigured()) {
    const now = new Date().toISOString();
    const chunks = input.chunks.map((chunk) => ({
      id: randomUUID(),
      documentId: input.documentId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      metadata: chunk.metadata ?? {},
      createdAt: now,
    }));

    demoKnowledgeChunks.set(input.documentId, chunks);

    return chunks;
  }

  const supabase = createSupabaseAdminClient();
  const { error: deleteError } = await supabase
    .from("knowledge_chunks")
    .delete()
    .eq("document_id", input.documentId);

  if (deleteError) {
    throw new ApiError(500, "KNOWLEDGE_CHUNKS_REPLACE_FAILED", deleteError.message);
  }

  if (input.chunks.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("knowledge_chunks")
    .insert(
      input.chunks.map((chunk) => ({
        document_id: input.documentId,
        chunk_index: chunk.chunkIndex,
        content: chunk.content,
        token_count: chunk.tokenCount,
        metadata: chunk.metadata ?? {},
        embedding: chunk.embedding ? toPgVector(chunk.embedding) : null,
      })),
    )
    .select(knowledgeChunkSelect)
    .order("chunk_index", { ascending: true });

  if (error) {
    throw new ApiError(500, "KNOWLEDGE_CHUNKS_REPLACE_FAILED", error.message);
  }

  return ((data ?? []) as unknown as KnowledgeChunkRow[]).map(mapKnowledgeChunk);
}

export async function listKnowledgeChunksByDocumentId(
  documentId: string,
): Promise<KnowledgeChunkDto[]> {
  if (!isSupabaseAdminConfigured()) {
    return [...(demoKnowledgeChunks.get(documentId) ?? [])].sort(
      (a, b) => a.chunkIndex - b.chunkIndex,
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select(knowledgeChunkSelect)
    .eq("document_id", documentId)
    .order("chunk_index", { ascending: true });

  if (error) {
    throw new ApiError(500, "KNOWLEDGE_CHUNKS_LIST_FAILED", error.message);
  }

  return ((data ?? []) as unknown as KnowledgeChunkRow[]).map(mapKnowledgeChunk);
}

export async function searchKnowledgeChunks(input: {
  merchantId: string;
  query: string;
  limit: number;
  queryEmbedding?: number[] | null;
  documentIds?: string[];
}): Promise<KnowledgeSearchMatchDto[]> {
  const documents = await listKnowledgeDocuments({ limit: 200 });
  const requestedDocumentIds = input.documentIds ? new Set(input.documentIds) : null;
  const eligibleDocuments = documents.filter(
    (document) =>
      document.status === "indexed" &&
      (document.scope === "platform"
        ? requestedDocumentIds === null || requestedDocumentIds.has(document.id)
        : document.merchantId === input.merchantId),
  );

  if (eligibleDocuments.length === 0 || input.limit <= 0) {
    return [];
  }

  const documentIds = eligibleDocuments.map((document) => document.id);
  const documentById = new Map(eligibleDocuments.map((document) => [document.id, document]));
  const terms = buildSearchTerms(input.query);
  const matches: KnowledgeSearchMatchDto[] = [];

  if (!isSupabaseAdminConfigured()) {
    for (const documentId of documentIds) {
      const document = documentById.get(documentId);

      if (!document) {
        continue;
      }

      for (const chunk of demoKnowledgeChunks.get(documentId) ?? []) {
        const contentScore = scoreText(chunk.content, terms);
        const titleScore = scoreText(document.title, terms) * 0.5;
        const score = contentScore + titleScore;

        matches.push({
          chunkId: chunk.id,
          documentId: document.id,
          documentTitle: document.title,
          sourceName: document.sourceName,
          scope: document.scope,
          merchantId: document.merchantId,
          content: chunk.content,
          score,
          chunkIndex: chunk.chunkIndex,
          metadata: chunk.metadata,
        });
      }
    }

    return rankKnowledgeMatches(matches, input.limit);
  }

  const supabase = createSupabaseAdminClient();

  if (input.queryEmbedding) {
    const { data: vectorData, error: vectorError } = await supabase.rpc(
      "match_knowledge_chunks",
      {
        query_embedding: toPgVector(input.queryEmbedding),
        match_count: input.limit,
        document_ids: documentIds,
      },
    );

    if (!vectorError && Array.isArray(vectorData) && vectorData.length > 0) {
      return (vectorData as unknown as KnowledgeVectorMatchRow[]).map((row) => {
        const document = documentById.get(row.document_id);

        return {
          chunkId: row.id,
          documentId: row.document_id,
          documentTitle: document?.title ?? "Unknown document",
          sourceName: document?.sourceName ?? null,
          scope: document?.scope ?? "platform",
          merchantId: document?.merchantId ?? null,
          content: row.content,
          score: typeof row.score === "number" ? row.score : 0,
          chunkIndex: row.chunk_index,
          metadata: toRecord(row.metadata),
        };
      });
    }
  }

  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select(knowledgeChunkSelect)
    .in("document_id", documentIds)
    .order("chunk_index", { ascending: true })
    .limit(1000);

  if (error) {
    throw new ApiError(500, "KNOWLEDGE_SEARCH_FAILED", error.message);
  }

  for (const row of (data ?? []) as unknown as KnowledgeChunkRow[]) {
    const document = documentById.get(row.document_id);

    if (!document) {
      continue;
    }

    const contentScore = scoreText(row.content, terms);
    const titleScore = scoreText(document.title, terms) * 0.5;
    const score = contentScore + titleScore;

    matches.push({
      chunkId: row.id,
      documentId: document.id,
      documentTitle: document.title,
      sourceName: document.sourceName,
      scope: document.scope,
      merchantId: document.merchantId,
      content: row.content,
      score,
      chunkIndex: row.chunk_index,
      metadata: toRecord(row.metadata),
    });
  }

  return rankKnowledgeMatches(matches, input.limit);
}

async function attachKnowledgeDocumentStats(
  documents: KnowledgeDocumentDto[],
): Promise<KnowledgeDocumentWithStatsDto[]> {
  if (documents.length === 0) {
    return [];
  }

  if (!isSupabaseAdminConfigured()) {
    return documents.map((document) => ({
      ...document,
      chunkCount: demoKnowledgeChunks.get(document.id)?.length ?? 0,
      latestJob: findLatestDemoKnowledgeJob(document.id),
    }));
  }

  const documentIds = documents.map((document) => document.id);
  const [chunkCounts, latestJobs] = await Promise.all([
    countKnowledgeChunksByDocumentIds(documentIds),
    listLatestKnowledgeJobsByDocumentIds(documentIds),
  ]);

  return documents.map((document) => ({
    ...document,
    chunkCount: chunkCounts.get(document.id) ?? 0,
    latestJob: latestJobs.get(document.id) ?? null,
  }));
}

function rankKnowledgeMatches(matches: KnowledgeSearchMatchDto[], limit: number) {
  matches.sort((a, b) => b.score - a.score || a.chunkIndex - b.chunkIndex);

  const positiveMatches = matches.filter((match) => match.score > 0);
  const rankedMatches = positiveMatches.length > 0 ? positiveMatches : matches;

  return rankedMatches.slice(0, limit);
}

function findLatestDemoKnowledgeJob(documentId: string) {
  return (
    Array.from(demoKnowledgeJobs.values())
      .filter((job) => job.documentId === documentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  );
}

async function countKnowledgeChunksByDocumentIds(documentIds: string[]) {
  const counts = new Map<string, number>();

  if (documentIds.length === 0) {
    return counts;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select("document_id")
    .in("document_id", documentIds);

  if (error) {
    throw new ApiError(500, "KNOWLEDGE_CHUNKS_COUNT_FAILED", error.message);
  }

  for (const row of (data ?? []) as Array<{ document_id: string }>) {
    counts.set(row.document_id, (counts.get(row.document_id) ?? 0) + 1);
  }

  return counts;
}

async function listLatestKnowledgeJobsByDocumentIds(documentIds: string[]) {
  const jobs = new Map<string, KnowledgeIngestionJobDto>();

  if (documentIds.length === 0) {
    return jobs;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("knowledge_ingestion_jobs")
    .select(knowledgeIngestionJobSelect)
    .in("document_id", documentIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new ApiError(500, "KNOWLEDGE_JOBS_LIST_FAILED", error.message);
  }

  for (const row of (data ?? []) as unknown as KnowledgeIngestionJobRow[]) {
    const job = mapKnowledgeIngestionJob(row);

    if (job.documentId && !jobs.has(job.documentId)) {
      jobs.set(job.documentId, job);
    }
  }

  return jobs;
}

function mapKnowledgeDocument(row: KnowledgeDocumentRow): KnowledgeDocumentDto {
  return {
    id: row.id,
    scope: row.scope,
    merchantId: row.merchant_id,
    title: row.title,
    sourceName: row.source_name,
    storageProvider: row.storage_provider,
    bucketName: row.bucket_name,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    status: row.status,
    summaryText: row.summary_text,
    metadata: toRecord(row.metadata),
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapKnowledgeChunk(row: KnowledgeChunkRow): KnowledgeChunkDto {
  return {
    id: row.id,
    documentId: row.document_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    tokenCount: row.token_count,
    metadata: toRecord(row.metadata),
    createdAt: row.created_at,
  };
}

function mapKnowledgeIngestionJob(row: KnowledgeIngestionJobRow): KnowledgeIngestionJobDto {
  return {
    id: row.id,
    documentId: row.document_id,
    merchantId: row.merchant_id,
    jobType: row.job_type,
    status: row.status,
    inputPayload: toRecord(row.input_payload),
    logPayload: toRecord(row.log_payload),
    errorSummary: row.error_summary,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildSearchTerms(query: string): string[] {
  const normalized = normalizeText(query);
  const terms = new Set<string>();

  if (normalized.length > 0 && normalized.length <= 80) {
    terms.add(normalized);
  }

  for (const term of normalized.split(/[\s,，。.!！?？;；:：、/\\|()[\]{}<>《》"'“”‘’]+/)) {
    if (term.length >= 2) {
      terms.add(term);
    }
  }

  for (const phrase of normalized.match(/\p{Script=Han}{2,}/gu) ?? []) {
    if (phrase.length <= 12) {
      terms.add(phrase);
    }

    for (let index = 0; index < phrase.length - 1; index += 1) {
      terms.add(phrase.slice(index, index + 2));
    }
  }

  return Array.from(terms).slice(0, 40);
}

function scoreText(text: string, terms: string[]) {
  if (terms.length === 0) {
    return 0;
  }

  const normalized = normalizeText(text);
  return terms.reduce((score, term) => score + countTermOccurrences(normalized, term), 0);
}

function countTermOccurrences(text: string, term: string) {
  if (!term) {
    return 0;
  }

  let count = 0;
  let offset = text.indexOf(term);

  while (offset !== -1) {
    count += 1;
    offset = text.indexOf(term, offset + term.length);
  }

  return count;
}

function toPgVector(embedding: number[]) {
  return `[${embedding.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

const knowledgeDocumentSelect = [
  "id",
  "scope",
  "merchant_id",
  "title",
  "source_name",
  "storage_provider",
  "bucket_name",
  "storage_key",
  "mime_type",
  "status",
  "summary_text",
  "metadata",
  "created_by_user_id",
  "created_at",
  "updated_at",
].join(", ");

const knowledgeChunkSelect = [
  "id",
  "document_id",
  "chunk_index",
  "content",
  "token_count",
  "metadata",
  "created_at",
].join(", ");

const knowledgeIngestionJobSelect = [
  "id",
  "document_id",
  "merchant_id",
  "job_type",
  "status",
  "input_payload",
  "log_payload",
  "error_summary",
  "finished_at",
  "created_at",
  "updated_at",
].join(", ");
