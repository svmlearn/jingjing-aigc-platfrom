import "server-only";

import { randomUUID } from "node:crypto";

import type {
  AgentBindingStatus,
  AgentConfigDto,
  AgentConfigDetailDto,
  AgentConsoleFoundationStateDto,
  AgentKnowledgeSetBindingDto,
  AgentPromptVersionDto,
  AgentPromptVersionStatus,
  AgentRouteBindingDto,
  AgentRouteBindingStatus,
  AgentRouteKey,
  AgentServiceFlags,
  AgentServiceStatus,
  AgentSkillBindingDto,
  AgentSkillDto,
  AgentAssetStatus,
  KnowledgeSetDetailDto,
  KnowledgeSetDocumentDto,
  KnowledgeSetDto,
  KnowledgeSetScope,
} from "@/contracts/agent-console";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
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
  created_at: string;
  updated_at: string;
};

type AgentPromptVersionRow = {
  id: string;
  agent_id: string;
  version_no: number;
  body: string;
  status: AgentPromptVersionStatus;
  change_note: string | null;
  created_by_admin_id: string | null;
  created_at: string;
  activated_at: string | null;
  archived_at: string | null;
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
  created_at: string;
  updated_at: string;
};

type AgentSkillBindingRow = {
  id: string;
  agent_id: string;
  skill_id: string;
  status: AgentBindingStatus;
  created_by_admin_id: string | null;
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
};

type AgentKnowledgeSetBindingRow = {
  id: string;
  agent_id: string;
  knowledge_set_id: string;
  status: AgentBindingStatus;
  created_by_admin_id: string | null;
  created_at: string;
  updated_at: string;
};

type AgentRouteBindingRow = {
  id: string;
  route_key: AgentRouteKey;
  agent_id: string | null;
  status: AgentRouteBindingStatus;
  description: string | null;
  created_by_admin_id: string | null;
  created_at: string;
  updated_at: string;
};

