"use client";

import { useMemo, useState } from "react";
import {
  Bot,
  Check,
  Copy,
  Database,
  Eye,
  Lock,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  Zap,
} from "lucide-react";

import {
  AdminEmptyState,
  AdminField,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminPanelHeader,
  AdminStatusBadge,
  adminButtonClassName,
  adminButtonVariants,
  adminInputClassName,
  adminSelectClassName,
  adminTextareaClassName,
} from "@/components/platform-admin/platform-admin-ui";
import type {
  AgentConfigDto,
  AgentConsoleFoundationStateDto,
  AgentAssetStatus,
  AgentTestRunDto,
  AgentKnowledgeSetBindingDto,
  AgentPromptVersionDto,
  AgentRouteBindingDto,
  AgentServiceStatus,
  AgentSkillBindingDto,
  AgentSkillDto,
  KnowledgeSetDto,
  PlatformAdminMerchantDto,
} from "@/contracts/platform-admin";
import { cn } from "@/lib/utils";

type AgentConsolePagesProps = {
  foundationState: AgentConsoleFoundationStateDto;
  skillBindings: AgentSkillBindingDto[];
  knowledgeSetBindings: AgentKnowledgeSetBindingDto[];
  promptVersions: AgentPromptVersionDto[];
};

function findOnlineAgentId(foundationState: AgentConsoleFoundationStateDto) {
  return foundationState.routeBindings.find(
    (binding) => binding.routeKey === "consultation_default" && binding.status === "active",
  )?.agentId;
}

function sortPromptVersions(promptVersions: AgentPromptVersionDto[]) {
  return [...promptVersions].sort((first, second) => second.versionNo - first.versionNo);
}

function getLatestPrompt(
  promptVersions: AgentPromptVersionDto[],
  agentId: string,
  status?: AgentPromptVersionDto["status"],
) {
  return sortPromptVersions(
    promptVersions.filter(
      (promptVersion) =>
        promptVersion.agentId === agentId && (!status || promptVersion.status === status),
    ),
  )[0];
}

function MiniButton({
  children,
  variant = "secondary",
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  variant?: keyof typeof adminButtonVariants;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(adminButtonClassName, adminButtonVariants[variant])}
    >
      {children}
    </button>
  );
}

function BindingCheckRow({
  title,
  description,
  status,
  checked,
  disabled = false,
  onCheckedChange,
}: {
  title: string;
  description?: string;
  status: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  const rowClassName = cn(
    "flex items-start gap-3 rounded-md px-3 py-3 transition-colors hover:bg-white/[0.03]",
    onCheckedChange && !disabled ? "cursor-pointer" : "",
    disabled ? "cursor-not-allowed opacity-55" : "",
  );
  const indicator = (
    <div
      className={cn(
        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
        checked ? "border-amber-500 bg-amber-500 text-white" : "border-white/20 text-transparent",
      )}
    >
      <Check className="size-3" aria-hidden="true" />
    </div>
  );
  const content = (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="break-words text-sm font-medium text-white/75">{title}</span>
        <AdminStatusBadge status={status} />
      </div>
      {description ? (
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/35">{description}</p>
      ) : null}
    </div>
  );

  if (onCheckedChange) {
    return (
      <label className={rowClassName}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className="sr-only"
        />
        {indicator}
        {content}
      </label>
    );
  }

  return (
    <div className={rowClassName}>
      {indicator}
      {content}
    </div>
  );
}

function getEnabledSkillIdSet(skills: AgentSkillDto[]) {
  return new Set(skills.filter((skill) => skill.status === "enabled").map((skill) => skill.id));
}

function getSaveableSkillIds(skillIds: string[], skills: AgentSkillDto[]) {
  const enabledSkillIds = getEnabledSkillIdSet(skills);
  return skillIds.filter((skillId) => enabledSkillIds.has(skillId));
}

function hasSkillBindingChanges(
  agentId: string,
  skills: AgentSkillDto[],
  initialBindings: AgentSkillBindingDto[],
  currentBindings: AgentSkillBindingDto[],
) {
  const initial = getSaveableSkillIds(getEnabledSkillIds(agentId, initialBindings), skills).sort();
  const current = getSaveableSkillIds(getEnabledSkillIds(agentId, currentBindings), skills).sort();

  if (initial.length !== current.length) {
    return true;
  }

  return initial.some((skillId, index) => skillId !== current[index]);
}

function getBoundSkills(
  agentId: string,
  skills: AgentSkillDto[],
  skillBindings: AgentSkillBindingDto[],
) {
  const boundSkillIds = new Set(
    skillBindings
      .filter((binding) => binding.agentId === agentId && binding.status === "enabled")
      .map((binding) => binding.skillId),
  );

  return skills.filter((skill) => boundSkillIds.has(skill.id));
}

function getBoundKnowledgeSets(
  agentId: string,
  knowledgeSets: KnowledgeSetDto[],
  knowledgeSetBindings: AgentKnowledgeSetBindingDto[],
) {
  const boundKnowledgeSetIds = new Set(
    knowledgeSetBindings
      .filter((binding) => binding.agentId === agentId && binding.status === "enabled")
      .map((binding) => binding.knowledgeSetId),
  );

  return knowledgeSets.filter((knowledgeSet) => boundKnowledgeSetIds.has(knowledgeSet.id));
}

function getEnabledSkillIds(agentId: string, skillBindings: AgentSkillBindingDto[]) {
  return skillBindings
    .filter((binding) => binding.agentId === agentId && binding.status === "enabled")
    .map((binding) => binding.skillId);
}

function getEnabledKnowledgeSetIds(
  agentId: string,
  knowledgeSetBindings: AgentKnowledgeSetBindingDto[],
) {
  return knowledgeSetBindings
    .filter((binding) => binding.agentId === agentId && binding.status === "enabled")
    .map((binding) => binding.knowledgeSetId);
}

function getSaveableKnowledgeSetIds(
  knowledgeSetIds: string[],
  knowledgeSets: KnowledgeSetDto[],
) {
  const enabledKnowledgeSetIds = new Set(
    knowledgeSets.filter((knowledgeSet) => knowledgeSet.status === "enabled").map((set) => set.id),
  );

  return knowledgeSetIds.filter((knowledgeSetId) => enabledKnowledgeSetIds.has(knowledgeSetId));
}

function hasKnowledgeSetBindingChanges(
  agentId: string,
  knowledgeSets: KnowledgeSetDto[],
  initialBindings: AgentKnowledgeSetBindingDto[],
  currentBindings: AgentKnowledgeSetBindingDto[],
) {
  const initial = getSaveableKnowledgeSetIds(
    getEnabledKnowledgeSetIds(agentId, initialBindings),
    knowledgeSets,
  ).sort();
  const current = getSaveableKnowledgeSetIds(
    getEnabledKnowledgeSetIds(agentId, currentBindings),
    knowledgeSets,
  ).sort();

  if (initial.length !== current.length) {
    return true;
  }

  return initial.some((knowledgeSetId, index) => knowledgeSetId !== current[index]);
}

type AgentBasicFormState = {
  displayName: string;
  roleDescription: string;
  description: string;
  serviceStatus: AgentServiceStatus;
};

type AgentActionKey = "create" | "copy" | "save" | "setOnline";
type PromptActionKey = "saveDraft" | "publish";

type SkillFormState = {
  name: string;
  description: string;
  whenToUse: string;
  body: string;
  status: AgentAssetStatus;
  dependenciesText: string;
};

type SkillActionKey = "create" | "save" | "toggle";

async function readAdminJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(data.error?.message ?? fallbackMessage);
  }

  return data;
}

function toAgentBasicForm(agent: AgentConfigDto): AgentBasicFormState {
  return {
    displayName: agent.displayName,
    roleDescription: agent.roleDescription ?? "",
    description: agent.description ?? "",
    serviceStatus: agent.serviceStatus,
  };
}

function toSkillForm(skill: AgentSkillDto): SkillFormState {
  return {
    name: skill.name,
    description: skill.description,
    whenToUse: skill.whenToUse,
    body: skill.body,
    status: skill.status,
    dependenciesText: skill.dependencies.join("\n"),
  };
}

