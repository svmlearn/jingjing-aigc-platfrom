import "server-only";

import type { AgentConfigDto } from "@/contracts/agent-console";
import type { ConsultationAgentSettingsDto } from "@/contracts/knowledge";
import {
  getAgentConfigById,
  getConsultationDefaultRouteBinding,
  listAgentConfigs,
  listAgentKnowledgeSetBindings,
  listAgentPromptVersions,
  listAgentSoulVersions,
  listAgentSkillBindings,
  listAgentSkills,
  listKnowledgeSets,
  listKnowledgeSetDocuments,
} from "@/lib/db/agent-console-repository";
import { getPlatformSettings } from "@/lib/db/platform-admin-repository";
import { toRuntimeSkill } from "@/server/api/consultation-runtime/skills";
import { getConsultationBusinessToolCatalog } from "@/server/api/consultation-runtime/tools";
import type {
  ConsultationAgentRuntimeSettings,
  ConsultationPlannerMode,
  ConsultationAgentToolKey,
  ConsultationMentionRouting,
} from "@/server/api/consultation-runtime/types";
import {
  clampInteger,
  toStringArrayValue,
  uniqueStrings,
} from "@/server/api/consultation-runtime/utils";

export async function resolveConsultationAgentRuntime(input: {
  fallback?: ConsultationAgentSettingsDto;
  agentId?: string | null;
  allowNonEnabled?: boolean;
  promptMode?: "active" | "draft_or_active";
} = {}): Promise<{
  consultationAgent: ConsultationAgentRuntimeSettings;
}> {
  const fallback = input.fallback ?? (await getPlatformSettings()).consultationAgent;
  const fallbackRuntime: ConsultationAgentRuntimeSettings = {
    ...fallback,
    plannerMode: "model_json_planner",
    container: null,
    soulPrompt: null,
    skillCatalog: [],
    activeSkills: [],
  };

  try {
    let agentId = input.agentId ?? null;

    if (!agentId) {
      const routeBinding = await getConsultationDefaultRouteBinding();

      if (routeBinding?.status !== "active") {
        return { consultationAgent: fallbackRuntime };
      }

      agentId = routeBinding.agentId ?? null;
    }

    if (!agentId) {
      return { consultationAgent: fallbackRuntime };
    }

    const agent = await getAgentConfigById(agentId);

    if (!input.allowNonEnabled && agent.serviceStatus !== "enabled") {
      return { consultationAgent: fallbackRuntime };
    }

    const [
      promptVersions,
      soulVersions,
      skillBindings,
      skills,
      knowledgeSetBindings,
      knowledgeSets,
    ] = await Promise.all([
      listAgentPromptVersions(agent.id),
      listAgentSoulVersions(agent.id),
      listAgentSkillBindings({ agentId: agent.id }),
      listAgentSkills(),
      listAgentKnowledgeSetBindings({ agentId: agent.id }),
      listKnowledgeSets(),
    ]);
    const sortedPromptVersions = promptVersions.sort(
      (first, second) => second.versionNo - first.versionNo,
    );
    const activePrompt = sortedPromptVersions.find(
      (promptVersion) => promptVersion.status === "active",
    ) ?? null;
    const draftPrompt = sortedPromptVersions.find(
      (promptVersion) => promptVersion.status === "draft",
    ) ?? null;
    const selectedPrompt =
      input.promptMode === "draft_or_active" ? draftPrompt ?? activePrompt : activePrompt;
    const sortedSoulVersions = soulVersions.sort(
      (first, second) => second.versionNo - first.versionNo,
    );
    const activeSoul = sortedSoulVersions.find(
      (soulVersion) => soulVersion.status === "active",
    ) ?? null;
    const draftSoul = sortedSoulVersions.find(
      (soulVersion) => soulVersion.status === "draft",
    ) ?? null;
    const selectedSoul =
      input.promptMode === "draft_or_active" ? draftSoul ?? activeSoul : activeSoul;
    const enabledSkillIds = new Set(
      skillBindings
        .filter((binding) => binding.status === "enabled")
        .map((binding) => binding.skillId),
    );
    const enabledKnowledgeSetIds = new Set(
      knowledgeSets
        .filter((knowledgeSet) => knowledgeSet.status === "enabled")
        .map((knowledgeSet) => knowledgeSet.id),
    );
    const candidateSkills = skills
      .filter((skill) => skill.status === "enabled" && enabledSkillIds.has(skill.id))
      .map(toRuntimeSkill);
    const knowledgeSetIds = agent.serviceFlags.knowledgeEnabled
      ? knowledgeSetBindings
          .filter(
            (binding) =>
              binding.status === "enabled" &&
              enabledKnowledgeSetIds.has(binding.knowledgeSetId),
          )
          .map((binding) => binding.knowledgeSetId)
      : [];
    const knowledgeDocumentIds = agent.serviceFlags.knowledgeEnabled
      ? await resolveKnowledgeDocumentIdsForSets(knowledgeSetIds)
      : [];

    return {
      consultationAgent: {
        ...resolveAgentRuntimeOverrides({
          fallback,
          agent,
        }),
        systemPrompt:
          agent.serviceFlags.systemPromptEnabled && selectedPrompt?.body
            ? selectedPrompt.body
            : fallback.systemPrompt,
        container: {
          agent,
          activePromptVersion: selectedPrompt,
          activeSoulVersion: selectedSoul,
          candidateSkills,
          knowledgeSetIds,
          knowledgeDocumentIds,
        },
        soulPrompt: selectedSoul?.body?.trim() ? selectedSoul.body : null,
        skillCatalog: agent.serviceFlags.skillsEnabled ? candidateSkills : [],
        activeSkills: [],
      },
    };
  } catch {
    return { consultationAgent: fallbackRuntime };
  }
}

