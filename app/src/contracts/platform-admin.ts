import type { InvitationCodeDto, MerchantPlan, MerchantProfileDto } from "./merchant";

export type PlatformAdminInvitationCodeDto = InvitationCodeDto;

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
};

export type PlatformAdminMerchantPatch = {
  status?: MerchantProfileDto["status"];
  plan?: MerchantPlan;
};
