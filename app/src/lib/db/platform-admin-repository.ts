import "server-only";

import { randomBytes } from "node:crypto";

import {
  consultationAgentToolKeys,
  type ConsultationAgentSettingsDto,
  type KnowledgeRuntimeSettingsDto,
  type ScriptProductionAgentSettingsDto,
} from "@/contracts/knowledge";
import type { MerchantProfileDto } from "@/contracts/merchant";
import type {
  PlatformAdminInvitationCodeFilters,
  ImportRuntimeSettingsDto,
  LlmRuntimeSettingsDto,
  PlatformAdminInvitationCodePatch,
  MembershipPlanSettingsDto,
  PlatformAdminMerchantDto,
  PlatformAdminMerchantPatch,
  PlatformAdminInvitationCodeDto,
  PlatformAdminRole,
  PlatformSettingsDto,
  PlatformAdminUserDto,
  PlatformAdminUserStatus,
} from "@/contracts/platform-admin";
import { createPlatformAdminPasswordHash } from "@/lib/auth/platform-admin-session";
import { isLocalDemoRuntime } from "@/lib/demo/local-demo-runtime";
import { mapMerchantProfile } from "@/lib/db/merchant-repository";
import {
  mapPostgresError,
  queryAppDb,
  withAppDbTransaction,
  type DatabaseClient,
} from "@/lib/server-db/postgres";
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
  expires_at: Timestamp | null;
  note: string | null;
  created_at: Timestamp;
};

type PlatformSettingRow = {
  key: string;
  category: "llm" | "import" | "membership" | "consultation" | "script_production" | "knowledge";
  value: unknown;
};

type PlatformAdminEventRow = {
  id: string;
};

type Timestamp = string | Date;

type PlatformAdminUserRow = {
  id: string;
  auth_user_id?: string | null;
  email: string;
  display_name: string | null;
  role: PlatformAdminRole;
  status: PlatformAdminUserStatus;
  created_by_admin_id: string | null;
  last_login_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

type CountRow = {
  merchant_id: string | null;
  count?: string | number;
};

type PlatformSettingsUpdateInput = {
  llmRuntime?: Omit<LlmRuntimeSettingsDto, "apiKeyMasked" | "apiKeySource">;
  importRuntime?: ImportRuntimeSettingsDto;
  membershipPlans?: MembershipPlanSettingsDto;
  consultationAgent?: ConsultationAgentSettingsDto;
  scriptProductionAgent?: ScriptProductionAgentSettingsDto;
  knowledgeRuntime?: KnowledgeRuntimeSettingsDto;
};

const defaultLlmRuntime: Omit<LlmRuntimeSettingsDto, "apiKeyMasked" | "apiKeySource"> = {
  providerLabel: "SiliconFlow",
  baseUrl: "https://api.siliconflow.cn/v1",
  primaryModel: "Qwen/Qwen3-32B",
  fallbackModel: "Qwen/Qwen3-14B",
  temperature: 0.7,
  maxTokens: 1800,
  timeoutSeconds: 60,
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
    description: "适合测试期用户，先按 1 次改写 = 1 点。",
  },
  plus: {
    dailyCredits: 100,
    description: "适合稳定使用中的用户，支持更高频改写。",
  },
  pro: {
    dailyCredits: 300,
    description: "适合高频运营用户，预留更高改写额度。",
  },
};

const defaultConsultationAgent: ConsultationAgentSettingsDto = {
  systemPrompt:
    "你是静境平台里的 AI 商业顾问。目标是帮助当前用户或经营者快速澄清自己是谁、可提供的能力或服务、卖点、目标对象、关键场景、内容策略和后续内容创作输入。资料不足时必须先追问，不要替用户假设行业、业务形态或服务范围。",
  enabledTools: [
    "retrieve_knowledge_base",
    "search_benchmark_materials",
    "update_strategy_snapshot",
    "update_content_calendar",
  ],
  visibleExecutionMode: "cards",
  maxRounds: 6,
  retrievalTopK: 5,
  model: "Qwen/Qwen3-32B",
  temperature: 0.6,
};

