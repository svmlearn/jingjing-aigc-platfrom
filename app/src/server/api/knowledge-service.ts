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
  createdByUserId?: string | null;
  sourceName?: string | null;
  textContent?: string | null;
  file?: KnowledgeUploadFileInput | null;
  metadata?: Record<string, unknown>;
};

const maxKnowledgeDocumentBytes = 10 * 1024 * 1024;
const maxMerchantMemoryChars = 1000;

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
  return listKnowledgeDocuments({
    scope: "platform",
    merchantId: null,
    limit: 100,
  });
}

export async function getKnowledgeDocumentForPlatformAdmin(
  documentId: string,
): Promise<KnowledgeDocumentWithStatsDto> {
  const document = await getKnowledgeDocumentById(documentId);

  if (document.scope !== "platform") {
    throw new ApiError(
      404,
      "PLATFORM_KNOWLEDGE_DOCUMENT_NOT_FOUND",
      "平台方法论文档不存在或无权访问。",
    );
  }

  return document;
}

export async function deleteKnowledgeDocumentForPlatformAdmin(documentId: string): Promise<void> {
  await getKnowledgeDocumentForPlatformAdmin(documentId);
  await deleteKnowledgeDocument(documentId);
}

export async function uploadKnowledgeDocumentForPlatformAdmin(
  input: KnowledgeUploadInput,
): Promise<KnowledgeDocumentWithStatsDto> {
  if (input.scope !== "platform") {
    throw new ApiError(
      400,
      "PLATFORM_KNOWLEDGE_SCOPE_REQUIRED",
      "平台后台只能维护平台方法论知识库。",
    );
  }

  return uploadKnowledgeDocument({
    ...input,
    scope: "platform",
    merchantId: null,
    metadata: {
      contentKind: "platform_methodology",
      chunkPolicy: "auto",
      ...input.metadata,
    },
  });
}

export async function listKnowledgeDocumentsForMerchant(
  merchantId: string,
): Promise<KnowledgeDocumentWithStatsDto[]> {
  return listKnowledgeDocuments({
    scope: "merchant",
    merchantId,
    limit: 100,
  });
}

export async function uploadKnowledgeDocumentForMerchant(input: {
  merchantId: string;
  createdByUserId?: string | null;
  title?: string | null;
  file: KnowledgeUploadFileInput;
}): Promise<KnowledgeDocumentWithStatsDto> {
  const title = prepareRequiredTitle(input.title, "资料名称必填。");

  if (!isMerchantKnowledgeFile(input.file)) {
    throw new ApiError(
      415,
      "MERCHANT_KNOWLEDGE_FILE_UNSUPPORTED",
      "商家知识库上传仅支持 txt 或 md 文件。",
    );
  }

  return uploadKnowledgeDocument({
    scope: "merchant",
    merchantId: input.merchantId,
    createdByUserId: input.createdByUserId,
    title,
    sourceName: input.file.fileName,
    file: input.file,
    metadata: {
      sourceType: "file",
      contentKind: "merchant_document",
      chunkPolicy: "auto",
    },
  });
}

export async function createMerchantMemoryForMerchant(input: {
  merchantId: string;
  createdByUserId?: string | null;
  title?: string | null;
  textContent?: string | null;
}): Promise<KnowledgeDocumentWithStatsDto> {
  const title = prepareRequiredTitle(input.title, "商家记忆名称必填。");
  const text = prepareMerchantMemoryText(input.textContent);
  const document = await createKnowledgeDocument({
    id: randomUUID(),
    scope: "merchant",
    merchantId: input.merchantId,
    title,
    sourceName: `${title}.txt`,
    storageProvider: "supabase_storage",
    bucketName: null,
    storageKey: null,
    mimeType: "text/plain; charset=utf-8",
    status: "uploaded",
    summaryText: buildSummary(text),
    metadata: {
      sourceType: "memory",
      contentKind: "merchant_memory",
      chunkPolicy: "single",
      sourceText: text,
      fileSizeBytes: Buffer.byteLength(text, "utf8"),
    },
    createdByUserId: input.createdByUserId,
  });

  return ingestKnowledgeDocumentText({
    document,
    text,
    reason: "upload",
  });
}

export async function updateKnowledgeDocumentForMerchant(input: {
  merchantId: string;
  documentId: string;
  title?: string | null;
  textContent?: string | null;
}): Promise<KnowledgeDocumentWithStatsDto> {
  const document = await getMerchantOwnedKnowledgeDocument({
    merchantId: input.merchantId,
    documentId: input.documentId,
  });
  const isMemory = document.metadata.contentKind === "merchant_memory";
  const title =
    input.title !== undefined
      ? prepareRequiredTitle(input.title, "名称必填。")
      : undefined;

  if (!isMemory && input.textContent !== undefined) {
    throw new ApiError(
      400,
      "MERCHANT_KNOWLEDGE_FILE_BODY_IMMUTABLE",
      "文件型商家资料不支持在线修改正文，请删除后重新上传。",
    );
  }

  if (isMemory && input.textContent !== undefined) {
    const text = prepareMerchantMemoryText(input.textContent);
    const updated = await updateKnowledgeDocument({
      documentId: document.id,
      title,
      sourceName: title ? `${title}.txt` : undefined,
      status: "uploaded",
      summaryText: buildSummary(text),
      metadata: {
        ...document.metadata,
        sourceType: "memory",
        contentKind: "merchant_memory",
        chunkPolicy: "single",
        sourceText: text,
        fileSizeBytes: Buffer.byteLength(text, "utf8"),
      },
    });

    return ingestKnowledgeDocumentText({
      document: updated,
      text,
      reason: "retry",
    });
  }

  if (title === undefined) {
    return document;
  }

  await updateKnowledgeDocument({
    documentId: document.id,
    title,
    sourceName: isMemory ? `${title}.txt` : undefined,
  });

  return getKnowledgeDocumentById(document.id);
}

