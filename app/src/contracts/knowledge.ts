export type ConsultationAgentToolKey =
  | "read_merchant_profile"
  | "retrieve_knowledge_base"
  | "update_strategy_snapshot"
  | "update_content_calendar"
  | "generate_article_brief"
  | "generate_video_brief"
  | "read_history"
  | "search_benchmark_materials";

export type ConsultationAgentSettingsDto = {
  systemPrompt: string;
  enabledTools: ConsultationAgentToolKey[];
  visibleExecutionMode: "cards" | "minimal";
  maxRounds: number;
  retrievalTopK: number;
  model: string;
  temperature: number;
};

export type ScriptProductionAgentSettingsDto = {
  model: string;
  temperature: number;
  retrievalTopK: number;
  revisionEnabled: boolean;
};

export type KnowledgeRuntimeSettingsDto = {
  retrievalTopK: number;
  chunkSize: number;
  chunkOverlap: number;
  embeddingModel: string;
  queryRewriteEnabled: boolean;
};

export type KnowledgeDocumentStatus =
  | "uploaded"
  | "queued"
  | "processing"
  | "indexed"
  | "failed";

export type KnowledgeStorageProvider =
  | "tencent_cos"
  | "aliyun_oss"
  | "supabase_storage"
  | "inline_seed";

export type KnowledgeDocumentDto = {
  id: string;
  scope: "platform" | "merchant";
  merchantId?: string | null;
  title: string;
  sourceName?: string | null;
  storageProvider: KnowledgeStorageProvider;
  bucketName?: string | null;
  storageKey?: string | null;
  mimeType?: string | null;
  status: KnowledgeDocumentStatus;
  summaryText?: string | null;
  metadata: Record<string, unknown>;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeIngestionJobDto = {
  id: string;
  documentId?: string | null;
  merchantId?: string | null;
  jobType: "document_ingestion";
  status: "pending" | "queued" | "processing" | "succeeded" | "failed";
  inputPayload: Record<string, unknown>;
  logPayload: Record<string, unknown>;
  errorSummary?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeChunkDto = {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type KnowledgeDocumentWithStatsDto = KnowledgeDocumentDto & {
  chunkCount: number;
  latestJob?: KnowledgeIngestionJobDto | null;
};

export type KnowledgeSearchMatchDto = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  sourceName?: string | null;
  scope: KnowledgeDocumentDto["scope"];
  merchantId?: string | null;
  content: string;
  score: number;
  chunkIndex: number;
  metadata: Record<string, unknown>;
};