const defaultScriptProductionAgent: ScriptProductionAgentSettingsDto = {
  model: "Qwen/Qwen3-14B",
  temperature: 0.65,
  retrievalTopK: 4,
  revisionEnabled: true,
};

const defaultKnowledgeRuntime: KnowledgeRuntimeSettingsDto = {
  retrievalTopK: 5,
  chunkSize: 900,
  chunkOverlap: 120,
  embeddingModel: "Qwen/Qwen3-Embedding-4B",
  queryRewriteEnabled: true,
};

const invitationCodeExpiringSoonWindowDays = 7;

const platformSettingKeys = [
  "llm_runtime",
  "import_runtime",
  "membership_plans",
  "consultation_agent",
  "script_production_agent",
  "knowledge_runtime",
];

let demoPlatformSettings: PlatformSettingsDto | null = null;

const appOwnedPlatformAdminUserSelect = [
  "id",
  "id as auth_user_id",
  "email",
  "display_name",
  "role",
  "status",
  "created_by_admin_id",
  "last_login_at",
  "created_at",
  "updated_at",
].join(", ");

const invitationCodeAdminSelect = [
  "id",
  "code",
  "purpose",
  "status",
  "max_redemptions",
  "redemption_count",
  "expires_at",
  "note",
  "created_at",
].join(", ");

const merchantAdminSelect = [
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
].join(", ");

export async function listPlatformAdminUsers(): Promise<PlatformAdminUserDto[]> {
  try {
    const result = await queryAppDb<PlatformAdminUserRow>(
      `
      select ${appOwnedPlatformAdminUserSelect}
      from public.platform_admin_users
      order by created_at asc
      `,
    );

    return result.rows.map(mapPlatformAdminUser);
  } catch (error) {
    throw mapPostgresError(error, "PLATFORM_ADMIN_USERS_FETCH_FAILED");
  }
}

export async function createPlatformAdminUser(
  input: {
    email: string;
    password: string;
    displayName?: string | null;
    role?: PlatformAdminRole;
  },
  actor: PlatformAdminUserDto,
): Promise<PlatformAdminUserDto> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName?.trim() || null;
  const role = input.role ?? "admin";

  try {
    return await withAppDbTransaction(async (client) => {
      const result = await insertAppOwnedPlatformAdminUser(client, {
        email,
        password: input.password,
        displayName,
        role,
        createdByAdminId: actor.id,
      });
      const adminUser = mapPlatformAdminUser(result);

      await insertPlatformAdminEvent(client, {
        actorAdminId: actor.id,
        actorLabel: actor.email,
        eventType: "platform_admin_user.created",
        targetType: "platform_admin_user",
        targetId: adminUser.id,
        summary: `新增后台管理员 ${adminUser.email}`,
        details: {
          role: adminUser.role,
          status: adminUser.status,
        },
      });

      return adminUser;
    });
  } catch (error) {
    throw mapPostgresError(error, "PLATFORM_ADMIN_USER_CREATE_FAILED");
  }
}

