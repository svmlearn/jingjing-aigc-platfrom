import "server-only";

import { randomUUID } from "node:crypto";

import type {
  AgentBindingStatus,
  AgentConfigDto,
  AgentConfigDetailDto,
  AgentConsoleFoundationStateDto,
  AgentTestRunDto,
  AgentTestRunStatus,
  AgentKnowledgeSetBindingDto,
  AgentPromptVersionDto,
  AgentPromptVersionStatus,
  AgentRouteBindingDto,
  AgentRouteBindingStatus,
  AgentRuntimeSnapshotDto,
  AgentRouteKey,
  AgentServiceFlags,
  AgentServiceStatus,
  AgentSkillBindingDto,
  AgentSkillDto,
  AgentSoulVersionDto,
  AgentAssetStatus,
  KnowledgeSetDetailDto,
  KnowledgeSetDocumentDto,
  KnowledgeSetDto,
  KnowledgeSetScope,
  MerchantCreditAccountDto,
  MerchantCreditLedgerDto,
  MerchantUsageEventDto,
} from "@/contracts/agent-console";
import {
  type DatabaseClient,
  mapPostgresError,
  queryAppDb,
  withAppDbTransaction,
} from "@/lib/server-db/postgres";
import { isLocalDemoRuntime } from "@/lib/demo/local-demo-runtime";
import { ApiError } from "@/server/api/errors";

