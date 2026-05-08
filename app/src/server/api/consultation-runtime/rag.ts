import type { KnowledgeSearchMatchDto } from "@/contracts/knowledge";
import {
  listKnowledgeChunksByDocumentId,
  listKnowledgeDocuments,
  searchKnowledgeChunks,
} from "@/lib/db/knowledge-repository";
import {
  createEmbeddings,
  getAiRuntimeApiKey,
} from "@/server/api/ai-runtime";
import type { ConsultationAgentLoopState } from "@/server/api/consultation-runtime/types";
import {
  isExplicitKnowledgeBaseReadRequest,
  toStringArrayValue,
  uniqueStrings,
} from "@/server/api/consultation-runtime/utils";

export async function retrieveConsultationKnowledge(input: {
  state: ConsultationAgentLoopState;
  query: string;
  topK: number;
  knowledgeDocumentIds: unknown;
}) {
  const expertKnowledgeDocumentIds = toStringArrayValue(input.knowledgeDocumentIds);
  const queryEmbedding = await embedKnowledgeQuery({
    query: input.query,
    state: input.state,
  });
  const shouldReadMerchantDocuments = isExplicitKnowledgeBaseReadRequest(input.query);
  const merchantDocumentMatches = shouldReadMerchantDocuments
    ? await listMerchantKnowledgeDocumentMatches({
        state: input.state,
        limit: input.topK,
      })
    : [];
  const matches =
    input.topK > 0
      ? mergeKnowledgeMatches(
          [
            ...merchantDocumentMatches,
            ...(shouldReadMerchantDocuments
              ? []
              : await searchKnowledgeChunks({
                  merchantId: input.state.merchant.id,
                  query: input.query,
                  limit: input.topK,
                  queryEmbedding: queryEmbedding.embedding,
                  documentIds: expertKnowledgeDocumentIds,
                })),
          ],
          input.topK,
        )
      : [];

  return {
    matches,
    payload: {
      retrievalMode: shouldReadMerchantDocuments
        ? "merchant_documents_direct"
        : queryEmbedding.embedding
          ? "vector_with_lexical_fallback"
          : "lexical",
      embeddingMode: queryEmbedding.mode,
      embeddingModel: queryEmbedding.model ?? input.state.knowledgeRuntime.embeddingModel,
      expertKnowledgeDocumentIds,
      merchantKnowledgeDocumentIds: uniqueStrings(
        merchantDocumentMatches.map((match) => match.documentId),
      ),
    },
  };
}

async function listMerchantKnowledgeDocumentMatches(input: {
  state: ConsultationAgentLoopState;
  limit: number;
}): Promise<KnowledgeSearchMatchDto[]> {
  if (input.limit <= 0) {
    return [];
  }

  const documents = (
    await listKnowledgeDocuments({
      scope: "merchant",
      merchantId: input.state.merchant.id,
      limit: 50,
    })
  ).filter((document) => document.status === "indexed" && document.chunkCount > 0);
  const chunksByDocument = await Promise.all(
    documents.map(async (document) => ({
      document,
      chunks: await listKnowledgeChunksByDocumentId(document.id),
    })),
  );
  const matches: KnowledgeSearchMatchDto[] = [];

  for (let chunkIndex = 0; matches.length < input.limit; chunkIndex += 1) {
    let addedThisRound = false;

    for (const entry of chunksByDocument) {
      const chunk = entry.chunks[chunkIndex];

      if (!chunk) {
        continue;
      }

      matches.push({
        chunkId: chunk.id,
        documentId: entry.document.id,
        documentTitle: entry.document.title,
        sourceName: entry.document.sourceName,
        scope: entry.document.scope,
        merchantId: entry.document.merchantId,
        content: chunk.content,
        score: 1 - chunkIndex * 0.01,
        chunkIndex: chunk.chunkIndex,
        metadata: chunk.metadata,
      });
      addedThisRound = true;

      if (matches.length >= input.limit) {
        break;
      }
    }

    if (!addedThisRound) {
      break;
    }
  }

  return matches;
}

function mergeKnowledgeMatches(
  matches: KnowledgeSearchMatchDto[],
  limit: number,
): KnowledgeSearchMatchDto[] {
  const seen = new Set<string>();
  const merged: KnowledgeSearchMatchDto[] = [];

  for (const match of matches) {
    if (seen.has(match.chunkId)) {
      continue;
    }

    seen.add(match.chunkId);
    merged.push(match);

    if (merged.length >= limit) {
      break;
    }
  }

  return merged;
}

async function embedKnowledgeQuery(input: {
  query: string;
  state: ConsultationAgentLoopState;
}): Promise<{
  embedding: number[] | null;
  mode: "embedded" | "not_configured" | "failed" | "empty";
  model?: string;
}> {
  if (!input.query.trim()) {
    return { embedding: null, mode: "empty" };
  }

  if (!getAiRuntimeApiKey()) {
    return { embedding: null, mode: "not_configured" };
  }

  try {
    const result = await createEmbeddings({
      runtime: input.state.llmRuntime,
      knowledgeRuntime: input.state.knowledgeRuntime,
      input: input.query,
    });

    return {
      embedding: result.embeddings[0] ?? null,
      mode: "embedded",
      model: result.model,
    };
  } catch {
    return { embedding: null, mode: "failed" };
  }
}
