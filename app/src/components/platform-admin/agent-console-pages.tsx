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
  AgentConsoleFoundationStateDto,
  AgentKnowledgeSetBindingDto,
  AgentPromptVersionDto,
  AgentSkillBindingDto,
  AgentSkillDto,
  KnowledgeSetDto,
} from "@/contracts/platform-admin";
import { cn } from "@/lib/utils";
import type { AdminMerchant } from "@/lib/ui/platform-admin-mock";

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
  disabled = true,
}: {
  children: React.ReactNode;
  variant?: keyof typeof adminButtonVariants;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
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

export function AgentConfigAdminPage({
  foundationState,
  skillBindings,
  knowledgeSetBindings,
  promptVersions,
}: AgentConsolePagesProps) {
  const onlineAgentId = findOnlineAgentId(foundationState);
  const [selectedAgentId, setSelectedAgentId] = useState(
    onlineAgentId ?? foundationState.agents[0]?.id ?? "",
  );
  const [promptTab, setPromptTab] = useState<"draft" | "active" | "history">("draft");
  const [localSkillBindings, setLocalSkillBindings] = useState(skillBindings);
  const [savingSkills, setSavingSkills] = useState(false);
  const [skillBindingError, setSkillBindingError] = useState<string | null>(null);
  const [skillBindingSaved, setSkillBindingSaved] = useState(false);
  const selectedAgent =
    foundationState.agents.find((agent) => agent.id === selectedAgentId) ??
    foundationState.agents[0];

  const activePrompt = selectedAgent
    ? getLatestPrompt(promptVersions, selectedAgent.id, "active")
    : undefined;
  const draftPrompt = selectedAgent
    ? getLatestPrompt(promptVersions, selectedAgent.id, "draft")
    : undefined;
  const selectedAgentPromptVersions = selectedAgent
    ? sortPromptVersions(promptVersions.filter((version) => version.agentId === selectedAgent.id))
    : [];
  const boundSkills = selectedAgent
    ? getBoundSkills(selectedAgent.id, foundationState.skills, localSkillBindings)
    : [];
  const selectedSkillIds = selectedAgent
    ? getEnabledSkillIds(selectedAgent.id, localSkillBindings)
    : [];
  const selectedSaveableSkillIds = selectedAgent
    ? getSaveableSkillIds(selectedSkillIds, foundationState.skills)
    : [];
  const skillBindingsDirty = selectedAgent
    ? hasSkillBindingChanges(
        selectedAgent.id,
        foundationState.skills,
        skillBindings,
        localSkillBindings,
      )
    : false;
  const boundKnowledgeSets = selectedAgent
    ? getBoundKnowledgeSets(
        selectedAgent.id,
        foundationState.knowledgeSets,
        knowledgeSetBindings,
      )
    : [];
  const isOnline = selectedAgent?.id === onlineAgentId;

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

  if (!selectedAgent) {
    return (
      <div className="grid gap-6">
        <AdminPageHeader title="Agent 配置" description="foundation 还没有返回任何 Agent。" />
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
        <div className="border-b border-white/[0.06] px-4 py-4">
          <div className="text-[10px] font-medium uppercase tracking-widest text-white/40">
            Agent 列表
          </div>
        </div>
        <div className="grid gap-1 p-2">
          {foundationState.agents.map((agent) => (
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
              <MiniButton>
                <Copy className="size-3.5" aria-hidden="true" />
                复制 Agent
              </MiniButton>
              <MiniButton>
                <Lock className="size-3.5" aria-hidden="true" />
                设为线上
              </MiniButton>
              <MiniButton variant="primary">
                <Check className="size-3.5" aria-hidden="true" />
                保存
              </MiniButton>
            </div>
          }
        />

        {selectedAgent.serviceStatus === "disabled" && isOnline ? (
          <AdminNotice tone="danger">
            当前 Agent 已禁用，但仍被线上咨询入口引用。商家端应展示「服务维护中」。
          </AdminNotice>
        ) : null}

        {!isOnline && selectedAgent.serviceStatus === "draft" ? (
          <AdminNotice tone="warning">草稿 Agent 只能用于调试，不能设为线上咨询 Agent。</AdminNotice>
        ) : null}

        <AdminPanel>
          <AdminPanelHeader eyebrow="基础信息" />
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <AdminField label="Agent ID">
              <input readOnly value={selectedAgent.id} className={adminInputClassName} />
            </AdminField>
            <AdminField label="状态">
              <select value={selectedAgent.serviceStatus} disabled className={adminSelectClassName}>
                <option value="draft">草稿</option>
                <option value="enabled">已启用</option>
                <option value="disabled">已禁用</option>
              </select>
            </AdminField>
            <AdminField label="名称">
              <input readOnly value={selectedAgent.displayName} className={adminInputClassName} />
            </AdminField>
            <AdminField label="Agent Key">
              <input readOnly value={selectedAgent.agentKey} className={adminInputClassName} />
            </AdminField>
            <div className="md:col-span-2">
              <AdminField label="角色描述">
                <input
                  readOnly
                  value={selectedAgent.roleDescription ?? ""}
                  placeholder="暂无角色描述"
                  className={adminInputClassName}
                />
              </AdminField>
            </div>
          </div>
        </AdminPanel>

        <AdminPanel>
          <AdminPanelHeader
            eyebrow="System Prompt"
            action={
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
            }
          />
          <div className="grid gap-4 p-5">
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
              <textarea
                readOnly
                rows={10}
                value={draftPrompt?.body ?? activePrompt?.body ?? ""}
                placeholder="暂无 System Prompt 草稿"
                className={cn(adminTextareaClassName, "font-mono text-xs")}
              />
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
                      className="grid gap-2 rounded-md border border-white/[0.06] px-4 py-3 md:grid-cols-[7rem_1fr_auto]"
                    >
                      <span className="font-mono text-xs text-white/45">
                        v{version.versionNo}
                      </span>
                      <span className="min-w-0 truncate text-xs text-white/40">
                        {version.changeNote ?? "无变更说明"}
                      </span>
                      <AdminStatusBadge status={version.status} />
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
              {foundationState.skills.length > 0 ? (
                foundationState.skills.map((skill) => (
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
            <AdminPanelHeader eyebrow="挂载知识集" />
            <div className="p-2">
              {boundKnowledgeSets.length === 0 ? (
                <AdminNotice tone="warning" className="m-3">
                  未挂载任何知识集，Knowledge 服务不会检索平台知识。
                </AdminNotice>
              ) : null}
              {foundationState.knowledgeSets.length > 0 ? (
                foundationState.knowledgeSets.map((knowledgeSet) => (
                  <BindingCheckRow
                    key={knowledgeSet.id}
                    title={knowledgeSet.name}
                    description={knowledgeSet.description ?? knowledgeSet.scope}
                    status={knowledgeSet.status}
                    checked={boundKnowledgeSets.some((set) => set.id === knowledgeSet.id)}
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
  const [selectedSkillId, setSelectedSkillId] = useState(foundationState.skills[0]?.id ?? "");
  const selectedSkill =
    foundationState.skills.find((skill) => skill.id === selectedSkillId) ??
    foundationState.skills[0];

  const mountedAgentNames = useMemo(() => {
    if (!selectedSkill) {
      return [];
    }

    const mountedAgentIds = new Set(
      skillBindings
        .filter((binding) => binding.skillId === selectedSkill.id && binding.status === "enabled")
        .map((binding) => binding.agentId),
    );

    return foundationState.agents
      .filter((agent) => mountedAgentIds.has(agent.id))
      .map((agent) => agent.displayName);
  }, [foundationState.agents, selectedSkill, skillBindings]);

  if (!selectedSkill) {
    return (
      <div className="grid gap-6">
        <AdminPageHeader
          title="技能管理"
          description="Skill 是可控 prompt 片段，不开放底层 tool 权限。当前 foundation 尚未返回技能记录。"
          action={
            <MiniButton disabled>
              <Plus className="size-3.5" aria-hidden="true" />
              新建 Skill
            </MiniButton>
          }
        />
        <AdminEmptyState
          icon={Zap}
          title="暂无技能"
          description="等待 Agent 能力资产 API 分支接入后，再开放创建、启用、禁用和编辑。"
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
          <MiniButton disabled>
            <Plus className="size-3.5" aria-hidden="true" />
          </MiniButton>
        </div>
        <div className="grid gap-1 p-2">
          {foundationState.skills.map((skill) => (
            <button
              key={skill.id}
              type="button"
              onClick={() => setSelectedSkillId(skill.id)}
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
          description="管理单体 Skill 的能力描述、触发条件和 prompt 正文。当前为只读结构，写操作等待能力资产 API 接入。"
          action={
            <div className="flex flex-wrap gap-2">
              <MiniButton variant={selectedSkill.status === "enabled" ? "danger" : "primary"}>
                {selectedSkill.status === "enabled" ? "禁用" : "启用"}
              </MiniButton>
              <MiniButton>
                <Check className="size-3.5" aria-hidden="true" />
                保存
              </MiniButton>
            </div>
          }
        />

        <AdminPanel>
          <AdminPanelHeader eyebrow="基础信息" />
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <AdminField label="名称">
              <input readOnly value={selectedSkill.name} className={adminInputClassName} />
            </AdminField>
            <AdminField label="状态">
              <select value={selectedSkill.status} disabled className={adminSelectClassName}>
                <option value="draft">草稿</option>
                <option value="enabled">已启用</option>
                <option value="disabled">已禁用</option>
              </select>
            </AdminField>
            <div className="md:col-span-2">
              <AdminField label="Description（能力描述）">
                <textarea
                  readOnly
                  rows={2}
                  value={selectedSkill.description}
                  className={adminTextareaClassName}
                />
              </AdminField>
            </div>
            <div className="md:col-span-2">
              <AdminField label="When to Use（触发条件）">
                <textarea
                  readOnly
                  rows={2}
                  value={selectedSkill.whenToUse}
                  className={adminTextareaClassName}
                />
              </AdminField>
            </div>
            {selectedSkill.dependencies.length > 0 ? (
              <div className="md:col-span-2">
                <AdminField label="依赖项">
                  <div className="flex flex-wrap gap-2">
                    {selectedSkill.dependencies.map((dependency) => (
                      <span
                        key={dependency}
                        className="rounded border border-amber-500/25 bg-amber-500/10 px-2 py-1 font-mono text-xs text-amber-300"
                      >
                        {dependency}
                      </span>
                    ))}
                  </div>
                </AdminField>
              </div>
            ) : null}
          </div>
        </AdminPanel>

        <AdminPanel>
          <AdminPanelHeader eyebrow="Skill Body（Prompt 正文）" />
          <div className="p-5">
            <textarea
              readOnly
              rows={12}
              value={selectedSkill.body}
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
  merchants: AdminMerchant[];
}) {
  const onlineAgentId = findOnlineAgentId(foundationState);
  const [selectedAgentId, setSelectedAgentId] = useState(
    onlineAgentId ?? foundationState.agents[0]?.id ?? "",
  );
  const [selectedMerchantId, setSelectedMerchantId] = useState(merchants[0]?.id ?? "");
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

  return (
    <div className="grid gap-6 lg:-mx-8 lg:-my-6 lg:min-h-[calc(100vh-1px)] lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid min-h-[70vh] grid-rows-[auto_minmax(0,1fr)_auto] border-white/10 lg:border-r">
        <div className="border-b border-white/10 bg-[#080808] px-5 py-4">
          <AdminPageHeader
            eyebrow="平台管理台 · Agent 调试"
            title="Agent 调试"
            description="本分支只还原调试台布局。真实运行、快照保存和测试记录由 runtime/debug 分支接入。"
            action={
              <span className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/35">
                测试不扣积分 · 当前禁用运行
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

        <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300">
            <Settings2 className="size-5" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-white/60">选择 Agent 和测试商家，等待 runtime 接入</p>
          <p className="mt-2 max-w-lg text-sm leading-6 text-white/35">
            调试页已经预留多轮消息、配置展开、命中知识和工具摘要的呈现区域；当前不生成假回复。
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {["我不知道这个门店的小红书账号该怎么定位", "客户总说价格太贵，怎么处理？", "帮我分析竞品账号差异化方向"].map(
              (question) => (
                <span
                  key={question}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/35"
                >
                  {question}
                </span>
              ),
            )}
          </div>
        </div>

        <div className="border-t border-white/10 bg-[#080808] p-4">
          <div className="flex items-end gap-3">
            <textarea
              rows={2}
              disabled
              placeholder="runtime/debug API 接入后可输入测试消息"
              className={cn(adminTextareaClassName, "min-h-16 flex-1")}
            />
            <button
              type="button"
              disabled
              className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-white/20"
            >
              <Send className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-2 text-[10px] text-white/25">
            0 条消息 · 测试商家：{selectedMerchant?.name ?? "未选择"}
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
              最终回复等待 runtime。
            </div>
            <div className="flex items-center gap-2">
              <Database className="size-4" aria-hidden="true" />
              命中知识片段等待检索快照。
            </div>
            <div className="flex items-center gap-2">
              <RefreshCw className="size-4" aria-hidden="true" />
              工具摘要等待 bounded loop。
            </div>
          </div>
        </AdminPanel>
      </aside>
    </div>
  );
}
