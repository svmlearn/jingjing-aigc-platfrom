import type { MerchantPlan } from "./merchant";

export type PlatformAdminRole = "super_admin" | "admin";

export type PlatformAdminUserStatus = "active" | "disabled";

export type PlatformAdminUserDto = {
  id: string;
  authUserId: string;
  email: string;
  displayName?: string | null;
  role: PlatformAdminRole;
  status: PlatformAdminUserStatus;
  createdByAdminId?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentServiceStatus = "draft" | "enabled" | "disabled";

export type AgentPromptVersionStatus = "draft" | "active" | "archived";

export type AgentAssetStatus = "draft" | "enabled" | "disabled";

export type AgentBindingStatus = "enabled" | "disabled";

export type AgentRouteKey = "consultation_default";

export type AgentRouteBindingStatus = "active" | "disabled";

export type AgentServiceFlags = {
  systemPromptEnabled: boolean;
  skillsEnabled: boolean;
  knowledgeEnabled: boolean;
} & Record<string, unknown>;

export type AgentConfigDto = {
  id: string;
  agentKey: string;
  displayName: string;
  roleDescription?: string | null;
  description?: string | null;
  serviceStatus: AgentServiceStatus;
  serviceFlags: AgentServiceFlags;
  modelConfig: Record<string, unknown>;
  copiedFromAgentId?: string | null;
  createdByAdminId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentPromptVersionDto = {
  id: string;
  agentId: string;
  versionNo: number;
  body: string;
  status: AgentPromptVersionStatus;
  changeNote?: string | null;
  createdByAdminId?: string | null;
  createdAt: string;
  activatedAt?: string | null;
  archivedAt?: string | null;
};

export type AgentSoulVersionDto = {
  id: string;
  agentId: string;
  versionNo: number;
  body: string;
  status: AgentPromptVersionStatus;
  changeNote?: string | null;
  createdByAdminId?: string | null;
  createdAt: string;
  activatedAt?: string | null;
  archivedAt?: string | null;
};

export type AgentSkillDto = {
  id: string;
  skillKey?: string | null;
  name: string;
  description: string;
  whenToUse: string;
  body: string;
  status: AgentAssetStatus;
  dependencies: string[];
  metadata: Record<string, unknown>;
  createdByAdminId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentSkillReferenceType =
  | "knowledge_document"
  | "knowledge_set"
  | "url"
  | "local_path";

export type AgentSkillReferenceUsage =
  | "retrieve_when_active"
  | "retrieve_when_needed"
  | "load_when_active";

export type AgentSkillReferenceDto = {
  type: AgentSkillReferenceType;
  title: string;
  usage: AgentSkillReferenceUsage;
  documentId?: string;
  knowledgeSetId?: string;
  url?: string;
  path?: string;
  notes?: string;
};

export type AgentSkillBindingDto = {
  id: string;
  agentId: string;
  skillId: string;
  status: AgentBindingStatus;
  createdByAdminId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeSetScope = "platform" | "merchant";

export type KnowledgeSetDto = {
  id: string;
  setKey?: string | null;
  name: string;
  description?: string | null;
  scope: KnowledgeSetScope;
  merchantId?: string | null;
  status: AgentAssetStatus;
  metadata: Record<string, unknown>;
  createdByAdminId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeSetDocumentDto = {
  id: string;
  knowledgeSetId: string;
  documentId: string;
  createdByAdminId?: string | null;
  createdAt: string;
};

export type AgentKnowledgeSetBindingDto = {
  id: string;
  agentId: string;
  knowledgeSetId: string;
  status: AgentBindingStatus;
  createdByAdminId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentRouteBindingDto = {
  id: string;
  routeKey: AgentRouteKey;
  agentId?: string | null;
  status: AgentRouteBindingStatus;
  description?: string | null;
  createdByAdminId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentTestRunStatus = "succeeded" | "failed";

export type AgentTestRunDto = {
  id: string;
  agentId?: string | null;
  merchantId?: string | null;
  inputMessage: string;
  promptVersionId?: string | null;
  candidateSkillIds: string[];
  actualSkillIds: string[];
  knowledgeSetIds: string[];
  knowledgeMatchIds: string[];
  memoryMatchIds: string[];
  toolSummary: Record<string, unknown>;
  assistantOutput?: string | null;
  status: AgentTestRunStatus;
  errorSummary?: string | null;
  model?: string | null;
  createdByAdminId?: string | null;
  createdAt: string;
};

export type AgentRuntimeSnapshotDto = {
  id: string;
  sessionId?: string | null;
  messageId?: string | null;
  agentId?: string | null;
  promptVersionId?: string | null;
  candidateSkillIds: string[];
  actualSkillIds: string[];
  knowledgeSetIds: string[];
  knowledgeMatchIds: string[];
  memoryMatchIds: string[];
  toolCallSummary: Record<string, unknown>;
  model?: string | null;
  createdAt: string;
};

export type MerchantMembershipTier = MerchantPlan | "max";

export type MerchantMembershipDto = {
  id: string;
  merchantId: string;
  tier: MerchantMembershipTier;
  status: "trial" | "active" | "expired" | "cancelled";
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type MerchantCreditAccountDto = {
  id: string;
  merchantId: string;
  balance: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type MerchantUsageEventDto = {
  id: string;
  merchantId: string;
  actionType: string;
  agentId?: string | null;
  estimatedCost?: number | null;
  actualCost?: number | null;
  status: "reserved" | "consumed" | "failed" | "refunded" | "skipped";
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type MerchantCreditLedgerDto = {
  id: string;
  merchantId: string;
  creditAccountId?: string | null;
  direction: "grant" | "consume" | "refund" | "adjust" | "expire";
  amount: number;
  reason: string;
  relatedUsageEventId?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AgentConsoleFoundationStateDto = {
  agents: AgentConfigDto[];
  routeBindings: AgentRouteBindingDto[];
  knowledgeSets: KnowledgeSetDto[];
  skills: AgentSkillDto[];
};

export type AgentConfigDetailDto = {
  agent: AgentConfigDto;
  promptVersions: AgentPromptVersionDto[];
  soulVersions: AgentSoulVersionDto[];
  activePromptVersion?: AgentPromptVersionDto | null;
  activeSoulVersion?: AgentSoulVersionDto | null;
  skillBindings: AgentSkillBindingDto[];
  knowledgeSetBindings: AgentKnowledgeSetBindingDto[];
};

export type KnowledgeSetDetailDto = {
  knowledgeSet: KnowledgeSetDto;
  documentIds: string[];
};
