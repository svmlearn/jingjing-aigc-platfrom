import "server-only";

import type { MerchantProfileDto } from "@/contracts/merchant";
import type {
  ConsultationAgentSettingsDto,
  KnowledgeRuntimeSettingsDto,
} from "@/contracts/knowledge";
import type {
  PlatformAdminInvitationCodeFilters,
  ImportRuntimeSettingsDto,
  LlmRuntimeSettingsDto,
  PlatformAdminInvitationCodePatch,
  MembershipPlanSettingsDto,
  PlatformAdminMerchantDto,
  PlatformAdminMerchantPatch,
  PlatformAdminInvitationCodeDto,
  PlatformSettingsDto,
} from "@/contracts/platform-admin";
import { createInvitationCode, mapMerchantProfile } from "@/lib/db/merchant-repository";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getAiRuntimeApiKeySource, maskAiRuntimeApiKey } from "@/server/api/ai-runtime";
import { ApiError } from "@/server/api/errors";

type MerchantAdminRow = {
  id: string;
  owner_user_id: string | null;
  name: string;
  industry: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  address: string | null;
  service_items: unknown;
  brand_summary: string | null;
  region_summary: string | null;
  tone_style: string | null;
  default_cta: unknown;
  forbidden_words: unknown;
  status: MerchantProfileDto["status"];
  plan: MerchantProfileDto["plan"];
  created_at: string;
  updated_at: string;
};

type InvitationCodeAdminRow = {
  id: string;
  code: string;
  purpose: "merchant_signup";
  status: "active" | "redeemed" | "expired" | "disabled";
  max_redemptions: number;
  redemption_count: number;
  expires_at: string | null;
  note: string | null;
  created_at: string;
};

type PlatformSettingRow = {
  key: string;
  category: "llm" | "import" | "membership" | "consultation" | "knowledge";
  value: unknown;
};

type CountRow = {
  merchant_id: string | null;
};

type PlatformSettingsUpdateInput = {
  llmRuntime?: Omit<LlmRuntimeSettingsDto, "apiKeyMasked" | "apiKeySource">;
  importRuntime?: ImportRuntimeSettingsDto;
  membershipPlans?: MembershipPlanSettingsDto;
  consultationAgent?: ConsultationAgentSettingsDto;
  knowledgeRuntime?: KnowledgeRuntimeSettingsDto;
};

const defaultLlmRuntime: Omit<LlmRuntimeSettingsDto, "apiKeyMasked" | "apiKeySource"> = {
  providerLabel: "OpenAI Compatible",
  baseUrl: "https://api.openai.com/v1",
  primaryModel: "gpt-4.1",
  fallbackModel: "gpt-4.1-mini",
  temperature: 0.7,
  maxTokens: 1800,
  timeoutSeconds: 45,
  retryCount: 2,
};

const defaultImportRuntime: ImportRuntimeSettingsDto = {
  importProvider: "apify",
  defaultMaxComments: 30,
  defaultCreatorPosts: 20,
  waitSeconds: 120,
};

const defaultMembershipPlans: MembershipPlanSettingsDto = {
  free: {
    dailyCredits: 20,
    description: "适合测试期商户，先按 1 次改写 = 1 点。",
  },
  plus: {
    dailyCredits: 100,
    description: "适合稳定使用中的商户，支持更高频改写。",
  },
  pro: {
    dailyCredits: 300,
    description: "适合高频运营商户，预留更高改写额度。",
  },
};

const defaultConsultationAgent: ConsultationAgentSettingsDto = {
  systemPrompt:
    "你是静境商家平台里的 AI 商业顾问。目标是帮助本地生活商家快速沉淀定位、卖点、目标客群、关键场景、内容策略和一周内容日历，并把结论转成后续图文与视频创作输入。",
  enabledTools: [
    "read_merchant_profile",
    "retrieve_knowledge_base",
    "update_strategy_snapshot",
    "update_content_calendar",
    "generate_article_brief",
    "generate_video_brief",
    "read_history",
  ],
  visibleExecutionMode: "cards",
  maxRounds: 6,
  retrievalTopK: 5,
  model: "gpt-4.1-mini",
  temperature: 0.6,
};

