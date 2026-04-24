export type ConsultationAgentToolKey =
  | "read_merchant_profile"
  | "retrieve_knowledge_base"
  | "update_strategy_snapshot"
  | "update_content_calendar"
  | "generate_article_brief"
  | "generate_video_brief"
  | "read_history";

export type ConsultationAgentSettingsDto = {
  systemPrompt: string;
  enabledTools: ConsultationAgentToolKey[];
  visibleExecutionMode: "cards" | "minimal";
  maxRounds: number;
  retrievalTopK: number;
  model: string;
  temperature: number;
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

export type KnowledgeDocumentDto = {
  id: string;
  scope: "platform" | "merchant";
  merchantId?: string | null;
  title: string;
  sourceName?: string | null;
  storageProvider: "tencent_cos" | "supabase_storage";
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