export async function updatePlatformAdminUser(
  adminUserId: string,
  input: {
    displayName?: string | null;
    role?: PlatformAdminRole;
    status?: PlatformAdminUserStatus;
  },
  actor: PlatformAdminUserDto,
): Promise<PlatformAdminUserDto> {
  try {
    return await withAppDbTransaction(async (client) => {
      const current = await getAppOwnedPlatformAdminUserById(adminUserId, client, {
        forUpdate: true,
      });

      if (
        current.role === "super_admin" &&
        current.status === "active" &&
        (input.role === "admin" || input.status === "disabled")
      ) {
        const activeSuperAdminCount = await countAppOwnedActiveSuperAdmins(client);

        if (activeSuperAdminCount <= 1) {
          throw new ApiError(
            409,
            "LAST_SUPER_ADMIN_REQUIRED",
            "At least one active super admin is required.",
          );
        }
      }

      const update: Record<string, unknown> = {};

      if (input.displayName !== undefined) {
        update.display_name = input.displayName?.trim() || null;
      }

      if (input.role !== undefined) {
        update.role = input.role;
      }

      if (input.status !== undefined) {
        update.status = input.status;
      }

      if (Object.keys(update).length === 0) {
        return current;
      }

      const updateResult = await client.query<PlatformAdminUserRow>(
        `
        update public.platform_admin_users
        set display_name = case when $2::boolean then $3 else display_name end,
            role = case when $4::boolean then $5 else role end,
            status = case when $6::boolean then $7 else status end,
            updated_at = timezone('utc', now())
        where id = $1
        returning ${appOwnedPlatformAdminUserSelect}
        `,
        [
          adminUserId,
          input.displayName !== undefined,
          update.display_name ?? null,
          input.role !== undefined,
          update.role ?? null,
          input.status !== undefined,
          update.status ?? null,
        ],
      );
      const updated = updateResult.rows[0];

      if (!updated) {
        throw new ApiError(404, "PLATFORM_ADMIN_USER_NOT_FOUND", "Platform admin user not found.");
      }

      const adminUser = mapPlatformAdminUser(updated);

      if (input.status === "disabled") {
        await client.query(
          `
          update public.platform_admin_sessions
          set revoked_at = timezone('utc', now())
          where admin_user_id = $1
            and revoked_at is null
          `,
          [adminUser.id],
        );
      }

      await insertPlatformAdminEvent(client, {
        actorAdminId: actor.id,
        actorLabel: actor.email,
        eventType: "platform_admin_user.updated",
        targetType: "platform_admin_user",
        targetId: adminUser.id,
        summary: `更新后台管理员 ${adminUser.email}`,
        details: {
          fromRole: current.role,
          toRole: adminUser.role,
          fromStatus: current.status,
          toStatus: adminUser.status,
          displayNameChanged: current.displayName !== adminUser.displayName,
        },
      });

      return adminUser;
    });
  } catch (error) {
    throw mapPostgresError(error, "PLATFORM_ADMIN_USER_UPDATE_FAILED");
  }
}

export async function listPlatformInvitationCodes(
  filters: PlatformAdminInvitationCodeFilters = {},
): Promise<PlatformAdminInvitationCodeDto[]> {
  try {
    const result = await queryAppDb<InvitationCodeAdminRow>(
      `
      select ${invitationCodeAdminSelect}
      from public.invitation_codes
      order by created_at desc
      `,
    );

    return filterPlatformInvitationCodes(result.rows.map(mapInvitationCodeAdmin), filters);
  } catch (error) {
    throw mapPostgresError(error, "PLATFORM_INVITATION_CODES_FETCH_FAILED");
  }
}