function parseDependencies(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

type SkillDependencyWarningDto = {
  skillId: string;
  skillName: string;
  dependency: string;
  message: string;
};

function buildLocalSkillDependencyWarnings(input: {
  skills: AgentSkillDto[];
  agent: AgentConfigDto;
  boundKnowledgeSets: KnowledgeSetDto[];
}): SkillDependencyWarningDto[] {
  const knowledgeReady =
    input.agent.serviceFlags.knowledgeEnabled && input.boundKnowledgeSets.length > 0;

  return input.skills.flatMap((skill) =>
    skill.dependencies.flatMap((dependency) => {
      const normalized = dependency.trim().toLowerCase().replace(/[\s-]+/g, "_");
      const requiresKnowledge =
        normalized === "knowledge" ||
        normalized === "knowledge_retrieval" ||
        normalized === "retrieve_knowledge_base";

      if (!requiresKnowledge || knowledgeReady) {
        return [];
      }

      return [{
        skillId: skill.id,
        skillName: skill.name,
        dependency,
        message: `Skill「${skill.name}」依赖 Knowledge 检索，但当前 Agent 未启用 Knowledge 或未挂载可用知识集。`,
      }];
    }),
  );
}

export function AgentConfigAdminPage({
  foundationState,
  skillBindings,
  knowledgeSetBindings,
  promptVersions,
}: AgentConsolePagesProps) {
  const [agents, setAgents] = useState(foundationState.agents);
  const [routeBindings, setRouteBindings] = useState(foundationState.routeBindings);
  const [localPromptVersions, setLocalPromptVersions] = useState(promptVersions);
  const [localKnowledgeSetBindings, setLocalKnowledgeSetBindings] =
    useState(knowledgeSetBindings);
  const agentState = useMemo(
    () => ({
      ...foundationState,
      agents,
      routeBindings,
    }),
    [agents, foundationState, routeBindings],
  );
  const onlineAgentId = findOnlineAgentId(agentState);
  const [selectedAgentId, setSelectedAgentId] = useState(
    onlineAgentId ?? foundationState.agents[0]?.id ?? "",
  );
  const [promptTab, setPromptTab] = useState<"draft" | "active" | "history">("draft");
  const [localSkillBindings, setLocalSkillBindings] = useState(skillBindings);
  const [agentAction, setAgentAction] = useState<AgentActionKey | null>(null);
  const [agentActionError, setAgentActionError] = useState<string | null>(null);
  const [agentActionMessage, setAgentActionMessage] = useState<string | null>(null);
  const [promptAction, setPromptAction] = useState<PromptActionKey | null>(null);
  const [promptActionError, setPromptActionError] = useState<string | null>(null);
  const [promptActionMessage, setPromptActionMessage] = useState<string | null>(null);
  const [savingSkills, setSavingSkills] = useState(false);
  const [skillBindingError, setSkillBindingError] = useState<string | null>(null);
  const [skillBindingSaved, setSkillBindingSaved] = useState(false);
  const [savingKnowledgeSets, setSavingKnowledgeSets] = useState(false);
  const [knowledgeSetBindingError, setKnowledgeSetBindingError] = useState<string | null>(null);
  const [knowledgeSetBindingSaved, setKnowledgeSetBindingSaved] = useState(false);
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];
  const [agentFormState, setAgentFormState] = useState<{
    agentId: string;
    values: AgentBasicFormState;
  } | null>(
    selectedAgent
      ? { agentId: selectedAgent.id, values: toAgentBasicForm(selectedAgent) }
      : null,
  );
  const agentForm =
    selectedAgent && agentFormState?.agentId === selectedAgent.id
      ? agentFormState.values
      : selectedAgent
        ? toAgentBasicForm(selectedAgent)
        : null;

  const activePrompt = selectedAgent
    ? getLatestPrompt(localPromptVersions, selectedAgent.id, "active")
    : undefined;
  const draftPrompt = selectedAgent
    ? getLatestPrompt(localPromptVersions, selectedAgent.id, "draft")
    : undefined;
  const [promptDraftState, setPromptDraftState] = useState<{
    agentId: string;
    body: string;
    changeNote: string;
  } | null>(
    selectedAgent
      ? {
          agentId: selectedAgent.id,
          body: draftPrompt?.body ?? activePrompt?.body ?? "",
          changeNote: draftPrompt?.changeNote ?? "",
        }
      : null,
  );
  const promptDraft =
    selectedAgent && promptDraftState?.agentId === selectedAgent.id
      ? promptDraftState
      : selectedAgent
        ? {
            agentId: selectedAgent.id,
            body: draftPrompt?.body ?? activePrompt?.body ?? "",
            changeNote: draftPrompt?.changeNote ?? "",
          }
        : null;
  const selectedAgentPromptVersions = selectedAgent
    ? sortPromptVersions(localPromptVersions.filter((version) => version.agentId === selectedAgent.id))
    : [];
  const boundSkills = selectedAgent
    ? getBoundSkills(selectedAgent.id, agentState.skills, localSkillBindings)
    : [];
  const selectedSkillIds = selectedAgent
    ? getEnabledSkillIds(selectedAgent.id, localSkillBindings)
    : [];
  const selectedSaveableSkillIds = selectedAgent
    ? getSaveableSkillIds(selectedSkillIds, agentState.skills)
    : [];
  const skillBindingsDirty = selectedAgent
    ? hasSkillBindingChanges(
        selectedAgent.id,
        agentState.skills,
        skillBindings,
        localSkillBindings,
      )
    : false;
  const boundKnowledgeSets = selectedAgent
    ? getBoundKnowledgeSets(
        selectedAgent.id,
        agentState.knowledgeSets,
        localKnowledgeSetBindings,
      )
    : [];
  const skillDependencyWarnings = selectedAgent
    ? buildLocalSkillDependencyWarnings({
        skills: boundSkills,
        agent: selectedAgent,
        boundKnowledgeSets,
      })
    : [];
  const selectedKnowledgeSetIds = selectedAgent
    ? getEnabledKnowledgeSetIds(selectedAgent.id, localKnowledgeSetBindings)
    : [];
  const selectedSaveableKnowledgeSetIds = selectedAgent
    ? getSaveableKnowledgeSetIds(selectedKnowledgeSetIds, agentState.knowledgeSets)
    : [];
  const knowledgeSetBindingsDirty = selectedAgent
    ? hasKnowledgeSetBindingChanges(
        selectedAgent.id,
        agentState.knowledgeSets,
        knowledgeSetBindings,
        localKnowledgeSetBindings,
      )
    : false;
  const isOnline = selectedAgent?.id === onlineAgentId;
  const defaultBindingInvalid = Boolean(
    onlineAgentId && !agents.some((agent) => agent.id === onlineAgentId),
  );
  const agentBasicDirty =
    Boolean(selectedAgent && agentForm) &&
    (agentForm?.displayName !== selectedAgent?.displayName ||
      agentForm?.roleDescription !== (selectedAgent?.roleDescription ?? "") ||
      agentForm?.description !== (selectedAgent?.description ?? "") ||
      agentForm?.serviceStatus !== selectedAgent?.serviceStatus);
  const promptDraftDirty =
    Boolean(selectedAgent && promptDraft) &&
    (promptDraft?.body !== (draftPrompt?.body ?? activePrompt?.body ?? "") ||
      promptDraft?.changeNote !== (draftPrompt?.changeNote ?? ""));

  function mergeAgent(agent: AgentConfigDto) {
    setAgents((current) => {
      const exists = current.some((item) => item.id === agent.id);

      return exists
        ? current.map((item) => (item.id === agent.id ? agent : item))
        : [agent, ...current];
    });
  }

  function mergeRouteBinding(routeBinding: AgentRouteBindingDto) {
    setRouteBindings((current) => [
      routeBinding,
      ...current.filter((binding) => binding.routeKey !== routeBinding.routeKey),
    ]);
  }

  function mergePromptVersion(promptVersion: AgentPromptVersionDto) {
    setLocalPromptVersions((current) => {
      const withoutCurrent = current.filter((version) => version.id !== promptVersion.id);

      return [promptVersion, ...withoutCurrent];
    });
  }

  function setAgentFormField<K extends keyof AgentBasicFormState>(
    key: K,
    value: AgentBasicFormState[K],
  ) {
    if (!selectedAgent || !agentForm) {
      return;
    }

    setAgentFormState({
      agentId: selectedAgent.id,
      values: {
        ...agentForm,
        [key]: value,
      },
    });
    setAgentActionError(null);
    setAgentActionMessage(null);
  }

  function setPromptDraftField(key: "body" | "changeNote", value: string) {
    if (!selectedAgent || !promptDraft) {
      return;
    }

    setPromptDraftState({
      ...promptDraft,
      agentId: selectedAgent.id,
      [key]: value,
    });
    setPromptActionError(null);
    setPromptActionMessage(null);
  }

  async function persistPromptDraft() {
    if (!selectedAgent || !promptDraft) {
      return null;
    }

    const response = await fetch(`/api/platform-admin/agents/${selectedAgent.id}/prompt-draft`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body: promptDraft.body,
        changeNote: promptDraft.changeNote.trim() || null,
      }),
    });
    const data = await readAdminJson<{ promptVersion: AgentPromptVersionDto }>(
      response,
      "Prompt 草稿保存失败",
    );

    mergePromptVersion(data.promptVersion);
    setPromptDraftState({
      agentId: selectedAgent.id,
      body: data.promptVersion.body,
      changeNote: data.promptVersion.changeNote ?? "",
    });

    return data.promptVersion;
  }

  async function savePromptDraft() {
    setPromptAction("saveDraft");
    setPromptActionError(null);
    setPromptActionMessage(null);

    try {
      await persistPromptDraft();
      setPromptActionMessage("System Prompt 草稿已保存，当前 active 版本不受影响。");
    } catch (error) {
      setPromptActionError(error instanceof Error ? error.message : "Prompt 草稿保存失败");
    } finally {
      setPromptAction(null);
    }
  }

  async function publishPromptDraft() {
    if (!selectedAgent || !promptDraft) {
      return;
    }

    if (!promptDraft.body.trim()) {
      setPromptActionError("System Prompt 不能为空");
      return;
    }

    setPromptAction("publish");
    setPromptActionError(null);
    setPromptActionMessage(null);

    try {
      const promptToPublish = promptDraftDirty || !draftPrompt
        ? await persistPromptDraft()
        : draftPrompt;

      if (!promptToPublish) {
        throw new Error("Prompt 草稿不存在");
      }

      const response = await fetch(`/api/platform-admin/agents/${selectedAgent.id}/publish-prompt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ promptVersionId: promptToPublish.id }),
      });
      const data = await readAdminJson<{ promptVersion: AgentPromptVersionDto }>(
        response,
        "Prompt 发布失败",
      );
      const now = new Date().toISOString();

      setLocalPromptVersions((current) => [
        data.promptVersion,
        ...current
          .filter((version) => version.id !== data.promptVersion.id)
          .map((version) =>
            version.agentId === selectedAgent.id && version.status === "active"
              ? { ...version, status: "archived" as const, archivedAt: now }
              : version,
          ),
      ]);
      setPromptDraftState({
        agentId: selectedAgent.id,
        body: data.promptVersion.body,
        changeNote: data.promptVersion.changeNote ?? "",
      });
      setPromptTab("active");
      setPromptActionMessage("System Prompt 已发布，下一轮真实咨询会读取新的 active 版本。");
    } catch (error) {
      setPromptActionError(error instanceof Error ? error.message : "Prompt 发布失败");
    } finally {
      setPromptAction(null);
    }
  }

  async function rollbackPrompt(promptVersionId: string) {
    if (!selectedAgent) {
      return;
    }

    setPromptAction("publish");
    setPromptActionError(null);
    setPromptActionMessage(null);

    try {
      const response = await fetch(`/api/platform-admin/agents/${selectedAgent.id}/rollback-prompt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ promptVersionId }),
      });
      const data = await readAdminJson<{ promptVersion: AgentPromptVersionDto }>(
        response,
        "Prompt 回滚失败",
      );
      const now = new Date().toISOString();

      setLocalPromptVersions((current) => [
        data.promptVersion,
        ...current
          .filter((version) => version.id !== data.promptVersion.id)
          .map((version) =>
            version.agentId === selectedAgent.id && version.status === "active"
              ? { ...version, status: "archived" as const, archivedAt: now }
              : version,
          ),
      ]);
      setPromptDraftState({
        agentId: selectedAgent.id,
        body: data.promptVersion.body,
        changeNote: data.promptVersion.changeNote ?? "",
      });
      setPromptTab("active");
      setPromptActionMessage("System Prompt 已回滚为选中的历史版本。");
    } catch (error) {
      setPromptActionError(error instanceof Error ? error.message : "Prompt 回滚失败");
    } finally {
      setPromptAction(null);
    }
  }

  async function createAgent() {
    const displayName = window.prompt("输入新 Agent 名称，例如：成交异议 Agent");
    const trimmedName = displayName?.trim();

    if (!trimmedName) {
      return;
    }

    setAgentAction("create");
    setAgentActionError(null);
    setAgentActionMessage(null);

    try {
      const response = await fetch("/api/platform-admin/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: trimmedName,
          roleDescription: "本地生活商家咨询专家",
          description: "从后台新建的咨询 Agent。",
          serviceStatus: "draft",
          serviceFlags: {
            systemPromptEnabled: true,
            skillsEnabled: true,
            knowledgeEnabled: true,
          },
          modelConfig: {},
        }),
      });
      const data = await readAdminJson<{ agent: AgentConfigDto }>(
        response,
        "Agent 创建失败",
      );

      mergeAgent(data.agent);
      setSelectedAgentId(data.agent.id);
      setAgentFormState({ agentId: data.agent.id, values: toAgentBasicForm(data.agent) });
      setPromptTab("draft");
      setAgentActionMessage("Agent 已创建。保存为已启用后，会出现在商家端 @ 专家列表。");
    } catch (error) {
      setAgentActionError(error instanceof Error ? error.message : "Agent 创建失败");
    } finally {
      setAgentAction(null);
    }
  }

  async function copyAgent() {
    if (!selectedAgent) {
      return;
    }

    const displayName = window.prompt("输入复制后的 Agent 名称", `${selectedAgent.displayName} 副本`);
    const trimmedName = displayName?.trim();

    if (!trimmedName) {
      return;
    }

    setAgentAction("copy");
    setAgentActionError(null);
    setAgentActionMessage(null);

    try {
      const response = await fetch(`/api/platform-admin/agents/${selectedAgent.id}/copy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ displayName: trimmedName }),
      });
      const data = await readAdminJson<{
        detail: {
          agent: AgentConfigDto;
          promptVersions: AgentPromptVersionDto[];
          skillBindings: AgentSkillBindingDto[];
          knowledgeSetBindings: AgentKnowledgeSetBindingDto[];
        };
      }>(response, "Agent 复制失败");

      mergeAgent(data.detail.agent);
      setLocalPromptVersions((current) => [...data.detail.promptVersions, ...current]);
      setLocalSkillBindings((current) => [...data.detail.skillBindings, ...current]);
      setLocalKnowledgeSetBindings((current) => [
        ...data.detail.knowledgeSetBindings,
        ...current,
      ]);
      setSelectedAgentId(data.detail.agent.id);
      setAgentFormState({
        agentId: data.detail.agent.id,
        values: toAgentBasicForm(data.detail.agent),
      });
      setPromptTab("draft");
      setAgentActionMessage("Agent 已复制为草稿。保存为已启用后，会出现在商家端 @ 专家列表。");
    } catch (error) {
      setAgentActionError(error instanceof Error ? error.message : "Agent 复制失败");
    } finally {
      setAgentAction(null);
    }
  }

  async function saveAgentConfig() {
    if (!selectedAgent || !agentForm) {
      return null;
    }

    const payload = {
      displayName: agentForm.displayName.trim(),
      roleDescription: agentForm.roleDescription.trim() || null,
      description: agentForm.description.trim() || null,
      serviceStatus: agentForm.serviceStatus,
    };

    setAgentAction("save");
    setAgentActionError(null);
    setAgentActionMessage(null);

    try {
      const response = await fetch(`/api/platform-admin/agents/${selectedAgent.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await readAdminJson<{ agent: AgentConfigDto }>(
        response,
        "Agent 保存失败",
      );

      mergeAgent(data.agent);
      setAgentFormState({ agentId: data.agent.id, values: toAgentBasicForm(data.agent) });
      setAgentActionMessage(
        data.agent.serviceStatus === "enabled"
          ? "Agent 已保存为已启用，会出现在商家端 @ 专家列表。"
          : "Agent 已保存。",
      );
      return data.agent;
    } catch (error) {
      setAgentActionError(error instanceof Error ? error.message : "Agent 保存失败");
      return null;
    } finally {
      setAgentAction(null);
    }
  }

  async function setAgentOnline() {
    if (!selectedAgent) {
      return;
    }

    setAgentAction("setOnline");
    setAgentActionError(null);
    setAgentActionMessage(null);

    try {
      let targetAgent = selectedAgent;

      if (selectedAgent.serviceStatus !== "enabled" || agentBasicDirty) {
        const response = await fetch(`/api/platform-admin/agents/${selectedAgent.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            displayName: agentForm?.displayName.trim() || selectedAgent.displayName,
            roleDescription:
              agentForm?.roleDescription.trim() || selectedAgent.roleDescription || null,
            description: agentForm?.description.trim() || selectedAgent.description || null,
            serviceStatus: "enabled",
          }),
        });
        const data = await readAdminJson<{ agent: AgentConfigDto }>(
          response,
          "Agent 启用失败",
        );

        targetAgent = data.agent;
        mergeAgent(data.agent);
        setAgentFormState({ agentId: data.agent.id, values: toAgentBasicForm(data.agent) });
      }

      const response = await fetch(`/api/platform-admin/agents/${targetAgent.id}/set-online`, {
        method: "POST",
      });
      const data = await readAdminJson<{ routeBinding: AgentRouteBindingDto }>(
        response,
        "Agent 设为线上失败",
      );

      mergeRouteBinding(data.routeBinding);
      setSelectedAgentId(targetAgent.id);
      setAgentActionMessage("Agent 已设为线上默认咨询入口，并会出现在商家端 @ 专家列表。");
    } catch (error) {
      setAgentActionError(error instanceof Error ? error.message : "Agent 设为线上失败");
    } finally {
      setAgentAction(null);
    }
  }

  function toggleSkill(skillId: string, checked: boolean) {
    if (!selectedAgent) {
      return;
    }

    setSkillBindingError(null);
    setSkillBindingSaved(false);
    setLocalSkillBindings((current) => {
      const existing = current.find(
        (binding) => binding.agentId === selectedAgent.id && binding.skillId === skillId,
      );

      if (existing) {
        return current.map((binding) =>
          binding.id === existing.id
            ? { ...binding, status: checked ? "enabled" : "disabled" }
            : binding,
        );
      }

      return [
        ...current,
        {
          id: `local-${selectedAgent.id}-${skillId}`,
          agentId: selectedAgent.id,
          skillId,
          status: checked ? "enabled" : "disabled",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    });
  }

  async function saveSkillBindings() {
    if (!selectedAgent) {
      return;
    }

    setSavingSkills(true);
    setSkillBindingError(null);
    setSkillBindingSaved(false);

    try {
      const response = await fetch(`/api/platform-admin/agents/${selectedAgent.id}/skills`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ skillIds: selectedSaveableSkillIds }),
      });
      const data = (await response.json()) as {
        skillBindings?: AgentSkillBindingDto[];
        error?: { message?: string };
      };

      const nextSkillBindings = data.skillBindings;

      if (!response.ok || !nextSkillBindings) {
        throw new Error(data.error?.message ?? "Skill 挂载保存失败");
      }

      setLocalSkillBindings((current) => [
        ...current.filter((binding) => binding.agentId !== selectedAgent.id),
        ...nextSkillBindings,
      ]);
      setSkillBindingSaved(true);
    } catch (error) {
      setSkillBindingError(error instanceof Error ? error.message : "Skill 挂载保存失败");
    } finally {
      setSavingSkills(false);
    }
  }

  function toggleKnowledgeSet(knowledgeSetId: string, checked: boolean) {
    if (!selectedAgent) {
      return;
    }

    setKnowledgeSetBindingError(null);
    setKnowledgeSetBindingSaved(false);
    setLocalKnowledgeSetBindings((current) => {
      const existing = current.find(
        (binding) =>
          binding.agentId === selectedAgent.id &&
          binding.knowledgeSetId === knowledgeSetId,
      );

      if (existing) {
        return current.map((binding) =>
          binding.id === existing.id
            ? { ...binding, status: checked ? "enabled" : "disabled" }
            : binding,
        );
      }

      return [
        ...current,
        {
          id: `local-${selectedAgent.id}-${knowledgeSetId}`,
          agentId: selectedAgent.id,
          knowledgeSetId,
          status: checked ? "enabled" : "disabled",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    });
  }

  async function saveKnowledgeSetBindings() {
    if (!selectedAgent) {
      return;
    }

    setSavingKnowledgeSets(true);
    setKnowledgeSetBindingError(null);
    setKnowledgeSetBindingSaved(false);

    try {
      const response = await fetch(`/api/platform-admin/agents/${selectedAgent.id}/knowledge-sets`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ knowledgeSetIds: selectedSaveableKnowledgeSetIds }),
      });
      const data = await readAdminJson<{
        knowledgeSetBindings: AgentKnowledgeSetBindingDto[];
      }>(response, "Knowledge Set 挂载保存失败");

      setLocalKnowledgeSetBindings((current) => [
        ...current.filter((binding) => binding.agentId !== selectedAgent.id),
        ...data.knowledgeSetBindings,
      ]);
      setKnowledgeSetBindingSaved(true);
    } catch (error) {
      setKnowledgeSetBindingError(
        error instanceof Error ? error.message : "Knowledge Set 挂载保存失败",
      );
    } finally {
      setSavingKnowledgeSets(false);
    }
  }

  if (!selectedAgent) {
    return (
      <div className="grid gap-6">
        <AdminPageHeader
          title="Agent 配置"
          description="foundation 还没有返回任何 Agent。"
          action={
            <MiniButton
              variant="primary"
              onClick={() => void createAgent()}
              disabled={agentAction !== null}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              新建 Agent
            </MiniButton>
          }
        />
        <AdminEmptyState
          icon={Bot}
          title="暂无 Agent"
          description="foundation 分支需要先初始化初始咨询 Agent 和线上 route binding。"
        />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:-mx-8 lg:-my-6 lg:min-h-[calc(100vh-1px)] lg:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="rounded-lg border border-white/10 bg-[#080808] lg:rounded-none lg:border-y-0 lg:border-l-0">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-4">
          <div className="text-[10px] font-medium uppercase tracking-widest text-white/40">
            Agent 列表
          </div>
          <button
            type="button"
            onClick={() => void createAgent()}
            disabled={agentAction !== null}
            className="inline-flex size-8 items-center justify-center rounded-md border border-amber-500/25 bg-amber-500/10 text-amber-300 transition-colors hover:bg-amber-500/15 disabled:pointer-events-none disabled:opacity-40"
            title="新建 Agent"
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="grid gap-1 p-2">
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => setSelectedAgentId(agent.id)}
              className={cn(
                "min-w-0 rounded-md border px-3 py-3 text-left transition-colors",
                selectedAgent.id === agent.id
                  ? "border-amber-500/25 bg-amber-500/10"
                  : "border-transparent hover:bg-white/[0.05]",
              )}
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-white/80">
                  {agent.displayName}
                </span>
                {agent.id === onlineAgentId ? <AdminStatusBadge status="online" /> : null}
              </div>
              <div className="mt-2">
                <AdminStatusBadge status={agent.serviceStatus} />
              </div>
            </button>
          ))}
        </div>
      </aside>

      <div className="grid content-start gap-5 lg:p-6">
        <AdminPageHeader
          eyebrow="Agent 配置"
          title={selectedAgent.displayName}
          description="以 Agent 容器组织 System Prompt、Skill 与 Knowledge Set。Skill 挂载会进入商家端咨询运行时，并按触发条件渐进式披露。"
          action={
            <div className="flex flex-wrap gap-2">
              <MiniButton
                onClick={() => void copyAgent()}
                disabled={agentAction !== null}
              >
                {agentAction === "copy" ? (
                  <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Copy className="size-3.5" aria-hidden="true" />
                )}
                复制 Agent
              </MiniButton>
              <MiniButton
                onClick={() => void setAgentOnline()}
                disabled={agentAction !== null || isOnline}
              >
                {agentAction === "setOnline" ? (
                  <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Lock className="size-3.5" aria-hidden="true" />
                )}
                设为线上
              </MiniButton>
              <MiniButton
                variant="primary"
                onClick={() => void saveAgentConfig()}
                disabled={agentAction !== null || !agentBasicDirty}
              >
                {agentAction === "save" ? (
                  <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="size-3.5" aria-hidden="true" />
                )}
                保存
              </MiniButton>
            </div>
          }
        />

        {agentActionError ? (
          <AdminNotice tone="danger">{agentActionError}</AdminNotice>
        ) : null}

        {agentActionMessage ? (
          <AdminNotice tone="success">{agentActionMessage}</AdminNotice>
        ) : null}

        <AdminNotice tone="warning">
          已启用 Agent 会出现在商家端咨询页的 @ 专家列表；设为线上会成为默认咨询入口。
        </AdminNotice>

        {defaultBindingInvalid ? (
          <AdminNotice tone="danger">
            默认 Agent 未正确配置：当前 consultation_default 指向的 Agent 不存在。请先选择一个已启用 Agent 并设为线上。
          </AdminNotice>
        ) : null}

        {selectedAgent.serviceStatus === "disabled" && isOnline ? (
          <AdminNotice tone="danger">
            当前 Agent 已禁用，但仍被线上咨询入口引用。商家端应展示「服务维护中」。
          </AdminNotice>
        ) : null}

        {!isOnline && selectedAgent.serviceStatus === "draft" ? (
          <AdminNotice tone="warning">草稿 Agent 可先编辑调试；点击「设为线上」会自动启用并设为默认咨询入口。</AdminNotice>
        ) : null}

        <AdminPanel>
          <AdminPanelHeader eyebrow="基础信息" />
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <AdminField label="Agent ID">
              <input readOnly value={selectedAgent.id} className={adminInputClassName} />
            </AdminField>
            <AdminField label="状态">
              <select
                value={agentForm?.serviceStatus ?? selectedAgent.serviceStatus}
                onChange={(event) =>
                  setAgentFormField("serviceStatus", event.target.value as AgentServiceStatus)
                }
                disabled={agentAction !== null}
                className={adminSelectClassName}
              >
                <option value="draft">草稿</option>
                <option value="enabled">已启用</option>
                <option value="disabled">已禁用</option>
              </select>
            </AdminField>
            <AdminField label="名称">
              <input
                value={agentForm?.displayName ?? selectedAgent.displayName}
                onChange={(event) => setAgentFormField("displayName", event.target.value)}
                disabled={agentAction !== null}
                className={adminInputClassName}
              />
            </AdminField>
            <AdminField label="Agent Key">
              <input readOnly value={selectedAgent.agentKey} className={adminInputClassName} />
            </AdminField>
            <div className="md:col-span-2">
              <AdminField label="角色描述">
                <input
                  value={agentForm?.roleDescription ?? ""}
                  onChange={(event) => setAgentFormField("roleDescription", event.target.value)}
                  placeholder="暂无角色描述"
                  disabled={agentAction !== null}
                  className={adminInputClassName}
                />
              </AdminField>
            </div>
            <div className="md:col-span-2">
              <AdminField label="后台描述">
                <textarea
                  rows={3}
                  value={agentForm?.description ?? ""}
                  onChange={(event) => setAgentFormField("description", event.target.value)}
                  placeholder="用于后台辨识这个 Agent 的职责边界"
                  disabled={agentAction !== null}
                  className={adminTextareaClassName}
                />
              </AdminField>
            </div>
          </div>
        </AdminPanel>

        <AdminPanel>
          <AdminPanelHeader
            eyebrow="System Prompt"
            action={
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-2">
                  {(["draft", "active", "history"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setPromptTab(tab)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                        promptTab === tab
                          ? "border border-amber-500/25 bg-amber-500/10 text-amber-300"
                          : "text-white/45 hover:bg-white/[0.05] hover:text-white/80",
                      )}
                    >
                      {tab === "draft" ? "草稿" : tab === "active" ? "生效版本" : "历史版本"}
                    </button>
                  ))}
                </div>
                <MiniButton
                  onClick={() => void savePromptDraft()}
                  disabled={promptAction !== null || !promptDraftDirty}
                >
                  {promptAction === "saveDraft" ? (
                    <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="size-3.5" aria-hidden="true" />
                  )}
                  保存草稿
                </MiniButton>
                <MiniButton
                  variant="primary"
                  onClick={() => void publishPromptDraft()}
                  disabled={promptAction !== null || !promptDraft?.body.trim()}
                >
                  {promptAction === "publish" ? (
                    <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="size-3.5" aria-hidden="true" />
                  )}
                  发布
                </MiniButton>
              </div>
            }
          />
          <div className="grid gap-4 p-5">
            {promptActionError ? (
              <AdminNotice tone="danger">{promptActionError}</AdminNotice>
            ) : null}
            {promptActionMessage ? (
              <AdminNotice tone="success">{promptActionMessage}</AdminNotice>
            ) : null}
            <div className="flex flex-wrap gap-4 text-xs text-white/40">
              <span>
                当前生效:{" "}
                <span className="text-white/65">
                  {activePrompt ? `v${activePrompt.versionNo}` : "未发布"}
                </span>
              </span>
              <span>
                最近草稿:{" "}
                <span className="text-amber-300">
                  {draftPrompt ? `v${draftPrompt.versionNo}` : "暂无草稿"}
                </span>
              </span>
            </div>

            {promptTab === "draft" ? (
              <div className="grid gap-3">
                <textarea
                  rows={10}
                  value={promptDraft?.body ?? ""}
                  onChange={(event) => setPromptDraftField("body", event.target.value)}
                  placeholder="输入 System Prompt 草稿。保存草稿不会影响 active 版本。"
                  disabled={promptAction !== null}
                  className={cn(adminTextareaClassName, "font-mono text-xs")}
                />
                <AdminField label="变更说明">
                  <input
                    value={promptDraft?.changeNote ?? ""}
                    onChange={(event) => setPromptDraftField("changeNote", event.target.value)}
                    placeholder="例如：补充成交异议处理边界"
                    disabled={promptAction !== null}
                    className={adminInputClassName}
                  />
                </AdminField>
              </div>
            ) : null}

            {promptTab === "active" ? (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-[#050505] p-4 text-xs leading-6 text-white/60">
                {activePrompt?.body ?? "暂无生效版本。"}
              </pre>
            ) : null}

            {promptTab === "history" ? (
              <div className="grid gap-2">
                {selectedAgentPromptVersions.length > 0 ? (
                  selectedAgentPromptVersions.map((version) => (
                    <div
                      key={version.id}
                      className="grid gap-2 rounded-md border border-white/[0.06] px-4 py-3 md:grid-cols-[7rem_1fr_auto_auto]"
                    >
                      <span className="font-mono text-xs text-white/45">
                        v{version.versionNo}
                      </span>
                      <span className="min-w-0 truncate text-xs text-white/40">
                        {version.changeNote ?? "无变更说明"}
                      </span>
                      <AdminStatusBadge status={version.status} />
                      <button
                        type="button"
                        disabled={version.status !== "archived" || promptAction !== null}
                        onClick={() => void rollbackPrompt(version.id)}
                        className={cn(
                          adminButtonClassName,
                          adminButtonVariants.secondary,
                          "min-h-7 px-2 py-1",
                        )}
                      >
                        回滚
                      </button>
                    </div>
                  ))
                ) : (
                  <AdminEmptyState title="暂无 Prompt 版本" />
                )}
              </div>
            ) : null}
          </div>
        </AdminPanel>

        <div className="grid gap-5 xl:grid-cols-2">
          <AdminPanel>
            <AdminPanelHeader
              eyebrow="挂载技能"
              description="只把 Skill 摘要送入候选列表；命中触发条件后，咨询运行时才加载 Skill Body。"
              action={
                <button
                  type="button"
                  onClick={() => void saveSkillBindings()}
                  disabled={savingSkills || !skillBindingsDirty}
                  className={cn(adminButtonClassName, adminButtonVariants.primary)}
                >
                  {savingSkills ? (
                    <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="size-3.5" aria-hidden="true" />
                  )}
                  保存挂载
                </button>
              }
            />
            <div className="p-2">
              {skillBindingError ? (
                <AdminNotice tone="danger" className="m-3">
                  {skillBindingError}
                </AdminNotice>
              ) : null}
              {skillBindingSaved ? (
                <AdminNotice tone="success" className="m-3">
                  Skill 挂载已保存，商家端咨询 Agent 下一轮运行会读取最新候选集。
                </AdminNotice>
              ) : null}
              {skillDependencyWarnings.length > 0 ? (
                <AdminNotice tone="warning" className="m-3">
                  {skillDependencyWarnings.map((warning) => warning.message).join("；")}
                </AdminNotice>
              ) : null}
              {agentState.skills.length > 0 ? (
                agentState.skills.map((skill) => (
                  <BindingCheckRow
                    key={skill.id}
                    title={skill.name}
                    description={skill.whenToUse}
                    status={skill.status}
                    checked={boundSkills.some((boundSkill) => boundSkill.id === skill.id)}
                    disabled={skill.status !== "enabled" || savingSkills}
                    onCheckedChange={(checked) => toggleSkill(skill.id, checked)}
                  />
                ))
              ) : (
                <AdminEmptyState
                  icon={Zap}
                  title="暂无技能"
                  description="Skill API 分支接入后，这里会展示可挂载的可控 prompt 片段。"
                />
              )}
            </div>
          </AdminPanel>

          <AdminPanel>
            <AdminPanelHeader
              eyebrow="挂载知识集"
              action={
                <button
                  type="button"
                  onClick={() => void saveKnowledgeSetBindings()}
                  disabled={savingKnowledgeSets || !knowledgeSetBindingsDirty}
                  className={cn(adminButtonClassName, adminButtonVariants.primary)}
                >
                  {savingKnowledgeSets ? (
                    <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="size-3.5" aria-hidden="true" />
                  )}
                  保存挂载
                </button>
              }
            />
            <div className="p-2">
              {knowledgeSetBindingError ? (
                <AdminNotice tone="danger" className="m-3">
                  {knowledgeSetBindingError}
                </AdminNotice>
              ) : null}
              {knowledgeSetBindingSaved ? (
                <AdminNotice tone="success" className="m-3">
                  Knowledge Set 挂载已保存，商家端咨询下一轮检索会读取最新范围。
                </AdminNotice>
              ) : null}
              {boundKnowledgeSets.length === 0 ? (
                <AdminNotice tone="warning" className="m-3">
                  未挂载任何知识集，Knowledge 服务不会检索平台知识。
                </AdminNotice>
              ) : null}
              {agentState.knowledgeSets.length > 0 ? (
                agentState.knowledgeSets.map((knowledgeSet) => (
                  <BindingCheckRow
                    key={knowledgeSet.id}
                    title={knowledgeSet.name}
                    description={knowledgeSet.description ?? knowledgeSet.scope}
                    status={knowledgeSet.status}
                    checked={boundKnowledgeSets.some((set) => set.id === knowledgeSet.id)}
                    disabled={knowledgeSet.status !== "enabled" || savingKnowledgeSets}
                    onCheckedChange={(checked) => toggleKnowledgeSet(knowledgeSet.id, checked)}
                  />
                ))
              ) : (
                <AdminEmptyState
                  icon={Database}
                  title="暂无知识集"
                  description="foundation 需要先初始化基础平台知识集。"
                />
              )}
            </div>
          </AdminPanel>
        </div>
      </div>
    </div>
  );
}

export function SkillManagementAdminPage({
  foundationState,
  skillBindings,
}: Pick<AgentConsolePagesProps, "foundationState" | "skillBindings">) {
  const [skills, setSkills] = useState(foundationState.skills);
  const skillState = useMemo(
    () => ({
      ...foundationState,
      skills,
    }),
    [foundationState, skills],
  );
  const [selectedSkillId, setSelectedSkillId] = useState(skills[0]?.id ?? "");
  const [skillAction, setSkillAction] = useState<SkillActionKey | null>(null);
  const [skillActionError, setSkillActionError] = useState<string | null>(null);
  const [skillActionMessage, setSkillActionMessage] = useState<string | null>(null);
  const selectedSkill =
    skills.find((skill) => skill.id === selectedSkillId) ??
    skills[0];
  const [skillFormState, setSkillFormState] = useState<{
    skillId: string;
    values: SkillFormState;
  } | null>(
    selectedSkill ? { skillId: selectedSkill.id, values: toSkillForm(selectedSkill) } : null,
  );
  const skillForm =
    selectedSkill && skillFormState?.skillId === selectedSkill.id
      ? skillFormState.values
      : selectedSkill
        ? toSkillForm(selectedSkill)
        : null;
  const skillFormDirty =
    Boolean(selectedSkill && skillForm) &&
    (skillForm?.name !== selectedSkill?.name ||
      skillForm?.description !== selectedSkill?.description ||
      skillForm?.whenToUse !== selectedSkill?.whenToUse ||
      skillForm?.body !== selectedSkill?.body ||
      skillForm?.status !== selectedSkill?.status ||
      skillForm?.dependenciesText !== selectedSkill?.dependencies.join("\n"));

  const mountedAgentNames = useMemo(() => {
    if (!selectedSkill) {
      return [];
    }

    const mountedAgentIds = new Set(
      skillBindings
        .filter((binding) => binding.skillId === selectedSkill.id && binding.status === "enabled")
        .map((binding) => binding.agentId),
    );

    return skillState.agents
      .filter((agent) => mountedAgentIds.has(agent.id))
      .map((agent) => agent.displayName);
  }, [skillState.agents, selectedSkill, skillBindings]);

  function mergeSkill(skill: AgentSkillDto) {
    setSkills((current) => {
      const exists = current.some((item) => item.id === skill.id);

      return exists
        ? current.map((item) => (item.id === skill.id ? skill : item))
        : [skill, ...current];
    });
  }

  function setSkillFormField<K extends keyof SkillFormState>(
    key: K,
    value: SkillFormState[K],
  ) {
    if (!selectedSkill || !skillForm) {
      return;
    }

    setSkillFormState({
      skillId: selectedSkill.id,
      values: {
        ...skillForm,
        [key]: value,
      },
    });
    setSkillActionError(null);
    setSkillActionMessage(null);
  }

  async function createSkill() {
    const name = window.prompt("输入新 Skill 名称，例如：门店定位方法");
    const trimmedName = name?.trim();

    if (!trimmedName) {
      return;
    }

    setSkillAction("create");
    setSkillActionError(null);
    setSkillActionMessage(null);

    try {
      const response = await fetch("/api/platform-admin/skills", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          description: "",
          whenToUse: "",
          body: "",
          status: "draft",
          dependencies: [],
        }),
      });
      const data = await readAdminJson<{ skill: AgentSkillDto }>(
        response,
        "Skill 创建失败",
      );

      mergeSkill(data.skill);
      setSelectedSkillId(data.skill.id);
      setSkillFormState({ skillId: data.skill.id, values: toSkillForm(data.skill) });
      setSkillActionMessage("Skill 已创建为草稿。启用后才能挂载到 Agent。");
    } catch (error) {
      setSkillActionError(error instanceof Error ? error.message : "Skill 创建失败");
    } finally {
      setSkillAction(null);
    }
  }

  async function saveSkill() {
    if (!selectedSkill || !skillForm) {
      return;
    }

    const payload = {
      name: skillForm.name.trim(),
      description: skillForm.description.trim(),
      whenToUse: skillForm.whenToUse.trim(),
      body: skillForm.body,
      status: skillForm.status,
      dependencies: parseDependencies(skillForm.dependenciesText),
    };

    if (!payload.name) {
      setSkillActionError("Skill 名称不能为空。");
      return;
    }

    setSkillAction("save");
    setSkillActionError(null);
    setSkillActionMessage(null);

    try {
      const response = await fetch(`/api/platform-admin/skills/${selectedSkill.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await readAdminJson<{ skill: AgentSkillDto }>(
        response,
        "Skill 保存失败",
      );

      mergeSkill(data.skill);
      setSkillFormState({ skillId: data.skill.id, values: toSkillForm(data.skill) });
      setSkillActionMessage(
        data.skill.status === "enabled"
          ? "Skill 已保存并启用，可在 Agent 配置中挂载。"
          : "Skill 已保存。",
      );
    } catch (error) {
      setSkillActionError(error instanceof Error ? error.message : "Skill 保存失败");
    } finally {
      setSkillAction(null);
    }
  }

  async function toggleSkillStatus() {
    if (!selectedSkill) {
      return;
    }

    const nextStatus: AgentAssetStatus =
      selectedSkill.status === "enabled" ? "disabled" : "enabled";

    setSkillAction("toggle");
    setSkillActionError(null);
    setSkillActionMessage(null);

    try {
      const response = await fetch(`/api/platform-admin/skills/${selectedSkill.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await readAdminJson<{ skill: AgentSkillDto }>(
        response,
        "Skill 状态更新失败",
      );

      mergeSkill(data.skill);
      setSkillFormState({ skillId: data.skill.id, values: toSkillForm(data.skill) });
      setSkillActionMessage(
        nextStatus === "enabled"
          ? "Skill 已启用，可在 Agent 配置中挂载。"
          : "Skill 已禁用，并会从已启用挂载中移除。",
      );
    } catch (error) {
      setSkillActionError(error instanceof Error ? error.message : "Skill 状态更新失败");
    } finally {
      setSkillAction(null);
    }
  }

  if (!selectedSkill) {
    return (
      <div className="grid gap-6">
        <AdminPageHeader
          title="技能管理"
          description="Skill 是可控 prompt 片段，不开放底层 tool 权限。新建后先保存为草稿，启用后才能挂载到 Agent。"
          action={
            <MiniButton
              variant="primary"
              onClick={() => void createSkill()}
              disabled={skillAction !== null}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              新建 Skill
            </MiniButton>
          }
        />
        {skillActionError ? <AdminNotice tone="danger">{skillActionError}</AdminNotice> : null}
        <AdminEmptyState
          icon={Zap}
          title="暂无技能"
          description="创建一个门店定位、成交异议或平台口吻策略 Skill，作为 Agent 的候选能力片段。"
        />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:-mx-8 lg:-my-6 lg:min-h-[calc(100vh-1px)] lg:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="rounded-lg border border-white/10 bg-[#080808] lg:rounded-none lg:border-y-0 lg:border-l-0">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-4">
          <div className="text-[10px] font-medium uppercase tracking-widest text-white/40">
            技能列表
          </div>
          <MiniButton
            onClick={() => void createSkill()}
            disabled={skillAction !== null}
          >
            <Plus className="size-3.5" aria-hidden="true" />
          </MiniButton>
        </div>
        <div className="grid gap-1 p-2">
          {skills.map((skill) => (
            <button
              key={skill.id}
              type="button"
              onClick={() => {
                setSelectedSkillId(skill.id);
                setSkillFormState({ skillId: skill.id, values: toSkillForm(skill) });
                setSkillActionError(null);
                setSkillActionMessage(null);
              }}
              className={cn(
                "min-w-0 rounded-md border px-3 py-3 text-left transition-colors",
                selectedSkill.id === skill.id
                  ? "border-amber-500/25 bg-amber-500/10"
                  : "border-transparent hover:bg-white/[0.05]",
              )}
            >
              <div className="truncate text-sm font-medium text-white/80">{skill.name}</div>
              <div className="mt-2">
                <AdminStatusBadge status={skill.status} />
              </div>
            </button>
          ))}
        </div>
      </aside>

      <div className="grid content-start gap-5 lg:p-6">
        <AdminPageHeader
          eyebrow="技能管理"
          title={selectedSkill.name}
          description="管理单体 Skill 的能力描述、触发条件和 prompt 正文。启用后的 Skill 才能作为 Agent 候选能力挂载。"
          action={
            <div className="flex flex-wrap gap-2">
              <MiniButton
                variant={selectedSkill.status === "enabled" ? "danger" : "primary"}
                onClick={() => void toggleSkillStatus()}
                disabled={skillAction !== null}
              >
                {skillAction === "toggle" ? (
                  <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                {selectedSkill.status === "enabled" ? "禁用" : "启用"}
              </MiniButton>
              <MiniButton
                variant="primary"
                onClick={() => void saveSkill()}
                disabled={skillAction !== null || !skillFormDirty}
              >
                {skillAction === "save" ? (
                  <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="size-3.5" aria-hidden="true" />
                )}
                保存
              </MiniButton>
            </div>
          }
        />

        {skillActionError ? <AdminNotice tone="danger">{skillActionError}</AdminNotice> : null}
        {skillActionMessage ? <AdminNotice tone="success">{skillActionMessage}</AdminNotice> : null}

        <AdminPanel>
          <AdminPanelHeader eyebrow="基础信息" />
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <AdminField label="名称">
              <input
                value={skillForm?.name ?? selectedSkill.name}
                onChange={(event) => setSkillFormField("name", event.target.value)}
                disabled={skillAction !== null}
                className={adminInputClassName}
              />
            </AdminField>
            <AdminField label="状态">
              <select
                value={skillForm?.status ?? selectedSkill.status}
                onChange={(event) =>
                  setSkillFormField("status", event.target.value as AgentAssetStatus)
                }
                disabled={skillAction !== null}
                className={adminSelectClassName}
              >
                <option value="draft">草稿</option>
                <option value="enabled">已启用</option>
                <option value="disabled">已禁用</option>
              </select>
            </AdminField>
            <div className="md:col-span-2">
              <AdminField label="Description（能力描述）">
                <textarea
                  rows={2}
                  value={skillForm?.description ?? selectedSkill.description}
                  onChange={(event) => setSkillFormField("description", event.target.value)}
                  disabled={skillAction !== null}
                  className={adminTextareaClassName}
                />
              </AdminField>
            </div>
            <div className="md:col-span-2">
              <AdminField label="When to Use（触发条件）">
                <textarea
                  rows={2}
                  value={skillForm?.whenToUse ?? selectedSkill.whenToUse}
                  onChange={(event) => setSkillFormField("whenToUse", event.target.value)}
                  disabled={skillAction !== null}
                  className={adminTextareaClassName}
                />
              </AdminField>
            </div>
            <div className="md:col-span-2">
              <AdminField label="依赖项" hint="一行一个，例如 knowledge_retrieval。">
                <textarea
                  rows={2}
                  value={skillForm?.dependenciesText ?? ""}
                  onChange={(event) => setSkillFormField("dependenciesText", event.target.value)}
                  disabled={skillAction !== null}
                  className={cn(adminTextareaClassName, "font-mono text-xs")}
                />
              </AdminField>
            </div>
          </div>
        </AdminPanel>

        <AdminPanel>
          <AdminPanelHeader eyebrow="Skill Body（Prompt 正文）" />
          <div className="p-5">
            <textarea
              rows={12}
              value={skillForm?.body ?? selectedSkill.body}
              onChange={(event) => setSkillFormField("body", event.target.value)}
              disabled={skillAction !== null}
              className={cn(adminTextareaClassName, "font-mono text-xs")}
            />
          </div>
        </AdminPanel>

        <AdminPanel>
          <AdminPanelHeader eyebrow="已挂载 Agent" />
          <div className="flex flex-wrap gap-2 p-5">
            {mountedAgentNames.length > 0 ? (
              mountedAgentNames.map((agentName) => (
                <span
                  key={agentName}
                  className="rounded-md border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs text-white/60"
                >
                  {agentName}
                </span>
              ))
            ) : (
              <span className="text-sm text-white/35">暂无 Agent 挂载该 Skill。</span>
            )}
          </div>
        </AdminPanel>
      </div>
    </div>
  );
}

export function AgentDebugAdminPage({
  foundationState,
  skillBindings,
  knowledgeSetBindings,
  promptVersions,
  merchants,
}: AgentConsolePagesProps & {
  merchants: PlatformAdminMerchantDto[];
}) {
  const onlineAgentId = findOnlineAgentId(foundationState);
  const [selectedAgentId, setSelectedAgentId] = useState(
    onlineAgentId ?? foundationState.agents[0]?.id ?? "",
  );
  const [selectedMerchantId, setSelectedMerchantId] = useState(merchants[0]?.id ?? "");
  const [debugInput, setDebugInput] = useState("我不知道这个门店的小红书账号该怎么定位");
  const [debugRunning, setDebugRunning] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [debugResult, setDebugResult] = useState<{
    testRun: AgentTestRunDto | null;
    assistantOutput: string | null;
    runtimeSnapshot: Record<string, unknown> | null;
    toolResults: Array<{ toolName: string; status: string; summary: string }>;
    knowledgeMatches: Array<{ documentTitle?: string; chunkId?: string; score?: number }>;
    memoryMatches: Array<{ documentTitle?: string; chunkId?: string; score?: number }>;
    skillDisclosure: {
      candidateSkills?: Array<{ id: string; name?: string }>;
      activeSkills?: Array<{
        id: string;
        name?: string;
        score?: number;
        triggerReasons?: string[];
      }>;
    };
    skillDependencyWarnings: SkillDependencyWarningDto[];
  } | null>(null);
  const selectedAgent =
    foundationState.agents.find((agent) => agent.id === selectedAgentId) ??
    foundationState.agents[0];
  const selectedMerchant =
    merchants.find((merchant) => merchant.id === selectedMerchantId) ?? merchants[0];
  const activePrompt = selectedAgent
    ? getLatestPrompt(promptVersions, selectedAgent.id, "active")
    : undefined;
  const boundSkills = selectedAgent
    ? getBoundSkills(selectedAgent.id, foundationState.skills, skillBindings)
    : [];
  const boundKnowledgeSets = selectedAgent
    ? getBoundKnowledgeSets(
        selectedAgent.id,
        foundationState.knowledgeSets,
        knowledgeSetBindings,
      )
    : [];

  async function runAgentDebugTest() {
    if (!selectedAgent || !selectedMerchant || !debugInput.trim()) {
      return;
    }

    setDebugRunning(true);
    setDebugError(null);
    setDebugResult(null);

    try {
      const response = await fetch("/api/platform-admin/agents/test-runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId: selectedAgent.id,
          merchantId: selectedMerchant.id,
          inputMessage: debugInput.trim(),
        }),
      });
      const data = await readAdminJson<NonNullable<typeof debugResult>>(
        response,
        "Agent 调试运行失败",
      );

      setDebugResult(data);
    } catch (error) {
      setDebugError(error instanceof Error ? error.message : "Agent 调试运行失败");
    } finally {
      setDebugRunning(false);
    }
  }

  return (
    <div className="grid gap-6 lg:-mx-8 lg:-my-6 lg:min-h-[calc(100vh-1px)] lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid min-h-[70vh] grid-rows-[auto_minmax(0,1fr)_auto] border-white/10 lg:border-r">
        <div className="border-b border-white/10 bg-[#080808] px-5 py-4">
          <AdminPageHeader
            eyebrow="平台管理台 · Agent 调试"
            title="Agent 调试"
            description="选择任意 Agent 和测试商家运行后台调试；结果保存到 agent_test_runs，不写真实咨询会话，不扣商家积分。"
            action={
              <span className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/45">
                测试不扣积分 · 保存调试记录
              </span>
            }
          />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <select
              value={selectedAgent?.id ?? ""}
              onChange={(event) => setSelectedAgentId(event.target.value)}
              className={adminSelectClassName}
            >
              {foundationState.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.displayName}
                  {agent.id === onlineAgentId ? " [线上]" : ""} [{agent.serviceStatus}]
                </option>
              ))}
            </select>
            <select
              value={selectedMerchant?.id ?? ""}
              onChange={(event) => setSelectedMerchantId(event.target.value)}
              className={adminSelectClassName}
            >
              {merchants.map((merchant) => (
                <option key={merchant.id} value={merchant.id}>
                  {merchant.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="min-h-0 overflow-auto px-6 py-6">
          {debugError ? <AdminNotice tone="danger">{debugError}</AdminNotice> : null}
          {!debugResult && !debugError ? (
            <div className="flex min-h-[26rem] flex-col items-center justify-center text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300">
                <Settings2 className="size-5" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-white/60">输入测试问题后运行 Agent 调试</p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-white/35">
                调试运行会读取当前 Agent 的 Prompt、Skill、Knowledge Set 和测试商家资料，并保存一条可追溯记录。
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {["我不知道这个门店的小红书账号该怎么定位", "客户总说价格太贵，怎么处理？", "帮我分析竞品账号差异化方向"].map(
                  (question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => setDebugInput(question)}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/45 hover:bg-white/[0.05] hover:text-white/70"
                    >
                      {question}
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : null}

          {debugResult ? (
            <div className="grid gap-5">
              {debugResult.skillDependencyWarnings.length > 0 ? (
                <AdminNotice tone="warning">
                  {debugResult.skillDependencyWarnings.map((warning) => warning.message).join("；")}
                </AdminNotice>
              ) : null}

              <AdminPanel>
                <AdminPanelHeader
                  eyebrow="最终回复"
                  description={
                    debugResult.testRun
                      ? `测试记录 ${debugResult.testRun.id} · ${debugResult.testRun.status}`
                      : "本地 demo 未写入 test run。"
                  }
                />
                <div className="whitespace-pre-wrap p-5 text-sm leading-7 text-white/70">
                  {debugResult.assistantOutput ?? debugResult.testRun?.errorSummary ?? "无输出"}
                </div>
              </AdminPanel>

              <div className="grid gap-5 xl:grid-cols-2">
                <AdminPanel>
                  <AdminPanelHeader eyebrow="工具摘要" />
                  <div className="divide-y divide-white/[0.06]">
                    {debugResult.toolResults.length > 0 ? (
                      debugResult.toolResults.map((toolResult) => (
                        <div key={`${toolResult.toolName}-${toolResult.summary}`} className="p-4">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-white/65">
                              {toolResult.toolName}
                            </span>
                            <AdminStatusBadge status={toolResult.status} />
                          </div>
                          <p className="mt-2 text-xs leading-5 text-white/35">
                            {toolResult.summary}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="p-5 text-sm text-white/35">暂无工具结果。</div>
                    )}
                  </div>
                </AdminPanel>

                <AdminPanel>
                  <AdminPanelHeader eyebrow="命中知识片段" />
                  <div className="divide-y divide-white/[0.06]">
                    {debugResult.knowledgeMatches.length > 0 ? (
                      debugResult.knowledgeMatches.map((match) => (
                        <div key={match.chunkId ?? match.documentTitle} className="p-4">
                          <div className="text-sm font-medium text-white/65">
                            {match.documentTitle ?? "未命名知识片段"}
                          </div>
                          <div className="mt-2 text-xs text-white/35">
                            {match.chunkId ?? "chunk"} · score {match.score ?? "-"}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-5 text-sm text-white/35">暂无知识命中。</div>
                    )}
                  </div>
                </AdminPanel>
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <AdminPanel>
                  <AdminPanelHeader eyebrow="实际加载 Skills" />
                  <div className="divide-y divide-white/[0.06]">
                    {(debugResult.skillDisclosure.activeSkills ?? []).length > 0 ? (
                      debugResult.skillDisclosure.activeSkills?.map((skill) => (
                        <div key={skill.id} className="p-4">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-white/65">
                              {skill.name ?? skill.id}
                            </span>
                            <span className="text-xs text-white/35">
                              score {skill.score ?? 0}
                            </span>
                          </div>
                          {skill.triggerReasons?.length ? (
                            <p className="mt-2 text-xs leading-5 text-white/35">
                              {skill.triggerReasons.join(" / ")}
                            </p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="p-5 text-sm text-white/35">本轮未激活 Skill。</div>
                    )}
                  </div>
                </AdminPanel>

                <AdminPanel>
                  <AdminPanelHeader eyebrow="Memory 调用情况" />
                  <div className="divide-y divide-white/[0.06]">
                    {debugResult.memoryMatches.length > 0 ? (
                      debugResult.memoryMatches.map((match) => (
                        <div key={match.chunkId ?? match.documentTitle} className="p-4">
                          <div className="text-sm font-medium text-white/65">
                            {match.documentTitle ?? "商家记忆"}
                          </div>
                          <div className="mt-2 text-xs text-white/35">
                            {match.chunkId ?? "memory"} · score {match.score ?? "-"}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-5 text-sm text-white/35">
                        本轮未命中商家长期记忆。
                      </div>
                    )}
                  </div>
                </AdminPanel>
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-white/10 bg-[#080808] p-4">
          <div className="flex items-end gap-3">
            <textarea
              rows={2}
              value={debugInput}
              onChange={(event) => setDebugInput(event.target.value)}
              disabled={debugRunning}
              placeholder="输入测试消息"
              className={cn(adminTextareaClassName, "min-h-16 flex-1")}
            />
            <button
              type="button"
              disabled={debugRunning || !debugInput.trim() || !selectedAgent || !selectedMerchant}
              onClick={() => void runAgentDebugTest()}
              className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-black transition-colors hover:bg-amber-400 disabled:bg-white/[0.05] disabled:text-white/20"
            >
              {debugRunning ? (
                <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
          <div className="mt-2 text-[10px] text-white/25">
            {debugResult?.testRun
              ? `1 条调试记录 · ${debugResult.testRun.createdAt}`
              : "0 条调试记录"}{" "}
            · 测试商家：{selectedMerchant?.name ?? "未选择"}
          </div>
        </div>
      </div>

      <aside className="grid content-start gap-4 p-0 lg:p-5">
        <AdminPanel>
          <AdminPanelHeader eyebrow="当前配置快照" />
          <div className="grid gap-4 p-5 text-sm">
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-widest text-white/35">Agent 状态</p>
              {selectedAgent ? <AdminStatusBadge status={selectedAgent.serviceStatus} /> : null}
            </div>
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-widest text-white/35">Knowledge 服务</p>
              <AdminStatusBadge
                status={selectedAgent?.serviceFlags.knowledgeEnabled ? "enabled" : "disabled"}
              />
            </div>
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-widest text-white/35">Prompt 版本</p>
              <span className="font-mono text-white/55">
                {activePrompt ? `v${activePrompt.versionNo} active` : "暂无 active"}
              </span>
            </div>
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-widest text-white/35">候选 Skills</p>
              <div className="flex flex-wrap gap-2">
                {boundSkills.length > 0 ? (
                  boundSkills.map((skill) => (
                    <span
                      key={skill.id}
                      className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300"
                    >
                      {skill.name}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-white/30">无</span>
                )}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-widest text-white/35">Knowledge Sets</p>
              <div className="flex flex-wrap gap-2">
                {boundKnowledgeSets.length > 0 ? (
                  boundKnowledgeSets.map((set) => (
                    <span
                      key={set.id}
                      className="rounded border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-300"
                    >
                      {set.name}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-white/30">无</span>
                )}
              </div>
            </div>
          </div>
        </AdminPanel>

        <AdminPanel>
          <AdminPanelHeader eyebrow="运行结果" />
          <div className="grid gap-3 p-5 text-sm text-white/35">
            <div className="flex items-center gap-2">
              <Eye className="size-4" aria-hidden="true" />
              最终回复：{debugResult?.assistantOutput ? "已生成" : "未运行"}
            </div>
            <div className="flex items-center gap-2">
              <Database className="size-4" aria-hidden="true" />
              命中知识片段：{debugResult?.knowledgeMatches.length ?? 0}
            </div>
            <div className="flex items-center gap-2">
              <Zap className="size-4" aria-hidden="true" />
              实际加载 Skill：{debugResult?.skillDisclosure.activeSkills?.length ?? 0}
            </div>
            <div className="flex items-center gap-2">
              <Database className="size-4" aria-hidden="true" />
              Memory 命中：{debugResult?.memoryMatches.length ?? 0}
            </div>
            <div className="flex items-center gap-2">
              <RefreshCw className="size-4" aria-hidden="true" />
              工具摘要：{debugResult?.toolResults.length ?? 0}
            </div>
          </div>
        </AdminPanel>
      </aside>
    </div>
  );
}