function resolveAgentRuntimeOverrides(input: {
  fallback: ConsultationAgentSettingsDto;
  agent: AgentConfigDto;
}): ConsultationAgentSettingsDto & { plannerMode: ConsultationPlannerMode } {
  const modelConfig = input.agent.modelConfig;
  const enabledTools = toAgentEnabledTools(modelConfig.enabledTools);
  const plannerMode = toConsultationPlannerMode(modelConfig.plannerMode);

  return {
    ...input.fallback,
    plannerMode: plannerMode ?? "model_json_planner",
    enabledTools: enabledTools.length > 0 ? enabledTools : input.fallback.enabledTools,
    maxRounds:
      typeof modelConfig.maxRounds === "number"
        ? clampInteger(modelConfig.maxRounds, 1, 12)
        : input.fallback.maxRounds,
    retrievalTopK:
      typeof modelConfig.retrievalTopK === "number"
        ? clampInteger(modelConfig.retrievalTopK, 0, 12)
        : input.fallback.retrievalTopK,
    model:
      typeof modelConfig.model === "string" && modelConfig.model.trim()
        ? modelConfig.model.trim()
        : input.fallback.model,
    temperature:
      typeof modelConfig.temperature === "number"
        ? Math.max(0, Math.min(modelConfig.temperature, 2))
        : input.fallback.temperature,
  };
}

function toConsultationPlannerMode(value: unknown): ConsultationPlannerMode | null {
  if (
    value === "deterministic" ||
    value === "model_json_planner" ||
    value === "native_tool_calling"
  ) {
    return value;
  }

  return null;
}

function toAgentEnabledTools(value: unknown): ConsultationAgentToolKey[] {
  const allowed = new Set<ConsultationAgentToolKey>(
    getConsultationBusinessToolCatalog().map((tool) => tool.key),
  );

  return uniqueStrings(toStringArrayValue(value)).filter(
    (tool): tool is ConsultationAgentToolKey => allowed.has(tool as ConsultationAgentToolKey),
  );
}

