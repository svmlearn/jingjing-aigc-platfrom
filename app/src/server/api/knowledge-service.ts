import "server-only";

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import type {
  KnowledgeDocumentDto,
  KnowledgeDocumentWithStatsDto,
} from "@/contracts/knowledge";
import {
  createKnowledgeDocument,
  createKnowledgeIngestionJob,
  deleteKnowledgeDocument,
  getKnowledgeDocumentById,
  listKnowledgeChunksByDocumentId,
  listKnowledgeDocuments,
  replaceKnowledgeChunks,
  updateKnowledgeDocument,
  updateKnowledgeIngestionJob,
} from "@/lib/db/knowledge-repository";
import { getPlatformSettings } from "@/lib/db/platform-admin-repository";
import {
  buildKnowledgeCosObjectKey,
  putCosObject,
} from "@/server/api/cos";
import { AiRuntimeError, createEmbeddings, getAiRuntimeApiKey } from "@/server/api/ai-runtime";
import { ApiError } from "@/server/api/errors";

type KnowledgeUploadFileInput = {
  fileName: string;
  mimeType?: string | null;
  sizeBytes: number;
  body: Buffer;
};

type KnowledgeUploadInput = {
  title?: string | null;
  scope: KnowledgeDocumentDto["scope"];
  merchantId?: string | null;
  sourceName?: string | null;
  textContent?: string | null;
  file?: KnowledgeUploadFileInput | null;
};

const maxKnowledgeDocumentBytes = 10 * 1024 * 1024;