type KnowledgeSetDocumentRow = {
  id: string;
  knowledge_set_id: string;
  document_id: string;
  created_by_admin_id: string | null;
  created_at: string;
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

const demoCreatedAt = "2026-04-27T00:00:00.000Z";

const demoInitialAgent: AgentConfigDto = {
  id: "demo_initial_consultation_agent",
  agentKey: "initial_consultation_agent",
  displayName: "初始咨询 Agent",
  roleDescription: "本地生活商家内容咨询顾问",
  description: "本地 demo fallback，仅在 Supabase service role 未配置时使用。",
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
  description: "本地 demo fallback，仅在 Supabase service role 未配置时使用。",
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
  description: "商家端默认咨询入口绑定。",
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
  requireSupabaseAdmin("AGENT_CONFIG_CREATE_UNAVAILABLE");
  await assertAgentDisplayNameAvailable(input.displayName);
  const supabase = createSupabaseAdminClient();
  const agentKey = input.agentKey ?? createStableKey("agent");

  const { data, error } = await supabase
    .from("agent_configs")
    .insert({
      agent_key: agentKey,
      display_name: input.displayName,
      role_description: input.roleDescription ?? null,
      description: input.description ?? null,
      service_status: input.serviceStatus ?? "draft",
      service_flags: normalizeAgentServiceFlags(input.serviceFlags),
      model_config: input.modelConfig ?? {},
    })
    .select(agentConfigSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "AGENT_CONFIG_CREATE_FAILED", error?.message ?? "Create failed.");
  }

  const agent = mapAgentConfig(data as unknown as AgentConfigRow);

  await recordAgentConsoleAdminEvent({
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
}

export async function getAgentConfigById(agentId: string): Promise<AgentConfigDto> {
  if (!isSupabaseAdminConfigured()) {
    if (agentId === demoInitialAgent.id) {
      return demoInitialAgent;
    }

    throw new ApiError(404, "AGENT_CONFIG_NOT_FOUND", "Agent config not found.");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agent_configs")
    .select(agentConfigSelect)
    .eq("id", agentId)
    .single();

  if (error || !data) {
    throw new ApiError(404, "AGENT_CONFIG_NOT_FOUND", "Agent config not found.");
  }

  return mapAgentConfig(data as unknown as AgentConfigRow);
}

export async function getAgentConfigDetail(
  agentId: string,
): Promise<AgentConfigDetailDto> {
  const [agent, promptVersions, skillBindings, knowledgeSetBindings] = await Promise.all([
    getAgentConfigById(agentId),
    listAgentPromptVersions(agentId),
    listAgentSkillBindings({ agentId }),
    listAgentKnowledgeSetBindings({ agentId }),
  ]);

  return {
    agent,
    promptVersions,
    activePromptVersion: promptVersions.find((prompt) => prompt.status === "active") ?? null,
    skillBindings,
    knowledgeSetBindings,
  };
}

export async function updateAgentConfig(
  agentId: string,
  input: AgentConfigUpdateInput,
): Promise<AgentConfigDto> {
  requireSupabaseAdmin("AGENT_CONFIG_UPDATE_UNAVAILABLE");
  const current = await getAgentConfigById(agentId);
  const update: Record<string, unknown> = {};

  if (input.displayName !== undefined) {
    if (input.displayName !== current.displayName) {
      await assertAgentDisplayNameAvailable(input.displayName, agentId);
    }
    update.display_name = input.displayName;
  }
  if (input.roleDescription !== undefined) {
    update.role_description = input.roleDescription;
  }
  if (input.description !== undefined) {
    update.description = input.description;
  }
  if (input.serviceStatus !== undefined) {
    update.service_status = input.serviceStatus;
  }
  if (input.serviceFlags !== undefined) {
    update.service_flags = normalizeAgentServiceFlags(input.serviceFlags, current.serviceFlags);
  }
  if (input.modelConfig !== undefined) {
    update.model_config = input.modelConfig;
  }

  if (Object.keys(update).length === 0) {
    return current;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agent_configs")
    .update(update)
    .eq("id", agentId)
    .select(agentConfigSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "AGENT_CONFIG_UPDATE_FAILED", error?.message ?? "Update failed.");
  }

  const agent = mapAgentConfig(data as unknown as AgentConfigRow);

  await recordAgentConsoleAdminEvent({
    actorLabel: input.actorLabel,
    eventType: "agent.updated",
    targetType: "agent",
    targetId: agentId,
    summary: `更新 Agent ${agent.displayName}`,
    details: {
      updatedFields: Object.keys(update),
      fromStatus: current.serviceStatus,
      toStatus: agent.serviceStatus,
    },
  });

  return agent;
}

export async function copyAgentConfig(
  agentId: string,
  input: { displayName: string; actorLabel?: string },
): Promise<AgentConfigDetailDto> {
  requireSupabaseAdmin("AGENT_CONFIG_COPY_UNAVAILABLE");
  const source = await getAgentConfigById(agentId);
  await assertAgentDisplayNameAvailable(input.displayName);

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agent_configs")
    .insert({
      agent_key: createStableKey("agent"),
      display_name: input.displayName,
      role_description: source.roleDescription ?? null,
      description: source.description ?? null,
      service_status: "draft",
      service_flags: source.serviceFlags,
      model_config: source.modelConfig,
      copied_from_agent_id: source.id,
    })
    .select(agentConfigSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "AGENT_CONFIG_COPY_FAILED", error?.message ?? "Copy failed.");
  }

  const copied = mapAgentConfig(data as unknown as AgentConfigRow);
  const [prompts, skillBindings, knowledgeSetBindings] = await Promise.all([
    listAgentPromptVersions(source.id),
    listAgentSkillBindings({ agentId: source.id }),
    listAgentKnowledgeSetBindings({ agentId: source.id }),
  ]);
  const activePrompt = prompts.find((prompt) => prompt.status === "active");
  const draftPrompt = prompts.find((prompt) => prompt.status === "draft");

  if (activePrompt) {
    const { error: promptError } = await supabase.from("agent_prompt_versions").insert({
      agent_id: copied.id,
      version_no: 1,
      body: activePrompt.body,
      status: "active",
      change_note: `复制自 ${source.displayName} 的 active prompt。`,
      activated_at: new Date().toISOString(),
    });

    if (promptError) {
      throw new ApiError(500, "AGENT_COPY_ACTIVE_PROMPT_FAILED", promptError.message);
    }
  }

  if (draftPrompt) {
    const { error: promptError } = await supabase.from("agent_prompt_versions").insert({
      agent_id: copied.id,
      version_no: activePrompt ? 2 : 1,
      body: draftPrompt.body,
      status: "draft",
      change_note: `复制自 ${source.displayName} 的 draft prompt。`,
    });

    if (promptError) {
      throw new ApiError(500, "AGENT_COPY_DRAFT_PROMPT_FAILED", promptError.message);
    }
  }

  if (skillBindings.length > 0) {
    const { error: bindingError } = await supabase.from("agent_skill_bindings").insert(
      skillBindings.map((binding) => ({
        agent_id: copied.id,
        skill_id: binding.skillId,
        status: binding.status,
      })),
    );

    if (bindingError) {
      throw new ApiError(500, "AGENT_COPY_SKILLS_FAILED", bindingError.message);
    }
  }

  if (knowledgeSetBindings.length > 0) {
    const { error: bindingError } = await supabase.from("agent_knowledge_set_bindings").insert(
      knowledgeSetBindings.map((binding) => ({
        agent_id: copied.id,
        knowledge_set_id: binding.knowledgeSetId,
        status: binding.status,
      })),
    );

    if (bindingError) {
      throw new ApiError(500, "AGENT_COPY_KNOWLEDGE_SETS_FAILED", bindingError.message);
    }
  }

  await recordAgentConsoleAdminEvent({
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
    },
  });

  return getAgentConfigDetail(copied.id);
}

export async function listAgentConfigs(): Promise<AgentConfigDto[]> {
  if (!isSupabaseAdminConfigured()) {
    return [demoInitialAgent];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agent_configs")
    .select(agentConfigSelect)
    .order("created_at", { ascending: false });

  if (error) {
    throw new ApiError(500, "AGENT_CONFIGS_LIST_FAILED", error.message);
  }

  return ((data ?? []) as unknown as AgentConfigRow[]).map(mapAgentConfig);
}

export async function listAgentPromptVersions(
  agentId: string,
): Promise<AgentPromptVersionDto[]> {
  if (!isSupabaseAdminConfigured()) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agent_prompt_versions")
    .select(agentPromptVersionSelect)
    .eq("agent_id", agentId)
    .order("version_no", { ascending: false });

  if (error) {
    throw new ApiError(500, "AGENT_PROMPT_VERSIONS_LIST_FAILED", error.message);
  }

  return ((data ?? []) as unknown as AgentPromptVersionRow[]).map(mapAgentPromptVersion);
}

export async function getActiveAgentPromptVersion(
  agentId: string,
): Promise<AgentPromptVersionDto | null> {
  if (!isSupabaseAdminConfigured()) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agent_prompt_versions")
    .select(agentPromptVersionSelect)
    .eq("agent_id", agentId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new ApiError(500, "AGENT_ACTIVE_PROMPT_FETCH_FAILED", error.message);
  }

  return data ? mapAgentPromptVersion(data as unknown as AgentPromptVersionRow) : null;
}

export async function saveAgentPromptDraft(input: {
  agentId: string;
  body: string;
  changeNote?: string | null;
  actorLabel?: string;
}): Promise<AgentPromptVersionDto> {
  requireSupabaseAdmin("AGENT_PROMPT_DRAFT_SAVE_UNAVAILABLE");
  await getAgentConfigById(input.agentId);
  const supabase = createSupabaseAdminClient();
  const existingDraft = (await listAgentPromptVersions(input.agentId)).find(
    (prompt) => prompt.status === "draft",
  );

  if (existingDraft) {
    const { data, error } = await supabase
      .from("agent_prompt_versions")
      .update({
        body: input.body,
        change_note: input.changeNote ?? null,
      })
      .eq("id", existingDraft.id)
      .select(agentPromptVersionSelect)
      .single();

    if (error || !data) {
      throw new ApiError(500, "AGENT_PROMPT_DRAFT_UPDATE_FAILED", error?.message ?? "Update failed.");
    }

    const draft = mapAgentPromptVersion(data as unknown as AgentPromptVersionRow);
    await recordAgentConsoleAdminEvent({
      actorLabel: input.actorLabel,
      eventType: "agent_prompt.draft_saved",
      targetType: "agent_prompt_version",
      targetId: draft.id,
      summary: `保存 Agent Prompt 草稿 v${draft.versionNo}`,
      details: {
        agentId: input.agentId,
        changeNote: input.changeNote ?? null,
      },
    });

    return draft;
  }

  const nextVersionNo = await getNextPromptVersionNo(input.agentId);
  const { data, error } = await supabase
    .from("agent_prompt_versions")
    .insert({
      agent_id: input.agentId,
      version_no: nextVersionNo,
      body: input.body,
      status: "draft",
      change_note: input.changeNote ?? null,
    })
    .select(agentPromptVersionSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "AGENT_PROMPT_DRAFT_CREATE_FAILED", error?.message ?? "Create failed.");
  }

  const draft = mapAgentPromptVersion(data as unknown as AgentPromptVersionRow);
  await recordAgentConsoleAdminEvent({
    actorLabel: input.actorLabel,
    eventType: "agent_prompt.draft_created",
    targetType: "agent_prompt_version",
    targetId: draft.id,
    summary: `创建 Agent Prompt 草稿 v${draft.versionNo}`,
    details: {
      agentId: input.agentId,
      changeNote: input.changeNote ?? null,
    },
  });

  return draft;
}

export async function publishAgentPromptDraft(input: {
  agentId: string;
  promptVersionId?: string;
  actorLabel?: string;
}): Promise<AgentPromptVersionDto> {
  requireSupabaseAdmin("AGENT_PROMPT_PUBLISH_UNAVAILABLE");
  const prompts = await listAgentPromptVersions(input.agentId);
  const draft = input.promptVersionId
    ? prompts.find((prompt) => prompt.id === input.promptVersionId)
    : prompts.find((prompt) => prompt.status === "draft");

  if (!draft) {
    throw new ApiError(404, "AGENT_PROMPT_DRAFT_NOT_FOUND", "Prompt draft not found.");
  }

  if (draft.status !== "draft") {
    throw new ApiError(409, "AGENT_PROMPT_NOT_DRAFT", "Only draft prompts can be published.");
  }

  if (!draft.body.trim()) {
    throw new ApiError(400, "AGENT_PROMPT_EMPTY", "System Prompt 不能为空");
  }

  const active = prompts.find((prompt) => prompt.status === "active");
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  if (active) {
    const { error } = await supabase
      .from("agent_prompt_versions")
      .update({
        status: "archived",
        archived_at: now,
      })
      .eq("id", active.id);

    if (error) {
      throw new ApiError(500, "AGENT_PROMPT_ACTIVE_ARCHIVE_FAILED", error.message);
    }
  }

  const { data, error } = await supabase
    .from("agent_prompt_versions")
    .update({
      status: "active",
      activated_at: now,
      archived_at: null,
    })
    .eq("id", draft.id)
    .select(agentPromptVersionSelect)
    .single();

  if (error || !data) {
    if (active) {
      await supabase
        .from("agent_prompt_versions")
        .update({
          status: "active",
          archived_at: null,
        })
        .eq("id", active.id);
    }

    throw new ApiError(500, "AGENT_PROMPT_PUBLISH_FAILED", error?.message ?? "Publish failed.");
  }

  const published = mapAgentPromptVersion(data as unknown as AgentPromptVersionRow);
  await recordAgentConsoleAdminEvent({
    actorLabel: input.actorLabel,
    eventType: "agent_prompt.published",
    targetType: "agent_prompt_version",
    targetId: published.id,
    summary: `发布 Agent Prompt v${published.versionNo}`,
    details: {
      agentId: input.agentId,
      previousActivePromptVersionId: active?.id ?? null,
    },
  });

  return published;
}

export async function rollbackAgentPromptVersion(input: {
  agentId: string;
  promptVersionId: string;
  actorLabel?: string;
}): Promise<AgentPromptVersionDto> {
  requireSupabaseAdmin("AGENT_PROMPT_ROLLBACK_UNAVAILABLE");
  const prompts = await listAgentPromptVersions(input.agentId);
  const target = prompts.find((prompt) => prompt.id === input.promptVersionId);

  if (!target) {
    throw new ApiError(404, "AGENT_PROMPT_VERSION_NOT_FOUND", "Prompt version not found.");
  }

  if (target.status !== "archived") {
    throw new ApiError(409, "AGENT_PROMPT_NOT_ARCHIVED", "Only archived prompts can be rolled back.");
  }

  if (!target.body.trim()) {
    throw new ApiError(400, "AGENT_PROMPT_EMPTY", "System Prompt 不能为空");
  }

  const active = prompts.find((prompt) => prompt.status === "active");
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();

  if (active) {
    const { error } = await supabase
      .from("agent_prompt_versions")
      .update({
        status: "archived",
        archived_at: now,
      })
      .eq("id", active.id);

    if (error) {
      throw new ApiError(500, "AGENT_PROMPT_ACTIVE_ARCHIVE_FAILED", error.message);
    }
  }

  const { data, error } = await supabase
    .from("agent_prompt_versions")
    .update({
      status: "active",
      activated_at: now,
      archived_at: null,
    })
    .eq("id", target.id)
    .select(agentPromptVersionSelect)
    .single();

  if (error || !data) {
    if (active) {
      await supabase
        .from("agent_prompt_versions")
        .update({
          status: "active",
          archived_at: null,
        })
        .eq("id", active.id);
    }

    throw new ApiError(500, "AGENT_PROMPT_ROLLBACK_FAILED", error?.message ?? "Rollback failed.");
  }

  const rolledBack = mapAgentPromptVersion(data as unknown as AgentPromptVersionRow);
  await recordAgentConsoleAdminEvent({
    actorLabel: input.actorLabel,
    eventType: "agent_prompt.rolled_back",
    targetType: "agent_prompt_version",
    targetId: rolledBack.id,
    summary: `回滚 Agent Prompt 到 v${rolledBack.versionNo}`,
    details: {
      agentId: input.agentId,
      previousActivePromptVersionId: active?.id ?? null,
    },
  });

  return rolledBack;
}

export async function createAgentSkill(input: AgentSkillCreateInput): Promise<AgentSkillDto> {
  requireSupabaseAdmin("AGENT_SKILL_CREATE_UNAVAILABLE");
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agent_skills")
    .insert({
      skill_key: input.skillKey ?? createStableKey("skill"),
      name: input.name,
      description: input.description ?? "",
      when_to_use: input.whenToUse ?? "",
      body: input.body ?? "",
      status: input.status ?? "draft",
      dependencies: input.dependencies ?? [],
      metadata: input.metadata ?? {},
    })
    .select(agentSkillSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "AGENT_SKILL_CREATE_FAILED", error?.message ?? "Create failed.");
  }

  const skill = mapAgentSkill(data as unknown as AgentSkillRow);
  await recordAgentConsoleAdminEvent({
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
}

export async function getAgentSkillById(skillId: string): Promise<AgentSkillDto> {
  if (!isSupabaseAdminConfigured()) {
    throw new ApiError(404, "AGENT_SKILL_NOT_FOUND", "Agent skill not found.");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agent_skills")
    .select(agentSkillSelect)
    .eq("id", skillId)
    .single();

  if (error || !data) {
    throw new ApiError(404, "AGENT_SKILL_NOT_FOUND", "Agent skill not found.");
  }

  return mapAgentSkill(data as unknown as AgentSkillRow);
}

export async function updateAgentSkill(
  skillId: string,
  input: AgentSkillUpdateInput,
): Promise<AgentSkillDto> {
  requireSupabaseAdmin("AGENT_SKILL_UPDATE_UNAVAILABLE");
  const current = await getAgentSkillById(skillId);
  const update: Record<string, unknown> = {};

  if (input.skillKey !== undefined) {
    update.skill_key = input.skillKey;
  }
  if (input.name !== undefined) {
    update.name = input.name;
  }
  if (input.description !== undefined) {
    update.description = input.description;
  }
  if (input.whenToUse !== undefined) {
    update.when_to_use = input.whenToUse;
  }
  if (input.body !== undefined) {
    update.body = input.body;
  }
  if (input.status !== undefined) {
    update.status = input.status;
  }
  if (input.dependencies !== undefined) {
    update.dependencies = input.dependencies;
  }
  if (input.metadata !== undefined) {
    update.metadata = input.metadata;
  }

  if (Object.keys(update).length === 0) {
    return current;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agent_skills")
    .update(update)
    .eq("id", skillId)
    .select(agentSkillSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "AGENT_SKILL_UPDATE_FAILED", error?.message ?? "Update failed.");
  }

  const skill = mapAgentSkill(data as unknown as AgentSkillRow);

  if (input.status === "disabled" && current.status !== "disabled") {
    const { error: bindingError } = await supabase
      .from("agent_skill_bindings")
      .update({ status: "disabled" })
      .eq("skill_id", skillId)
      .eq("status", "enabled");

    if (bindingError) {
      throw new ApiError(500, "AGENT_SKILL_BINDINGS_DISABLE_FAILED", bindingError.message);
    }
  }

  await recordAgentConsoleAdminEvent({
    actorLabel: input.actorLabel,
    eventType: "agent_skill.updated",
    targetType: "agent_skill",
    targetId: skill.id,
    summary: `更新 Skill ${skill.name}`,
    details: {
      updatedFields: Object.keys(update),
      fromStatus: current.status,
      toStatus: skill.status,
    },
  });

  return skill;
}

export async function listAgentSkills(): Promise<AgentSkillDto[]> {
  if (!isSupabaseAdminConfigured()) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agent_skills")
    .select(agentSkillSelect)
    .order("created_at", { ascending: false });

  if (error) {
    throw new ApiError(500, "AGENT_SKILLS_LIST_FAILED", error.message);
  }

  return ((data ?? []) as unknown as AgentSkillRow[]).map(mapAgentSkill);
}

export async function listAgentSkillBindings(input: {
  agentId?: string;
} = {}): Promise<AgentSkillBindingDto[]> {
  if (!isSupabaseAdminConfigured()) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("agent_skill_bindings")
    .select(agentSkillBindingSelect)
    .order("created_at", { ascending: false });

  if (input.agentId) {
    query = query.eq("agent_id", input.agentId);
  }

  const { data, error } = await query;

  if (error) {
    throw new ApiError(500, "AGENT_SKILL_BINDINGS_LIST_FAILED", error.message);
  }

  return ((data ?? []) as unknown as AgentSkillBindingRow[]).map(mapAgentSkillBinding);
}

export async function replaceAgentSkillBindings(input: {
  agentId: string;
  skillIds: string[];
  actorLabel?: string;
}): Promise<AgentSkillBindingDto[]> {
  requireSupabaseAdmin("AGENT_SKILL_BINDINGS_UPDATE_UNAVAILABLE");
  await getAgentConfigById(input.agentId);
  const desiredSkillIds = uniqueIds(input.skillIds);
  const skills = await getAgentSkillsByIds(desiredSkillIds);
  const notEnabled = skills.filter((skill) => skill.status !== "enabled");

  if (notEnabled.length > 0) {
    throw new ApiError(
      409,
      "AGENT_SKILL_NOT_ENABLED",
      "Only enabled skills can be attached as enabled candidates.",
      { skillIds: notEnabled.map((skill) => skill.id) },
    );
  }

  const existing = await listAgentSkillBindings({ agentId: input.agentId });
  const existingBySkillId = new Map(existing.map((binding) => [binding.skillId, binding]));
  const desired = new Set(desiredSkillIds);
  const supabase = createSupabaseAdminClient();

  for (const binding of existing) {
    const nextStatus: AgentBindingStatus = desired.has(binding.skillId) ? "enabled" : "disabled";

    if (binding.status === nextStatus) {
      continue;
    }

    const { error } = await supabase
      .from("agent_skill_bindings")
      .update({ status: nextStatus })
      .eq("id", binding.id);

    if (error) {
      throw new ApiError(500, "AGENT_SKILL_BINDING_UPDATE_FAILED", error.message);
    }
  }

  const rowsToInsert = desiredSkillIds
    .filter((skillId) => !existingBySkillId.has(skillId))
    .map((skillId) => ({
      agent_id: input.agentId,
      skill_id: skillId,
      status: "enabled",
    }));

  if (rowsToInsert.length > 0) {
    const { error } = await supabase.from("agent_skill_bindings").insert(rowsToInsert);

    if (error) {
      throw new ApiError(500, "AGENT_SKILL_BINDING_CREATE_FAILED", error.message);
    }
  }

  await recordAgentConsoleAdminEvent({
    actorLabel: input.actorLabel,
    eventType: "agent_skill_bindings.replaced",
    targetType: "agent",
    targetId: input.agentId,
    summary: "更新 Agent 挂载 Skill",
    details: {
      enabledSkillIds: desiredSkillIds,
    },
  });

  return listAgentSkillBindings({ agentId: input.agentId });
}

export async function createKnowledgeSet(
  input: KnowledgeSetCreateInput,
): Promise<KnowledgeSetDto> {
  requireSupabaseAdmin("KNOWLEDGE_SET_CREATE_UNAVAILABLE");
  const scope = input.scope ?? "platform";

  if (scope === "platform" && input.merchantId) {
    throw new ApiError(400, "KNOWLEDGE_SET_SCOPE_INVALID", "Platform knowledge sets cannot have merchantId.");
  }

  if (scope === "merchant" && !input.merchantId) {
    throw new ApiError(400, "KNOWLEDGE_SET_SCOPE_INVALID", "Merchant knowledge sets require merchantId.");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("knowledge_sets")
    .insert({
      set_key: input.setKey ?? createStableKey("ks"),
      name: input.name,
      description: input.description ?? null,
      scope,
      merchant_id: scope === "merchant" ? input.merchantId : null,
      status: input.status ?? "draft",
      metadata: input.metadata ?? {},
    })
    .select(knowledgeSetSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "KNOWLEDGE_SET_CREATE_FAILED", error?.message ?? "Create failed.");
  }

  const knowledgeSet = mapKnowledgeSet(data as unknown as KnowledgeSetRow);
  await recordAgentConsoleAdminEvent({
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
}

export async function getKnowledgeSetById(setId: string): Promise<KnowledgeSetDto> {
  if (!isSupabaseAdminConfigured()) {
    if (setId === demoBaseKnowledgeSet.id) {
      return demoBaseKnowledgeSet;
    }

    throw new ApiError(404, "KNOWLEDGE_SET_NOT_FOUND", "Knowledge set not found.");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("knowledge_sets")
    .select(knowledgeSetSelect)
    .eq("id", setId)
    .single();

  if (error || !data) {
    throw new ApiError(404, "KNOWLEDGE_SET_NOT_FOUND", "Knowledge set not found.");
  }

  return mapKnowledgeSet(data as unknown as KnowledgeSetRow);
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
  requireSupabaseAdmin("KNOWLEDGE_SET_UPDATE_UNAVAILABLE");
  const current = await getKnowledgeSetById(setId);
  const update: Record<string, unknown> = {};

  if (input.setKey !== undefined) {
    update.set_key = input.setKey;
  }
  if (input.name !== undefined) {
    update.name = input.name;
  }
  if (input.description !== undefined) {
    update.description = input.description;
  }
  if (input.status !== undefined) {
    update.status = input.status;
  }
  if (input.metadata !== undefined) {
    update.metadata = input.metadata;
  }

  if (Object.keys(update).length === 0) {
    return current;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("knowledge_sets")
    .update(update)
    .eq("id", setId)
    .select(knowledgeSetSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "KNOWLEDGE_SET_UPDATE_FAILED", error?.message ?? "Update failed.");
  }

  const knowledgeSet = mapKnowledgeSet(data as unknown as KnowledgeSetRow);

  if (input.status === "disabled" && current.status !== "disabled") {
    const { error: bindingError } = await supabase
      .from("agent_knowledge_set_bindings")
      .update({ status: "disabled" })
      .eq("knowledge_set_id", setId)
      .eq("status", "enabled");

    if (bindingError) {
      throw new ApiError(500, "KNOWLEDGE_SET_BINDINGS_DISABLE_FAILED", bindingError.message);
    }
  }

  await recordAgentConsoleAdminEvent({
    actorLabel: input.actorLabel,
    eventType: "knowledge_set.updated",
    targetType: "knowledge_set",
    targetId: knowledgeSet.id,
    summary: `更新 Knowledge Set ${knowledgeSet.name}`,
    details: {
      updatedFields: Object.keys(update),
      fromStatus: current.status,
      toStatus: knowledgeSet.status,
    },
  });

  return knowledgeSet;
}

export async function listKnowledgeSets(): Promise<KnowledgeSetDto[]> {
  if (!isSupabaseAdminConfigured()) {
    return [demoBaseKnowledgeSet];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("knowledge_sets")
    .select(knowledgeSetSelect)
    .order("created_at", { ascending: false });

  if (error) {
    throw new ApiError(500, "KNOWLEDGE_SETS_LIST_FAILED", error.message);
  }

  return ((data ?? []) as unknown as KnowledgeSetRow[]).map(mapKnowledgeSet);
}

export async function listKnowledgeSetDocuments(input: {
  knowledgeSetId?: string;
  documentId?: string;
} = {}): Promise<KnowledgeSetDocumentDto[]> {
  if (!isSupabaseAdminConfigured()) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("knowledge_set_documents")
    .select(knowledgeSetDocumentSelect)
    .order("created_at", { ascending: false });

  if (input.knowledgeSetId) {
    query = query.eq("knowledge_set_id", input.knowledgeSetId);
  }

  if (input.documentId) {
    query = query.eq("document_id", input.documentId);
  }

  const { data, error } = await query;

  if (error) {
    throw new ApiError(500, "KNOWLEDGE_SET_DOCUMENTS_LIST_FAILED", error.message);
  }

  return ((data ?? []) as unknown as KnowledgeSetDocumentRow[]).map(mapKnowledgeSetDocument);
}

export async function replaceKnowledgeSetDocuments(input: {
  knowledgeSetId: string;
  documentIds: string[];
  actorLabel?: string;
}): Promise<KnowledgeSetDetailDto> {
  requireSupabaseAdmin("KNOWLEDGE_SET_DOCUMENTS_UPDATE_UNAVAILABLE");
  await getKnowledgeSetById(input.knowledgeSetId);
  const documentIds = uniqueIds(input.documentIds);
  await assertKnowledgeDocumentsExist(documentIds);
  const supabase = createSupabaseAdminClient();

  const { error: deleteError } = await supabase
    .from("knowledge_set_documents")
    .delete()
    .eq("knowledge_set_id", input.knowledgeSetId);

  if (deleteError) {
    throw new ApiError(500, "KNOWLEDGE_SET_DOCUMENTS_DELETE_FAILED", deleteError.message);
  }

  if (documentIds.length > 0) {
    const { error: insertError } = await supabase.from("knowledge_set_documents").insert(
      documentIds.map((documentId) => ({
        knowledge_set_id: input.knowledgeSetId,
        document_id: documentId,
      })),
    );

    if (insertError) {
      throw new ApiError(500, "KNOWLEDGE_SET_DOCUMENTS_CREATE_FAILED", insertError.message);
    }
  }

  await recordAgentConsoleAdminEvent({
    actorLabel: input.actorLabel,
    eventType: "knowledge_set_documents.replaced",
    targetType: "knowledge_set",
    targetId: input.knowledgeSetId,
    summary: "更新 Knowledge Set 文档",
    details: {
      documentIds,
    },
  });

  return getKnowledgeSetDetail(input.knowledgeSetId);
}

export async function replaceKnowledgeDocumentSets(input: {
  documentId: string;
  knowledgeSetIds: string[];
  actorLabel?: string;
}): Promise<KnowledgeSetDocumentDto[]> {
  requireSupabaseAdmin("KNOWLEDGE_DOCUMENT_SETS_UPDATE_UNAVAILABLE");
  await assertKnowledgeDocumentsExist([input.documentId]);
  const knowledgeSetIds = uniqueIds(input.knowledgeSetIds);
  await getKnowledgeSetsByIds(knowledgeSetIds);
  const supabase = createSupabaseAdminClient();

  const { error: deleteError } = await supabase
    .from("knowledge_set_documents")
    .delete()
    .eq("document_id", input.documentId);

  if (deleteError) {
    throw new ApiError(500, "KNOWLEDGE_DOCUMENT_SETS_DELETE_FAILED", deleteError.message);
  }

  if (knowledgeSetIds.length > 0) {
    const { error: insertError } = await supabase.from("knowledge_set_documents").insert(
      knowledgeSetIds.map((knowledgeSetId) => ({
        knowledge_set_id: knowledgeSetId,
        document_id: input.documentId,
      })),
    );

    if (insertError) {
      throw new ApiError(500, "KNOWLEDGE_DOCUMENT_SETS_CREATE_FAILED", insertError.message);
    }
  }

  await recordAgentConsoleAdminEvent({
    actorLabel: input.actorLabel,
    eventType: "knowledge_document_sets.replaced",
    targetType: "knowledge_document",
    targetId: input.documentId,
    summary: "更新 Knowledge 文档所属知识集",
    details: {
      knowledgeSetIds,
    },
  });

  return listKnowledgeSetDocuments({ documentId: input.documentId });
}

export async function listAgentKnowledgeSetBindings(input: {
  agentId?: string;
} = {}): Promise<AgentKnowledgeSetBindingDto[]> {
  if (!isSupabaseAdminConfigured()) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("agent_knowledge_set_bindings")
    .select(agentKnowledgeSetBindingSelect)
    .order("created_at", { ascending: false });

  if (input.agentId) {
    query = query.eq("agent_id", input.agentId);
  }

  const { data, error } = await query;

  if (error) {
    throw new ApiError(500, "AGENT_KNOWLEDGE_SET_BINDINGS_LIST_FAILED", error.message);
  }

  return ((data ?? []) as unknown as AgentKnowledgeSetBindingRow[]).map(
    mapAgentKnowledgeSetBinding,
  );
}

export async function replaceAgentKnowledgeSetBindings(input: {
  agentId: string;
  knowledgeSetIds: string[];
  actorLabel?: string;
}): Promise<AgentKnowledgeSetBindingDto[]> {
  requireSupabaseAdmin("AGENT_KNOWLEDGE_SET_BINDINGS_UPDATE_UNAVAILABLE");
  await getAgentConfigById(input.agentId);
  const desiredKnowledgeSetIds = uniqueIds(input.knowledgeSetIds);
  const knowledgeSets = await getKnowledgeSetsByIds(desiredKnowledgeSetIds);
  const notEnabled = knowledgeSets.filter((knowledgeSet) => knowledgeSet.status !== "enabled");

  if (notEnabled.length > 0) {
    throw new ApiError(
      409,
      "KNOWLEDGE_SET_NOT_ENABLED",
      "Only enabled knowledge sets can be attached as enabled candidates.",
      { knowledgeSetIds: notEnabled.map((knowledgeSet) => knowledgeSet.id) },
    );
  }

  const existing = await listAgentKnowledgeSetBindings({ agentId: input.agentId });
  const existingByKnowledgeSetId = new Map(
    existing.map((binding) => [binding.knowledgeSetId, binding]),
  );
  const desired = new Set(desiredKnowledgeSetIds);
  const supabase = createSupabaseAdminClient();

  for (const binding of existing) {
    const nextStatus: AgentBindingStatus = desired.has(binding.knowledgeSetId)
      ? "enabled"
      : "disabled";

    if (binding.status === nextStatus) {
      continue;
    }

    const { error } = await supabase
      .from("agent_knowledge_set_bindings")
      .update({ status: nextStatus })
      .eq("id", binding.id);

    if (error) {
      throw new ApiError(500, "AGENT_KNOWLEDGE_SET_BINDING_UPDATE_FAILED", error.message);
    }
  }

  const rowsToInsert = desiredKnowledgeSetIds
    .filter((knowledgeSetId) => !existingByKnowledgeSetId.has(knowledgeSetId))
    .map((knowledgeSetId) => ({
      agent_id: input.agentId,
      knowledge_set_id: knowledgeSetId,
      status: "enabled",
    }));

  if (rowsToInsert.length > 0) {
    const { error } = await supabase.from("agent_knowledge_set_bindings").insert(rowsToInsert);

    if (error) {
      throw new ApiError(500, "AGENT_KNOWLEDGE_SET_BINDING_CREATE_FAILED", error.message);
    }
  }

  await recordAgentConsoleAdminEvent({
    actorLabel: input.actorLabel,
    eventType: "agent_knowledge_set_bindings.replaced",
    targetType: "agent",
    targetId: input.agentId,
    summary: "更新 Agent 挂载 Knowledge Set",
    details: {
      enabledKnowledgeSetIds: desiredKnowledgeSetIds,
    },
  });

  return listAgentKnowledgeSetBindings({ agentId: input.agentId });
}

export async function listAgentRouteBindings(): Promise<AgentRouteBindingDto[]> {
  if (!isSupabaseAdminConfigured()) {
    return [demoConsultationDefaultBinding];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agent_route_bindings")
    .select(agentRouteBindingSelect)
    .order("created_at", { ascending: false });

  if (error) {
    throw new ApiError(500, "AGENT_ROUTE_BINDINGS_LIST_FAILED", error.message);
  }

  return ((data ?? []) as unknown as AgentRouteBindingRow[]).map(mapAgentRouteBinding);
}

export async function getAgentRouteBinding(
  routeKey: AgentRouteKey,
): Promise<AgentRouteBindingDto | null> {
  if (!isSupabaseAdminConfigured()) {
    return routeKey === "consultation_default" ? demoConsultationDefaultBinding : null;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agent_route_bindings")
    .select(agentRouteBindingSelect)
    .eq("route_key", routeKey)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, "AGENT_ROUTE_BINDING_FETCH_FAILED", error.message);
  }

  return data ? mapAgentRouteBinding(data as unknown as AgentRouteBindingRow) : null;
}

export async function getConsultationDefaultRouteBinding() {
  return getAgentRouteBinding("consultation_default");
}

export async function setConsultationDefaultAgent(input: {
  agentId: string;
  actorLabel?: string;
}): Promise<AgentRouteBindingDto> {
  requireSupabaseAdmin("AGENT_ROUTE_BINDING_UPDATE_UNAVAILABLE");
  const agent = await getAgentConfigById(input.agentId);

  if (agent.serviceStatus !== "enabled") {
    throw new ApiError(
      409,
      "AGENT_NOT_ENABLED",
      "Only enabled Agents can be set as consultation_default.",
      { agentId: agent.id, serviceStatus: agent.serviceStatus },
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agent_route_bindings")
    .upsert(
      {
        route_key: "consultation_default",
        agent_id: agent.id,
        status: "active",
        description: "商家端默认咨询入口绑定。",
      },
      { onConflict: "route_key" },
    )
    .select(agentRouteBindingSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "AGENT_ROUTE_BINDING_UPDATE_FAILED", error?.message ?? "Update failed.");
  }

  const binding = mapAgentRouteBinding(data as unknown as AgentRouteBindingRow);
  await recordAgentConsoleAdminEvent({
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    createdAt: row.created_at,
    activatedAt: row.activated_at,
    archivedAt: row.archived_at,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAgentSkillBinding(row: AgentSkillBindingRow): AgentSkillBindingDto {
  return {
    id: row.id,
    agentId: row.agent_id,
    skillId: row.skill_id,
    status: row.status,
    createdByAdminId: row.created_by_admin_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapKnowledgeSetDocument(row: KnowledgeSetDocumentRow): KnowledgeSetDocumentDto {
  return {
    id: row.id,
    knowledgeSetId: row.knowledge_set_id,
    documentId: row.document_id,
    createdByAdminId: row.created_by_admin_id,
    createdAt: row.created_at,
  };
}

function requireSupabaseAdmin(code: string) {
  if (!isSupabaseAdminConfigured()) {
    throw new ApiError(503, code, "Supabase admin client is not configured.");
  }
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

async function recordAgentConsoleAdminEvent(input: {
  actorLabel?: string;
  eventType: string;
  targetType: string;
  targetId?: string;
  summary: string;
  details?: Record<string, unknown>;
}) {
  requireSupabaseAdmin("PLATFORM_ADMIN_EVENT_CREATE_UNAVAILABLE");
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("platform_admin_events").insert({
    actor_label: input.actorLabel ?? "admin",
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

async function assertAgentDisplayNameAvailable(displayName: string, excludingAgentId?: string) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("agent_configs")
    .select("id")
    .eq("display_name", displayName)
    .limit(1);

  if (excludingAgentId) {
    query = query.neq("id", excludingAgentId);
  }

  const { data, error } = await query;

  if (error) {
    throw new ApiError(500, "AGENT_DISPLAY_NAME_CHECK_FAILED", error.message);
  }

  if ((data ?? []).length > 0) {
    throw new ApiError(409, "AGENT_DISPLAY_NAME_TAKEN", "Agent display name is already used.");
  }
}

async function getNextPromptVersionNo(agentId: string) {
  const prompts = await listAgentPromptVersions(agentId);
  const latestVersionNo = prompts.reduce(
    (latest, prompt) => Math.max(latest, prompt.versionNo),
    0,
  );

  return latestVersionNo + 1;
}

async function getAgentSkillsByIds(skillIds: string[]) {
  if (skillIds.length === 0) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agent_skills")
    .select(agentSkillSelect)
    .in("id", skillIds);

  if (error) {
    throw new ApiError(500, "AGENT_SKILLS_FETCH_FAILED", error.message);
  }

  const skills = ((data ?? []) as unknown as AgentSkillRow[]).map(mapAgentSkill);

  if (skills.length !== skillIds.length) {
    throw new ApiError(404, "AGENT_SKILL_NOT_FOUND", "One or more agent skills were not found.", {
      skillIds,
      foundSkillIds: skills.map((skill) => skill.id),
    });
  }

  return skills;
}

async function getKnowledgeSetsByIds(knowledgeSetIds: string[]) {
  if (knowledgeSetIds.length === 0) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("knowledge_sets")
    .select(knowledgeSetSelect)
    .in("id", knowledgeSetIds);

  if (error) {
    throw new ApiError(500, "KNOWLEDGE_SETS_FETCH_FAILED", error.message);
  }

  const knowledgeSets = ((data ?? []) as unknown as KnowledgeSetRow[]).map(mapKnowledgeSet);

  if (knowledgeSets.length !== knowledgeSetIds.length) {
    throw new ApiError(404, "KNOWLEDGE_SET_NOT_FOUND", "One or more knowledge sets were not found.", {
      knowledgeSetIds,
      foundKnowledgeSetIds: knowledgeSets.map((knowledgeSet) => knowledgeSet.id),
    });
  }

  return knowledgeSets;
}

async function assertKnowledgeDocumentsExist(documentIds: string[]) {
  if (documentIds.length === 0) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("id")
    .in("id", documentIds);

  if (error) {
    throw new ApiError(500, "KNOWLEDGE_DOCUMENTS_FETCH_FAILED", error.message);
  }

  const foundDocumentIds = (data ?? []).map((row) => String(row.id));

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
  return Array.from(new Set(ids));
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