const defaultKnowledgeRuntime: KnowledgeRuntimeSettingsDto = {
  retrievalTopK: 5,
  chunkSize: 900,
  chunkOverlap: 120,
  embeddingModel: "text-embedding-3-small",
  queryRewriteEnabled: true,
};

const invitationCodeExpiringSoonWindowDays = 7;

let demoPlatformSettings: PlatformSettingsDto | null = null;

export async function listPlatformInvitationCodes(
  filters: PlatformAdminInvitationCodeFilters = {},
): Promise<PlatformAdminInvitationCodeDto[]> {
  if (!isSupabaseAdminConfigured()) {
    return filterPlatformInvitationCodes([], filters);
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("invitation_codes")
    .select(
      "id, code, purpose, status, max_redemptions, redemption_count, expires_at, note, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new ApiError(500, "PLATFORM_INVITATION_CODES_FETCH_FAILED", error.message);
  }

  const invitationCodes = ((data ?? []) as InvitationCodeAdminRow[]).map(mapInvitationCodeAdmin);

  return filterPlatformInvitationCodes(invitationCodes, filters);
}

export async function createPlatformInvitationCode(input: {
  code?: string;
  maxRedemptions?: number;
  expiresAt?: string | null;
  note?: string | null;
  actorLabel?: string;
}): Promise<PlatformAdminInvitationCodeDto> {
  const invitationCode = await createInvitationCode(input);

  await recordPlatformAdminEvent({
    actorLabel: input.actorLabel ?? "admin",
    eventType: "invitation_code.created",
    targetType: "invitation_code",
    targetId: invitationCode.id,
    summary: `生成邀请码 ${invitationCode.code}`,
    details: {
      status: invitationCode.status,
      maxRedemptions: invitationCode.maxRedemptions,
      expiresAt: invitationCode.expiresAt ?? null,
    },
  });

  return invitationCode;
}

export async function updatePlatformInvitationCode(
  invitationCodeId: string,
  input: PlatformAdminInvitationCodePatch,
  actorLabel = "admin",
): Promise<PlatformAdminInvitationCodeDto> {
  const supabase = createSupabaseAdminClient();
  const current = await getPlatformInvitationCodeById(invitationCodeId);

  if (current.status === input.status) {
    return current;
  }

  if (
    input.status === "disabled" &&
    current.status !== "active"
  ) {
    throw new ApiError(
      409,
      "INVITATION_CODE_CANNOT_DISABLE",
      "Only active invitation codes can be disabled.",
    );
  }

  if (
    input.status === "active" &&
    current.status !== "disabled"
  ) {
    throw new ApiError(
      409,
      "INVITATION_CODE_CANNOT_ACTIVATE",
      "Only disabled invitation codes can be re-enabled.",
    );
  }

  const { data, error } = await supabase
    .from("invitation_codes")
    .update({ status: input.status })
    .eq("id", invitationCodeId)
    .select(
      "id, code, purpose, status, max_redemptions, redemption_count, expires_at, note, created_at",
    )
    .single();

  if (error || !data) {
    throw new ApiError(500, "PLATFORM_INVITATION_CODE_UPDATE_FAILED", error?.message ?? "Update failed.");
  }

  const invitationCode = mapInvitationCodeAdmin(data as InvitationCodeAdminRow);

  await recordPlatformAdminEvent({
    actorLabel,
    eventType: "invitation_code.updated",
    targetType: "invitation_code",
    targetId: invitationCodeId,
    summary:
      input.status === "disabled"
        ? `停用邀请码 ${invitationCode.code}`
        : `重新启用邀请码 ${invitationCode.code}`,
    details: {
      fromStatus: current.status,
      toStatus: invitationCode.status,
    },
  });

  return invitationCode;
}

export async function listPlatformMerchants(): Promise<PlatformAdminMerchantDto[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("merchant_profiles")
    .select(
      [
        "id",
        "owner_user_id",
        "name",
        "industry",
        "contact_name",
        "contact_phone",
        "address",
        "service_items",
        "brand_summary",
        "region_summary",
        "tone_style",
        "default_cta",
        "forbidden_words",
        "status",
        "plan",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new ApiError(500, "PLATFORM_MERCHANTS_FETCH_FAILED", error.message);
  }

  const merchants = ((data ?? []) as unknown as MerchantAdminRow[]).map(mapMerchantProfile);
  const [importCounts, draftCounts] = await Promise.all([
    countByMerchant("import_jobs"),
    countByMerchant("content_drafts"),
  ]);

  return merchants.map((merchant) =>
    toPlatformAdminMerchant(merchant, {
      totalImports: importCounts.get(merchant.id) ?? 0,
      totalDrafts: draftCounts.get(merchant.id) ?? 0,
    }),
  );
}

export async function getPlatformMerchantById(
  merchantId: string,
): Promise<PlatformAdminMerchantDto> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("merchant_profiles")
    .select(
      [
        "id",
        "owner_user_id",
        "name",
        "industry",
        "contact_name",
        "contact_phone",
        "address",
        "service_items",
        "brand_summary",
        "region_summary",
        "tone_style",
        "default_cta",
        "forbidden_words",
        "status",
        "plan",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .eq("id", merchantId)
    .single();

  if (error || !data) {
    throw new ApiError(404, "PLATFORM_MERCHANT_NOT_FOUND", "Merchant profile not found.");
  }

  const merchant = mapMerchantProfile(data as unknown as MerchantAdminRow);
  const [totalImports, totalDrafts] = await Promise.all([
    countMerchantRows("import_jobs", merchantId),
    countMerchantRows("content_drafts", merchantId),
  ]);

  return toPlatformAdminMerchant(merchant, { totalImports, totalDrafts });
}

export async function updatePlatformMerchant(
  merchantId: string,
  input: PlatformAdminMerchantPatch,
  actorLabel = "admin",
): Promise<PlatformAdminMerchantDto> {
  const supabase = createSupabaseAdminClient();
  const update: Record<string, unknown> = {};

  if (input.status !== undefined) {
    update.status = input.status;
  }

  if (input.plan !== undefined) {
    update.plan = input.plan;
  }

  if (Object.keys(update).length === 0) {
    return getPlatformMerchantById(merchantId);
  }

  const { error } = await supabase
    .from("merchant_profiles")
    .update(update)
    .eq("id", merchantId);

  if (error) {
    throw new ApiError(500, "PLATFORM_MERCHANT_UPDATE_FAILED", error.message);
  }

  const merchant = await getPlatformMerchantById(merchantId);

  await recordPlatformAdminEvent({
    actorLabel,
    eventType: "merchant.updated",
    targetType: "merchant",
    targetId: merchantId,
    summary: `更新商户 ${merchant.name} 的平台状态`,
    details: update,
  });

  return merchant;
}

export async function getPlatformSettings(): Promise<PlatformSettingsDto> {
  if (!isSupabaseAdminConfigured()) {
    return demoPlatformSettings ?? getDefaultPlatformSettings();
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .select("key, category, value")
    .in("key", [
      "llm_runtime",
      "import_runtime",
      "membership_plans",
      "consultation_agent",
      "knowledge_runtime",
    ]);

  if (error) {
    throw new ApiError(500, "PLATFORM_SETTINGS_FETCH_FAILED", error.message);
  }

  const rows = new Map(((data ?? []) as PlatformSettingRow[]).map((row) => [row.key, row]));
  const llmRuntime = toLlmRuntimeSettings(rows.get("llm_runtime")?.value);
  const importRuntime = toImportRuntimeSettings(rows.get("import_runtime")?.value);
  const membershipPlans = toMembershipPlans(rows.get("membership_plans")?.value);
  const consultationAgent = toConsultationAgentSettings(
    rows.get("consultation_agent")?.value,
  );
  const knowledgeRuntime = toKnowledgeRuntimeSettings(rows.get("knowledge_runtime")?.value);

  return {
    llmRuntime,
    importRuntime,
    membershipPlans,
    consultationAgent,
    knowledgeRuntime,
  };
}

export async function updatePlatformSettings(
  input: PlatformSettingsUpdateInput,
  actorLabel = "admin",
): Promise<PlatformSettingsDto> {
  const current = await getPlatformSettings();
  const next = mergePlatformSettings(current, input);

  if (!isSupabaseAdminConfigured()) {
    demoPlatformSettings = next;
    return next;
  }

  const supabase = createSupabaseAdminClient();

  const rows = [
    {
      key: "llm_runtime",
      category: "llm",
      value: {
        providerLabel: next.llmRuntime.providerLabel,
        baseUrl: next.llmRuntime.baseUrl,
        primaryModel: next.llmRuntime.primaryModel,
        fallbackModel: next.llmRuntime.fallbackModel ?? null,
        temperature: next.llmRuntime.temperature,
        maxTokens: next.llmRuntime.maxTokens,
        timeoutSeconds: next.llmRuntime.timeoutSeconds,
        retryCount: next.llmRuntime.retryCount,
      },
      description: "Platform-level rewrite runtime defaults.",
    },
    {
      key: "import_runtime",
      category: "import",
      value: next.importRuntime,
      description: "Platform-level import runtime defaults.",
    },
    {
      key: "membership_plans",
      category: "membership",
      value: next.membershipPlans,
      description: "Membership plan defaults for merchant daily rewrite credits.",
    },
    {
      key: "consultation_agent",
      category: "consultation",
      value: next.consultationAgent,
      description: "Platform-level consultation agent settings.",
    },
    {
      key: "knowledge_runtime",
      category: "knowledge",
      value: next.knowledgeRuntime,
      description: "Platform-level knowledge retrieval runtime settings.",
    },
  ];

  const { error } = await supabase.from("platform_settings").upsert(rows, {
    onConflict: "key",
  });

  if (error) {
    throw new ApiError(500, "PLATFORM_SETTINGS_UPDATE_FAILED", error.message);
  }

  await recordPlatformAdminEvent({
    actorLabel,
    eventType: "settings.updated",
    targetType: "platform_settings",
    summary: "更新平台配置",
    details: {
      updatedKeys: Object.keys(input),
    },
  });

  return getPlatformSettings();
}

function getDefaultPlatformSettings(): PlatformSettingsDto {
  return {
    llmRuntime: toLlmRuntimeSettings(undefined),
    importRuntime: toImportRuntimeSettings(undefined),
    membershipPlans: toMembershipPlans(undefined),
    consultationAgent: toConsultationAgentSettings(undefined),
    knowledgeRuntime: toKnowledgeRuntimeSettings(undefined),
  };
}

function mergePlatformSettings(
  current: PlatformSettingsDto,
  input: PlatformSettingsUpdateInput,
): PlatformSettingsDto {
  return {
    llmRuntime: {
      ...current.llmRuntime,
      ...input.llmRuntime,
      apiKeyMasked: current.llmRuntime.apiKeyMasked,
      apiKeySource: current.llmRuntime.apiKeySource,
    },
    importRuntime: {
      ...current.importRuntime,
      ...input.importRuntime,
    },
    membershipPlans: input.membershipPlans
      ? {
          free: { ...current.membershipPlans.free, ...input.membershipPlans.free },
          plus: { ...current.membershipPlans.plus, ...input.membershipPlans.plus },
          pro: { ...current.membershipPlans.pro, ...input.membershipPlans.pro },
        }
      : current.membershipPlans,
    consultationAgent: input.consultationAgent
      ? {
          ...current.consultationAgent,
          ...input.consultationAgent,
          enabledTools:
            input.consultationAgent.enabledTools ?? current.consultationAgent.enabledTools,
        }
      : current.consultationAgent,
    knowledgeRuntime: {
      ...current.knowledgeRuntime,
      ...input.knowledgeRuntime,
    },
  };
}

async function countByMerchant(table: "import_jobs" | "content_drafts") {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from(table).select("merchant_id");

  if (error) {
    throw new ApiError(500, "PLATFORM_MERCHANT_COUNT_FAILED", error.message);
  }

  const counts = new Map<string, number>();

  for (const row of (data ?? []) as CountRow[]) {
    if (!row.merchant_id) {
      continue;
    }
    counts.set(row.merchant_id, (counts.get(row.merchant_id) ?? 0) + 1);
  }

  return counts;
}

async function countMerchantRows(
  table: "import_jobs" | "content_drafts",
  merchantId: string,
) {
  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("merchant_id", merchantId);

  if (error) {
    throw new ApiError(500, "PLATFORM_MERCHANT_COUNT_FAILED", error.message);
  }

  return count ?? 0;
}

async function recordPlatformAdminEvent(input: {
  actorLabel: string;
  eventType: string;
  targetType: string;
  targetId?: string;
  summary: string;
  details?: Record<string, unknown>;
}) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("platform_admin_events").insert({
    actor_label: input.actorLabel,
    event_type: input.eventType,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    summary: input.summary,
    details: input.details ?? {},
  });

  if (error) {
    throw new ApiError(500, "PLATFORM_ADMIN_EVENT_CREATE_FAILED", error.message);
  }
}

async function getPlatformInvitationCodeById(
  invitationCodeId: string,
): Promise<PlatformAdminInvitationCodeDto> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("invitation_codes")
    .select(
      "id, code, purpose, status, max_redemptions, redemption_count, expires_at, note, created_at",
    )
    .eq("id", invitationCodeId)
    .single();

  if (error || !data) {
    throw new ApiError(404, "PLATFORM_INVITATION_CODE_NOT_FOUND", "Invitation code not found.");
  }

  return mapInvitationCodeAdmin(data as InvitationCodeAdminRow);
}

function mapInvitationCodeAdmin(row: InvitationCodeAdminRow): PlatformAdminInvitationCodeDto {
  return {
    id: row.id,
    code: row.code,
    purpose: row.purpose,
    status: row.status,
    maxRedemptions: row.max_redemptions,
    redemptionCount: row.redemption_count,
    expiresAt: row.expires_at,
    note: row.note,
    createdAt: row.created_at,
  };
}

function filterPlatformInvitationCodes(
  invitationCodes: PlatformAdminInvitationCodeDto[],
  filters: PlatformAdminInvitationCodeFilters,
) {
  const query = filters.query?.trim().toLowerCase();
  const status = filters.status ?? "all";
  const usage = filters.usage ?? "all";
  const now = Date.now();
  const expiringSoonWindow = invitationCodeExpiringSoonWindowDays * 24 * 60 * 60 * 1000;

  return invitationCodes.filter((invitationCode) => {
    if (query) {
      const haystacks = [invitationCode.code, invitationCode.note ?? ""].map((value) =>
        value.toLowerCase(),
      );

      if (!haystacks.some((value) => value.includes(query))) {
        return false;
      }
    }

    if (status !== "all" && invitationCode.status !== status) {
      return false;
    }

    if (usage === "unused" && invitationCode.redemptionCount > 0) {
      return false;
    }

    if (usage === "expiring") {
      if (invitationCode.status !== "active" || !invitationCode.expiresAt) {
        return false;
      }

      const expiresAt = new Date(invitationCode.expiresAt).getTime();

      if (
        Number.isNaN(expiresAt) ||
        expiresAt < now ||
        expiresAt > now + expiringSoonWindow
      ) {
        return false;
      }
    }

    return true;
  });
}

function toPlatformAdminMerchant(
  merchant: MerchantProfileDto,
  input: {
    totalImports: number;
    totalDrafts: number;
  },
): PlatformAdminMerchantDto {
  return {
    ...merchant,
    ownerEmail: null,
    totalImports: input.totalImports,
    totalDrafts: input.totalDrafts,
    lastActiveAt: merchant.updatedAt,
  };
}

function toLlmRuntimeSettings(value: unknown): LlmRuntimeSettingsDto {
  const record = toRecord(value);
  const apiKeyMasked = maskAiRuntimeApiKey();
  const apiKeySource = getAiRuntimeApiKeySource();

  return {
    providerLabel: getString(record.providerLabel, defaultLlmRuntime.providerLabel),
    baseUrl: getString(record.baseUrl, defaultLlmRuntime.baseUrl),
    primaryModel: getString(record.primaryModel, defaultLlmRuntime.primaryModel),
    fallbackModel: getNullableString(record.fallbackModel, defaultLlmRuntime.fallbackModel ?? null),
    temperature: getNumber(record.temperature, defaultLlmRuntime.temperature),
    maxTokens: getNumber(record.maxTokens, defaultLlmRuntime.maxTokens),
    timeoutSeconds: getNumber(record.timeoutSeconds, defaultLlmRuntime.timeoutSeconds),
    retryCount: getNumber(record.retryCount, defaultLlmRuntime.retryCount),
    apiKeyMasked,
    apiKeySource: apiKeySource === "none" ? "none" : "env",
  };
}

function toImportRuntimeSettings(value: unknown): ImportRuntimeSettingsDto {
  const record = toRecord(value);

  return {
    importProvider: getString(record.importProvider, defaultImportRuntime.importProvider),
    defaultMaxComments: getNumber(record.defaultMaxComments, defaultImportRuntime.defaultMaxComments),
    defaultCreatorPosts: getNumber(record.defaultCreatorPosts, defaultImportRuntime.defaultCreatorPosts),
    waitSeconds: getNumber(record.waitSeconds, defaultImportRuntime.waitSeconds),
  };
}

function toConsultationAgentSettings(value: unknown): ConsultationAgentSettingsDto {
  const record = toRecord(value);

  return {
    systemPrompt: getString(record.systemPrompt, defaultConsultationAgent.systemPrompt),
    enabledTools: toConsultationToolArray(record.enabledTools),
    visibleExecutionMode:
      getString(
        record.visibleExecutionMode,
        defaultConsultationAgent.visibleExecutionMode,
      ) === "minimal"
        ? "minimal"
        : "cards",
    maxRounds: getNumber(record.maxRounds, defaultConsultationAgent.maxRounds),
    retrievalTopK: getNumber(record.retrievalTopK, defaultConsultationAgent.retrievalTopK),
    model: getString(record.model, defaultConsultationAgent.model),
    temperature: getNumber(record.temperature, defaultConsultationAgent.temperature),
  };
}

function toKnowledgeRuntimeSettings(value: unknown): KnowledgeRuntimeSettingsDto {
  const record = toRecord(value);

  return {
    retrievalTopK: getNumber(record.retrievalTopK, defaultKnowledgeRuntime.retrievalTopK),
    chunkSize: getNumber(record.chunkSize, defaultKnowledgeRuntime.chunkSize),
    chunkOverlap: getNumber(record.chunkOverlap, defaultKnowledgeRuntime.chunkOverlap),
    embeddingModel: getString(record.embeddingModel, defaultKnowledgeRuntime.embeddingModel),
    queryRewriteEnabled: getBoolean(
      record.queryRewriteEnabled,
      defaultKnowledgeRuntime.queryRewriteEnabled,
    ),
  };
}

function toMembershipPlans(value: unknown): MembershipPlanSettingsDto {
  const record = toRecord(value);

  return {
    free: toMembershipPlanRule(record.free, defaultMembershipPlans.free),
    plus: toMembershipPlanRule(record.plus, defaultMembershipPlans.plus),
    pro: toMembershipPlanRule(record.pro, defaultMembershipPlans.pro),
  };
}

function toMembershipPlanRule(
  value: unknown,
  fallback: MembershipPlanSettingsDto["free"],
) {
  const record = toRecord(value);

  return {
    dailyCredits: getNumber(record.dailyCredits, fallback.dailyCredits),
    description: getString(record.description, fallback.description),
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function getString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function getNullableString(value: unknown, fallback: string | null) {
  if (value === null) {
    return null;
  }

  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function toConsultationToolArray(value: unknown): ConsultationAgentSettingsDto["enabledTools"] {
  if (!Array.isArray(value)) {
    return defaultConsultationAgent.enabledTools;
  }

  const allowed = new Set(defaultConsultationAgent.enabledTools);
  const next = value.filter(
    (item): item is ConsultationAgentSettingsDto["enabledTools"][number] =>
      typeof item === "string" &&
      allowed.has(item as ConsultationAgentSettingsDto["enabledTools"][number]),
  );

  return next.length > 0 ? next : defaultConsultationAgent.enabledTools;
}