const contextThreatPatterns: Array<[RegExp, string]> = [
  [/ignore\s+(previous|all|above|prior)\s+instructions/i, "prompt_injection"],
  [/do\s+not\s+tell\s+the\s+user/i, "deception_hide"],
  [/system\s+prompt\s+override/i, "sys_prompt_override"],
  [/disregard\s+(your|all|any)\s+(instructions|rules|guidelines)/i, "disregard_rules"],
  [/<!--[^>]*(?:ignore|override|system|secret|hidden)[^>]*-->/i, "html_comment_injection"],
  [/<\s*div\s+style\s*=\s*["'][\s\S]*?display\s*:\s*none/i, "hidden_div"],
  [/curl\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)/i, "exfil_curl"],
  [/cat\s+[^\n]*(\.env|credentials|\.netrc|\.pgpass)/i, "read_secrets"],
];

const contextInvisibleChars = new Set([
  "\u200b",
  "\u200c",
  "\u200d",
  "\u2060",
  "\ufeff",
  "\u202a",
  "\u202b",
  "\u202c",
  "\u202d",
  "\u202e",
]);

export async function listKnowledgeDocumentsForPlatformAdmin(): Promise<
  KnowledgeDocumentWithStatsDto[]
> {
  return listKnowledgeDocuments({ limit: 100 });
}

export async function getKnowledgeDocumentForPlatformAdmin(
  documentId: string,
): Promise<KnowledgeDocumentWithStatsDto> {
  return getKnowledgeDocumentById(documentId);
}

export async function deleteKnowledgeDocumentForPlatformAdmin(documentId: string): Promise<void> {
  await getKnowledgeDocumentById(documentId);
  await deleteKnowledgeDocument(documentId);
}

export async function uploadKnowledgeDocumentForPlatformAdmin(
  input: KnowledgeUploadInput,
): Promise<KnowledgeDocumentWithStatsDto> {
  if (input.scope === "merchant" && !input.merchantId) {
    throw new ApiError(
      400,
      "KNOWLEDGE_MERCHANT_ID_REQUIRED",
      "Merchant knowledge documents require a merchantId.",
    );
  }

  const prepared = prepareKnowledgeUpload(input);
  const documentId = randomUUID();
  const storage = await uploadSourceToCos({
    documentId,
    scope: input.scope,
    merchantId: input.merchantId,
    sourceName: prepared.sourceName,
    mimeType: prepared.mimeType,
    body: prepared.body,
  });
  const document = await createKnowledgeDocument({
    id: documentId,
    scope: input.scope,
    merchantId: input.scope === "merchant" ? input.merchantId : null,
    title: prepared.title,
    sourceName: prepared.sourceName,
    storageProvider: "tencent_cos",
    bucketName: storage.bucketName,
    storageKey: storage.storageKey,
    mimeType: prepared.mimeType,
    status: "uploaded",
    summaryText: buildSummary(prepared.text),
    metadata: {
      sourceType: input.file ? "file" : "text",
      fileSizeBytes: prepared.body.length,
      cosEtag: storage.etag ?? null,
      cosUploadSkippedReason: storage.skippedReason ?? null,
      ingestionMode: "sync_demo_lexical",
      referenceProjects: [
        "references/open-source/hermes-agent/agent/prompt_builder.py",
        "references/open-source/AIWriteX/src/ai_write_x/core/unified_workflow.py",
        "references/open-source/AIWriteX/knowledge/templates/",
      ],
    },
  });

  return ingestKnowledgeDocumentText({
    document,
    text: prepared.text,
    reason: "upload",
  });
}

export async function retryKnowledgeDocumentIngestionForPlatformAdmin(
  documentId: string,
): Promise<KnowledgeDocumentWithStatsDto> {
  const document = await getKnowledgeDocumentById(documentId);
  const chunks = await listKnowledgeChunksByDocumentId(documentId);
  const sourceText = chunks.map((chunk) => chunk.content).join("\n\n").trim();

  if (!sourceText) {
    throw new ApiError(
      409,
      "KNOWLEDGE_RETRY_SOURCE_TEXT_MISSING",
      "This document has no local chunks to retry from. Please upload it again.",
    );
  }

  return ingestKnowledgeDocumentText({
    document,
    text: sourceText,
    reason: "retry",
  });
}

async function ingestKnowledgeDocumentText(input: {
  document: KnowledgeDocumentDto;
  text: string;
  reason: "upload" | "retry";
}): Promise<KnowledgeDocumentWithStatsDto> {
  const { llmRuntime, knowledgeRuntime } = await getPlatformSettings();
  const job = await createKnowledgeIngestionJob({
    documentId: input.document.id,
    merchantId: input.document.merchantId,
    status: "processing",
    inputPayload: {
      reason: input.reason,
      chunkSize: knowledgeRuntime.chunkSize,
      chunkOverlap: knowledgeRuntime.chunkOverlap,
      embeddingModel: knowledgeRuntime.embeddingModel,
      embeddingMode: getAiRuntimeApiKey() ? "enabled" : "pending",
    },
  });

  try {
    const contextScanFindings = scanContextThreats(input.text);

    if (contextScanFindings.length > 0) {
      throw new ApiError(
        422,
        "KNOWLEDGE_CONTEXT_INJECTION_RISK",
        "Knowledge document contains potential prompt-injection patterns and was not indexed.",
        { findings: contextScanFindings },
      );
    }

    await updateKnowledgeDocument({
      documentId: input.document.id,
      status: "processing",
    });

    const chunks = chunkKnowledgeText(input.text, {
      chunkSize: knowledgeRuntime.chunkSize,
      chunkOverlap: knowledgeRuntime.chunkOverlap,
    });

    if (chunks.length === 0) {
      throw new ApiError(
        400,
        "KNOWLEDGE_DOCUMENT_EMPTY",
        "Knowledge document content is empty after normalization.",
      );
    }

    const embeddingResult = await embedKnowledgeChunks({
      chunks,
      llmRuntime,
      knowledgeRuntime,
    });
    const insertedChunks = await replaceKnowledgeChunks({
      documentId: input.document.id,
      chunks: embeddingResult.chunks,
    });
    const finishedAt = new Date().toISOString();

    await updateKnowledgeDocument({
      documentId: input.document.id,
      status: "indexed",
      summaryText: buildSummary(input.text),
      metadata: {
        ...input.document.metadata,
        lastIngestedAt: finishedAt,
        lastIngestionJobId: job.id,
        chunkCount: insertedChunks.length,
        retrievalMode: embeddingResult.mode === "embedded" ? "vector" : "lexical",
        embeddingMode: embeddingResult.mode,
        embeddingModel: embeddingResult.model ?? knowledgeRuntime.embeddingModel,
        embeddingDimensions: embeddingResult.dimensions ?? null,
        contextScanFindings,
        contextInjectionPolicy: "hermes_prompt_builder_safe_context",
        workflowPattern: "AIWriteX unified input -> transform -> save",
      },
    });
    await updateKnowledgeIngestionJob({
      jobId: job.id,
      status: "succeeded",
      finishedAt,
      logPayload: {
        chunkCount: insertedChunks.length,
        retrievalMode: embeddingResult.mode === "embedded" ? "vector" : "lexical",
        embeddingMode: embeddingResult.mode,
        embeddingModel: embeddingResult.model ?? knowledgeRuntime.embeddingModel,
        embeddingDimensions: embeddingResult.dimensions ?? null,
        referenceProjects: [
          "hermes-agent/agent/prompt_builder.py",
          "AIWriteX/src/ai_write_x/core/unified_workflow.py",
        ],
      },
    });

    return getKnowledgeDocumentById(input.document.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Knowledge ingestion failed.";
    const finishedAt = new Date().toISOString();

    await updateKnowledgeDocument({
      documentId: input.document.id,
      status: "failed",
      metadata: {
        ...input.document.metadata,
        lastIngestionFailedAt: finishedAt,
        lastIngestionError: message,
      },
    });
    await updateKnowledgeIngestionJob({
      jobId: job.id,
      status: "failed",
      finishedAt,
      errorSummary: message,
      logPayload: {
        retrievalMode: "lexical",
        failedAt: finishedAt,
        referenceProjects: [
          "hermes-agent/agent/prompt_builder.py",
          "AIWriteX/src/ai_write_x/core/unified_workflow.py",
        ],
      },
    });

    throw error;
  }
}

function prepareKnowledgeUpload(input: KnowledgeUploadInput) {
  const fileText = input.file ? decodeKnowledgeFile(input.file) : null;
  const text = (fileText ?? input.textContent ?? "").trim();

  if (!text) {
    throw new ApiError(
      400,
      "KNOWLEDGE_DOCUMENT_TEXT_REQUIRED",
      "Please upload a text-like document or paste document content.",
    );
  }

  const body = input.file?.body ?? Buffer.from(text, "utf8");

  if (body.length > maxKnowledgeDocumentBytes) {
    throw new ApiError(
      413,
      "KNOWLEDGE_DOCUMENT_TOO_LARGE",
      `Knowledge documents are limited to ${maxKnowledgeDocumentBytes} bytes.`,
    );
  }

  const sourceName = (
    input.sourceName ??
    input.file?.fileName ??
    "platform-knowledge.txt"
  ).trim();
  const title = (input.title ?? sourceName.replace(/\.[^.]+$/, "")).trim();

  return {
    title: title || "未命名知识文档",
    sourceName,
    mimeType: input.file?.mimeType ?? "text/plain; charset=utf-8",
    body,
    text,
  };
}

function decodeKnowledgeFile(file: KnowledgeUploadFileInput) {
  if (file.sizeBytes > maxKnowledgeDocumentBytes) {
    throw new ApiError(
      413,
      "KNOWLEDGE_DOCUMENT_TOO_LARGE",
      `Knowledge documents are limited to ${maxKnowledgeDocumentBytes} bytes.`,
    );
  }

  if (!isTextLikeKnowledgeFile(file)) {
    throw new ApiError(
      415,
      "KNOWLEDGE_DOCUMENT_UNSUPPORTED",
      "Current demo ingestion supports txt, md, csv, json, yaml and other text-like files.",
    );
  }

  return file.body.toString("utf8");
}

function isTextLikeKnowledgeFile(file: KnowledgeUploadFileInput) {
  const mimeType = file.mimeType?.toLowerCase() ?? "";
  const fileName = file.fileName.toLowerCase();

  return (
    mimeType.startsWith("text/") ||
    mimeType.includes("json") ||
    mimeType.includes("markdown") ||
    mimeType.includes("csv") ||
    mimeType.includes("yaml") ||
    mimeType.includes("xml") ||
    /\.(txt|md|markdown|csv|json|jsonl|yaml|yml|xml)$/i.test(fileName)
  );
}

async function uploadSourceToCos(input: {
  documentId: string;
  scope: KnowledgeDocumentDto["scope"];
  merchantId?: string | null;
  sourceName: string;
  mimeType?: string | null;
  body: Buffer;
}): Promise<{
  bucketName?: string | null;
  storageKey?: string | null;
  etag?: string | null;
  skippedReason?: string | null;
}> {
  const storageKey = buildKnowledgeCosObjectKey({
    scope: input.scope,
    merchantId: input.merchantId,
    documentId: input.documentId,
    fileName: input.sourceName,
  });

  try {
    return await putCosObject({
      key: storageKey,
      body: input.body,
      contentType: input.mimeType,
    });
  } catch (error) {
    if (error instanceof ApiError && error.code === "COS_NOT_CONFIGURED") {
      return {
        bucketName: null,
        storageKey: null,
        skippedReason: "COS_NOT_CONFIGURED",
      };
    }

    throw new ApiError(
      500,
      "KNOWLEDGE_COS_UPLOAD_FAILED",
      error instanceof Error ? error.message : "Tencent COS upload failed.",
    );
  }
}

function chunkKnowledgeText(input: string, options: {
  chunkSize: number;
  chunkOverlap: number;
}) {
  const text = input.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  if (!text) {
    return [];
  }

  const chunkSize = Math.max(200, options.chunkSize);
  const chunkOverlap = Math.max(0, Math.min(options.chunkOverlap, chunkSize - 1));
  const chunks: Array<{
    chunkIndex: number;
    content: string;
    tokenCount: number;
    metadata: Record<string, unknown>;
  }> = [];
  let startOffset = 0;

  while (startOffset < text.length) {
    const endOffset = Math.min(text.length, startOffset + chunkSize);
    const content = text.slice(startOffset, endOffset).trim();

    if (content) {
      chunks.push({
        chunkIndex: chunks.length,
        content,
        tokenCount: estimateTokenCount(content),
        metadata: {
          startOffset,
          endOffset,
          embeddingStatus: getAiRuntimeApiKey() ? "queued" : "pending",
        },
      });
    }

    if (endOffset >= text.length) {
      break;
    }

    startOffset = Math.max(endOffset - chunkOverlap, startOffset + 1);
  }

  return chunks;
}

async function embedKnowledgeChunks(input: {
  chunks: ReturnType<typeof chunkKnowledgeText>;
  llmRuntime: Awaited<ReturnType<typeof getPlatformSettings>>["llmRuntime"];
  knowledgeRuntime: Awaited<ReturnType<typeof getPlatformSettings>>["knowledgeRuntime"];
}) {
  if (!getAiRuntimeApiKey()) {
    return {
      mode: "pending" as const,
      chunks: input.chunks.map((chunk) => ({
        ...chunk,
        metadata: {
          ...chunk.metadata,
          embeddingStatus: "pending",
          embeddingReason: "AI_RUNTIME_API_KEY_NOT_CONFIGURED",
        },
      })),
    };
  }

  try {
    const result = await createEmbeddings({
      runtime: input.llmRuntime,
      knowledgeRuntime: input.knowledgeRuntime,
      input: input.chunks.map((chunk) => chunk.content),
    });

    if (result.embeddings.length !== input.chunks.length) {
      throw new AiRuntimeError(
        `Embedding count mismatch. Expected ${input.chunks.length}, got ${result.embeddings.length}.`,
      );
    }

    return {
      mode: "embedded" as const,
      model: result.model,
      dimensions: result.dimensions,
      chunks: input.chunks.map((chunk, index) => ({
        ...chunk,
        embedding: result.embeddings[index],
        metadata: {
          ...chunk.metadata,
          embeddingStatus: "embedded",
          embeddingModel: result.model,
          embeddingDimensions: result.dimensions,
        },
      })),
    };
  } catch (error) {
    throw new ApiError(
      502,
      "KNOWLEDGE_EMBEDDING_FAILED",
      error instanceof Error ? error.message : "Knowledge embedding failed.",
      error instanceof AiRuntimeError ? error.details : undefined,
    );
  }
}

function estimateTokenCount(content: string) {
  return Math.max(1, Math.ceil(content.length / 1.6));
}

function buildSummary(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 180 ? `${normalized.slice(0, 180)}...` : normalized;
}

function scanContextThreats(content: string) {
  const findings: string[] = [];

  for (const char of contextInvisibleChars) {
    if (content.includes(char)) {
      findings.push(`invisible_unicode_U+${char.charCodeAt(0).toString(16).toUpperCase()}`);
    }
  }

  for (const [pattern, id] of contextThreatPatterns) {
    if (pattern.test(content)) {
      findings.push(id);
    }
  }

  return Array.from(new Set(findings));
}
