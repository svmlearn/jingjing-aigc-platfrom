import "server-only";

import type {
  AgentBindingStatus,
  AgentConfigDto,
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
