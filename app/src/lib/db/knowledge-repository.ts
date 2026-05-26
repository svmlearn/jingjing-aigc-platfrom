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
import { isLocalDemoRuntime } from "@/lib/demo/local-demo-runtime";
import {
  mapPostgresError,
  queryAppDb,
  withAppDbTransaction,
} from "@/lib/server-db/postgres";
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
  created_at: string | Date;
  updated_at: string | Date;
};

type KnowledgeChunkRow = {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  token_count: number;
  metadata: unknown;
  embedding?: unknown;
  created_at: string | Date;
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
  finished_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

const demoKnowledgeDocuments = new Map<string, KnowledgeDocumentDto>();
const demoKnowledgeChunks = new Map<string, KnowledgeChunkDto[]>();
const demoKnowledgeJobs = new Map<string, KnowledgeIngestionJobDto>();

export async function listKnowledgeDocuments(input: {
  scope?: KnowledgeDocumentDto["scope"];
  merchantId?: string | null;
  limit?: number;
} = {}): Promise<KnowledgeDocumentWithStatsDto[]> {
  if (isLocalDemoRuntime()) {
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

  try {
    const filters: string[] = [];
    const values: unknown[] = [];

    if (input.scope) {
      values.push(input.scope);
      filters.push(`scope = $${values.length}`);
    }

    if (input.merchantId !== undefined) {
      if (input.merchantId === null) {
        filters.push("merchant_id is null");
      } else {
        values.push(input.merchantId);
        filters.push(`merchant_id = $${values.length}`);
      }
    }

    values.push(input.limit ?? 100);
    const result = await queryAppDb<KnowledgeDocumentRow>(
      `
      select ${knowledgeDocumentSelect}
      from public.knowledge_documents
      ${filters.length ? `where ${filters.join(" and ")}` : ""}
      order by created_at desc
      limit $${values.length}
      `,
      values,
    );
    const documents = result.rows.map(mapKnowledgeDocument);

    return attachKnowledgeDocumentStats(documents);
  } catch (error) {
    throw mapPostgresError(error, "KNOWLEDGE_DOCUMENTS_LIST_FAILED");
  }
}

export async function getKnowledgeDocumentById(
  documentId: string,
): Promise<KnowledgeDocumentWithStatsDto> {
  if (isLocalDemoRuntime()) {
    const document = demoKnowledgeDocuments.get(documentId);

    if (!document) {
      throw new ApiError(404, "KNOWLEDGE_DOCUMENT_NOT_FOUND", "Knowledge document not found.");
    }

    const [documentWithStats] = await attachKnowledgeDocumentStats([document]);
    return documentWithStats;
  }

  try {
    const result = await queryAppDb<KnowledgeDocumentRow>(
      `
      select ${knowledgeDocumentSelect}
      from public.knowledge_documents
      where id = $1
      limit 1
      `,
      [documentId],
    );
    const row = result.rows[0];

    if (!row) {
      throw new ApiError(404, "KNOWLEDGE_DOCUMENT_NOT_FOUND", "Knowledge document not found.");
    }

    const [document] = await attachKnowledgeDocumentStats([mapKnowledgeDocument(row)]);
    return document;
  } catch (error) {
    throw mapPostgresError(error, "KNOWLEDGE_DOCUMENT_FETCH_FAILED");
  }
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
  if (isLocalDemoRuntime()) {
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

  try {
    const result = await queryAppDb<KnowledgeDocumentRow>(
      `
      insert into public.knowledge_documents (
        id,
        scope,
        merchant_id,
        title,
        source_name,
        storage_provider,
        bucket_name,
        storage_key,
        mime_type,
        status,
        summary_text,
        metadata,
        created_by_user_id
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
      returning ${knowledgeDocumentSelect}
      `,
      [
        input.id,
        input.scope,
        input.merchantId ?? null,
        input.title,
        input.sourceName ?? null,
        input.storageProvider,
        input.bucketName ?? null,
        input.storageKey ?? null,
        input.mimeType ?? null,
        input.status ?? "uploaded",
        input.summaryText ?? null,
        JSON.stringify(input.metadata ?? {}),
        input.createdByUserId ?? null,
      ],
    );

    return mapKnowledgeDocument(result.rows[0]);
  } catch (error) {
    throw mapPostgresError(error, "KNOWLEDGE_DOCUMENT_CREATE_FAILED");
  }
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
  if (isLocalDemoRuntime()) {
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

  try {
    const patch = buildKnowledgeDocumentPostgresPatch(input);

    if (patch.assignments.length === 0) {
      return getKnowledgeDocumentById(input.documentId);
    }

    const result = await queryAppDb<KnowledgeDocumentRow>(
      `
      update public.knowledge_documents
      set ${patch.assignments.join(", ")},
          updated_at = timezone('utc', now())
      where id = $${patch.values.length + 1}
      returning ${knowledgeDocumentSelect}
      `,
      [...patch.values, input.documentId],
    );
    const row = result.rows[0];

    if (!row) {
      throw new ApiError(404, "KNOWLEDGE_DOCUMENT_NOT_FOUND", "Knowledge document not found.");
    }

    return mapKnowledgeDocument(row);
  } catch (error) {
    throw mapPostgresError(error, "KNOWLEDGE_DOCUMENT_UPDATE_FAILED");
  }
}

export async function deleteKnowledgeDocument(documentId: string): Promise<void> {
  if (isLocalDemoRuntime()) {
    demoKnowledgeDocuments.delete(documentId);
    demoKnowledgeChunks.delete(documentId);

    for (const [jobId, job] of demoKnowledgeJobs.entries()) {
      if (job.documentId === documentId) {
        demoKnowledgeJobs.delete(jobId);
      }
    }

    return;
  }

  try {
    await queryAppDb(
      `
      delete from public.knowledge_documents
      where id = $1
      `,
      [documentId],
    );
  } catch (error) {
    throw mapPostgresError(error, "KNOWLEDGE_DOCUMENT_DELETE_FAILED");
  }
}

export async function createKnowledgeIngestionJob(input: {
  documentId: string;
  merchantId?: string | null;
  status?: KnowledgeIngestionJobDto["status"];
  inputPayload?: Record<string, unknown>;
  logPayload?: Record<string, unknown>;
}): Promise<KnowledgeIngestionJobDto> {
  if (isLocalDemoRuntime()) {
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

  try {
    const result = await queryAppDb<KnowledgeIngestionJobRow>(
      `
      insert into public.knowledge_ingestion_jobs (
        document_id,
        merchant_id,
        status,
        input_payload,
        log_payload
      ) values ($1, $2, $3, $4::jsonb, $5::jsonb)
      returning ${knowledgeIngestionJobSelect}
      `,
      [
        input.documentId,
        input.merchantId ?? null,
        input.status ?? "pending",
        JSON.stringify(input.inputPayload ?? {}),
        JSON.stringify(input.logPayload ?? {}),
      ],
    );

    return mapKnowledgeIngestionJob(result.rows[0]);
  } catch (error) {
    throw mapPostgresError(error, "KNOWLEDGE_INGESTION_JOB_CREATE_FAILED");
  }
}

export async function updateKnowledgeIngestionJob(input: {
  jobId: string;
  status?: KnowledgeIngestionJobDto["status"];
  logPayload?: Record<string, unknown>;
  errorSummary?: string | null;
  finishedAt?: string | null;
}): Promise<KnowledgeIngestionJobDto> {
  if (isLocalDemoRuntime()) {
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

  try {
    const patch = buildKnowledgeIngestionJobPostgresPatch(input);
    const assignments = [...patch.assignments, "updated_at = timezone('utc', now())"];

    const result = await queryAppDb<KnowledgeIngestionJobRow>(
      `
      update public.knowledge_ingestion_jobs
      set ${assignments.join(", ")}
      where id = $${patch.values.length + 1}
      returning ${knowledgeIngestionJobSelect}
      `,
      [...patch.values, input.jobId],
    );
    const row = result.rows[0];

    if (!row) {
      throw new ApiError(404, "KNOWLEDGE_INGESTION_JOB_NOT_FOUND", "Knowledge job not found.");
    }

    return mapKnowledgeIngestionJob(row);
  } catch (error) {
    throw mapPostgresError(error, "KNOWLEDGE_INGESTION_JOB_UPDATE_FAILED");
  }
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
  if (isLocalDemoRuntime()) {
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

  try {
    return await withAppDbTransaction(async (client) => {
      await client.query("delete from public.knowledge_chunks where document_id = $1", [
        input.documentId,
      ]);

      if (input.chunks.length === 0) {
        return [];
      }

      const inserted: KnowledgeChunkRow[] = [];
      for (const chunk of input.chunks) {
        const result = await client.query<KnowledgeChunkRow>(
          `
          insert into public.knowledge_chunks (
            document_id,
            chunk_index,
            content,
            token_count,
            metadata,
            embedding_dimensions,
            embedding_json
          ) values ($1, $2, $3, $4, $5::jsonb, $6, $7::double precision[])
          returning ${knowledgeChunkSelect}
          `,
          [
            input.documentId,
            chunk.chunkIndex,
            chunk.content,
            chunk.tokenCount,
            JSON.stringify(chunk.metadata ?? {}),
            chunk.embedding?.length ?? null,
            chunk.embedding ?? null,
          ],
        );
        inserted.push(result.rows[0]);
      }

      return inserted.sort((a, b) => a.chunk_index - b.chunk_index).map(mapKnowledgeChunk);
    });
  } catch (error) {
    throw mapPostgresError(error, "KNOWLEDGE_CHUNKS_REPLACE_FAILED");
  }
}

export async function listKnowledgeChunksByDocumentId(
  documentId: string,
): Promise<KnowledgeChunkDto[]> {
  if (isLocalDemoRuntime()) {
    return [...(demoKnowledgeChunks.get(documentId) ?? [])].sort(
      (a, b) => a.chunkIndex - b.chunkIndex,
    );
  }

  try {
    const result = await queryAppDb<KnowledgeChunkRow>(
      `
      select ${knowledgeChunkSelect}
      from public.knowledge_chunks
      where document_id = $1
      order by chunk_index asc
      `,
      [documentId],
    );

    return result.rows.map(mapKnowledgeChunk);
  } catch (error) {
    throw mapPostgresError(error, "KNOWLEDGE_CHUNKS_LIST_FAILED");
  }
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

  if (isLocalDemoRuntime()) {
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

  try {
    const result = await queryAppDb<KnowledgeChunkRow>(
      `
      select ${knowledgeChunkSelect}
      from public.knowledge_chunks
      where document_id = any($1::uuid[])
      order by document_id, chunk_index asc
      limit 1000
      `,
      [documentIds],
    );

    for (const row of result.rows) {
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
  } catch (error) {
    throw mapPostgresError(error, "KNOWLEDGE_SEARCH_FAILED");
  }
}

async function attachKnowledgeDocumentStats(
  documents: KnowledgeDocumentDto[],
): Promise<KnowledgeDocumentWithStatsDto[]> {
  if (documents.length === 0) {
    return [];
  }

  if (isLocalDemoRuntime()) {
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

  try {
    const result = await queryAppDb<{
      document_id: string;
      count: string;
    }>(
      `
      select document_id, count(*)::text as count
      from public.knowledge_chunks
      where document_id = any($1::uuid[])
      group by document_id
      `,
      [documentIds],
    );

    for (const row of result.rows) {
      counts.set(row.document_id, Number.parseInt(row.count, 10) || 0);
    }

    return counts;
  } catch (error) {
    throw mapPostgresError(error, "KNOWLEDGE_CHUNKS_COUNT_FAILED");
  }
}

async function listLatestKnowledgeJobsByDocumentIds(documentIds: string[]) {
  const jobs = new Map<string, KnowledgeIngestionJobDto>();

  if (documentIds.length === 0) {
    return jobs;
  }

  try {
    const result = await queryAppDb<KnowledgeIngestionJobRow>(
      `
      select distinct on (document_id)
        ${knowledgeIngestionJobSelect}
      from public.knowledge_ingestion_jobs
      where document_id = any($1::uuid[])
      order by document_id, created_at desc, id desc
      `,
      [documentIds],
    );

    for (const row of result.rows) {
      const job = mapKnowledgeIngestionJob(row);

      if (job.documentId) {
        jobs.set(job.documentId, job);
      }
    }

    return jobs;
  } catch (error) {
    throw mapPostgresError(error, "KNOWLEDGE_JOBS_LIST_FAILED");
  }
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
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
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
    createdAt: toIsoString(row.created_at),
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
    finishedAt: toNullableIsoString(row.finished_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function buildKnowledgeDocumentPostgresPatch(input: {
  title?: string;
  sourceName?: string | null;
  status?: KnowledgeDocumentStatus;
  summaryText?: string | null;
  metadata?: Record<string, unknown>;
  bucketName?: string | null;
  storageKey?: string | null;
}) {
  const assignments: string[] = [];
  const values: unknown[] = [];

  function add(column: string, value: unknown, cast = "") {
    values.push(value);
    assignments.push(`${column} = $${values.length}${cast}`);
  }

  if (input.status !== undefined) add("status", input.status);
  if (input.title !== undefined) add("title", input.title);
  if (input.sourceName !== undefined) add("source_name", input.sourceName);
  if (input.summaryText !== undefined) add("summary_text", input.summaryText);
  if (input.metadata !== undefined) {
    add("metadata", JSON.stringify(input.metadata), "::jsonb");
  }
  if (input.bucketName !== undefined) add("bucket_name", input.bucketName);
  if (input.storageKey !== undefined) add("storage_key", input.storageKey);

  return { assignments, values };
}

function buildKnowledgeIngestionJobPostgresPatch(input: {
  status?: KnowledgeIngestionJobDto["status"];
  logPayload?: Record<string, unknown>;
  errorSummary?: string | null;
  finishedAt?: string | null;
}) {
  const assignments: string[] = [];
  const values: unknown[] = [];

  function add(column: string, value: unknown, cast = "") {
    values.push(value);
    assignments.push(`${column} = $${values.length}${cast}`);
  }

  if (input.status !== undefined) add("status", input.status);
  if (input.logPayload !== undefined) {
    add("log_payload", JSON.stringify(input.logPayload), "::jsonb");
  }
  if (input.errorSummary !== undefined) add("error_summary", input.errorSummary);
  if (input.finishedAt !== undefined) add("finished_at", input.finishedAt);

  return { assignments, values };
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function toNullableIsoString(value: string | Date | null) {
  return value ? toIsoString(value) : null;
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
