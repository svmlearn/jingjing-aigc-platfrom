import type { InvitationCodeDto, MerchantPlan, MerchantProfileDto } from "./merchant";
import type {
  ConsultationAgentSettingsDto,
  KnowledgeRuntimeSettingsDto,
  ScriptProductionAgentSettingsDto,
} from "./knowledge";

export type * from "./agent-console";

export type PlatformAdminInvitationCodeDto = InvitationCodeDto;

export type PlatformAdminInvitationCodeStatusFilter =
  | "all"
  | PlatformAdminInvitationCodeDto["status"];

export type PlatformAdminInvitationCodeUsageFilter = "all" | "unused" | "expiring";

export type PlatformAdminInvitationCodeFilters = {
  query?: string;
  status?: PlatformAdminInvitationCodeStatusFilter;
  usage?: PlatformAdminInvitationCodeUsageFilter;
};

export type PlatformAdminInvitationCodePatch = {
  status: Extract<PlatformAdminInvitationCodeDto["status"], "active" | "disabled">;
};

export type PlatformAdminMerchantDto = MerchantProfileDto & {
  ownerEmail?: string | null;
  totalImports: number;
  totalDrafts: number;
  lastActiveAt: string;
};

export type PlatformAdminEventDto = {
  id: string;
  actorLabel: string;
  eventType: string;
  targetType: string;
  targetId?: string | null;
  summary: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type LlmRuntimeSettingsDto = {
  providerLabel: string;
  baseUrl: string;
  primaryModel: string;
  fallbackModel?: string | null;
  temperature: number;
  maxTokens: number;
  timeoutSeconds: number;
  retryCount: number;
  apiKeyMasked?: string | null;
  apiKeySource: "env" | "secret" | "none";
};

export type ImportRuntimeSettingsDto = {
  importProvider: string;
  defaultMaxComments: number;
  defaultCreatorPosts: number;
  waitSeconds: number;
};

export type MembershipPlanSettingsDto = Record<
  MerchantPlan,
  {
    dailyCredits: number;
    description: string;
  }
>;

export type PlatformSettingsDto = {
  llmRuntime: LlmRuntimeSettingsDto;
  importRuntime: ImportRuntimeSettingsDto;
  membershipPlans: MembershipPlanSettingsDto;
  consultationAgent: ConsultationAgentSettingsDto;
  scriptProductionAgent: ScriptProductionAgentSettingsDto;
  knowledgeRuntime: KnowledgeRuntimeSettingsDto;
};

export type PlatformAdminMerchantPatch = {
  status?: MerchantProfileDto["status"];
  plan?: MerchantPlan;
};