export async function deleteKnowledgeDocumentForMerchant(input: {
  merchantId: string;
  documentId: string;
}): Promise<void> {
  await getMerchantOwnedKnowledgeDocument(input);
  await deleteKnowledgeDocument(input.documentId);
}

export async function retryKnowledgeDocumentIngestionForMerchant(input: {
  merchantId: string;
  documentId: string;
}): Promise<KnowledgeDocumentWithStatsDto> {
  const document = await getMerchantOwnedKnowledgeDocument(input);
  const sourceText =
    typeof document.metadata.sourceText === "string"
      ? document.metadata.sourceText.trim()
      : "";

  if (sourceText) {
    return ingestKnowledgeDocumentText({
      document,
      text: sourceText,
      reason: "retry",
    });
  }

  const chunks = await listKnowledgeChunksByDocumentId(input.documentId);
  const chunkText = chunks.map((chunk) => chunk.content).join("\n\n").trim();

  if (!chunkText) {
    throw new ApiError(
      409,
      "KNOWLEDGE_RETRY_SOURCE_TEXT_MISSING",
      "这条内容没有可用于重新处理的原文，请删除后重新上传。",
    );
  }

  return ingestKnowledgeDocumentText({
    document,
    text: chunkText,
    reason: "retry",
  });
}

async function uploadKnowledgeDocument(
  input: KnowledgeUploadInput,
): Promise<KnowledgeDocumentWithStatsDto> {
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
      ...input.metadata,
    },
    createdByUserId: input.createdByUserId,
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
  const document = await getKnowledgeDocumentForPlatformAdmin(documentId);
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

    const chunks = buildKnowledgeChunks(input.document, input.text, {
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

async function getMerchantOwnedKnowledgeDocument(input: {
  merchantId: string;
  documentId: string;
}) {
  const document = await getKnowledgeDocumentById(input.documentId);

  if (document.scope !== "merchant" || document.merchantId !== input.merchantId) {
    throw new ApiError(
      404,
      "MERCHANT_KNOWLEDGE_DOCUMENT_NOT_FOUND",
      "商家知识库内容不存在或无权访问。",
    );
  }

  return document;
}

function prepareRequiredTitle(input: string | null | undefined, message: string) {
  const title = input?.trim() ?? "";

  if (!title) {
    throw new ApiError(400, "MERCHANT_KNOWLEDGE_TITLE_REQUIRED", message);
  }

  if (Array.from(title).length > 120) {
    throw new ApiError(
      400,
      "MERCHANT_KNOWLEDGE_TITLE_TOO_LONG",
      "名称不能超过 120 个字符。",
    );
  }

  return title;
}

function prepareMerchantMemoryText(input: string | null | undefined) {
  const text = (input ?? "").trim();

  if (!text) {
    throw new ApiError(
      400,
      "MERCHANT_MEMORY_TEXT_REQUIRED",
      "商家记忆正文不能为空。",
    );
  }

  if (Array.from(text).length > maxMerchantMemoryChars) {
    throw new ApiError(
      400,
      "MERCHANT_MEMORY_TEXT_TOO_LONG",
      `商家记忆正文不能超过 ${maxMerchantMemoryChars} 个可见字符。`,
    );
  }

  return text;
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

function isMerchantKnowledgeFile(file: KnowledgeUploadFileInput) {
  const fileName = file.fileName.toLowerCase();

  return /\.(txt|md)$/i.test(fileName);
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

function buildKnowledgeChunks(input: KnowledgeDocumentDto, text: string, options: {
  chunkSize: number;
  chunkOverlap: number;
}): ReturnType<typeof chunkKnowledgeText> {
  if (input.metadata.chunkPolicy === "single") {
    const normalized = normalizeKnowledgeText(text);

    return normalized
      ? [
          {
            chunkIndex: 0,
            content: normalized,
            tokenCount: estimateTokenCount(normalized),
            metadata: {
              startOffset: 0,
              endOffset: normalized.length,
              embeddingStatus: getAiRuntimeApiKey() ? "queued" : "pending",
              chunkPolicy: "single",
            },
          },
        ]
      : [];
  }

  return chunkKnowledgeText(text, options);
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
  const text = normalizeKnowledgeText(input);

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

function normalizeKnowledgeText(input: string) {
  return input.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
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