type AgentConfigRow = {
  id: string;
  agent_key: string;
  display_name: string;
  role_description: string | null;
  description: string | null;
  service_status: AgentServiceStatus;
  service_flags: unknown;
  model_config: unknown;
  copied_from_agent_id: string | null;
  created_by_admin_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type AgentPromptVersionRow = {
  id: string;
  agent_id: string;
  version_no: number;
  body: string;
  status: AgentPromptVersionStatus;
  change_note: string | null;
  created_by_admin_id: string | null;
  created_at: string | Date;
  activated_at: string | Date | null;
  archived_at: string | Date | null;
};

type AgentSoulVersionRow = {
  id: string;
  agent_id: string;
  version_no: number;
  body: string;
  status: AgentPromptVersionStatus;
  change_note: string | null;
  created_by_admin_id: string | null;
  created_at: string | Date;
  activated_at: string | Date | null;
  archived_at: string | Date | null;
};

type AgentSkillRow = {
  id: string;
  skill_key: string | null;
  name: string;
  description: string;
  when_to_use: string;
  body: string;
  status: AgentAssetStatus;
  dependencies: unknown;
  metadata: unknown;
  created_by_admin_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type AgentSkillBindingRow = {
  id: string;
  agent_id: string;
  skill_id: string;
  status: AgentBindingStatus;
  created_by_admin_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type KnowledgeSetRow = {
  id: string;
  set_key: string | null;
  name: string;
  description: string | null;
  scope: KnowledgeSetScope;
  merchant_id: string | null;
  status: AgentAssetStatus;
  metadata: unknown;
  created_by_admin_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type AgentKnowledgeSetBindingRow = {
  id: string;
  agent_id: string;
  knowledge_set_id: string;
  status: AgentBindingStatus;
  created_by_admin_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type AgentRouteBindingRow = {
  id: string;
  route_key: AgentRouteKey;
  agent_id: string | null;
  status: AgentRouteBindingStatus;
  description: string | null;
  created_by_admin_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type KnowledgeSetDocumentRow = {
  id: string;
  knowledge_set_id: string;
  document_id: string;
  created_by_admin_id: string | null;
  created_at: string | Date;
};

type AgentRuntimeSnapshotRow = {
  id: string;
  session_id: string | null;
  message_id: string | null;
  agent_id: string | null;
  prompt_version_id: string | null;
  candidate_skill_ids: unknown;
  actual_skill_ids: unknown;
  knowledge_set_ids: unknown;
  knowledge_match_ids: unknown;
  memory_match_ids: unknown;
  tool_call_summary: unknown;
  model: string | null;
  created_at: string | Date;
};

type AgentTestRunRow = {
  id: string;
  agent_id: string | null;
  merchant_id: string | null;
  input_message: string;
  prompt_version_id: string | null;
  candidate_skill_ids: unknown;
  actual_skill_ids: unknown;
  knowledge_set_ids: unknown;
  knowledge_match_ids: unknown;
  memory_match_ids: unknown;
  tool_summary: unknown;
  assistant_output: string | null;
  status: AgentTestRunStatus;
  error_summary: string | null;
  model: string | null;
  created_by_admin_id: string | null;
  created_at: string | Date;
};

type MerchantCreditAccountRow = {
  id: string;
  merchant_id: string;
  balance: number;
  metadata: unknown;
  created_at: string | Date;
  updated_at: string | Date;
};

type MerchantUsageEventRow = {
  id: string;
  merchant_id: string;
  action_type: string;
  agent_id: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  status: MerchantUsageEventDto["status"];
  metadata: unknown;
  created_at: string | Date;
};

type MerchantCreditLedgerRow = {
  id: string;
  merchant_id: string;
  credit_account_id: string | null;
  direction: MerchantCreditLedgerDto["direction"];
  amount: number;
  reason: string;
  related_usage_event_id: string | null;
  metadata: unknown;
  created_at: string | Date;
};

type AgentConfigCreateInput = {
  agentKey?: string;
  displayName: string;
  roleDescription?: string | null;
  description?: string | null;
  serviceStatus?: AgentServiceStatus;
  serviceFlags?: Partial<AgentServiceFlags>;
  modelConfig?: Record<string, unknown>;
  actorLabel?: string;
};

type AgentConfigUpdateInput = Partial<{
  displayName: string;
  roleDescription: string | null;
  description: string | null;
  serviceStatus: AgentServiceStatus;
  serviceFlags: Partial<AgentServiceFlags>;
  modelConfig: Record<string, unknown>;
}> & {
  actorLabel?: string;
};

type AgentSkillCreateInput = {
  skillKey?: string | null;
  name: string;
  description?: string;
  whenToUse?: string;
  body?: string;
  status?: AgentAssetStatus;
  dependencies?: string[];
  metadata?: Record<string, unknown>;
  actorLabel?: string;
};

type AgentSkillUpdateInput = Partial<{
  skillKey: string | null;
  name: string;
  description: string;
  whenToUse: string;
  body: string;
  status: AgentAssetStatus;
  dependencies: string[];
  metadata: Record<string, unknown>;
}> & {
  actorLabel?: string;
};

type KnowledgeSetCreateInput = {
  setKey?: string | null;
  name: string;
  description?: string | null;
  scope?: KnowledgeSetScope;
  merchantId?: string | null;
  status?: AgentAssetStatus;
  metadata?: Record<string, unknown>;
  actorLabel?: string;
};

type KnowledgeSetUpdateInput = Partial<{
  setKey: string | null;
  name: string;
  description: string | null;
  status: AgentAssetStatus;
  metadata: Record<string, unknown>;
}> & {
  actorLabel?: string;
};

type AgentRuntimeSnapshotCreateInput = {
  sessionId?: string | null;
  messageId?: string | null;
  agentId?: string | null;
  promptVersionId?: string | null;
  candidateSkillIds?: string[];
  actualSkillIds?: string[];
  knowledgeSetIds?: string[];
  knowledgeMatchIds?: string[];
  memoryMatchIds?: string[];
  toolCallSummary?: Record<string, unknown>;
  model?: string | null;
};

type AgentTestRunCreateInput = {
  agentId?: string | null;
  merchantId?: string | null;
  inputMessage: string;
  promptVersionId?: string | null;
  candidateSkillIds?: string[];
  actualSkillIds?: string[];
  knowledgeSetIds?: string[];
  knowledgeMatchIds?: string[];
  memoryMatchIds?: string[];
  toolSummary?: Record<string, unknown>;
  assistantOutput?: string | null;
  status: AgentTestRunStatus;
  errorSummary?: string | null;
  model?: string | null;
  actorLabel?: string;
};

const demoCreatedAt = "2026-04-27T00:00:00.000Z";

const demoInitialAgent: AgentConfigDto = {
  id: "demo_initial_consultation_agent",
  agentKey: "initial_consultation_agent",
  displayName: "初始咨询 Agent",
  roleDescription: "用户内容咨询顾问",
  description: "本地 demo runtime 的初始咨询 Agent。",
  serviceStatus: "enabled",
  serviceFlags: {
    systemPromptEnabled: true,
    skillsEnabled: true,
    knowledgeEnabled: true,
  },
  modelConfig: {},
  copiedFromAgentId: null,
  createdByAdminId: null,
  createdAt: demoCreatedAt,
  updatedAt: demoCreatedAt,
};

const demoBaseKnowledgeSet: KnowledgeSetDto = {
  id: "demo_base_platform_knowledge",
  setKey: "base_platform_knowledge",
  name: "基础平台知识集",
  description: "本地 demo runtime 的基础平台知识集。",
  scope: "platform",
  merchantId: null,
  status: "enabled",
  metadata: {},
  createdByAdminId: null,
  createdAt: demoCreatedAt,
  updatedAt: demoCreatedAt,
};

const demoConsultationDefaultBinding: AgentRouteBindingDto = {
  id: "demo_consultation_default_binding",
  routeKey: "consultation_default",
  agentId: demoInitialAgent.id,
  status: "active",
  description: "用户端默认咨询入口绑定。",
  createdByAdminId: null,
  createdAt: demoCreatedAt,
  updatedAt: demoCreatedAt,
};

export async function getAgentConsoleFoundationState(): Promise<AgentConsoleFoundationStateDto> {
  const [agents, routeBindings, knowledgeSets, skills] = await Promise.all([
    listAgentConfigs(),
    listAgentRouteBindings(),
    listKnowledgeSets(),
    listAgentSkills(),
  ]);

  return {
    agents,
    routeBindings,
    knowledgeSets,
    skills,
  };
}

export async function createAgentConfig(
  input: AgentConfigCreateInput,
): Promise<AgentConfigDto> {
  if (input.serviceStatus === "enabled") {
    throw new ApiError(
      409,
      "AGENT_ACTIVE_PROMPT_REQUIRED",
      "请先创建并发布 agent.md，再启用 Agent",
    );
  }

  return withAppDbTransaction(async (client) => {
    await assertAgentDisplayNameAvailableInPostgres(client, input.displayName);
    const agentKey = input.agentKey ?? createStableKey("agent");
    const result = await client.query<AgentConfigRow>(
      `
      insert into public.agent_configs (
        agent_key,
        display_name,
        role_description,
        description,
        service_status,
        service_flags,
        model_config
      ) values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
      returning ${agentConfigSelect}
      `,
      [
        agentKey,
        input.displayName,
        input.roleDescription ?? null,
        input.description ?? null,
        input.serviceStatus ?? "draft",
        JSON.stringify(normalizeAgentServiceFlags(input.serviceFlags)),
        JSON.stringify(input.modelConfig ?? {}),
      ],
    );
    const agent = mapAgentConfig(result.rows[0]);

    await recordAgentConsoleAdminEventWithClient(client, {
      actorLabel: input.actorLabel,
      eventType: "agent.created",
      targetType: "agent",
      targetId: agent.id,
      summary: `创建 Agent ${agent.displayName}`,
      details: {
        agentKey: agent.agentKey,
        serviceStatus: agent.serviceStatus,
      },
    });

    return agent;
  });
}

export async function getAgentConfigById(agentId: string): Promise<AgentConfigDto> {
  if (isLocalDemoRuntime()) {
    if (agentId === demoInitialAgent.id) {
      return demoInitialAgent;
    }

    throw new ApiError(404, "AGENT_CONFIG_NOT_FOUND", "Agent config not found.");
  }

  try {
    const result = await queryAppDb<AgentConfigRow>(
      `
      select ${agentConfigSelect}
      from public.agent_configs
      where id = $1
      limit 1
      `,
      [agentId],
    );
    const row = result.rows[0];

    if (!row) {
      throw new ApiError(404, "AGENT_CONFIG_NOT_FOUND", "Agent config not found.");
    }

    return mapAgentConfig(row);
  } catch (error) {
    throw mapPostgresError(error, "AGENT_CONFIG_FETCH_FAILED");
  }
}

export async function getAgentConfigDetail(
  agentId: string,
): Promise<AgentConfigDetailDto> {
  const [agent, promptVersions, soulVersions, skillBindings, knowledgeSetBindings] = await Promise.all([
    getAgentConfigById(agentId),
    listAgentPromptVersions(agentId),
    listAgentSoulVersions(agentId),
    listAgentSkillBindings({ agentId }),
    listAgentKnowledgeSetBindings({ agentId }),
  ]);

  return {
    agent,
    promptVersions,
    soulVersions,
    activePromptVersion: promptVersions.find((prompt) => prompt.status === "active") ?? null,
    activeSoulVersion: soulVersions.find((soul) => soul.status === "active") ?? null,
    skillBindings,
    knowledgeSetBindings,
  };
}

export async function updateAgentConfig(
  agentId: string,
  input: AgentConfigUpdateInput,
): Promise<AgentConfigDto> {
  return withAppDbTransaction(async (client) => {
    const current = await getAgentConfigByIdFromPostgres(client, agentId);
    const updates: string[] = [];
    const values: unknown[] = [];

    if (input.serviceStatus === "enabled") {
      await assertAgentHasActivePromptInPostgres(client, agentId);
    }

    if (input.serviceStatus && input.serviceStatus !== "enabled") {
      const routeResult = await client.query<AgentRouteBindingRow>(
        `
        select ${agentRouteBindingSelect}
        from public.agent_route_bindings
        where route_key = 'consultation_default'
          and status = 'active'
          and agent_id = $1
        limit 1
        `,
        [agentId],
      );

      if (routeResult.rows[0]) {
        throw new ApiError(
          409,
          "AGENT_DEFAULT_DISABLE_BLOCKED",
          "请先切换默认 Agent",
          { agentId },
        );
      }
    }

    if (input.displayName !== undefined) {
      if (input.displayName !== current.displayName) {
        await assertAgentDisplayNameAvailableInPostgres(client, input.displayName, agentId);
      }
      values.push(input.displayName);
      updates.push(`display_name = $${values.length}`);
    }
    if (input.roleDescription !== undefined) {
      values.push(input.roleDescription);
      updates.push(`role_description = $${values.length}`);
    }
    if (input.description !== undefined) {
      values.push(input.description);
      updates.push(`description = $${values.length}`);
    }
    if (input.serviceStatus !== undefined) {
      values.push(input.serviceStatus);
      updates.push(`service_status = $${values.length}`);
    }
    if (input.serviceFlags !== undefined) {
      values.push(JSON.stringify(normalizeAgentServiceFlags(input.serviceFlags, current.serviceFlags)));
      updates.push(`service_flags = $${values.length}::jsonb`);
    }
    if (input.modelConfig !== undefined) {
      values.push(JSON.stringify(input.modelConfig));
      updates.push(`model_config = $${values.length}::jsonb`);
    }

    if (updates.length === 0) {
      return current;
    }

    values.push(agentId);
    const result = await client.query<AgentConfigRow>(
      `
      update public.agent_configs
      set ${updates.join(", ")}
      where id = $${values.length}
      returning ${agentConfigSelect}
      `,
      values,
    );
    const agent = mapAgentConfig(result.rows[0]);

    await recordAgentConsoleAdminEventWithClient(client, {
      actorLabel: input.actorLabel,
      eventType: "agent.updated",
      targetType: "agent",
      targetId: agentId,
      summary: `更新 Agent ${agent.displayName}`,
      details: {
        updatedFields: updates.map((item) => item.split(" = ")[0]),
        fromStatus: current.serviceStatus,
        toStatus: agent.serviceStatus,
      },
    });

    return agent;
  });
}

export async function copyAgentConfig(
  agentId: string,
  input: { displayName: string; actorLabel?: string },
): Promise<AgentConfigDetailDto> {
  const copiedAgentId = await withAppDbTransaction(async (client) => {
    const source = await getAgentConfigByIdFromPostgres(client, agentId);
    await assertAgentDisplayNameAvailableInPostgres(client, input.displayName);
    const insertAgent = await client.query<AgentConfigRow>(
      `
      insert into public.agent_configs (
        agent_key,
        display_name,
        role_description,
        description,
        service_status,
        service_flags,
        model_config,
        copied_from_agent_id
      ) values ($1, $2, $3, $4, 'draft', $5::jsonb, $6::jsonb, $7)
      returning ${agentConfigSelect}
      `,
      [
        createStableKey("agent"),
        input.displayName,
        source.roleDescription ?? null,
        source.description ?? null,
        JSON.stringify(source.serviceFlags),
        JSON.stringify(source.modelConfig),
        source.id,
      ],
    );
    const copied = mapAgentConfig(insertAgent.rows[0]);

    const [promptRows, soulRows, skillBindingRows, knowledgeBindingRows] = await Promise.all([
      client.query<AgentPromptVersionRow>(
        `
        select ${agentPromptVersionSelect}
        from public.agent_prompt_versions
        where agent_id = $1
        order by version_no asc
        `,
        [source.id],
      ),
      client.query<AgentSoulVersionRow>(
        `
        select ${agentSoulVersionSelect}
        from public.agent_soul_versions
        where agent_id = $1
        order by version_no asc
        `,
        [source.id],
      ),
      client.query<AgentSkillBindingRow>(
        `
        select ${agentSkillBindingSelect}
        from public.agent_skill_bindings
        where agent_id = $1
        order by created_at asc
        `,
        [source.id],
      ),
      client.query<AgentKnowledgeSetBindingRow>(
        `
        select ${agentKnowledgeSetBindingSelect}
        from public.agent_knowledge_set_bindings
        where agent_id = $1
        order by created_at asc
        `,
        [source.id],
      ),
    ]);

    const prompts = promptRows.rows.map(mapAgentPromptVersion);
    const souls = soulRows.rows.map(mapAgentSoulVersion);
    const skillBindings = skillBindingRows.rows.map(mapAgentSkillBinding);
    const knowledgeSetBindings = knowledgeBindingRows.rows.map(mapAgentKnowledgeSetBinding);
    const activePrompt = prompts.find((prompt) => prompt.status === "active");
    const draftPrompt = prompts.find((prompt) => prompt.status === "draft");
    const activeSoul = souls.find((soul) => soul.status === "active");
    const draftSoul = souls.find((soul) => soul.status === "draft");
    const now = new Date();

    if (activePrompt) {
      await client.query(
        `
        insert into public.agent_prompt_versions (
          agent_id,
          version_no,
          body,
          status,
          change_note,
          activated_at
        ) values ($1, 1, $2, 'active', $3, $4)
        `,
        [
          copied.id,
          activePrompt.body,
          `复制自 ${source.displayName} 的 active agent.md。`,
          now,
        ],
      );
    }

    if (draftPrompt) {
      await client.query(
        `
        insert into public.agent_prompt_versions (
          agent_id,
          version_no,
          body,
          status,
          change_note
        ) values ($1, $2, $3, 'draft', $4)
        `,
        [
          copied.id,
          activePrompt ? 2 : 1,
          draftPrompt.body,
          `复制自 ${source.displayName} 的 draft agent.md。`,
        ],
      );
    }

    if (activeSoul) {
      await client.query(
        `
        insert into public.agent_soul_versions (
          agent_id,
          version_no,
          body,
          status,
          change_note,
          activated_at
        ) values ($1, 1, $2, 'active', $3, $4)
        `,
        [
          copied.id,
          activeSoul.body,
          `复制自 ${source.displayName} 的 active soul.md。`,
          now,
        ],
      );
    }

    if (draftSoul) {
      await client.query(
        `
        insert into public.agent_soul_versions (
          agent_id,
          version_no,
          body,
          status,
          change_note
        ) values ($1, $2, $3, 'draft', $4)
        `,
        [
          copied.id,
          activeSoul ? 2 : 1,
          draftSoul.body,
          `复制自 ${source.displayName} 的 draft soul.md。`,
        ],
      );
    }

    for (const binding of skillBindings) {
      await client.query(
        `
        insert into public.agent_skill_bindings (
          agent_id,
          skill_id,
          status
        ) values ($1, $2, $3)
        `,
        [copied.id, binding.skillId, binding.status],
      );
    }

    for (const binding of knowledgeSetBindings) {
      await client.query(
        `
        insert into public.agent_knowledge_set_bindings (
          agent_id,
          knowledge_set_id,
          status
        ) values ($1, $2, $3)
        `,
        [copied.id, binding.knowledgeSetId, binding.status],
      );
    }

    await recordAgentConsoleAdminEventWithClient(client, {
      actorLabel: input.actorLabel,
      eventType: "agent.copied",
      targetType: "agent",
      targetId: copied.id,
      summary: `复制 Agent ${source.displayName} 为 ${copied.displayName}`,
      details: {
        sourceAgentId: source.id,
        copiedSkillCount: skillBindings.length,
        copiedKnowledgeSetCount: knowledgeSetBindings.length,
        copiedPromptStates: prompts.map((prompt) => prompt.status),
        copiedSoulStates: souls.map((soul) => soul.status),
      },
    });

    return copied.id;
  });

  return getAgentConfigDetail(copiedAgentId);
}

export async function listAgentConfigs(): Promise<AgentConfigDto[]> {
  if (isLocalDemoRuntime()) {
    return [demoInitialAgent];
  }

  try {
    const result = await queryAppDb<AgentConfigRow>(
      `
      select ${agentConfigSelect}
      from public.agent_configs
      order by created_at desc
      `,
    );

    return result.rows.map(mapAgentConfig);
  } catch (error) {
    throw mapPostgresError(error, "AGENT_CONFIGS_LIST_FAILED");
  }
}

export async function listAgentPromptVersions(
  agentId: string,
): Promise<AgentPromptVersionDto[]> {
  if (isLocalDemoRuntime()) {
    return [];
  }

  try {
    const result = await queryAppDb<AgentPromptVersionRow>(
      `
      select ${agentPromptVersionSelect}
      from public.agent_prompt_versions
      where agent_id = $1
      order by version_no desc
      `,
      [agentId],
    );

    return result.rows.map(mapAgentPromptVersion);
  } catch (error) {
    throw mapPostgresError(error, "AGENT_PROMPT_VERSIONS_LIST_FAILED");
  }
}

export async function getActiveAgentPromptVersion(
  agentId: string,
): Promise<AgentPromptVersionDto | null> {
  if (isLocalDemoRuntime()) {
    return null;
  }

  try {
    const result = await queryAppDb<AgentPromptVersionRow>(
      `
      select ${agentPromptVersionSelect}
      from public.agent_prompt_versions
      where agent_id = $1
        and status = 'active'
      limit 1
      `,
      [agentId],
    );

    return result.rows[0] ? mapAgentPromptVersion(result.rows[0]) : null;
  } catch (error) {
    throw mapPostgresError(error, "AGENT_ACTIVE_PROMPT_FETCH_FAILED");
  }
}

export async function saveAgentPromptDraft(input: {
  agentId: string;
  body: string;
  changeNote?: string | null;
  actorLabel?: string;
}): Promise<AgentPromptVersionDto> {
  return withAppDbTransaction(async (client) => {
    await getAgentConfigByIdFromPostgres(client, input.agentId);
    const existingDraft = await getDraftPromptFromPostgres(client, input.agentId);

    if (existingDraft) {
      const result = await client.query<AgentPromptVersionRow>(
        `
        update public.agent_prompt_versions
        set body = $1,
            change_note = $2
        where id = $3
        returning ${agentPromptVersionSelect}
        `,
        [input.body, input.changeNote ?? null, existingDraft.id],
      );
      const draft = mapAgentPromptVersion(result.rows[0]);

      await recordAgentConsoleAdminEventWithClient(client, {
        actorLabel: input.actorLabel,
        eventType: "agent_prompt.draft_saved",
        targetType: "agent_prompt_version",
        targetId: draft.id,
        summary: `保存 agent.md 草稿 v${draft.versionNo}`,
        details: {
          agentId: input.agentId,
          changeNote: input.changeNote ?? null,
        },
      });

      return draft;
    }

    const nextVersionNo = await getNextPromptVersionNoInPostgres(client, input.agentId);
    const result = await client.query<AgentPromptVersionRow>(
      `
      insert into public.agent_prompt_versions (
        agent_id,
        version_no,
        body,
        status,
        change_note
      ) values ($1, $2, $3, 'draft', $4)
      returning ${agentPromptVersionSelect}
      `,
      [input.agentId, nextVersionNo, input.body, input.changeNote ?? null],
    );
    const draft = mapAgentPromptVersion(result.rows[0]);

    await recordAgentConsoleAdminEventWithClient(client, {
      actorLabel: input.actorLabel,
      eventType: "agent_prompt.draft_created",
      targetType: "agent_prompt_version",
      targetId: draft.id,
      summary: `创建 agent.md 草稿 v${draft.versionNo}`,
      details: {
        agentId: input.agentId,
        changeNote: input.changeNote ?? null,
      },
    });

    return draft;
  });
}

export async function publishAgentPromptDraft(input: {
  agentId: string;
  promptVersionId?: string;
  actorLabel?: string;
}): Promise<AgentPromptVersionDto> {
  return withAppDbTransaction(async (client) => {
    const prompts = await listPromptVersionsFromPostgres(client, input.agentId);
    const draft = input.promptVersionId
      ? prompts.find((prompt) => prompt.id === input.promptVersionId)
      : prompts.find((prompt) => prompt.status === "draft");

    if (!draft) {
      throw new ApiError(404, "AGENT_PROMPT_DRAFT_NOT_FOUND", "agent.md draft not found.");
    }

    if (draft.status !== "draft") {
      throw new ApiError(409, "AGENT_PROMPT_NOT_DRAFT", "Only draft prompts can be published.");
    }

    if (!draft.body.trim()) {
      throw new ApiError(400, "AGENT_PROMPT_EMPTY", "agent.md 不能为空");
    }

    const active = prompts.find((prompt) => prompt.status === "active");
    const now = new Date();

    if (active) {
      await client.query(
        `
        update public.agent_prompt_versions
        set status = 'archived',
            archived_at = $1
        where id = $2
        `,
        [now, active.id],
      );
    }

    const result = await client.query<AgentPromptVersionRow>(
      `
      update public.agent_prompt_versions
      set status = 'active',
          activated_at = $1,
          archived_at = null
      where id = $2
      returning ${agentPromptVersionSelect}
      `,
      [now, draft.id],
    );
    const published = mapAgentPromptVersion(result.rows[0]);

    await recordAgentConsoleAdminEventWithClient(client, {
      actorLabel: input.actorLabel,
      eventType: "agent_prompt.published",
      targetType: "agent_prompt_version",
      targetId: published.id,
      summary: `发布 agent.md v${published.versionNo}`,
      details: {
        agentId: input.agentId,
        previousActivePromptVersionId: active?.id ?? null,
      },
    });

    return published;
  });
}

export async function rollbackAgentPromptVersion(input: {
  agentId: string;
  promptVersionId: string;
  actorLabel?: string;
}): Promise<AgentPromptVersionDto> {
  return withAppDbTransaction(async (client) => {
    const prompts = await listPromptVersionsFromPostgres(client, input.agentId);
    const target = prompts.find((prompt) => prompt.id === input.promptVersionId);

    if (!target) {
      throw new ApiError(404, "AGENT_PROMPT_VERSION_NOT_FOUND", "agent.md version not found.");
    }

    if (target.status !== "archived") {
      throw new ApiError(409, "AGENT_PROMPT_NOT_ARCHIVED", "Only archived prompts can be rolled back.");
    }

    if (!target.body.trim()) {
      throw new ApiError(400, "AGENT_PROMPT_EMPTY", "agent.md 不能为空");
    }

    const active = prompts.find((prompt) => prompt.status === "active");
    const now = new Date();

    if (active) {
      await client.query(
        `
        update public.agent_prompt_versions
        set status = 'archived',
            archived_at = $1
        where id = $2
        `,
        [now, active.id],
      );
    }

    const result = await client.query<AgentPromptVersionRow>(
      `
      update public.agent_prompt_versions
      set status = 'active',
          activated_at = $1,
          archived_at = null
      where id = $2
      returning ${agentPromptVersionSelect}
      `,
      [now, target.id],
    );
    const rolledBack = mapAgentPromptVersion(result.rows[0]);

    await recordAgentConsoleAdminEventWithClient(client, {
      actorLabel: input.actorLabel,
      eventType: "agent_prompt.rolled_back",
      targetType: "agent_prompt_version",
      targetId: rolledBack.id,
      summary: `回滚 agent.md 到 v${rolledBack.versionNo}`,
      details: {
        agentId: input.agentId,
        previousActivePromptVersionId: active?.id ?? null,
      },
    });

    return rolledBack;
  });
}

export async function listAgentSoulVersions(
  agentId: string,
): Promise<AgentSoulVersionDto[]> {
  if (isLocalDemoRuntime()) {
    return [];
  }

  try {
    const result = await queryAppDb<AgentSoulVersionRow>(
      `
      select ${agentSoulVersionSelect}
      from public.agent_soul_versions
      where agent_id = $1
      order by version_no desc
      `,
      [agentId],
    );

    return result.rows.map(mapAgentSoulVersion);
  } catch (error) {
    throw mapPostgresError(error, "AGENT_SOUL_VERSIONS_LIST_FAILED");
  }
}

export async function getActiveAgentSoulVersion(
  agentId: string,
): Promise<AgentSoulVersionDto | null> {
  if (isLocalDemoRuntime()) {
    return null;
  }

  try {
    const result = await queryAppDb<AgentSoulVersionRow>(
      `
      select ${agentSoulVersionSelect}
      from public.agent_soul_versions
      where agent_id = $1
        and status = 'active'
      limit 1
      `,
      [agentId],
    );

    return result.rows[0] ? mapAgentSoulVersion(result.rows[0]) : null;
  } catch (error) {
    throw mapPostgresError(error, "AGENT_ACTIVE_SOUL_FETCH_FAILED");
  }
}

export async function saveAgentSoulDraft(input: {
  agentId: string;
  body: string;
  changeNote?: string | null;
  actorLabel?: string;
}): Promise<AgentSoulVersionDto> {
  return withAppDbTransaction(async (client) => {
    await getAgentConfigByIdFromPostgres(client, input.agentId);
    const existingDraft = await getDraftSoulFromPostgres(client, input.agentId);

    if (existingDraft) {
      const result = await client.query<AgentSoulVersionRow>(
        `
        update public.agent_soul_versions
        set body = $1,
            change_note = $2
        where id = $3
        returning ${agentSoulVersionSelect}
        `,
        [input.body, input.changeNote ?? null, existingDraft.id],
      );
      const draft = mapAgentSoulVersion(result.rows[0]);

      await recordAgentConsoleAdminEventWithClient(client, {
        actorLabel: input.actorLabel,
        eventType: "agent_soul.draft_saved",
        targetType: "agent_soul_version",
        targetId: draft.id,
        summary: `保存 soul.md 草稿 v${draft.versionNo}`,
        details: {
          agentId: input.agentId,
          changeNote: input.changeNote ?? null,
        },
      });

      return draft;
    }

    const nextVersionNo = await getNextSoulVersionNoInPostgres(client, input.agentId);
    const result = await client.query<AgentSoulVersionRow>(
      `
      insert into public.agent_soul_versions (
        agent_id,
        version_no,
        body,
        status,
        change_note
      ) values ($1, $2, $3, 'draft', $4)
      returning ${agentSoulVersionSelect}
      `,
      [input.agentId, nextVersionNo, input.body, input.changeNote ?? null],
    );
    const draft = mapAgentSoulVersion(result.rows[0]);

    await recordAgentConsoleAdminEventWithClient(client, {
      actorLabel: input.actorLabel,
      eventType: "agent_soul.draft_created",
      targetType: "agent_soul_version",
      targetId: draft.id,
      summary: `创建 soul.md 草稿 v${draft.versionNo}`,
      details: {
        agentId: input.agentId,
        changeNote: input.changeNote ?? null,
      },
    });

    return draft;
  });
}

export async function publishAgentSoulDraft(input: {
  agentId: string;
  soulVersionId?: string;
  actorLabel?: string;
}): Promise<AgentSoulVersionDto> {
  return withAppDbTransaction(async (client) => {
    const souls = await listSoulVersionsFromPostgres(client, input.agentId);
    const draft = input.soulVersionId
      ? souls.find((soul) => soul.id === input.soulVersionId)
      : souls.find((soul) => soul.status === "draft");

    if (!draft) {
      throw new ApiError(404, "AGENT_SOUL_DRAFT_NOT_FOUND", "soul.md draft not found.");
    }

    if (draft.status !== "draft") {
      throw new ApiError(409, "AGENT_SOUL_NOT_DRAFT", "Only draft soul.md versions can be published.");
    }

    if (!draft.body.trim()) {
      throw new ApiError(400, "AGENT_SOUL_EMPTY", "soul.md 不能为空");
    }

    const active = souls.find((soul) => soul.status === "active");
    const now = new Date();

    if (active) {
      await client.query(
        `
        update public.agent_soul_versions
        set status = 'archived',
            archived_at = $1
        where id = $2
        `,
        [now, active.id],
      );
    }

    const result = await client.query<AgentSoulVersionRow>(
      `
      update public.agent_soul_versions
      set status = 'active',
          activated_at = $1,
          archived_at = null
      where id = $2
      returning ${agentSoulVersionSelect}
      `,
      [now, draft.id],
    );
    const published = mapAgentSoulVersion(result.rows[0]);

    await recordAgentConsoleAdminEventWithClient(client, {
      actorLabel: input.actorLabel,
      eventType: "agent_soul.published",
      targetType: "agent_soul_version",
      targetId: published.id,
      summary: `发布 soul.md v${published.versionNo}`,
      details: {
        agentId: input.agentId,
        previousActiveSoulVersionId: active?.id ?? null,
      },
    });

    return published;
  });
}

export async function rollbackAgentSoulVersion(input: {
  agentId: string;
  soulVersionId: string;
  actorLabel?: string;
}): Promise<AgentSoulVersionDto> {
  return withAppDbTransaction(async (client) => {
    const souls = await listSoulVersionsFromPostgres(client, input.agentId);
    const target = souls.find((soul) => soul.id === input.soulVersionId);

    if (!target) {
      throw new ApiError(404, "AGENT_SOUL_VERSION_NOT_FOUND", "soul.md version not found.");
    }

    if (target.status !== "archived") {
      throw new ApiError(409, "AGENT_SOUL_NOT_ARCHIVED", "Only archived soul.md versions can be rolled back.");
    }

    if (!target.body.trim()) {
      throw new ApiError(400, "AGENT_SOUL_EMPTY", "soul.md 不能为空");
    }

    const active = souls.find((soul) => soul.status === "active");
    const now = new Date();

    if (active) {
      await client.query(
        `
        update public.agent_soul_versions
        set status = 'archived',
            archived_at = $1
        where id = $2
        `,
        [now, active.id],
      );
    }

    const result = await client.query<AgentSoulVersionRow>(
      `
      update public.agent_soul_versions
      set status = 'active',
          activated_at = $1,
          archived_at = null
      where id = $2
      returning ${agentSoulVersionSelect}
      `,
      [now, target.id],
    );
    const rolledBack = mapAgentSoulVersion(result.rows[0]);

    await recordAgentConsoleAdminEventWithClient(client, {
      actorLabel: input.actorLabel,
      eventType: "agent_soul.rolled_back",
      targetType: "agent_soul_version",
      targetId: rolledBack.id,
      summary: `回滚 soul.md 到 v${rolledBack.versionNo}`,
      details: {
        agentId: input.agentId,
        previousActiveSoulVersionId: active?.id ?? null,
      },
    });

    return rolledBack;
  });
}

export async function createAgentSkill(input: AgentSkillCreateInput): Promise<AgentSkillDto> {
  return withAppDbTransaction(async (client) => {
    const result = await client.query<AgentSkillRow>(
      `
      insert into public.agent_skills (
        skill_key,
        name,
        description,
        when_to_use,
        body,
        status,
        dependencies,
        metadata
      ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
      returning ${agentSkillSelect}
      `,
      [
        input.skillKey ?? createStableKey("skill"),
        input.name,
        input.description ?? "",
        input.whenToUse ?? "",
        input.body ?? "",
        input.status ?? "draft",
        JSON.stringify(input.dependencies ?? []),
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const skill = mapAgentSkill(result.rows[0]);

    await recordAgentConsoleAdminEventWithClient(client, {
      actorLabel: input.actorLabel,
      eventType: "agent_skill.created",
      targetType: "agent_skill",
      targetId: skill.id,
      summary: `创建 Skill ${skill.name}`,
      details: {
        skillKey: skill.skillKey,
        status: skill.status,
      },
    });

    return skill;
  });
}

export async function getAgentSkillById(skillId: string): Promise<AgentSkillDto> {
  if (isLocalDemoRuntime()) {
    throw new ApiError(404, "AGENT_SKILL_NOT_FOUND", "Agent skill not found.");
  }

  try {
    const result = await queryAppDb<AgentSkillRow>(
      `
      select ${agentSkillSelect}
      from public.agent_skills
      where id = $1
      limit 1
      `,
      [skillId],
    );
    const row = result.rows[0];

    if (!row) {
      throw new ApiError(404, "AGENT_SKILL_NOT_FOUND", "Agent skill not found.");
    }

    return mapAgentSkill(row);
  } catch (error) {
    throw mapPostgresError(error, "AGENT_SKILL_FETCH_FAILED");
  }
}

export async function updateAgentSkill(
  skillId: string,
  input: AgentSkillUpdateInput,
): Promise<AgentSkillDto> {
  return withAppDbTransaction(async (client) => {
    const current = await getAgentSkillByIdFromPostgres(client, skillId);
    const updates: string[] = [];
    const values: unknown[] = [];

    if (input.skillKey !== undefined) {
      values.push(input.skillKey);
      updates.push(`skill_key = $${values.length}`);
    }
    if (input.name !== undefined) {
      values.push(input.name);
      updates.push(`name = $${values.length}`);
    }
    if (input.description !== undefined) {
      values.push(input.description);
      updates.push(`description = $${values.length}`);
    }
    if (input.whenToUse !== undefined) {
      values.push(input.whenToUse);
      updates.push(`when_to_use = $${values.length}`);
    }
    if (input.body !== undefined) {
      values.push(input.body);
      updates.push(`body = $${values.length}`);
    }
    if (input.status !== undefined) {
      values.push(input.status);
      updates.push(`status = $${values.length}`);
    }
    if (input.dependencies !== undefined) {
      values.push(JSON.stringify(input.dependencies));
      updates.push(`dependencies = $${values.length}::jsonb`);
    }
    if (input.metadata !== undefined) {
      values.push(JSON.stringify(input.metadata));
      updates.push(`metadata = $${values.length}::jsonb`);
    }

    if (updates.length === 0) {
      return current;
    }

    values.push(skillId);
    const result = await client.query<AgentSkillRow>(
      `
      update public.agent_skills
      set ${updates.join(", ")}
      where id = $${values.length}
      returning ${agentSkillSelect}
      `,
      values,
    );
    const skill = mapAgentSkill(result.rows[0]);

    if (input.status === "disabled" && current.status !== "disabled") {
      await client.query(
        `
        update public.agent_skill_bindings
        set status = 'disabled'
        where skill_id = $1
          and status = 'enabled'
        `,
        [skillId],
      );
    }

    await recordAgentConsoleAdminEventWithClient(client, {
      actorLabel: input.actorLabel,
      eventType: "agent_skill.updated",
      targetType: "agent_skill",
      targetId: skill.id,
      summary: `更新 Skill ${skill.name}`,
      details: {
        updatedFields: updates.map((item) => item.split(" = ")[0]),
        fromStatus: current.status,
        toStatus: skill.status,
      },
    });

    return skill;
  });
}

export async function listAgentSkills(): Promise<AgentSkillDto[]> {
  if (isLocalDemoRuntime()) {
    return [];
  }

  try {
    const result = await queryAppDb<AgentSkillRow>(
      `
      select ${agentSkillSelect}
      from public.agent_skills
      order by created_at desc
      `,
    );

    return result.rows.map(mapAgentSkill);
  } catch (error) {
    throw mapPostgresError(error, "AGENT_SKILLS_LIST_FAILED");
  }
}

export async function listAgentSkillBindings(input: {
  agentId?: string;
} = {}): Promise<AgentSkillBindingDto[]> {
  if (isLocalDemoRuntime()) {
    return [];
  }

  try {
    const filters: string[] = [];
    const values: unknown[] = [];

    if (input.agentId) {
      values.push(input.agentId);
      filters.push(`agent_id = $${values.length}`);
    }

    const result = await queryAppDb<AgentSkillBindingRow>(
      `
      select ${agentSkillBindingSelect}
      from public.agent_skill_bindings
      ${filters.length ? `where ${filters.join(" and ")}` : ""}
      order by created_at desc
      `,
      values,
    );

    return result.rows.map(mapAgentSkillBinding);
  } catch (error) {
    throw mapPostgresError(error, "AGENT_SKILL_BINDINGS_LIST_FAILED");
  }
}

export async function replaceAgentSkillBindings(input: {
  agentId: string;
  skillIds: string[];
  actorLabel?: string;
}): Promise<AgentSkillBindingDto[]> {
  await withAppDbTransaction(async (client) => {
    await getAgentConfigByIdFromPostgres(client, input.agentId);
    const desiredSkillIds = uniqueIds(input.skillIds);
    const skills = await getAgentSkillsByIdsFromPostgres(client, desiredSkillIds);
    const notEnabled = skills.filter((skill) => skill.status !== "enabled");

    if (notEnabled.length > 0) {
      throw new ApiError(
        409,
        "AGENT_SKILL_NOT_ENABLED",
        "Only enabled skills can be attached as enabled candidates.",
        { skillIds: notEnabled.map((skill) => skill.id) },
      );
    }

    const existing = await listAgentSkillBindingsFromPostgres(client, input.agentId);
    const existingBySkillId = new Map(existing.map((binding) => [binding.skillId, binding]));
    const desired = new Set(desiredSkillIds);

    for (const binding of existing) {
      const nextStatus: AgentBindingStatus = desired.has(binding.skillId)
        ? "enabled"
        : "disabled";

      if (binding.status === nextStatus) {
        continue;
      }

      await client.query(
        `
        update public.agent_skill_bindings
        set status = $1
        where id = $2
        `,
        [nextStatus, binding.id],
      );
    }

    for (const skillId of desiredSkillIds) {
      if (existingBySkillId.has(skillId)) {
        continue;
      }

      await client.query(
        `
        insert into public.agent_skill_bindings (
          agent_id,
          skill_id,
          status
        ) values ($1, $2, 'enabled')
        on conflict (agent_id, skill_id)
        do update set status = 'enabled'
        `,
        [input.agentId, skillId],
      );
    }

    await recordAgentConsoleAdminEventWithClient(client, {
      actorLabel: input.actorLabel,
      eventType: "agent_skill_bindings.replaced",
      targetType: "agent",
      targetId: input.agentId,
      summary: "更新 Agent 挂载 Skill",
      details: {
        enabledSkillIds: desiredSkillIds,
      },
    });
  });

  return listAgentSkillBindings({ agentId: input.agentId });
}

export async function createKnowledgeSet(
  input: KnowledgeSetCreateInput,
): Promise<KnowledgeSetDto> {
  const scope = input.scope ?? "platform";

  if (scope === "platform" && input.merchantId) {
    throw new ApiError(400, "KNOWLEDGE_SET_SCOPE_INVALID", "Platform knowledge sets cannot have merchantId.");
  }

  if (scope === "merchant" && !input.merchantId) {
    throw new ApiError(400, "KNOWLEDGE_SET_SCOPE_INVALID", "Merchant knowledge sets require merchantId.");
  }

  return withAppDbTransaction(async (client) => {
    const result = await client.query<KnowledgeSetRow>(
      `
      insert into public.knowledge_sets (
        set_key,
        name,
        description,
        scope,
        merchant_id,
        status,
        metadata
      ) values ($1, $2, $3, $4, $5, $6, $7::jsonb)
      returning ${knowledgeSetSelect}
      `,
      [
        input.setKey ?? createStableKey("ks"),
        input.name,
        input.description ?? null,
        scope,
        scope === "merchant" ? input.merchantId : null,
        input.status ?? "draft",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const knowledgeSet = mapKnowledgeSet(result.rows[0]);

    await recordAgentConsoleAdminEventWithClient(client, {
      actorLabel: input.actorLabel,
      eventType: "knowledge_set.created",
      targetType: "knowledge_set",
      targetId: knowledgeSet.id,
      summary: `创建 Knowledge Set ${knowledgeSet.name}`,
      details: {
        setKey: knowledgeSet.setKey,
        scope: knowledgeSet.scope,
        status: knowledgeSet.status,
      },
    });

    return knowledgeSet;
  });
}

export async function getKnowledgeSetById(setId: string): Promise<KnowledgeSetDto> {
  if (isLocalDemoRuntime()) {
    if (setId === demoBaseKnowledgeSet.id) {
      return demoBaseKnowledgeSet;
    }

    throw new ApiError(404, "KNOWLEDGE_SET_NOT_FOUND", "Knowledge set not found.");
  }

  try {
    const result = await queryAppDb<KnowledgeSetRow>(
      `
      select ${knowledgeSetSelect}
      from public.knowledge_sets
      where id = $1
      limit 1
      `,
      [setId],
    );
    const row = result.rows[0];

    if (!row) {
      throw new ApiError(404, "KNOWLEDGE_SET_NOT_FOUND", "Knowledge set not found.");
    }

    return mapKnowledgeSet(row);
  } catch (error) {
    throw mapPostgresError(error, "KNOWLEDGE_SET_FETCH_FAILED");
  }
}

export async function getKnowledgeSetDetail(setId: string): Promise<KnowledgeSetDetailDto> {
  const [knowledgeSet, documents] = await Promise.all([
    getKnowledgeSetById(setId),
    listKnowledgeSetDocuments({ knowledgeSetId: setId }),
  ]);

  return {
    knowledgeSet,
    documentIds: documents.map((document) => document.documentId),
  };
}

export async function updateKnowledgeSet(
  setId: string,
  input: KnowledgeSetUpdateInput,
): Promise<KnowledgeSetDto> {
  return withAppDbTransaction(async (client) => {
    const current = await getKnowledgeSetByIdFromPostgres(client, setId);
    const updates: string[] = [];
    const values: unknown[] = [];

    if (input.setKey !== undefined) {
      values.push(input.setKey);
      updates.push(`set_key = $${values.length}`);
    }
    if (input.name !== undefined) {
      values.push(input.name);
      updates.push(`name = $${values.length}`);
    }
    if (input.description !== undefined) {
      values.push(input.description);
      updates.push(`description = $${values.length}`);
    }
    if (input.status !== undefined) {
      values.push(input.status);
      updates.push(`status = $${values.length}`);
    }
    if (input.metadata !== undefined) {
      values.push(JSON.stringify(input.metadata));
      updates.push(`metadata = $${values.length}::jsonb`);
    }

    if (updates.length === 0) {
      return current;
    }

    values.push(setId);
    const result = await client.query<KnowledgeSetRow>(
      `
      update public.knowledge_sets
      set ${updates.join(", ")}
      where id = $${values.length}
      returning ${knowledgeSetSelect}
      `,
      values,
    );
    const knowledgeSet = mapKnowledgeSet(result.rows[0]);

    if (input.status === "disabled" && current.status !== "disabled") {
      await client.query(
        `
        update public.agent_knowledge_set_bindings
        set status = 'disabled'
        where knowledge_set_id = $1
          and status = 'enabled'
        `,
        [setId],
      );
    }

    await recordAgentConsoleAdminEventWithClient(client, {
      actorLabel: input.actorLabel,
      eventType: "knowledge_set.updated",
      targetType: "knowledge_set",
      targetId: knowledgeSet.id,
      summary: `更新 Knowledge Set ${knowledgeSet.name}`,
      details: {
        updatedFields: updates.map((item) => item.split(" = ")[0]),
        fromStatus: current.status,
        toStatus: knowledgeSet.status,
      },
    });

    return knowledgeSet;
  });
}

export async function listKnowledgeSets(): Promise<KnowledgeSetDto[]> {
  if (isLocalDemoRuntime()) {
    return [demoBaseKnowledgeSet];
  }

  try {
    const result = await queryAppDb<KnowledgeSetRow>(
      `
      select ${knowledgeSetSelect}
      from public.knowledge_sets
      order by created_at desc
      `,
    );

    return result.rows.map(mapKnowledgeSet);
  } catch (error) {
    throw mapPostgresError(error, "KNOWLEDGE_SETS_LIST_FAILED");
  }
}

export async function listKnowledgeSetDocuments(input: {
  knowledgeSetId?: string;
  documentId?: string;
} = {}): Promise<KnowledgeSetDocumentDto[]> {
  if (isLocalDemoRuntime()) {
    return [];
  }

  try {
    const filters: string[] = [];
    const values: unknown[] = [];

    if (input.knowledgeSetId) {
      values.push(input.knowledgeSetId);
      filters.push(`knowledge_set_id = $${values.length}`);
    }

    if (input.documentId) {
      values.push(input.documentId);
      filters.push(`document_id = $${values.length}`);
    }

    const result = await queryAppDb<KnowledgeSetDocumentRow>(
      `
      select ${knowledgeSetDocumentSelect}
      from public.knowledge_set_documents
      ${filters.length ? `where ${filters.join(" and ")}` : ""}
      order by created_at desc
      `,
      values,
    );

    return result.rows.map(mapKnowledgeSetDocument);
  } catch (error) {
    throw mapPostgresError(error, "KNOWLEDGE_SET_DOCUMENTS_LIST_FAILED");
  }
}

export async function replaceKnowledgeSetDocuments(input: {
  knowledgeSetId: string;
  documentIds: string[];
  actorLabel?: string;
}): Promise<KnowledgeSetDetailDto> {
  await withAppDbTransaction(async (client) => {
    await getKnowledgeSetByIdFromPostgres(client, input.knowledgeSetId);
    const documentIds = uniqueIds(input.documentIds);
    await assertKnowledgeDocumentsExistInPostgres(client, documentIds);

    await client.query(
      `
      delete from public.knowledge_set_documents
      where knowledge_set_id = $1
      `,
      [input.knowledgeSetId],
    );

    for (const documentId of documentIds) {
      await client.query(
        `
        insert into public.knowledge_set_documents (
          knowledge_set_id,
          document_id
        ) values ($1, $2)
        on conflict (knowledge_set_id, document_id) do nothing
        `,
        [input.knowledgeSetId, documentId],
      );
    }

    await recordAgentConsoleAdminEventWithClient(client, {
      actorLabel: input.actorLabel,
      eventType: "knowledge_set_documents.replaced",
      targetType: "knowledge_set",
      targetId: input.knowledgeSetId,
      summary: "更新 Knowledge Set 文档",
      details: {
        documentIds,
      },
    });
  });

  return getKnowledgeSetDetail(input.knowledgeSetId);
}

export async function replaceKnowledgeDocumentSets(input: {
  documentId: string;
  knowledgeSetIds: string[];
  actorLabel?: string;
}): Promise<KnowledgeSetDocumentDto[]> {
  await withAppDbTransaction(async (client) => {
    await assertKnowledgeDocumentsExistInPostgres(client, [input.documentId]);
    const knowledgeSetIds = uniqueIds(input.knowledgeSetIds);
    await getKnowledgeSetsByIdsFromPostgres(client, knowledgeSetIds);

    await client.query(
      `
      delete from public.knowledge_set_documents
      where document_id = $1
      `,
      [input.documentId],
    );

    for (const knowledgeSetId of knowledgeSetIds) {
      await client.query(
        `
        insert into public.knowledge_set_documents (
          knowledge_set_id,
          document_id
        ) values ($1, $2)
        on conflict (knowledge_set_id, document_id) do nothing
        `,
        [knowledgeSetId, input.documentId],
      );
    }

    await recordAgentConsoleAdminEventWithClient(client, {
      actorLabel: input.actorLabel,
      eventType: "knowledge_document_sets.replaced",
      targetType: "knowledge_document",
      targetId: input.documentId,
      summary: "更新 Knowledge 文档所属知识集",
      details: {
        knowledgeSetIds,
      },
    });
  });

  return listKnowledgeSetDocuments({ documentId: input.documentId });
}

export async function listAgentKnowledgeSetBindings(input: {
  agentId?: string;
} = {}): Promise<AgentKnowledgeSetBindingDto[]> {
  if (isLocalDemoRuntime()) {
    return [];
  }

  try {
    const filters: string[] = [];
    const values: unknown[] = [];

    if (input.agentId) {
      values.push(input.agentId);
      filters.push(`agent_id = $${values.length}`);
    }

    const result = await queryAppDb<AgentKnowledgeSetBindingRow>(
      `
      select ${agentKnowledgeSetBindingSelect}
      from public.agent_knowledge_set_bindings
      ${filters.length ? `where ${filters.join(" and ")}` : ""}
      order by created_at desc
      `,
      values,
    );

    return result.rows.map(mapAgentKnowledgeSetBinding);
  } catch (error) {
    throw mapPostgresError(error, "AGENT_KNOWLEDGE_SET_BINDINGS_LIST_FAILED");
  }
}

export async function replaceAgentKnowledgeSetBindings(input: {
  agentId: string;
  knowledgeSetIds: string[];
  actorLabel?: string;
}): Promise<AgentKnowledgeSetBindingDto[]> {
  await withAppDbTransaction(async (client) => {
    await getAgentConfigByIdFromPostgres(client, input.agentId);
    const desiredKnowledgeSetIds = uniqueIds(input.knowledgeSetIds);
    const knowledgeSets = await getKnowledgeSetsByIdsFromPostgres(client, desiredKnowledgeSetIds);
    const notEnabled = knowledgeSets.filter((knowledgeSet) => knowledgeSet.status !== "enabled");

    if (notEnabled.length > 0) {
      throw new ApiError(
        409,
        "KNOWLEDGE_SET_NOT_ENABLED",
        "Only enabled knowledge sets can be attached as enabled candidates.",
        { knowledgeSetIds: notEnabled.map((knowledgeSet) => knowledgeSet.id) },
      );
    }

    const existing = await listAgentKnowledgeSetBindingsFromPostgres(client, input.agentId);
    const existingByKnowledgeSetId = new Map(
      existing.map((binding) => [binding.knowledgeSetId, binding]),
    );
    const desired = new Set(desiredKnowledgeSetIds);

    for (const binding of existing) {
      const nextStatus: AgentBindingStatus = desired.has(binding.knowledgeSetId)
        ? "enabled"
        : "disabled";

      if (binding.status === nextStatus) {
        continue;
      }

      await client.query(
        `
        update public.agent_knowledge_set_bindings
        set status = $1
        where id = $2
        `,
        [nextStatus, binding.id],
      );
    }

    for (const knowledgeSetId of desiredKnowledgeSetIds) {
      if (existingByKnowledgeSetId.has(knowledgeSetId)) {
        continue;
      }

      await client.query(
        `
        insert into public.agent_knowledge_set_bindings (
          agent_id,
          knowledge_set_id,
          status
        ) values ($1, $2, 'enabled')
        on conflict (agent_id, knowledge_set_id)
        do update set status = 'enabled'
        `,
        [input.agentId, knowledgeSetId],
      );
    }

    await recordAgentConsoleAdminEventWithClient(client, {
      actorLabel: input.actorLabel,
      eventType: "agent_knowledge_set_bindings.replaced",
      targetType: "agent",
      targetId: input.agentId,
      summary: "更新 Agent 挂载 Knowledge Set",
      details: {
        enabledKnowledgeSetIds: desiredKnowledgeSetIds,
      },
    });
  });

  return listAgentKnowledgeSetBindings({ agentId: input.agentId });
}

export async function listAgentRouteBindings(): Promise<AgentRouteBindingDto[]> {
  if (isLocalDemoRuntime()) {
    return [demoConsultationDefaultBinding];
  }

  try {
    const result = await queryAppDb<AgentRouteBindingRow>(
      `
      select ${agentRouteBindingSelect}
      from public.agent_route_bindings
      order by created_at desc
      `,
    );

    return result.rows.map(mapAgentRouteBinding);
  } catch (error) {
    throw mapPostgresError(error, "AGENT_ROUTE_BINDINGS_LIST_FAILED");
  }
}

export async function getAgentRouteBinding(
  routeKey: AgentRouteKey,
): Promise<AgentRouteBindingDto | null> {
  if (isLocalDemoRuntime()) {
    return routeKey === "consultation_default" ? demoConsultationDefaultBinding : null;
  }

  try {
    const result = await queryAppDb<AgentRouteBindingRow>(
      `
      select ${agentRouteBindingSelect}
      from public.agent_route_bindings
      where route_key = $1
      limit 1
      `,
      [routeKey],
    );

    return result.rows[0] ? mapAgentRouteBinding(result.rows[0]) : null;
  } catch (error) {
    throw mapPostgresError(error, "AGENT_ROUTE_BINDING_FETCH_FAILED");
  }
}

export async function getConsultationDefaultRouteBinding() {
  return getAgentRouteBinding("consultation_default");
}

export async function setConsultationDefaultAgent(input: {
  agentId: string;
  actorLabel?: string;
}): Promise<AgentRouteBindingDto> {
  return withAppDbTransaction(async (client) => {
    const agent = await getAgentConfigByIdFromPostgres(client, input.agentId);

    if (agent.serviceStatus !== "enabled") {
      throw new ApiError(
        409,
        "AGENT_NOT_ENABLED",
        "Only enabled Agents can be set as consultation_default.",
        { agentId: agent.id, serviceStatus: agent.serviceStatus },
      );
    }

    await assertAgentHasActivePromptInPostgres(client, agent.id);

    const result = await client.query<AgentRouteBindingRow>(
      `
      insert into public.agent_route_bindings (
        route_key,
        agent_id,
        status,
        description
      ) values ('consultation_default', $1, 'active', '用户端默认咨询入口绑定。')
      on conflict (route_key)
      do update set agent_id = excluded.agent_id,
                    status = excluded.status,
                    description = excluded.description
      returning ${agentRouteBindingSelect}
      `,
      [agent.id],
    );
    const binding = mapAgentRouteBinding(result.rows[0]);

    await recordAgentConsoleAdminEventWithClient(client, {
      actorLabel: input.actorLabel,
      eventType: "agent_route_binding.set_online",
      targetType: "agent_route_binding",
      targetId: binding.id,
      summary: `切换 consultation_default 到 ${agent.displayName}`,
      details: {
        routeKey: binding.routeKey,
        agentId: agent.id,
      },
    });

    return binding;
  });
}

export async function recordAgentRuntimeSnapshot(
  input: AgentRuntimeSnapshotCreateInput,
): Promise<AgentRuntimeSnapshotDto | null> {
  if (isLocalDemoRuntime()) {
    return null;
  }

  try {
    const result = await queryAppDb<AgentRuntimeSnapshotRow>(
      `
      insert into public.agent_runtime_snapshots (
        session_id,
        message_id,
        agent_id,
        prompt_version_id,
        candidate_skill_ids,
        actual_skill_ids,
        knowledge_set_ids,
        knowledge_match_ids,
        memory_match_ids,
        tool_call_summary,
        model
      ) values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11)
      returning ${agentRuntimeSnapshotSelect}
      `,
      [
        input.sessionId ?? null,
        input.messageId ?? null,
        input.agentId ?? null,
        input.promptVersionId ?? null,
        JSON.stringify(input.candidateSkillIds ?? []),
        JSON.stringify(input.actualSkillIds ?? []),
        JSON.stringify(input.knowledgeSetIds ?? []),
        JSON.stringify(input.knowledgeMatchIds ?? []),
        JSON.stringify(input.memoryMatchIds ?? []),
        JSON.stringify(input.toolCallSummary ?? {}),
        input.model ?? null,
      ],
    );

    return mapAgentRuntimeSnapshot(result.rows[0]);
  } catch (error) {
    throw mapPostgresError(error, "AGENT_RUNTIME_SNAPSHOT_CREATE_FAILED");
  }
}

export async function recordAgentTestRun(
  input: AgentTestRunCreateInput,
): Promise<AgentTestRunDto | null> {
  if (isLocalDemoRuntime()) {
    return null;
  }

  try {
    return await withAppDbTransaction(async (client) => {
      const result = await client.query<AgentTestRunRow>(
        `
        insert into public.agent_test_runs (
          agent_id,
          merchant_id,
          input_message,
          prompt_version_id,
          candidate_skill_ids,
          actual_skill_ids,
          knowledge_set_ids,
          knowledge_match_ids,
          memory_match_ids,
          tool_summary,
          assistant_output,
          status,
          error_summary,
          model
        ) values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13, $14)
        returning ${agentTestRunSelect}
        `,
        [
          input.agentId ?? null,
          input.merchantId ?? null,
          input.inputMessage,
          input.promptVersionId ?? null,
          JSON.stringify(input.candidateSkillIds ?? []),
          JSON.stringify(input.actualSkillIds ?? []),
          JSON.stringify(input.knowledgeSetIds ?? []),
          JSON.stringify(input.knowledgeMatchIds ?? []),
          JSON.stringify(input.memoryMatchIds ?? []),
          JSON.stringify(input.toolSummary ?? {}),
          input.assistantOutput ?? null,
          input.status,
          input.errorSummary ?? null,
          input.model ?? null,
        ],
      );
      const testRun = mapAgentTestRun(result.rows[0]);

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
          input.actorLabel ?? "admin",
          "agent_test_run.created",
          "agent_test_run",
          testRun.id,
          `保存 Agent 调试记录：${testRun.status}`,
          JSON.stringify({
            agentId: testRun.agentId,
            merchantId: testRun.merchantId,
            status: testRun.status,
            actualSkillIds: testRun.actualSkillIds,
            knowledgeSetIds: testRun.knowledgeSetIds,
          }),
        ],
      );

      return testRun;
    });
  } catch (error) {
    throw mapPostgresError(error, "AGENT_TEST_RUN_CREATE_FAILED");
  }
}

export async function ensureMerchantCreditAccount(input: {
  merchantId: string;
  initialBalance?: number;
  reason?: string;
}): Promise<MerchantCreditAccountDto | null> {
  if (isLocalDemoRuntime()) {
    return null;
  }

  try {
    return await withAppDbTransaction(async (client) => {
      const initialBalance = Math.max(0, input.initialBalance ?? 0);
      const metadata = {
        createdBy: "consultation_entitlement_gate",
        reason: input.reason ?? "signup_bonus",
      };
      const insertResult = await client.query<MerchantCreditAccountRow>(
        `
        insert into public.merchant_credit_accounts (
          merchant_id,
          balance,
          metadata
        ) values ($1, $2, $3::jsonb)
        on conflict (merchant_id) do nothing
        returning ${merchantCreditAccountSelect}
        `,
        [input.merchantId, initialBalance, JSON.stringify(metadata)],
      );

      if (insertResult.rows[0]) {
        const account = mapMerchantCreditAccount(insertResult.rows[0]);

        if (initialBalance > 0) {
          await recordMerchantCreditLedger(
            {
              merchantId: input.merchantId,
              creditAccountId: account.id,
              direction: "grant",
              amount: initialBalance,
              reason: input.reason ?? "signup_bonus",
              metadata: {
                createdBy: "consultation_entitlement_gate",
              },
            },
            client,
          );
        }

        return account;
      }

      const existingResult = await client.query<MerchantCreditAccountRow>(
        `
        select ${merchantCreditAccountSelect}
        from public.merchant_credit_accounts
        where merchant_id = $1
        limit 1
        `,
        [input.merchantId],
      );
      const existing = existingResult.rows[0];

      if (!existing) {
        throw new ApiError(
          500,
          "MERCHANT_CREDIT_ACCOUNT_CREATE_FAILED",
          "Credit account was not created.",
        );
      }

      return mapMerchantCreditAccount(existing);
    });
  } catch (error) {
    throw mapPostgresError(error, "MERCHANT_CREDIT_ACCOUNT_CREATE_FAILED");
  }
}

export async function recordMerchantUsageEvent(input: {
  merchantId: string;
  actionType: string;
  agentId?: string | null;
  estimatedCost?: number | null;
  actualCost?: number | null;
  status: MerchantUsageEventDto["status"];
  metadata?: Record<string, unknown>;
}): Promise<MerchantUsageEventDto | null> {
  if (isLocalDemoRuntime()) {
    return null;
  }

  try {
    const result = await queryAppDb<MerchantUsageEventRow>(
      `
      insert into public.merchant_usage_events (
        merchant_id,
        action_type,
        agent_id,
        estimated_cost,
        actual_cost,
        status,
        metadata
      ) values ($1, $2, $3, $4, $5, $6, $7::jsonb)
      returning ${merchantUsageEventSelect}
      `,
      [
        input.merchantId,
        input.actionType,
        input.agentId ?? null,
        input.estimatedCost ?? null,
        input.actualCost ?? null,
        input.status,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return mapMerchantUsageEvent(result.rows[0]);
  } catch (error) {
    throw mapPostgresError(error, "MERCHANT_USAGE_EVENT_CREATE_FAILED");
  }
}

export async function updateMerchantUsageEvent(input: {
  usageEventId: string;
  actualCost?: number | null;
  status: MerchantUsageEventDto["status"];
  metadata?: Record<string, unknown>;
}): Promise<MerchantUsageEventDto | null> {
  if (isLocalDemoRuntime()) {
    return null;
  }

  try {
    const result = await queryAppDb<MerchantUsageEventRow>(
      `
      update public.merchant_usage_events
      set status = $2,
          actual_cost = case when $3::boolean then $4 else actual_cost end,
          metadata = case when $5::boolean then $6::jsonb else metadata end
      where id = $1
      returning ${merchantUsageEventSelect}
      `,
      [
        input.usageEventId,
        input.status,
        input.actualCost !== undefined,
        input.actualCost ?? null,
        input.metadata !== undefined,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    const row = result.rows[0];

    if (!row) {
      throw new ApiError(404, "MERCHANT_USAGE_EVENT_NOT_FOUND", "Usage event not found.");
    }

    return mapMerchantUsageEvent(row);
  } catch (error) {
    throw mapPostgresError(error, "MERCHANT_USAGE_EVENT_UPDATE_FAILED");
  }
}

export async function consumeMerchantCredits(input: {
  merchantId: string;
  creditAccountId: string;
  amount: number;
  relatedUsageEventId?: string | null;
  reason: string;
}): Promise<MerchantCreditAccountDto | null> {
  if (isLocalDemoRuntime()) {
    return null;
  }

  try {
    return await withAppDbTransaction(async (client) => {
      const accountResult = await client.query<MerchantCreditAccountRow>(
        `
        select ${merchantCreditAccountSelect}
        from public.merchant_credit_accounts
        where id = $1
          and merchant_id = $2
        for update
        `,
        [input.creditAccountId, input.merchantId],
      );
      const account = accountResult.rows[0];

      if (!account) {
        throw new ApiError(404, "MERCHANT_CREDIT_ACCOUNT_NOT_FOUND", "Credit account not found.");
      }

      if (account.balance < input.amount) {
        throw new ApiError(
          402,
          "MERCHANT_CREDIT_INSUFFICIENT",
          "当前积分不足，无法继续使用该 AI 能力。请升级会员或补充积分。",
        );
      }

      const updatedResult = await client.query<MerchantCreditAccountRow>(
        `
        update public.merchant_credit_accounts
        set balance = balance - $2
        where id = $1
        returning ${merchantCreditAccountSelect}
        `,
        [input.creditAccountId, input.amount],
      );
      const updatedAccount = updatedResult.rows[0];

      await recordMerchantCreditLedger(
        {
          merchantId: input.merchantId,
          creditAccountId: input.creditAccountId,
          direction: "consume",
          amount: input.amount,
          reason: input.reason,
          relatedUsageEventId: input.relatedUsageEventId ?? null,
          metadata: {
            createdBy: "consultation_entitlement_gate",
          },
        },
        client,
      );

      return mapMerchantCreditAccount(updatedAccount);
    });
  } catch (error) {
    throw mapPostgresError(error, "MERCHANT_CREDIT_CONSUME_FAILED");
  }
}

async function recordMerchantCreditLedger(
  input: {
    merchantId: string;
    creditAccountId?: string | null;
    direction: MerchantCreditLedgerDto["direction"];
    amount: number;
    reason: string;
    relatedUsageEventId?: string | null;
    metadata?: Record<string, unknown>;
  },
  client?: DatabaseClient,
): Promise<MerchantCreditLedgerDto | null> {
  if (isLocalDemoRuntime()) {
    return null;
  }

  try {
    const executor = client ?? { query: queryAppDb };
    const result = await executor.query<MerchantCreditLedgerRow>(
      `
      insert into public.merchant_credit_ledger (
        merchant_id,
        credit_account_id,
        direction,
        amount,
        reason,
        related_usage_event_id,
        metadata
      ) values ($1, $2, $3, $4, $5, $6, $7::jsonb)
      returning ${merchantCreditLedgerSelect}
      `,
      [
        input.merchantId,
        input.creditAccountId ?? null,
        input.direction,
        input.amount,
        input.reason,
        input.relatedUsageEventId ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return mapMerchantCreditLedger(result.rows[0]);
  } catch (error) {
    throw mapPostgresError(error, "MERCHANT_CREDIT_LEDGER_CREATE_FAILED");
  }
}

function mapAgentConfig(row: AgentConfigRow): AgentConfigDto {
  return {
    id: row.id,
    agentKey: row.agent_key,
    displayName: row.display_name,
    roleDescription: row.role_description,
    description: row.description,
    serviceStatus: row.service_status,
    serviceFlags: toAgentServiceFlags(row.service_flags),
    modelConfig: toRecord(row.model_config),
    copiedFromAgentId: row.copied_from_agent_id,
    createdByAdminId: row.created_by_admin_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapAgentPromptVersion(row: AgentPromptVersionRow): AgentPromptVersionDto {
  return {
    id: row.id,
    agentId: row.agent_id,
    versionNo: row.version_no,
    body: row.body,
    status: row.status,
    changeNote: row.change_note,
    createdByAdminId: row.created_by_admin_id,
    createdAt: toIsoString(row.created_at),
    activatedAt: toNullableIsoString(row.activated_at),
    archivedAt: toNullableIsoString(row.archived_at),
  };
}

function mapAgentSoulVersion(row: AgentSoulVersionRow): AgentSoulVersionDto {
  return {
    id: row.id,
    agentId: row.agent_id,
    versionNo: row.version_no,
    body: row.body,
    status: row.status,
    changeNote: row.change_note,
    createdByAdminId: row.created_by_admin_id,
    createdAt: toIsoString(row.created_at),
    activatedAt: toNullableIsoString(row.activated_at),
    archivedAt: toNullableIsoString(row.archived_at),
  };
}

function mapAgentSkill(row: AgentSkillRow): AgentSkillDto {
  return {
    id: row.id,
    skillKey: row.skill_key,
    name: row.name,
    description: row.description,
    whenToUse: row.when_to_use,
    body: row.body,
    status: row.status,
    dependencies: toStringArray(row.dependencies),
    metadata: toRecord(row.metadata),
    createdByAdminId: row.created_by_admin_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapAgentSkillBinding(row: AgentSkillBindingRow): AgentSkillBindingDto {
  return {
    id: row.id,
    agentId: row.agent_id,
    skillId: row.skill_id,
    status: row.status,
    createdByAdminId: row.created_by_admin_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapKnowledgeSet(row: KnowledgeSetRow): KnowledgeSetDto {
  return {
    id: row.id,
    setKey: row.set_key,
    name: row.name,
    description: row.description,
    scope: row.scope,
    merchantId: row.merchant_id,
    status: row.status,
    metadata: toRecord(row.metadata),
    createdByAdminId: row.created_by_admin_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapAgentKnowledgeSetBinding(
  row: AgentKnowledgeSetBindingRow,
): AgentKnowledgeSetBindingDto {
  return {
    id: row.id,
    agentId: row.agent_id,
    knowledgeSetId: row.knowledge_set_id,
    status: row.status,
    createdByAdminId: row.created_by_admin_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapAgentRouteBinding(row: AgentRouteBindingRow): AgentRouteBindingDto {
  return {
    id: row.id,
    routeKey: row.route_key,
    agentId: row.agent_id,
    status: row.status,
    description: row.description,
    createdByAdminId: row.created_by_admin_id,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapKnowledgeSetDocument(row: KnowledgeSetDocumentRow): KnowledgeSetDocumentDto {
  return {
    id: row.id,
    knowledgeSetId: row.knowledge_set_id,
    documentId: row.document_id,
    createdByAdminId: row.created_by_admin_id,
    createdAt: toIsoString(row.created_at),
  };
}

function mapAgentRuntimeSnapshot(row: AgentRuntimeSnapshotRow): AgentRuntimeSnapshotDto {
  return {
    id: row.id,
    sessionId: row.session_id,
    messageId: row.message_id,
    agentId: row.agent_id,
    promptVersionId: row.prompt_version_id,
    candidateSkillIds: toStringArray(row.candidate_skill_ids),
    actualSkillIds: toStringArray(row.actual_skill_ids),
    knowledgeSetIds: toStringArray(row.knowledge_set_ids),
    knowledgeMatchIds: toStringArray(row.knowledge_match_ids),
    memoryMatchIds: toStringArray(row.memory_match_ids),
    toolCallSummary: toRecord(row.tool_call_summary),
    model: row.model,
    createdAt: toIsoString(row.created_at),
  };
}

function mapAgentTestRun(row: AgentTestRunRow): AgentTestRunDto {
  return {
    id: row.id,
    agentId: row.agent_id,
    merchantId: row.merchant_id,
    inputMessage: row.input_message,
    promptVersionId: row.prompt_version_id,
    candidateSkillIds: toStringArray(row.candidate_skill_ids),
    actualSkillIds: toStringArray(row.actual_skill_ids),
    knowledgeSetIds: toStringArray(row.knowledge_set_ids),
    knowledgeMatchIds: toStringArray(row.knowledge_match_ids),
    memoryMatchIds: toStringArray(row.memory_match_ids),
    toolSummary: toRecord(row.tool_summary),
    assistantOutput: row.assistant_output,
    status: row.status,
    errorSummary: row.error_summary,
    model: row.model,
    createdByAdminId: row.created_by_admin_id,
    createdAt: toIsoString(row.created_at),
  };
}

function mapMerchantCreditAccount(row: MerchantCreditAccountRow): MerchantCreditAccountDto {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    balance: row.balance,
    metadata: toRecord(row.metadata),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapMerchantUsageEvent(row: MerchantUsageEventRow): MerchantUsageEventDto {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    actionType: row.action_type,
    agentId: row.agent_id,
    estimatedCost: row.estimated_cost,
    actualCost: row.actual_cost,
    status: row.status,
    metadata: toRecord(row.metadata),
    createdAt: toIsoString(row.created_at),
  };
}

function mapMerchantCreditLedger(row: MerchantCreditLedgerRow): MerchantCreditLedgerDto {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    creditAccountId: row.credit_account_id,
    direction: row.direction,
    amount: row.amount,
    reason: row.reason,
    relatedUsageEventId: row.related_usage_event_id,
    metadata: toRecord(row.metadata),
    createdAt: toIsoString(row.created_at),
  };
}

function createStableKey(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function normalizeAgentServiceFlags(
  value?: Partial<AgentServiceFlags>,
  base?: AgentServiceFlags,
): AgentServiceFlags {
  const record = {
    ...(base ?? {
      systemPromptEnabled: true,
      skillsEnabled: true,
      knowledgeEnabled: true,
    }),
    ...(value ?? {}),
  };

  return {
    ...record,
    systemPromptEnabled: getBoolean(record.systemPromptEnabled, true),
    skillsEnabled: getBoolean(record.skillsEnabled, true),
    knowledgeEnabled: getBoolean(record.knowledgeEnabled, true),
  };
}

// Kept for non-transactional admin event writes; current transactional paths use the client-scoped variant.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function recordAgentConsoleAdminEvent(input: {
  actorLabel?: string;
  eventType: string;
  targetType: string;
  targetId?: string;
  summary: string;
  details?: Record<string, unknown>;
}) {
  try {
    await queryAppDb(
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
        input.actorLabel ?? "admin",
        input.eventType,
        input.targetType,
        input.targetId ?? null,
        input.summary,
        JSON.stringify(input.details ?? {}),
      ],
    );
    return;
  } catch (error) {
    throw mapPostgresError(error, "PLATFORM_ADMIN_EVENT_CREATE_FAILED");
  }
}

async function recordAgentConsoleAdminEventWithClient(
  client: DatabaseClient,
  input: {
    actorLabel?: string;
    eventType: string;
    targetType: string;
    targetId?: string;
    summary: string;
    details?: Record<string, unknown>;
  },
) {
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
      input.actorLabel ?? "admin",
      input.eventType,
      input.targetType,
      input.targetId ?? null,
      input.summary,
      JSON.stringify(input.details ?? {}),
    ],
  );
}

async function getAgentConfigByIdFromPostgres(
  client: DatabaseClient,
  agentId: string,
): Promise<AgentConfigDto> {
  const result = await client.query<AgentConfigRow>(
    `
    select ${agentConfigSelect}
    from public.agent_configs
    where id = $1
    limit 1
    `,
    [agentId],
  );
  const row = result.rows[0];

  if (!row) {
    throw new ApiError(404, "AGENT_CONFIG_NOT_FOUND", "Agent config not found.");
  }

  return mapAgentConfig(row);
}

async function getAgentSkillByIdFromPostgres(
  client: DatabaseClient,
  skillId: string,
): Promise<AgentSkillDto> {
  const result = await client.query<AgentSkillRow>(
    `
    select ${agentSkillSelect}
    from public.agent_skills
    where id = $1
    limit 1
    `,
    [skillId],
  );
  const row = result.rows[0];

  if (!row) {
    throw new ApiError(404, "AGENT_SKILL_NOT_FOUND", "Agent skill not found.");
  }

  return mapAgentSkill(row);
}

async function getKnowledgeSetByIdFromPostgres(
  client: DatabaseClient,
  setId: string,
): Promise<KnowledgeSetDto> {
  const result = await client.query<KnowledgeSetRow>(
    `
    select ${knowledgeSetSelect}
    from public.knowledge_sets
    where id = $1
    limit 1
    `,
    [setId],
  );
  const row = result.rows[0];

  if (!row) {
    throw new ApiError(404, "KNOWLEDGE_SET_NOT_FOUND", "Knowledge set not found.");
  }

  return mapKnowledgeSet(row);
}

async function listPromptVersionsFromPostgres(
  client: DatabaseClient,
  agentId: string,
): Promise<AgentPromptVersionDto[]> {
  const result = await client.query<AgentPromptVersionRow>(
    `
    select ${agentPromptVersionSelect}
    from public.agent_prompt_versions
    where agent_id = $1
    order by version_no desc
    `,
    [agentId],
  );

  return result.rows.map(mapAgentPromptVersion);
}

async function listSoulVersionsFromPostgres(
  client: DatabaseClient,
  agentId: string,
): Promise<AgentSoulVersionDto[]> {
  const result = await client.query<AgentSoulVersionRow>(
    `
    select ${agentSoulVersionSelect}
    from public.agent_soul_versions
    where agent_id = $1
    order by version_no desc
    `,
    [agentId],
  );

  return result.rows.map(mapAgentSoulVersion);
}

async function getDraftPromptFromPostgres(
  client: DatabaseClient,
  agentId: string,
): Promise<AgentPromptVersionDto | null> {
  const result = await client.query<AgentPromptVersionRow>(
    `
    select ${agentPromptVersionSelect}
    from public.agent_prompt_versions
    where agent_id = $1
      and status = 'draft'
    limit 1
    `,
    [agentId],
  );

  return result.rows[0] ? mapAgentPromptVersion(result.rows[0]) : null;
}

async function getDraftSoulFromPostgres(
  client: DatabaseClient,
  agentId: string,
): Promise<AgentSoulVersionDto | null> {
  const result = await client.query<AgentSoulVersionRow>(
    `
    select ${agentSoulVersionSelect}
    from public.agent_soul_versions
    where agent_id = $1
      and status = 'draft'
    limit 1
    `,
    [agentId],
  );

  return result.rows[0] ? mapAgentSoulVersion(result.rows[0]) : null;
}

async function assertAgentDisplayNameAvailableInPostgres(
  client: DatabaseClient,
  displayName: string,
  excludingAgentId?: string,
) {
  const values: unknown[] = [displayName];
  const filters = ["display_name = $1"];

  if (excludingAgentId) {
    values.push(excludingAgentId);
    filters.push(`id <> $${values.length}`);
  }

  const result = await client.query<{ id: string }>(
    `
    select id
    from public.agent_configs
    where ${filters.join(" and ")}
    limit 1
    `,
    values,
  );

  if (result.rows.length > 0) {
    throw new ApiError(409, "AGENT_DISPLAY_NAME_TAKEN", "Agent display name is already used.");
  }
}

async function assertAgentHasActivePromptInPostgres(
  client: DatabaseClient,
  agentId: string,
) {
  const result = await client.query<{ id: string }>(
    `
    select id
    from public.agent_prompt_versions
    where agent_id = $1
      and status = 'active'
      and length(trim(body)) > 0
    limit 1
    `,
    [agentId],
  );

  if (result.rows.length === 0) {
    throw new ApiError(
      409,
      "AGENT_ACTIVE_PROMPT_REQUIRED",
      "请先发布 agent.md",
      { agentId },
    );
  }
}

async function getNextPromptVersionNoInPostgres(
  client: DatabaseClient,
  agentId: string,
) {
  const result = await client.query<{ next_version_no: number }>(
    `
    select coalesce(max(version_no), 0)::int + 1 as next_version_no
    from public.agent_prompt_versions
    where agent_id = $1
    `,
    [agentId],
  );

  return result.rows[0]?.next_version_no ?? 1;
}

async function getNextSoulVersionNoInPostgres(
  client: DatabaseClient,
  agentId: string,
) {
  const result = await client.query<{ next_version_no: number }>(
    `
    select coalesce(max(version_no), 0)::int + 1 as next_version_no
    from public.agent_soul_versions
    where agent_id = $1
    `,
    [agentId],
  );

  return result.rows[0]?.next_version_no ?? 1;
}

async function getAgentSkillsByIdsFromPostgres(
  client: DatabaseClient,
  skillIds: string[],
) {
  if (skillIds.length === 0) {
    return [];
  }

  const result = await client.query<AgentSkillRow>(
    `
    select ${agentSkillSelect}
    from public.agent_skills
    where id = any($1::uuid[])
    `,
    [skillIds],
  );
  const skills = result.rows.map(mapAgentSkill);

  if (skills.length !== skillIds.length) {
    throw new ApiError(404, "AGENT_SKILL_NOT_FOUND", "One or more agent skills were not found.", {
      skillIds,
      foundSkillIds: skills.map((skill) => skill.id),
    });
  }

  return skills;
}

async function listAgentSkillBindingsFromPostgres(
  client: DatabaseClient,
  agentId: string,
) {
  const result = await client.query<AgentSkillBindingRow>(
    `
    select ${agentSkillBindingSelect}
    from public.agent_skill_bindings
    where agent_id = $1
    order by created_at desc
    `,
    [agentId],
  );

  return result.rows.map(mapAgentSkillBinding);
}

async function getKnowledgeSetsByIdsFromPostgres(
  client: DatabaseClient,
  knowledgeSetIds: string[],
) {
  if (knowledgeSetIds.length === 0) {
    return [];
  }

  const result = await client.query<KnowledgeSetRow>(
    `
    select ${knowledgeSetSelect}
    from public.knowledge_sets
    where id = any($1::uuid[])
    `,
    [knowledgeSetIds],
  );
  const knowledgeSets = result.rows.map(mapKnowledgeSet);

  if (knowledgeSets.length !== knowledgeSetIds.length) {
    throw new ApiError(404, "KNOWLEDGE_SET_NOT_FOUND", "One or more knowledge sets were not found.", {
      knowledgeSetIds,
      foundKnowledgeSetIds: knowledgeSets.map((knowledgeSet) => knowledgeSet.id),
    });
  }

  return knowledgeSets;
}

async function listAgentKnowledgeSetBindingsFromPostgres(
  client: DatabaseClient,
  agentId: string,
) {
  const result = await client.query<AgentKnowledgeSetBindingRow>(
    `
    select ${agentKnowledgeSetBindingSelect}
    from public.agent_knowledge_set_bindings
    where agent_id = $1
    order by created_at desc
    `,
    [agentId],
  );

  return result.rows.map(mapAgentKnowledgeSetBinding);
}

async function assertKnowledgeDocumentsExistInPostgres(
  client: DatabaseClient,
  documentIds: string[],
) {
  if (documentIds.length === 0) {
    return;
  }

  const result = await client.query<{ id: string }>(
    `
    select id
    from public.knowledge_documents
    where id = any($1::uuid[])
    `,
    [documentIds],
  );
  const foundDocumentIds = result.rows.map((row) => row.id);

  if (foundDocumentIds.length !== documentIds.length) {
    throw new ApiError(
      404,
      "KNOWLEDGE_DOCUMENT_NOT_FOUND",
      "One or more knowledge documents were not found.",
      { documentIds, foundDocumentIds },
    );
  }
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids)];
}

function toAgentServiceFlags(value: unknown): AgentServiceFlags {
  const record = toRecord(value);

  return {
    ...record,
    systemPromptEnabled: getBoolean(record.systemPromptEnabled, true),
    skillsEnabled: getBoolean(record.skillsEnabled, true),
    knowledgeEnabled: getBoolean(record.knowledgeEnabled, true),
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function getBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function toNullableIsoString(value: string | Date | null) {
  return value ? toIsoString(value) : null;
}

const agentConfigSelect = [
  "id",
  "agent_key",
  "display_name",
  "role_description",
  "description",
  "service_status",
  "service_flags",
  "model_config",
  "copied_from_agent_id",
  "created_by_admin_id",
  "created_at",
  "updated_at",
].join(", ");

const agentPromptVersionSelect = [
  "id",
  "agent_id",
  "version_no",
  "body",
  "status",
  "change_note",
  "created_by_admin_id",
  "created_at",
  "activated_at",
  "archived_at",
].join(", ");

const agentSoulVersionSelect = [
  "id",
  "agent_id",
  "version_no",
  "body",
  "status",
  "change_note",
  "created_by_admin_id",
  "created_at",
  "activated_at",
  "archived_at",
].join(", ");

const agentSkillSelect = [
  "id",
  "skill_key",
  "name",
  "description",
  "when_to_use",
  "body",
  "status",
  "dependencies",
  "metadata",
  "created_by_admin_id",
  "created_at",
  "updated_at",
].join(", ");

const agentSkillBindingSelect = [
  "id",
  "agent_id",
  "skill_id",
  "status",
  "created_by_admin_id",
  "created_at",
  "updated_at",
].join(", ");

const knowledgeSetSelect = [
  "id",
  "set_key",
  "name",
  "description",
  "scope",
  "merchant_id",
  "status",
  "metadata",
  "created_by_admin_id",
  "created_at",
  "updated_at",
].join(", ");

const knowledgeSetDocumentSelect = [
  "id",
  "knowledge_set_id",
  "document_id",
  "created_by_admin_id",
  "created_at",
].join(", ");

const agentKnowledgeSetBindingSelect = [
  "id",
  "agent_id",
  "knowledge_set_id",
  "status",
  "created_by_admin_id",
  "created_at",
  "updated_at",
].join(", ");

const agentRouteBindingSelect = [
  "id",
  "route_key",
  "agent_id",
  "status",
  "description",
  "created_by_admin_id",
  "created_at",
  "updated_at",
].join(", ");

const agentRuntimeSnapshotSelect = [
  "id",
  "session_id",
  "message_id",
  "agent_id",
  "prompt_version_id",
  "candidate_skill_ids",
  "actual_skill_ids",
  "knowledge_set_ids",
  "knowledge_match_ids",
  "memory_match_ids",
  "tool_call_summary",
  "model",
  "created_at",
].join(", ");

const agentTestRunSelect = [
  "id",
  "agent_id",
  "merchant_id",
  "input_message",
  "prompt_version_id",
  "candidate_skill_ids",
  "actual_skill_ids",
  "knowledge_set_ids",
  "knowledge_match_ids",
  "memory_match_ids",
  "tool_summary",
  "assistant_output",
  "status",
  "error_summary",
  "model",
  "created_by_admin_id",
  "created_at",
].join(", ");

const merchantCreditAccountSelect = [
  "id",
  "merchant_id",
  "balance",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

const merchantUsageEventSelect = [
  "id",
  "merchant_id",
  "action_type",
  "agent_id",
  "estimated_cost",
  "actual_cost",
  "status",
  "metadata",
  "created_at",
].join(", ");

const merchantCreditLedgerSelect = [
  "id",
  "merchant_id",
  "credit_account_id",
  "direction",
  "amount",
  "reason",
  "related_usage_event_id",
  "metadata",
  "created_at",
].join(", ");