export async function createPlatformInvitationCode(input: {
  code?: string;
  maxRedemptions?: number;
  expiresAt?: string | null;
  note?: string | null;
  actorLabel?: string;
}): Promise<PlatformAdminInvitationCodeDto> {
  const code = input.code?.trim() || generateInvitationCode();

  try {
    return await withAppDbTransaction(async (client) => {
      const insertResult = await insertAppOwnedInvitationCode(client, {
        code,
        maxRedemptions: input.maxRedemptions,
        expiresAt: input.expiresAt,
        note: input.note,
      });
      const invitationCode = mapInvitationCodeAdmin(insertResult);

      await insertPlatformAdminEvent(client, {
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
    });
  } catch (error) {
    throw mapPostgresError(error, "INVITATION_CODE_CREATE_FAILED");
  }
}

export async function updatePlatformInvitationCode(
  invitationCodeId: string,
  input: PlatformAdminInvitationCodePatch,
  actorLabel = "admin",
): Promise<PlatformAdminInvitationCodeDto> {
  try {
    return await withAppDbTransaction(async (client) => {
      const current = await getAppOwnedPlatformInvitationCodeById(
        invitationCodeId,
        client,
        { forUpdate: true },
      );

      if (current.status === input.status) {
        return current;
      }

      assertInvitationCodeStatusTransition(current.status, input.status);

      const updateResult = await client.query<InvitationCodeAdminRow>(
        `
        update public.invitation_codes
        set status = $2,
            updated_at = timezone('utc', now())
        where id = $1
        returning ${invitationCodeAdminSelect}
        `,
        [invitationCodeId, input.status],
      );
      const row = updateResult.rows[0];

      if (!row) {
        throw new ApiError(
          404,
          "PLATFORM_INVITATION_CODE_NOT_FOUND",
          "Invitation code not found.",
        );
      }

      const invitationCode = mapInvitationCodeAdmin(row);

      await insertPlatformAdminEvent(client, {
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
    });
  } catch (error) {
    throw mapPostgresError(error, "PLATFORM_INVITATION_CODE_UPDATE_FAILED");
  }
}

export async function listPlatformMerchants(): Promise<PlatformAdminMerchantDto[]> {
  try {
    const result = await queryAppDb<MerchantAdminRow>(
      `
      select ${merchantAdminSelect}
      from public.merchant_profiles
      order by created_at desc
      `,
    );
    const merchants = result.rows.map(mapMerchantProfile);
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
  } catch (error) {
    throw mapPostgresError(error, "PLATFORM_MERCHANTS_FETCH_FAILED");
  }
}

export async function getPlatformMerchantById(
  merchantId: string,
): Promise<PlatformAdminMerchantDto> {
  try {
    const result = await queryAppDb<MerchantAdminRow>(
      `
      select ${merchantAdminSelect}
      from public.merchant_profiles
      where id = $1
      limit 1
      `,
      [merchantId],
    );
    const row = result.rows[0];

    if (!row) {
      throw new ApiError(404, "PLATFORM_MERCHANT_NOT_FOUND", "Merchant profile not found.");
    }

    const merchant = mapMerchantProfile(row);
    const [totalImports, totalDrafts] = await Promise.all([
      countMerchantRows("import_jobs", merchantId),
      countMerchantRows("content_drafts", merchantId),
    ]);

    return toPlatformAdminMerchant(merchant, { totalImports, totalDrafts });
  } catch (error) {
    throw mapPostgresError(error, "PLATFORM_MERCHANT_FETCH_FAILED");
  }
}

export async function updatePlatformMerchant(
  merchantId: string,
  input: PlatformAdminMerchantPatch,
  actorLabel = "admin",
): Promise<PlatformAdminMerchantDto> {
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

  try {
    await withAppDbTransaction(async (client) => {
      const updateResult = await client.query<MerchantAdminRow>(
        `
        update public.merchant_profiles
        set status = coalesce($2, status),
            plan = coalesce($3, plan),
            updated_at = timezone('utc', now())
        where id = $1
        returning ${merchantAdminSelect}
        `,
        [merchantId, update.status ?? null, update.plan ?? null],
      );

      if (!updateResult.rows[0]) {
        throw new ApiError(404, "PLATFORM_MERCHANT_NOT_FOUND", "Merchant profile not found.");
      }

      await insertPlatformAdminEvent(client, {
        actorLabel,
        eventType: "merchant.updated",
        targetType: "merchant",
        targetId: merchantId,
        summary: `更新用户 ${updateResult.rows[0].name} 的平台状态`,
        details: update,
      });
    });

    return getPlatformMerchantById(merchantId);
  } catch (error) {
    throw mapPostgresError(error, "PLATFORM_MERCHANT_UPDATE_FAILED");
  }
}

export async function getPlatformSettings(): Promise<PlatformSettingsDto> {
  if (isLocalDemoRuntime()) {
    return demoPlatformSettings ?? getDefaultPlatformSettings();
  }

  try {
    const result = await queryAppDb<PlatformSettingRow>(
      `
      select key, category, value
      from public.platform_settings
      where key = any($1::text[])
      `,
      [platformSettingKeys],
    );
    const rows = new Map(result.rows.map((row) => [row.key, row]));

    return mapPlatformSettingsRows(rows);
  } catch (error) {
    throw mapPostgresError(error, "PLATFORM_SETTINGS_FETCH_FAILED");
  }
}

function mapPlatformSettingsRows(rows: Map<string, PlatformSettingRow>) {
  const llmRuntime = toLlmRuntimeSettings(rows.get("llm_runtime")?.value);
  const importRuntime = toImportRuntimeSettings(rows.get("import_runtime")?.value);
  const membershipPlans = toMembershipPlans(rows.get("membership_plans")?.value);
  const consultationAgent = toConsultationAgentSettings(
    rows.get("consultation_agent")?.value,
  );
  const scriptProductionAgent = toScriptProductionAgentSettings(
    rows.get("script_production_agent")?.value,
  );
  const knowledgeRuntime = toKnowledgeRuntimeSettings(rows.get("knowledge_runtime")?.value);

  return {
    llmRuntime,
    importRuntime,
    membershipPlans,
    consultationAgent,
    scriptProductionAgent,
    knowledgeRuntime,
  };
}

export async function updatePlatformSettings(
  input: PlatformSettingsUpdateInput,
  actorLabel = "admin",
): Promise<PlatformSettingsDto> {
  const current = await getPlatformSettings();
  const next = mergePlatformSettings(current, input);

  if (isLocalDemoRuntime()) {
    demoPlatformSettings = next;
    return next;
  }

  try {
    await withAppDbTransaction(async (client) => {
      for (const row of buildPlatformSettingsRows(next)) {
        await client.query(
          `
          insert into public.platform_settings (
            key,
            category,
            value,
            description
          ) values ($1, $2, $3::jsonb, $4)
          on conflict (key) do update
          set category = excluded.category,
              value = excluded.value,
              description = excluded.description,
              updated_at = timezone('utc', now())
          `,
          [row.key, row.category, JSON.stringify(row.value), row.description],
        );
      }

      await client.query(
        `
        insert into public.platform_admin_events (
          actor_label,
          event_type,
          target_type,
          target_id,
          summary,
          details
        ) values ($1, $2, $3, $4, $5, $6::jsonb)
        `,
        [
          actorLabel,
          "settings.updated",
          "platform_settings",
          null,
          "更新平台配置",
          JSON.stringify({ updatedKeys: Object.keys(input) }),
        ],
      );
    });

    return getPlatformSettings();
  } catch (error) {
    throw mapPostgresError(error, "PLATFORM_SETTINGS_UPDATE_FAILED");
  }
}

function buildPlatformSettingsRows(next: PlatformSettingsDto) {
  return [
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
      key: "script_production_agent",
      category: "script_production",
      value: {
        model: next.scriptProductionAgent.model,
        temperature: next.scriptProductionAgent.temperature,
        retrievalTopK: next.scriptProductionAgent.retrievalTopK,
        revisionEnabled: next.scriptProductionAgent.revisionEnabled,
      },
      description: "Platform-level script production agent settings.",
    },
    {
      key: "knowledge_runtime",
      category: "knowledge",
      value: next.knowledgeRuntime,
      description: "Platform-level knowledge retrieval runtime settings.",
    },
  ] as const;
}

function getDefaultPlatformSettings(): PlatformSettingsDto {
  return {
    llmRuntime: toLlmRuntimeSettings(undefined),
    importRuntime: toImportRuntimeSettings(undefined),
    membershipPlans: toMembershipPlans(undefined),
    consultationAgent: toConsultationAgentSettings(undefined),
    scriptProductionAgent: toScriptProductionAgentSettings(undefined),
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
    scriptProductionAgent: {
      ...current.scriptProductionAgent,
      ...input.scriptProductionAgent,
    },
    knowledgeRuntime: {
      ...current.knowledgeRuntime,
      ...input.knowledgeRuntime,
    },
  };
}

async function countByMerchant(table: "import_jobs" | "content_drafts") {
  try {
    const result = await queryAppDb<CountRow>(
      `
      select merchant_id, count(*)::text as count
      from public.${table}
      where merchant_id is not null
      group by merchant_id
      `,
    );

    return new Map(
      result.rows
        .filter((row) => row.merchant_id)
        .map((row) => [row.merchant_id as string, Number(row.count ?? 0)]),
    );
  } catch (error) {
    throw mapPostgresError(error, "PLATFORM_MERCHANT_COUNT_FAILED");
  }
}

async function countMerchantRows(
  table: "import_jobs" | "content_drafts",
  merchantId: string,
) {
  try {
    const result = await queryAppDb<{ count: string }>(
      `
      select count(*)::text as count
      from public.${table}
      where merchant_id = $1
      `,
      [merchantId],
    );

    return Number.parseInt(result.rows[0]?.count ?? "0", 10) || 0;
  } catch (error) {
    throw mapPostgresError(error, "PLATFORM_MERCHANT_COUNT_FAILED");
  }
}

async function insertAppOwnedPlatformAdminUser(
  client: DatabaseClient,
  input: {
    email: string;
    password: string;
    displayName: string | null;
    role: PlatformAdminRole;
    createdByAdminId: string | null;
  },
) {
  try {
    const result = await client.query<PlatformAdminUserRow>(
      `
      insert into public.platform_admin_users (
        email,
        password_hash,
        display_name,
        role,
        status,
        created_by_admin_id
      ) values ($1, $2, $3, $4, 'active', $5)
      returning ${appOwnedPlatformAdminUserSelect}
      `,
      [
        input.email,
        createPlatformAdminPasswordHash(input.password),
        input.displayName,
        input.role,
        input.createdByAdminId,
      ],
    );

    return result.rows[0];
  } catch (error) {
    if (isPostgresUniqueViolation(error)) {
      throw new ApiError(409, "PLATFORM_ADMIN_USER_EXISTS", "Platform admin email already exists.");
    }

    throw error;
  }
}

async function getAppOwnedPlatformAdminUserById(
  adminUserId: string,
  client?: DatabaseClient,
  options: { forUpdate?: boolean } = {},
): Promise<PlatformAdminUserDto> {
  const sql = `
  select ${appOwnedPlatformAdminUserSelect}
  from public.platform_admin_users
  where id = $1
  limit 1
  ${options.forUpdate ? "for update" : ""}
  `;
  const params = [adminUserId];
  const result = client
    ? await client.query<PlatformAdminUserRow>(sql, params)
    : await queryAppDb<PlatformAdminUserRow>(sql, params);
  const row = result.rows[0];

  if (!row) {
    throw new ApiError(404, "PLATFORM_ADMIN_USER_NOT_FOUND", "Platform admin user not found.");
  }

  return mapPlatformAdminUser(row);
}

async function countAppOwnedActiveSuperAdmins(client?: DatabaseClient) {
  const sql = `
  select count(*)::text as count
  from public.platform_admin_users
  where role = 'super_admin'
    and status = 'active'
  `;
  const result = client
    ? await client.query<{ count: string }>(sql)
    : await queryAppDb<{ count: string }>(sql);

  return Number.parseInt(result.rows[0]?.count ?? "0", 10) || 0;
}

async function insertAppOwnedInvitationCode(
  client: DatabaseClient,
  input: {
    code: string;
    maxRedemptions?: number;
    expiresAt?: string | null;
    note?: string | null;
  },
) {
  try {
    const result = await client.query<InvitationCodeAdminRow>(
      `
      insert into public.invitation_codes (
        code,
        max_redemptions,
        expires_at,
        note
      ) values ($1, $2, $3, $4)
      returning ${invitationCodeAdminSelect}
      `,
      [input.code, input.maxRedemptions ?? 1, input.expiresAt ?? null, input.note ?? null],
    );

    return result.rows[0];
  } catch (error) {
    if (isPostgresUniqueViolation(error)) {
      throw new ApiError(409, "INVITATION_CODE_EXISTS", "Invitation code already exists.");
    }

    throw error;
  }
}

async function getAppOwnedPlatformInvitationCodeById(
  invitationCodeId: string,
  client?: DatabaseClient,
  options: { forUpdate?: boolean } = {},
): Promise<PlatformAdminInvitationCodeDto> {
  const sql = `
  select ${invitationCodeAdminSelect}
  from public.invitation_codes
  where id = $1
  limit 1
  ${options.forUpdate ? "for update" : ""}
  `;
  const params = [invitationCodeId];
  const result = client
    ? await client.query<InvitationCodeAdminRow>(sql, params)
    : await queryAppDb<InvitationCodeAdminRow>(sql, params);
  const row = result.rows[0];

  if (!row) {
    throw new ApiError(404, "PLATFORM_INVITATION_CODE_NOT_FOUND", "Invitation code not found.");
  }

  return mapInvitationCodeAdmin(row);
}

async function insertPlatformAdminEvent(
  client: DatabaseClient | null,
  input: {
    actorAdminId?: string | null;
    actorLabel: string;
    eventType: string;
    targetType: string;
    targetId?: string;
    summary: string;
    details?: Record<string, unknown>;
  },
) {
  const sql = `
  insert into public.platform_admin_events (
    actor_admin_id,
    actor_label,
    event_type,
    target_type,
    target_id,
    summary,
    details
  ) values ($1, $2, $3, $4, $5, $6, $7::jsonb)
  returning id
  `;
  const params = [
    input.actorAdminId ?? null,
    input.actorLabel,
    input.eventType,
    input.targetType,
    input.targetId ?? null,
    input.summary,
    JSON.stringify(input.details ?? {}),
  ];

  if (client) {
    await client.query<PlatformAdminEventRow>(sql, params);
    return;
  }

  await queryAppDb<PlatformAdminEventRow>(sql, params);
}

function assertInvitationCodeStatusTransition(
  currentStatus: PlatformAdminInvitationCodeDto["status"],
  nextStatus: PlatformAdminInvitationCodePatch["status"],
) {
  if (nextStatus === "disabled" && currentStatus !== "active") {
    throw new ApiError(
      409,
      "INVITATION_CODE_CANNOT_DISABLE",
      "Only active invitation codes can be disabled.",
    );
  }

  if (nextStatus === "active" && currentStatus !== "disabled") {
    throw new ApiError(
      409,
      "INVITATION_CODE_CANNOT_ACTIVATE",
      "Only disabled invitation codes can be re-enabled.",
    );
  }
}

function mapPlatformAdminUser(row: PlatformAdminUserRow): PlatformAdminUserDto {
  return {
    id: row.id,
    authUserId: row.auth_user_id ?? row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdByAdminId: row.created_by_admin_id,
    lastLoginAt: row.last_login_at ? toIsoString(row.last_login_at) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapInvitationCodeAdmin(row: InvitationCodeAdminRow): PlatformAdminInvitationCodeDto {
  return {
    id: row.id,
    code: row.code,
    purpose: row.purpose,
    status: row.status,
    maxRedemptions: row.max_redemptions,
    redemptionCount: row.redemption_count,
    expiresAt: row.expires_at ? toIsoString(row.expires_at) : null,
    note: row.note,
    createdAt: toIsoString(row.created_at),
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
  const storedBaseUrl = getString(record.baseUrl, defaultLlmRuntime.baseUrl);
  const useSiliconFlowDefaults =
    apiKeySource !== "openai" &&
    (!storedBaseUrl || storedBaseUrl === "https://api.openai.com/v1");

  return {
    providerLabel: useSiliconFlowDefaults
      ? defaultLlmRuntime.providerLabel
      : getString(record.providerLabel, defaultLlmRuntime.providerLabel),
    baseUrl: useSiliconFlowDefaults ? defaultLlmRuntime.baseUrl : storedBaseUrl,
    primaryModel: useSiliconFlowDefaults
      ? defaultLlmRuntime.primaryModel
      : getString(record.primaryModel, defaultLlmRuntime.primaryModel),
    fallbackModel: useSiliconFlowDefaults
      ? defaultLlmRuntime.fallbackModel
      : getNullableString(record.fallbackModel, defaultLlmRuntime.fallbackModel ?? null),
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
  const model = normalizeLegacyOpenAiModel(
    getString(record.model, defaultConsultationAgent.model),
    defaultConsultationAgent.model,
  );

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
    model,
    temperature: getNumber(record.temperature, defaultConsultationAgent.temperature),
  };
}

function toScriptProductionAgentSettings(value: unknown): ScriptProductionAgentSettingsDto {
  const record = toRecord(value);
  const model = normalizeLegacyOpenAiModel(
    getString(record.model, defaultScriptProductionAgent.model),
    defaultScriptProductionAgent.model,
  );

  return {
    model,
    temperature: getNumber(record.temperature, defaultScriptProductionAgent.temperature),
    retrievalTopK: getNumber(record.retrievalTopK, defaultScriptProductionAgent.retrievalTopK),
    revisionEnabled: getBoolean(
      record.revisionEnabled,
      defaultScriptProductionAgent.revisionEnabled,
    ),
  };
}

function toKnowledgeRuntimeSettings(value: unknown): KnowledgeRuntimeSettingsDto {
  const record = toRecord(value);
  const embeddingModel = normalizeLegacyOpenAiModel(
    getString(record.embeddingModel, defaultKnowledgeRuntime.embeddingModel),
    defaultKnowledgeRuntime.embeddingModel,
  );

  return {
    retrievalTopK: getNumber(record.retrievalTopK, defaultKnowledgeRuntime.retrievalTopK),
    chunkSize: getNumber(record.chunkSize, defaultKnowledgeRuntime.chunkSize),
    chunkOverlap: getNumber(record.chunkOverlap, defaultKnowledgeRuntime.chunkOverlap),
    embeddingModel,
    queryRewriteEnabled: getBoolean(
      record.queryRewriteEnabled,
      defaultKnowledgeRuntime.queryRewriteEnabled,
    ),
  };
}

function normalizeLegacyOpenAiModel(model: string, fallback: string) {
  if (getAiRuntimeApiKeySource() === "openai") {
    return model;
  }

  return isLegacyOpenAiModel(model) ? fallback : model;
}

function isLegacyOpenAiModel(model: string) {
  const normalized = model.trim().toLowerCase();

  return (
    normalized.startsWith("gpt-") ||
    normalized.startsWith("text-embedding-") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4")
  );
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

  const allowed = new Set<ConsultationAgentSettingsDto["enabledTools"][number]>(
    consultationAgentToolKeys,
  );
  const seen = new Set<ConsultationAgentSettingsDto["enabledTools"][number]>();
  const next: ConsultationAgentSettingsDto["enabledTools"] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const toolKey = item as ConsultationAgentSettingsDto["enabledTools"][number];

    if (!allowed.has(toolKey) || seen.has(toolKey)) {
      continue;
    }

    seen.add(toolKey);
    next.push(toolKey);
  }

  return next.length > 0 ? next : defaultConsultationAgent.enabledTools;
}

function generateInvitationCode() {
  return `JJ-${randomBytes(6).toString("hex").toUpperCase()}`;
}

function isPostgresUniqueViolation(error: unknown) {
  return (error as { code?: unknown }).code === "23505";
}

function toIsoString(value: Timestamp) {
  return value instanceof Date ? value.toISOString() : value;
}
