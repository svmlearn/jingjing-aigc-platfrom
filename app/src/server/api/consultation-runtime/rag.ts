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
  const shouldReadMerchantDocuments = isExplicitKnowledgeBaseReadRequest(input.query);

  if (input.topK <= 0) {
    return {
      matches: [],
      payload: {
        retrievalMode: "hybrid_empty_top_k",
        retrievalStrategy: {
          strategy: "consultation_hybrid_rag_v1",
          sources: [],
          directMerchantDocumentScan: shouldReadMerchantDocuments,
        },
        embeddingMode: "empty",
        embeddingModel: input.state.knowledgeRuntime.embeddingModel,
        expertKnowledgeDocumentIds,
        merchantKnowledgeDocumentIds: [],
      },
    };
  }

  const queryEmbedding = await embedKnowledgeQuery({
    query: input.query,
    state: input.state,
  });
  const searchLimit = Math.max(input.topK, input.topK * 2);
  const [merchantDocumentMatches, keywordMatches, vectorMatches] = await Promise.all([
    shouldReadMerchantDocuments
      ? listMerchantKnowledgeDocumentMatches({
          state: input.state,
          limit: searchLimit,
        })
      : Promise.resolve([]),
    searchKnowledgeChunks({
      merchantId: input.state.merchant.id,
      query: input.query,
      limit: searchLimit,
      documentIds: expertKnowledgeDocumentIds,
    }),
    queryEmbedding.embedding
      ? searchKnowledgeChunks({
          merchantId: input.state.merchant.id,
          query: input.query,
          limit: searchLimit,
          queryEmbedding: queryEmbedding.embedding,
          documentIds: expertKnowledgeDocumentIds,
        })
      : Promise.resolve([]),
  ]);
  const matchGroups = [
    {
      source: "direct_merchant_document_scan",
      matches: merchantDocumentMatches,
    },
    {
      source: "keyword_search",
      matches: keywordMatches,
    },
    {
      source: "semantic_vector_search",
      matches: vectorMatches,
    },
  ];
  const matches = mergeKnowledgeMatches(matchGroups, input.topK);

  return {
    matches,
    payload: {
      retrievalMode: buildRetrievalMode({
        shouldReadMerchantDocuments,
        hasKeywordMatches: keywordMatches.length > 0,
        hasVectorMatches: vectorMatches.length > 0,
        hasEmbedding: Boolean(queryEmbedding.embedding),
      }),
      retrievalStrategy: {
        strategy: "consultation_hybrid_rag_v1",
        sources: matchGroups
          .filter((group) => group.matches.length > 0)
          .map((group) => group.source),
        directMerchantDocumentScan: shouldReadMerchantDocuments,
        topK: input.topK,
        searchLimit,
      },
      sourceCounts: {
        directMerchantDocumentScan: merchantDocumentMatches.length,
        keywordSearch: keywordMatches.length,
        semanticVectorSearch: vectorMatches.length,
      },
      embeddingMode: queryEmbedding.mode,
      embeddingModel: queryEmbedding.model ?? input.state.knowledgeRuntime.embeddingModel,
      expertKnowledgeDocumentIds,
      merchantKnowledgeDocumentIds: uniqueStrings(
        matches
          .filter((match) => match.scope === "merchant")
          .map((match) => match.documentId),
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
  groups: Array<{ source: string; matches: KnowledgeSearchMatchDto[] }>,
  limit: number,
): KnowledgeSearchMatchDto[] {
  const seen = new Set<string>();
  const merged: KnowledgeSearchMatchDto[] = [];
  const maxGroupLength = Math.max(0, ...groups.map((group) => group.matches.length));

  for (let index = 0; index < maxGroupLength && merged.length < limit; index += 1) {
    for (const group of groups) {
      const match = group.matches[index];

      if (!match || seen.has(match.chunkId)) {
        continue;
      }

      seen.add(match.chunkId);
      merged.push({
        ...match,
        metadata: {
          ...match.metadata,
          retrievalSource: group.source,
        },
      });

      if (merged.length >= limit) {
        break;
      }
    }
  }

  return merged;
}

function buildRetrievalMode(input: {
  shouldReadMerchantDocuments: boolean;
  hasKeywordMatches: boolean;
  hasVectorMatches: boolean;
  hasEmbedding: boolean;
}) {
  const modes = [
    input.shouldReadMerchantDocuments ? "direct" : null,
    input.hasKeywordMatches ? "keyword" : null,
    input.hasVectorMatches ? "vector" : null,
  ].filter(Boolean);

  if (modes.length > 0) {
    return `hybrid_${modes.join("_")}`;
  }

  return input.hasEmbedding ? "hybrid_no_matches_with_embedding" : "hybrid_no_matches_lexical";
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
