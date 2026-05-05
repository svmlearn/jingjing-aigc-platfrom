import { searchKnowledgeChunks } from "@/lib/db/knowledge-repository";
import {
  createEmbeddings,
  getAiRuntimeApiKey,
} from "@/server/api/ai-runtime";
import type { ConsultationAgentLoopState } from "@/server/api/consultation-runtime/types";
import { toStringArrayValue } from "@/server/api/consultation-runtime/utils";

export async function retrieveConsultationKnowledge(input: {
  state: ConsultationAgentLoopState;
  query: string;
  topK: number;
  knowledgeDocumentIds: unknown;
}) {
  const queryEmbedding = await embedKnowledgeQuery({
    query: input.query,
    state: input.state,
  });
  const matches =
    input.topK > 0
      ? await searchKnowledgeChunks({
          merchantId: input.state.merchant.id,
          query: input.query,
          limit: input.topK,
          queryEmbedding: queryEmbedding.embedding,
          documentIds: toStringArrayValue(input.knowledgeDocumentIds),
        })
      : [];

  return {
    matches,
    payload: {
      retrievalMode: queryEmbedding.embedding ? "vector_with_lexical_fallback" : "lexical",
      embeddingMode: queryEmbedding.mode,
      embeddingModel: queryEmbedding.model ?? input.state.knowledgeRuntime.embeddingModel,
      expertKnowledgeDocumentIds: toStringArrayValue(input.knowledgeDocumentIds),
    },
  };
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