export async function resolveMentionedConsultationAgentRuntime(input: {
  fallback: ConsultationAgentSettingsDto;
  defaultRuntime: ConsultationAgentRuntimeSettings;
  content: string;
}): Promise<{
  consultationAgent: ConsultationAgentRuntimeSettings;
  routing: ConsultationMentionRouting;
}> {
  const mention = parseLeadingAgentMention(input.content);

  if (!mention) {
    return {
      consultationAgent: input.defaultRuntime,
      routing: buildDefaultMentionRouting(input.content, input.defaultRuntime),
    };
  }

  const agents = await listEnabledConsultationExpertAgents();
  const matchedAgent = findMentionedAgent({
    mention: mention.token,
    agents,
  });

  if (!matchedAgent) {
    return {
      consultationAgent: input.defaultRuntime,
      routing: {
        mode: "mention_unresolved",
        rawMention: mention.raw,
        cleanedContent: mention.cleanedContent || input.content,
        targetAgentId: input.defaultRuntime.container?.agent.id ?? null,
        targetAgentKey: input.defaultRuntime.container?.agent.agentKey ?? null,
        targetDisplayName: input.defaultRuntime.container?.agent.displayName ?? null,
        availableMentions: agents.map((agent) => agent.displayName),
      },
    };
  }

  const resolved = await resolveConsultationAgentRuntime({
    fallback: input.fallback,
    agentId: matchedAgent.id,
  });

  return {
    consultationAgent: resolved.consultationAgent,
    routing: {
      mode: "mentioned_agent",
      rawMention: mention.raw,
      cleanedContent: mention.cleanedContent || input.content,
      targetAgentId: resolved.consultationAgent.container?.agent.id ?? matchedAgent.id,
      targetAgentKey: resolved.consultationAgent.container?.agent.agentKey ?? matchedAgent.agentKey,
      targetDisplayName:
        resolved.consultationAgent.container?.agent.displayName ?? matchedAgent.displayName,
      availableMentions: agents.map((agent) => agent.displayName),
    },
  };
}

async function resolveKnowledgeDocumentIdsForSets(knowledgeSetIds: string[]) {
  if (knowledgeSetIds.length === 0) {
    return [];
  }

  const documentsBySet = await Promise.all(
    uniqueStrings(knowledgeSetIds).map((knowledgeSetId) =>
      listKnowledgeSetDocuments({ knowledgeSetId }),
    ),
  );

  return uniqueStrings(
    documentsBySet.flatMap((documents) => documents.map((document) => document.documentId)),
  );
}

async function listEnabledConsultationExpertAgents() {
  try {
    return (await listAgentConfigs()).filter((agent) => agent.serviceStatus === "enabled");
  } catch {
    return [];
  }
}

function parseLeadingAgentMention(content: string): {
  raw: string;
  token: string;
  cleanedContent: string;
} | null {
  const match = content.trimStart().match(/^@([^\s@，,：:]+)[\s，,：:]*/);

  if (!match?.[0] || !match[1]) {
    return null;
  }

  return {
    raw: match[0].trim(),
    token: match[1].trim(),
    cleanedContent: content.trimStart().slice(match[0].length).trim(),
  };
}

function buildDefaultMentionRouting(
  content: string,
  runtime: ConsultationAgentRuntimeSettings,
): ConsultationMentionRouting {
  return {
    mode: "default_agent",
    rawMention: null,
    cleanedContent: content,
    targetAgentId: runtime.container?.agent.id ?? null,
    targetAgentKey: runtime.container?.agent.agentKey ?? null,
    targetDisplayName: runtime.container?.agent.displayName ?? null,
    availableMentions: runtime.container ? [runtime.container.agent.displayName] : [],
  };
}

function findMentionedAgent(input: {
  mention: string;
  agents: AgentConfigDto[];
}) {
  const mentionKey = normalizeMentionAlias(input.mention);

  return input.agents.find((agent) =>
    buildAgentMentionAliases(agent).some((alias) => alias === mentionKey),
  ) ?? null;
}

function buildAgentMentionAliases(agent: AgentConfigDto) {
  return uniqueStrings(
    [
      agent.agentKey,
      agent.displayName,
      agent.roleDescription ?? "",
      agent.displayName.replace(/agent/gi, ""),
      agent.displayName.replace(/专家/g, ""),
      agent.displayName.replace(/官/g, ""),
    ]
      .map(normalizeMentionAlias)
      .filter(Boolean),
  );
}

function normalizeMentionAlias(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s_\-·.。:：,，/|()[\]{}"'`]+/g, "")
    .trim();
}
