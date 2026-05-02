import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import type {
  AgentConfigDto,
  AgentPromptVersionDto,
  AgentSkillDto,
} from "@/contracts/agent-console";
import type {
  ConsultationSessionDetailDto,
  ConsultationToolCardDto,
  StrategySnapshotDto,
} from "@/contracts/consultation";
import type { MerchantProfileDto } from "@/contracts/merchant";
import type {
  ConsultationAgentSettingsDto,
  KnowledgeRuntimeSettingsDto,
  KnowledgeSearchMatchDto,
} from "@/contracts/knowledge";
import {
  createConsultationEvent,
  createConsultationMessage,
  createConsultationSession,
  deleteConsultationSession,
  getConsultationSessionDetail,
  listConsultationSessions,
  updateConsultationSession,
} from "@/lib/db/consultation-repository";
import {
  attachRoundtableState,
  createRoundtableConsultationSessionForUser,
  resolveRoundtableState,
  sendRoundtableMessageForUser,
} from "@/server/api/roundtable-consultation-service";
import {
  ensureMerchantStrategyAsset,
  getMerchantStrategyAsset,
  upsertMerchantStrategyAsset,
} from "@/lib/db/merchant-strategy-asset-repository";
import {
  getAgentConfigById,
  getConsultationDefaultRouteBinding,
  listAgentPromptVersions,
  listAgentSkillBindings,
  listAgentSkills,
} from "@/lib/db/agent-console-repository";
import { searchKnowledgeChunks } from "@/lib/db/knowledge-repository";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import { getPlatformSettings } from "@/lib/db/platform-admin-repository";
import {
  AiRuntimeError,
  type AiRuntimeTool,
  type AiRuntimeToolCall,
  type ChatMessage,
  createChatCompletion,
  createEmbeddings,
  getAiRuntimeApiKey,
} from "@/server/api/ai-runtime";

export async function listConsultationSessionsForUser(userId: string) {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(userId);
  const [sessions, merchantStrategyAsset] = await Promise.all([
    listConsultationSessions(merchant.id),
    getMerchantStrategyAsset(merchant.id),
  ]);

  if (!merchantStrategyAsset) {
    return sessions;
  }

  return sessions.map((session) => ({
    ...session,
    strategySnapshot: merchantStrategyAsset,
  }));
}

export async function createConsultationSessionForUser(input: {
  userId: string;
  title?: string | null;
  mode?: "standard" | "roundtable";
}): Promise<ConsultationSessionDetailDto> {
  if (input.mode === "roundtable") {
    return createRoundtableConsultationSessionForUser(input);
  }

  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const { consultationAgent } = await resolveConsultationAgentRuntime();
  const initialStrategySnapshot = buildStrategySnapshot({
    merchant,
    previousSnapshot: null,
    userMessages: [],
  });
  const strategySnapshot = await ensureMerchantStrategyAsset({
    merchantId: merchant.id,
    fallback: initialStrategySnapshot,
  });
  const session = await createConsultationSession({
    merchantId: merchant.id,
    title: input.title ?? `${merchant.name} 咨询诊断`,
    currentStage: "商家画像读取",
    strategySnapshot,
    summaryText: `${merchant.name} 的首轮咨询会话已建立，等待补充客群与经营场景。`,
  });

  await createConsultationEvent({
    sessionId: session.id,
    eventType: "session.created",
    stageLabel: "商家画像读取",
    payload: {
      merchantName: merchant.name,
      enabledTools: consultationAgent.enabledTools,
      agentContainer: consultationAgent.container
        ? {
            agentId: consultationAgent.container.agent.id,
            agentKey: consultationAgent.container.agent.agentKey,
            displayName: consultationAgent.container.agent.displayName,
            activePromptVersion: consultationAgent.container.activePromptVersion?.versionNo ?? null,
            candidateSkillIds: consultationAgent.container.candidateSkills.map((skill) => skill.id),
          }
        : null,
    },
  });
  await createConsultationMessage({
    sessionId: session.id,
    role: "assistant",
    content: buildGreetingMessage(merchant),
    stageLabel: "商家画像读取",
    toolCards: buildToolCards({
      merchant,
      settings: consultationAgent,
      stageLabel: "商家画像读取",
    }),
    visibleSummary: {
      positioning: strategySnapshot.positioning,
      nextAction: "先补充你的主力客群、核心服务和最想解决的获客问题。",
    },
  });

  return getConsultationSessionDetail({
    merchantId: merchant.id,
    sessionId: session.id,
  }).then(attachRoundtableState);
}

export async function getConsultationSessionForUser(input: {
  userId: string;
  sessionId: string;
}) {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const session = await getConsultationSessionDetail({
    merchantId: merchant.id,
    sessionId: input.sessionId,
  });
  const merchantStrategyAsset = await getMerchantStrategyAsset(merchant.id);

  return merchantStrategyAsset
    ? attachRoundtableState({
        ...session,
        strategySnapshot: merchantStrategyAsset,
      })
    : attachRoundtableState(session);
}

export async function deleteConsultationSessionForUser(input: {
  userId: string;
  sessionId: string;
}) {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  await deleteConsultationSession({
    merchantId: merchant.id,
    sessionId: input.sessionId,
  });
}

export async function sendConsultationMessageForUser(input: {
  userId: string;
  sessionId: string;
  content: string;
}) {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const [{ consultationAgent, knowledgeRuntime, llmRuntime }, session, existingMerchantStrategyAsset] = await Promise.all([
    getPlatformSettings(),
    getConsultationSessionDetail({
      merchantId: merchant.id,
      sessionId: input.sessionId,
    }),
    getMerchantStrategyAsset(merchant.id),
  ]);
  const runtime = await resolveConsultationAgentRuntime({
    fallback: consultationAgent,
  });
  const effectiveSession: ConsultationSessionDetailDto = {
    ...session,
    strategySnapshot: existingMerchantStrategyAsset ?? session.strategySnapshot,
  };

  if (resolveRoundtableState(effectiveSession)) {
    return sendRoundtableMessageForUser(input);
  }

  const userMessage = await createConsultationMessage({
    sessionId: effectiveSession.id,
    role: "user",
    content: input.content,
    stageLabel: effectiveSession.currentStage,
  });
  const allUserMessages = [...effectiveSession.messages, userMessage]
    .filter((message) => message.role === "user")
    .map((message) => message.content);
  const conversationMessages = [...effectiveSession.messages, userMessage]
    .filter(
      (message): message is typeof message & { role: "user" | "assistant" } =>
        message.role === "user" || message.role === "assistant",
    )
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
  const loopResult = await runConsultationAgentLoop({
    merchant,
    session: effectiveSession,
    userContent: input.content,
    userMessages: allUserMessages,
    conversationMessages,
    consultationAgent: runtime.consultationAgent,
    knowledgeRuntime,
    llmRuntime,
  });

  await createConsultationEvent({
    sessionId: effectiveSession.id,
    eventType: "strategy_snapshot.updated",
    stageLabel: loopResult.nextStage,
    payload: {
      round: loopResult.nextRound,
      strategyTags: loopResult.strategySnapshot.strategyTags,
      calendarCount: loopResult.strategySnapshot.contentCalendarDraft.length,
      loopIterations: loopResult.toolResults.length,
    },
  });
  await upsertMerchantStrategyAsset({
    merchantId: merchant.id,
    strategySnapshot: loopResult.strategySnapshot,
  });
  await updateConsultationSession({
    merchantId: merchant.id,
    sessionId: effectiveSession.id,
    currentStage: loopResult.nextStage,
    strategySnapshot: loopResult.strategySnapshot,
    summaryText: loopResult.strategySnapshot.currentSuggestion,
  });
  await createConsultationMessage({
    sessionId: effectiveSession.id,
    role: "assistant",
    content: loopResult.assistantContent,
    stageLabel: loopResult.nextStage,
    toolCards: buildToolCards({
      merchant,
      settings: runtime.consultationAgent,
      stageLabel: loopResult.nextStage,
      knowledgeMatches: loopResult.knowledgeMatches,
      toolResults: loopResult.toolResults,
    }),
    visibleSummary: {
      positioning: loopResult.strategySnapshot.positioning,
      strategyTags: loopResult.strategySnapshot.strategyTags,
      knowledgeContext: buildKnowledgeContextBlock(loopResult.knowledgeMatches),
      agentLoop: {
        mode: "bounded_tool_loop",
        references: [
          "references/open-source/hermes-agent/run_agent.py",
          "references/open-source/hermes-agent/model_tools.py",
          "references/open-source/claude-code泄漏的客户端源码/claude-code-main/",
        ],
        agentContainer: loopResult.agentContainer,
        skillDisclosure: loopResult.skillDisclosure,
        toolResults: loopResult.toolResults.map((result) => ({
          tool: result.toolName,
          status: result.status,
          summary: result.summary,
        })),
      },
      nextAction:
        loopResult.nextRound >= 3
          ? "已经可以进入图文工作台或视频工作台继续创作。"
          : "继续补充你最想拿下的场景、用户异议或成交目标。",
    },
  });

  return getConsultationSessionDetail({
    merchantId: merchant.id,
    sessionId: effectiveSession.id,
  }).then((updatedSession) => ({
    ...updatedSession,
    strategySnapshot: loopResult.strategySnapshot,
  }));
}

type ConsultationAgentToolKey = ConsultationAgentSettingsDto["enabledTools"][number];

type ConsultationRuntimeSkill = Pick<
  AgentSkillDto,
  "id" | "skillKey" | "name" | "description" | "whenToUse" | "body"
>;

type ConsultationAgentContainerSnapshot = {
  agent: AgentConfigDto;
  activePromptVersion: AgentPromptVersionDto | null;
  candidateSkills: ConsultationRuntimeSkill[];
};

type ConsultationSkillDisclosure = {
  mode: "progressive_disclosure";
  candidateSkills: Array<Pick<ConsultationRuntimeSkill, "id" | "skillKey" | "name" | "whenToUse">>;
  activeSkills: Array<Pick<ConsultationRuntimeSkill, "id" | "skillKey" | "name" | "whenToUse">>;
};

type ConsultationAgentRuntimeSettings = ConsultationAgentSettingsDto & {
  container: ConsultationAgentContainerSnapshot | null;
  skillCatalog: ConsultationRuntimeSkill[];
  activeSkills: ConsultationRuntimeSkill[];
};

type ConsultationAgentToolCall = {
  id: string;
  toolName: ConsultationAgentToolKey;
  args: Record<string, unknown>;
  repaired?: boolean;
};

type ConsultationAgentToolResult = {
  callId: string;
  toolName: ConsultationAgentToolKey;
  status: ConsultationToolCardDto["status"];
  summary: string;
  payload: Record<string, unknown>;
  knowledgeMatches?: KnowledgeSearchMatchDto[];
};

type StrategyAssetFieldKey =
  | "positioning"
  | "coreSellingPoints"
  | "targetAudiences"
  | "keyScenes"
  | "currentSuggestion";

type StrategyAssetEditorPatch = {
  positioning?: string;
  coreSellingPoints?: string[];
  targetAudiences?: string[];
  keyScenes?: string[];
  currentSuggestion?: string;
  changedFields: StrategyAssetFieldKey[];
};

type ConsultationConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

const strategyAssetFieldKeys = [
  "positioning",
  "coreSellingPoints",
  "targetAudiences",
  "keyScenes",
  "currentSuggestion",
] as const satisfies readonly StrategyAssetFieldKey[];

const strategyAssetListLimits = {
  coreSellingPoints: 8,
  targetAudiences: 10,
  keyScenes: 8,
} as const;

const strategyAssetDocumentSchema = z
  .object({
    positioning: z.string().trim().min(1),
    coreSellingPoints: z.array(z.string().trim().min(1)).max(strategyAssetListLimits.coreSellingPoints),
    targetAudiences: z.array(z.string().trim().min(1)).max(strategyAssetListLimits.targetAudiences),
    keyScenes: z.array(z.string().trim().min(1)).max(strategyAssetListLimits.keyScenes),
    currentSuggestion: z.string().trim().min(1),
  })
  .strict();

const strategyAssetEditorToolArgsSchema = z
  .object({
    changedFields: z.array(z.enum(strategyAssetFieldKeys)),
    strategyAsset: strategyAssetDocumentSchema,
    changeSummary: z.string().trim().optional(),
  })
  .strict();

type StrategyAssetEditorToolArgs = z.infer<
  typeof strategyAssetEditorToolArgsSchema
>;

type StrategyAssetEditorToolParseResult =
  | {
      ok: true;
      patch: StrategyAssetEditorPatch;
    }
  | {
      ok: false;
      error: string;
    };

type ConsultationAgentLoopState = {
  merchant: MerchantProfileDto;
  session: ConsultationSessionDetailDto;
  userContent: string;
  userMessages: string[];
  conversationMessages: ConsultationConversationMessage[];
  nextRound: number;
  nextStage: string;
  consultationAgent: ConsultationAgentRuntimeSettings;
  knowledgeRuntime: KnowledgeRuntimeSettingsDto;
  llmRuntime: Awaited<ReturnType<typeof getPlatformSettings>>["llmRuntime"];
  knowledgeMatches: KnowledgeSearchMatchDto[];
  strategySnapshot: StrategySnapshotDto;
};

async function resolveConsultationAgentRuntime(input: {
  fallback?: ConsultationAgentSettingsDto;
} = {}): Promise<{
  consultationAgent: ConsultationAgentRuntimeSettings;
}> {
  const fallback = input.fallback ?? (await getPlatformSettings()).consultationAgent;
  const fallbackRuntime = {
    ...fallback,
    container: null,
    skillCatalog: [],
    activeSkills: [],
  };

  try {
    const routeBinding = await getConsultationDefaultRouteBinding();

    if (!routeBinding?.agentId || routeBinding.status !== "active") {
      return { consultationAgent: fallbackRuntime };
    }

    const agent = await getAgentConfigById(routeBinding.agentId);

    if (agent.serviceStatus !== "enabled") {
      return { consultationAgent: fallbackRuntime };
    }

    const [promptVersions, skillBindings, skills] = await Promise.all([
      listAgentPromptVersions(agent.id),
      listAgentSkillBindings({ agentId: agent.id }),
      listAgentSkills(),
    ]);
    const activePrompt =
      promptVersions
        .filter((promptVersion) => promptVersion.status === "active")
        .sort((first, second) => second.versionNo - first.versionNo)[0] ?? null;
    const enabledSkillIds = new Set(
      skillBindings
        .filter((binding) => binding.status === "enabled")
        .map((binding) => binding.skillId),
    );
    const candidateSkills = skills
      .filter((skill) => skill.status === "enabled" && enabledSkillIds.has(skill.id))
      .map(toRuntimeSkill);

    return {
      consultationAgent: {
        ...fallback,
        systemPrompt:
          agent.serviceFlags.systemPromptEnabled && activePrompt?.body
            ? activePrompt.body
            : fallback.systemPrompt,
        container: {
          agent,
          activePromptVersion: activePrompt,
          candidateSkills,
        },
        skillCatalog: agent.serviceFlags.skillsEnabled ? candidateSkills : [],
        activeSkills: [],
      },
    };
  } catch {
    return { consultationAgent: fallbackRuntime };
  }
}

async function runConsultationAgentLoop(input: {
  merchant: MerchantProfileDto;
  session: ConsultationSessionDetailDto;
  userContent: string;
  userMessages: string[];
  conversationMessages: ConsultationConversationMessage[];
  consultationAgent: ConsultationAgentRuntimeSettings;
  knowledgeRuntime: KnowledgeRuntimeSettingsDto;
  llmRuntime: Awaited<ReturnType<typeof getPlatformSettings>>["llmRuntime"];
}) {
  const nextRound = input.userMessages.length;
  const maxConversationRounds = Math.max(1, input.consultationAgent.maxRounds);
  const nextStage =
    nextRound >= Math.min(3, maxConversationRounds)
      ? "策略沉淀完成"
      : nextRound === 2
        ? "内容策略收束"
        : "目标客群梳理";
  const state: ConsultationAgentLoopState = {
    merchant: input.merchant,
    session: input.session,
    userContent: input.userContent,
    userMessages: input.userMessages,
    conversationMessages: input.conversationMessages,
    nextRound,
    nextStage,
    consultationAgent: {
      ...input.consultationAgent,
      activeSkills: selectActiveConsultationSkills({
        skills: input.consultationAgent.skillCatalog,
        userContent: input.userContent,
        userMessages: input.userMessages,
      }),
    },
    knowledgeRuntime: input.knowledgeRuntime,
    llmRuntime: input.llmRuntime,
    knowledgeMatches: [],
    strategySnapshot: input.session.strategySnapshot,
  };
  const plannedCalls = planConsultationToolCalls(state);
  const toolBudget = Math.min(
    plannedCalls.length,
    Math.max(1, input.consultationAgent.enabledTools.length),
  );
  const toolResults: ConsultationAgentToolResult[] = [];

  await createConsultationEvent({
    sessionId: input.session.id,
    eventType: "agent.loop.started",
    stageLabel: nextStage,
    payload: {
      mode: "bounded_tool_loop",
      round: nextRound,
      maxConversationRounds,
      toolBudget,
      enabledTools: input.consultationAgent.enabledTools,
      businessTools: getConsultationBusinessToolCatalog()
        .filter((tool) => input.consultationAgent.enabledTools.includes(tool.key))
        .map((tool) => ({
          key: tool.key,
          label: tool.label,
          purpose: tool.purpose,
          writes: tool.writes,
        })),
      agentContainer: state.consultationAgent.container
        ? {
            agentId: state.consultationAgent.container.agent.id,
            agentKey: state.consultationAgent.container.agent.agentKey,
            displayName: state.consultationAgent.container.agent.displayName,
            activePromptVersion:
              state.consultationAgent.container.activePromptVersion?.versionNo ?? null,
            candidateSkillIds: state.consultationAgent.skillCatalog.map((skill) => skill.id),
            activeSkillIds: state.consultationAgent.activeSkills.map((skill) => skill.id),
          }
        : null,
      skillDisclosure: buildSkillDisclosure(state.consultationAgent),
      systemPromptPreview: input.consultationAgent.systemPrompt.slice(0, 240),
      references: [
        "references/open-source/hermes-agent/run_agent.py",
        "references/open-source/hermes-agent/model_tools.py",
        "references/open-source/hermes-agent/agent/prompt_builder.py",
        "references/open-source/claude-code泄漏的客户端源码/claude-code-main/",
      ],
    },
  });

  for (const plannedCall of plannedCalls.slice(0, toolBudget)) {
    const toolCall = repairConsultationToolCall(plannedCall, state);
    const result = await dispatchConsultationTool(toolCall, state);

    applyToolResultToState(result, state);
    toolResults.push(result);

    await createConsultationEvent({
      sessionId: input.session.id,
      eventType: "agent.tool.completed",
      stageLabel: nextStage,
      payload: {
        callId: toolCall.id,
        toolName: toolCall.toolName,
        repaired: toolCall.repaired ?? false,
        status: result.status,
        summary: result.summary,
        payload: result.payload,
      },
    });

    if (result.toolName === "retrieve_knowledge_base") {
      await createConsultationEvent({
        sessionId: input.session.id,
        eventType: "knowledge.retrieved",
        stageLabel: nextStage,
        payload: {
          source: "agent_loop",
          status: result.status,
          summary: result.summary,
          ...(result.payload as Record<string, unknown>),
        },
      });
    }
  }

  const assistantReply = await buildAssistantReplyWithModel({
    merchant: state.merchant,
    round: state.nextRound,
    userContent: state.userContent,
    strategySnapshot: state.strategySnapshot,
    knowledgeMatches: state.knowledgeMatches,
    toolResults,
    consultationAgent: state.consultationAgent,
    llmRuntime: state.llmRuntime,
  });

  await createConsultationEvent({
    sessionId: input.session.id,
    eventType:
      assistantReply.mode === "llm"
        ? "llm.response.completed"
        : "llm.response.fallback",
    stageLabel: nextStage,
    payload: {
      mode: assistantReply.mode,
      model: assistantReply.model ?? null,
      error: assistantReply.error ?? null,
    },
  });

  await createConsultationEvent({
    sessionId: input.session.id,
    eventType: "agent.loop.completed",
    stageLabel: nextStage,
    payload: {
      toolCount: toolResults.length,
      completedTools: toolResults
        .filter((result) => result.status === "completed")
        .map((result) => result.toolName),
      skippedTools: toolResults
        .filter((result) => result.status === "skipped")
        .map((result) => result.toolName),
      strategyTags: state.strategySnapshot.strategyTags,
    },
  });

  return {
    nextRound: state.nextRound,
    nextStage,
    strategySnapshot: state.strategySnapshot,
    knowledgeMatches: state.knowledgeMatches,
    toolResults,
    agentContainer: state.consultationAgent.container
      ? {
          agentId: state.consultationAgent.container.agent.id,
          agentKey: state.consultationAgent.container.agent.agentKey,
          displayName: state.consultationAgent.container.agent.displayName,
          activePromptVersion: state.consultationAgent.container.activePromptVersion?.versionNo ?? null,
        }
      : null,
    skillDisclosure: buildSkillDisclosure(state.consultationAgent),
    assistantContent: assistantReply.content,
  };
}

function planConsultationToolCalls(
  state: ConsultationAgentLoopState,
): ConsultationAgentToolCall[] {
  const enabled = new Set<ConsultationAgentToolKey>(state.consultationAgent.enabledTools);
  const orderedTools: ConsultationAgentToolKey[] = [
    "read_merchant_profile",
    "retrieve_knowledge_base",
    "read_history",
    "update_strategy_snapshot",
    "update_content_calendar",
    "generate_article_brief",
    "generate_video_brief",
  ];

  return orderedTools
    .filter((toolName) => enabled.has(toolName))
    .map((toolName) => ({
      id: randomUUID(),
      toolName,
      args: buildToolArgs(toolName, state),
    }));
}

function toRuntimeSkill(skill: AgentSkillDto): ConsultationRuntimeSkill {
  return {
    id: skill.id,
    skillKey: skill.skillKey,
    name: skill.name,
    description: skill.description,
    whenToUse: skill.whenToUse,
    body: skill.body,
  };
}

function selectActiveConsultationSkills(input: {
  skills: ConsultationRuntimeSkill[];
  userContent: string;
  userMessages: string[];
}) {
  const currentText = normalizeSkillMatchText(input.userContent);
  const recentText = normalizeSkillMatchText(input.userMessages.slice(-3).join(" "));

  return input.skills
    .filter((skill) => {
      const haystack = normalizeSkillMatchText(
        [skill.name, skill.skillKey ?? "", skill.description, skill.whenToUse].join(" "),
      );
      const tokens = extractSkillTriggerTokens(haystack);

      return tokens.some((token) => currentText.includes(token) || recentText.includes(token));
    })
    .slice(0, 3);
}

function extractSkillTriggerTokens(source: string) {
  const normalized = normalizeSkillMatchText(source);
  const phraseTokens = normalized
    .split(/[\s,，。；;、/|()[\]{}"'`：:]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && token.length <= 12);
  const conceptTokens = [
    "个人ip",
    "个人定位",
    "定位",
    "亮点",
    "优势",
    "人设",
    "产品",
    "卖点",
    "客群",
    "场景",
    "异议",
    "内容",
    "日历",
    "图文",
    "视频",
    "脚本",
    "转化",
    "私信",
    "到店",
  ].filter((token) => normalized.includes(token));

  return uniqueStrings([...conceptTokens, ...phraseTokens]).slice(0, 32);
}

function normalizeSkillMatchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function buildSkillDisclosure(
  consultationAgent: ConsultationAgentRuntimeSettings,
): ConsultationSkillDisclosure {
  return {
    mode: "progressive_disclosure",
    candidateSkills: consultationAgent.skillCatalog.map(toSkillDisclosureItem),
    activeSkills: consultationAgent.activeSkills.map(toSkillDisclosureItem),
  };
}

function toSkillDisclosureItem(skill: ConsultationRuntimeSkill) {
  return {
    id: skill.id,
    skillKey: skill.skillKey,
    name: skill.name,
    whenToUse: skill.whenToUse,
  };
}

function buildSkillCatalogPrompt(consultationAgent: ConsultationAgentRuntimeSettings) {
  if (consultationAgent.skillCatalog.length === 0) {
    return "";
  }

  const listing = consultationAgent.skillCatalog
    .map((skill) =>
      [
        `- ${skill.name}${skill.skillKey ? ` (${skill.skillKey})` : ""}`,
        skill.description ? `  Description: ${clipText(skill.description, 160)}` : "",
        skill.whenToUse ? `  When to use: ${clipText(skill.whenToUse, 180)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");

  return [
    "【候选 Skills：渐进式披露】",
    "下面只列出可用 Skill 的简短说明。只有当前轮用户问题命中触发条件时，才会在后续“本轮激活 Skill”中提供完整正文。",
    listing,
  ].join("\n");
}

function buildActiveSkillPrompt(skills: ConsultationRuntimeSkill[]) {
  if (skills.length === 0) {
    return "";
  }

  return [
    "【本轮激活 Skill】",
    "以下 Skill 正文只用于当前轮咨询判断。不得向商家暴露 Skill 名称、内部字段或配置来源。",
    ...skills.map((skill) =>
      [
        `## ${skill.name}${skill.skillKey ? ` (${skill.skillKey})` : ""}`,
        skill.body ? clipText(skill.body, 3600) : skill.whenToUse,
      ].join("\n"),
    ),
  ].join("\n\n");
}

function buildBusinessToolPrompt(enabledTools: ConsultationAgentToolKey[]) {
  const enabled = new Set(enabledTools);
  const rows = getConsultationBusinessToolCatalog()
    .filter((tool) => enabled.has(tool.key))
    .map((tool) => `- ${tool.key}: ${tool.label}。${tool.purpose} 写入/影响：${tool.writes}。`)
    .join("\n");

  return [
    "【咨询 Agent 受控业务工具】",
    "右侧策略资产不是普通文案，它由以下受控业务工具更新；回答时要尊重这些工具的输出，不要声称执行未启用工具。",
    rows,
  ].join("\n");
}

function getConsultationBusinessToolCatalog(): Array<{
  key: ConsultationAgentToolKey;
  label: string;
  purpose: string;
  writes: string;
}> {
  return [
    {
      key: "read_merchant_profile",
      label: "读取商家资料",
      purpose: "读取商家基础信息、服务项目、品牌语气和默认 CTA。",
      writes: "只读上下文",
    },
    {
      key: "retrieve_knowledge_base",
      label: "检索平台方法论与商家上下文",
      purpose: "检索平台方法论、商家资料和可用于咨询的知识片段。",
      writes: "knowledgeMatches / 受控上下文",
    },
    {
      key: "read_history",
      label: "读取历史内容",
      purpose: "读取当前咨询会话历史和摘要，避免丢上下文。",
      writes: "只读上下文",
    },
    {
      key: "update_strategy_snapshot",
      label: "编辑策略资产",
      purpose: "把产品定位、核心卖点、目标客群、关键场景和当前建议作为一个整体资产编辑。",
      writes: "strategySnapshot as one editor document: positioning / coreSellingPoints / targetAudiences / keyScenes / currentSuggestion",
    },
    {
      key: "update_content_calendar",
      label: "更新内容日历",
      purpose: "把策略快照转成图文/视频混合内容日历。",
      writes: "strategySnapshot.contentCalendarDraft",
    },
    {
      key: "generate_article_brief",
      label: "生成图文任务草案",
      purpose: "把咨询结论转成图文工作台可使用的 brief。",
      writes: "strategySnapshot.articleBrief",
    },
    {
      key: "generate_video_brief",
      label: "生成视频任务草案",
      purpose: "把咨询结论转成视频工作台可使用的 brief。",
      writes: "strategySnapshot.videoBrief",
    },
  ];
}

function buildToolArgs(
  toolName: ConsultationAgentToolKey,
  state: ConsultationAgentLoopState,
): Record<string, unknown> {
  if (toolName === "retrieve_knowledge_base") {
    return {
      query: buildKnowledgeQuery({
        merchant: state.merchant,
        userContent: state.userContent,
        previousSnapshot: state.session.strategySnapshot,
      }),
      topK: Math.max(
        0,
        Math.min(state.consultationAgent.retrievalTopK, state.knowledgeRuntime.retrievalTopK),
      ),
      contextPolicy: "hermes_safe_context_block",
    };
  }

  if (toolName === "read_history") {
    return {
      sessionId: state.session.id,
      previousMessageCount: state.session.messages.length,
      previousSummary: state.session.summaryText,
    };
  }

  return {
    merchantId: state.merchant.id,
    round: state.nextRound,
    stage: state.nextStage,
  };
}

function repairConsultationToolCall(
  call: ConsultationAgentToolCall,
  state: ConsultationAgentLoopState,
): ConsultationAgentToolCall {
  if (call.toolName !== "retrieve_knowledge_base") {
    return call;
  }

  if (typeof call.args.query === "string" && call.args.query.trim().length > 0) {
    return call;
  }

  return {
    ...call,
    repaired: true,
    args: {
      ...call.args,
      query: [
        state.userContent,
        state.merchant.industry ?? "",
        state.merchant.serviceItems.join(" "),
      ]
        .filter(Boolean)
        .join(" "),
    },
  };
}

async function dispatchConsultationTool(
  call: ConsultationAgentToolCall,
  state: ConsultationAgentLoopState,
): Promise<ConsultationAgentToolResult> {
  if (call.toolName === "read_merchant_profile") {
    return {
      callId: call.id,
      toolName: call.toolName,
      status: "completed",
      summary: `已读取 ${state.merchant.name} 的商家资料、服务项目与品牌上下文。`,
      payload: {
        merchantId: state.merchant.id,
        serviceItems: state.merchant.serviceItems,
        industry: state.merchant.industry,
      },
    };
  }

  if (call.toolName === "retrieve_knowledge_base") {
    const topK = typeof call.args.topK === "number" ? call.args.topK : 0;
    const query = typeof call.args.query === "string" ? call.args.query : "";
    const queryEmbedding = await embedKnowledgeQuery({
      query,
      state,
    });
    const matches =
      topK > 0
        ? await searchKnowledgeChunks({
            merchantId: state.merchant.id,
            query,
            limit: topK,
            queryEmbedding: queryEmbedding.embedding,
          })
        : [];

    return {
      callId: call.id,
      toolName: call.toolName,
      status: matches.length > 0 ? "completed" : "skipped",
      summary:
        matches.length > 0
          ? `检索平台方法论与商家上下文，命中 ${matches.length} 个受控片段。`
          : "暂无 indexed 知识片段命中，使用商家基础资料与会话上下文兜底。",
      payload: {
        retrievalMode: queryEmbedding.embedding ? "vector_with_lexical_fallback" : "lexical",
        embeddingMode: queryEmbedding.mode,
        embeddingModel: queryEmbedding.model ?? state.knowledgeRuntime.embeddingModel,
        queryMode: call.args.contextPolicy,
        matchCount: matches.length,
        matches: matches.map((match) => ({
          documentId: match.documentId,
          documentTitle: match.documentTitle,
          chunkId: match.chunkId,
          scope: match.scope,
          score: match.score,
        })),
      },
      knowledgeMatches: matches,
    };
  }

  if (call.toolName === "read_history") {
    return {
      callId: call.id,
      toolName: call.toolName,
      status: state.session.messages.length > 0 ? "completed" : "skipped",
      summary: `已读取当前会话 ${state.session.messages.length} 条历史消息。`,
      payload: {
        previousMessageCount: state.session.messages.length,
        previousSummary: state.session.summaryText,
      },
    };
  }

  if (call.toolName === "update_strategy_snapshot") {
    const assetEdit = await resolveStrategyAssetEditorPatch({
      state,
      fallback: buildStrategyAssetSnapshotPatch(state.session.strategySnapshot),
    });
    const strategySnapshot = buildStrategySnapshot({
      merchant: state.merchant,
      previousSnapshot: state.session.strategySnapshot,
      userMessages: state.userMessages,
      knowledgeMatches: state.knowledgeMatches,
      assetEdit,
    });

    return {
      callId: call.id,
      toolName: call.toolName,
      status: "completed",
      summary: assetEdit.changedFields.length
        ? `策略资产 Editor 已更新：${summarizeStrategyAssetEdit(assetEdit)}。`
        : "策略资产 Editor 已同步定位、卖点、客群、关键场景与当前建议。",
      payload: {
        strategySnapshot,
        editorPatch: toStrategyAssetEditorPayload(assetEdit),
      },
    };
  }

  if (call.toolName === "update_content_calendar") {
    const calendar = state.strategySnapshot.contentCalendarDraft;
    return {
      callId: call.id,
      toolName: call.toolName,
      status: calendar.length > 0 ? "completed" : "skipped",
      summary:
        calendar.length > 0
          ? `已同步 ${calendar.length} 条图文/视频混合内容日历。`
          : "策略快照尚未生成内容日历。",
      payload: {
        calendarCount: calendar.length,
        calendar,
      },
    };
  }

  if (call.toolName === "generate_article_brief") {
    return {
      callId: call.id,
      toolName: call.toolName,
      status: state.strategySnapshot.articleBrief ? "completed" : "skipped",
      summary: state.strategySnapshot.articleBrief
        ? `已生成图文任务草案：${state.strategySnapshot.articleBrief.workingTitle}`
        : "暂无图文任务草案。",
      payload: {
        articleBrief: state.strategySnapshot.articleBrief,
      },
    };
  }

  return {
    callId: call.id,
    toolName: call.toolName,
    status: state.strategySnapshot.videoBrief ? "completed" : "skipped",
    summary: state.strategySnapshot.videoBrief
      ? `已生成视频任务草案：${state.strategySnapshot.videoBrief.workingTitle}`
      : "暂无视频任务草案。",
    payload: {
      videoBrief: state.strategySnapshot.videoBrief,
    },
  };
}

async function embedKnowledgeQuery(input: {
  query: string;
  state: ConsultationAgentLoopState;
}): Promise<{
  embedding: number[] | null;
  mode: "embedded" | "not_configured" | "failed" | "empty";
  model?: string;
}> {
  if (!input.query.trim()) {
    return { embedding: null, mode: "empty" };
  }

  if (!getAiRuntimeApiKey()) {
    return { embedding: null, mode: "not_configured" };
  }

  try {
    const result = await createEmbeddings({
      runtime: input.state.llmRuntime,
      knowledgeRuntime: input.state.knowledgeRuntime,
      input: input.query,
    });

    return {
      embedding: result.embeddings[0] ?? null,
      mode: "embedded",
      model: result.model,
    };
  } catch {
    return { embedding: null, mode: "failed" };
  }
}

function applyToolResultToState(
  result: ConsultationAgentToolResult,
  state: ConsultationAgentLoopState,
) {
  if (result.toolName === "retrieve_knowledge_base") {
    state.knowledgeMatches = result.knowledgeMatches ?? [];
  }

  if (result.toolName === "update_strategy_snapshot") {
    const strategySnapshot = result.payload.strategySnapshot;

    if (isStrategySnapshot(strategySnapshot)) {
      state.strategySnapshot = strategySnapshot;
    }
  }
}

function buildGreetingMessage(merchant: MerchantProfileDto) {
  const service = merchant.serviceItems[0] ?? merchant.industry ?? "本地服务";
  return `你好，欢迎来到静境商家平台。我已经先读取了 ${merchant.name} 的基础资料。接下来我会帮你把「${service}」这条业务线梳理成更清晰的定位、卖点、目标客群和内容策略。先告诉我：你现在最想提升的是到店咨询、私信转化，还是账号的人设种草？`;
}

function buildAssistantReply(input: {
  merchant: MerchantProfileDto;
  round: number;
  userContent: string;
  strategySnapshot: StrategySnapshotDto;
  knowledgeMatches: KnowledgeSearchMatchDto[];
  toolResults?: ConsultationAgentToolResult[];
}) {
  const knowledgeHint = buildKnowledgeReplyHint(input.knowledgeMatches);
  const loopHint = buildAgentLoopReplyHint(input.toolResults ?? []);

  if (input.round === 1) {
    return `收到，我先把你的目标收进策略资产里。${loopHint}${knowledgeHint}现在看，${input.strategySnapshot.positioning}。下一步我想把人群和场景再钉牢一点: 你最优先想拿下的是哪一类人，她们通常会在什么场景下开始认真考虑你这项服务？`;
  }

  if (input.round === 2) {
    return `这条信息很关键，我已经把它合并到客群和内容场景里。${loopHint}${knowledgeHint}当前建议是：${input.strategySnapshot.currentSuggestion}。再补最后一个关键问题: 现阶段最容易卡成交的异议是什么，是价格、效果可信度、时间安排，还是门店距离与体验顾虑？`;
  }

  return `策略已经够落地了，我先帮你沉淀成可执行结论。${loopHint}${knowledgeHint}${input.strategySnapshot.currentSuggestion}。右侧内容日历已经更新，你现在可以直接进入图文工作台生成笔记草稿，或者进入视频工作台生成脚本并继续推进视频任务。`;
}

async function buildAssistantReplyWithModel(input: {
  merchant: MerchantProfileDto;
  round: number;
  userContent: string;
  strategySnapshot: StrategySnapshotDto;
  knowledgeMatches: KnowledgeSearchMatchDto[];
  toolResults?: ConsultationAgentToolResult[];
  consultationAgent: ConsultationAgentRuntimeSettings;
  llmRuntime: Awaited<ReturnType<typeof getPlatformSettings>>["llmRuntime"];
}): Promise<{
  content: string;
  mode: "llm" | "fallback_no_key" | "fallback_error";
  model?: string;
  error?: string;
}> {
  const fallback = buildAssistantReply(input);

  if (!getAiRuntimeApiKey()) {
    return {
      content: fallback,
      mode: "fallback_no_key",
    };
  }

  try {
    const response = await createChatCompletion({
      runtime: input.llmRuntime,
      model: input.consultationAgent.model,
      messages: [
        {
          role: "system",
          content: [
            input.consultationAgent.systemPrompt,
            buildSkillCatalogPrompt(input.consultationAgent),
            buildActiveSkillPrompt(input.consultationAgent.activeSkills),
            buildBusinessToolPrompt(input.consultationAgent.enabledTools),
            "你只输出给商家的中文自然语言回复，不要输出 JSON、Markdown 表格或内部工具名。",
            "必须基于已完成工具结果、策略快照和受控知识库片段回答；如果信息不足，提出一个最关键的追问。",
            "如果工具结果已经显示策略资产被编辑，要先确认已按用户要求写入；不要反过来劝用户保持旧结构，也不要把已执行的明确编辑再改成优先级追问。",
            "当你列出目标客群、核心卖点或核心场景时，只能逐字使用 strategySnapshot 中已经存在的条目；不要补充未写入右侧策略资产的新条目。",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            merchant: {
              name: input.merchant.name,
              industry: input.merchant.industry,
              serviceItems: input.merchant.serviceItems,
              defaultCta: input.merchant.defaultCta,
            },
            userMessage: input.userContent,
            round: input.round,
            strategySnapshot: input.strategySnapshot,
            knowledgeMatches: input.knowledgeMatches.map((match) => ({
              title: match.documentTitle,
              score: match.score,
              content: match.content.slice(0, 600),
            })),
            toolResults: (input.toolResults ?? []).map((result) => ({
              tool: result.toolName,
              status: result.status,
              summary: result.summary,
            })),
            skillDisclosure: buildSkillDisclosure(input.consultationAgent),
            fallbackDraft: fallback,
          }),
        },
      ],
    });

    return {
      content: response.content.trim(),
      mode: "llm",
      model: response.model,
    };
  } catch (error) {
    return {
      content: fallback,
      mode: "fallback_error",
      error:
        error instanceof AiRuntimeError
          ? `${error.message}${error.status ? ` (${error.status})` : ""}`
          : error instanceof Error
            ? error.message
            : "Unknown AI runtime error.",
    };
  }
}

function buildToolCards(input: {
  merchant: MerchantProfileDto;
  settings: ConsultationAgentSettingsDto;
  stageLabel: string;
  knowledgeMatches?: KnowledgeSearchMatchDto[];
  toolResults?: ConsultationAgentToolResult[];
}): ConsultationToolCardDto[] {
  const { merchant, settings, stageLabel } = input;
  const knowledgeMatches = input.knowledgeMatches ?? [];
  const resultByTool = new Map(
    (input.toolResults ?? []).map((result) => [result.toolName, result]),
  );
  const matchedTitles = uniqueStrings(knowledgeMatches.map((match) => match.documentTitle)).slice(0, 2);
  const cards: Record<string, ConsultationToolCardDto> = {
    read_merchant_profile: {
      key: "read_merchant_profile",
      label: "读取商家资料",
      summary: `已读取 ${merchant.name} 的基础资料与服务信息。`,
      status: "completed",
    },
    retrieve_knowledge_base: {
      key: "retrieve_knowledge_base",
      label: "检索平台方法论与商家上下文",
      summary:
        knowledgeMatches.length > 0
          ? `已按 Hermes 安全上下文方式注入 ${knowledgeMatches.length} 个片段，来源：${matchedTitles.join("、")}。`
          : `按 Top ${settings.retrievalTopK} 规则检索，暂无 indexed 知识片段命中。`,
      status: knowledgeMatches.length > 0 ? "completed" : "skipped",
    },
    update_strategy_snapshot: {
      key: "update_strategy_snapshot",
      label: "编辑策略资产",
      summary: `已把定位、卖点、客群与当前建议作为一个整体资产同步到「${stageLabel}」。`,
      status: "completed",
    },
    update_content_calendar: {
      key: "update_content_calendar",
      label: "更新内容日历",
      summary: "已生成图文与视频混合的一周内容草案。",
      status: "completed",
    },
    generate_article_brief: {
      key: "generate_article_brief",
      label: "生成图文任务草案",
      summary: "已准备好图文工作台的默认选题与标题方向。",
      status: "completed",
    },
    generate_video_brief: {
      key: "generate_video_brief",
      label: "生成视频任务草案",
      summary: "已准备好视频钩子、脚本方向和保底输出目标。",
      status: "completed",
    },
    read_history: {
      key: "read_history",
      label: "读取历史内容",
      summary: "已保留和当前商家资料兼容的历史上下文入口。",
      status: "completed",
    },
  };

  return settings.enabledTools
    .map((tool) => {
      const result = resultByTool.get(tool);
      const fallback = cards[tool];

      if (!fallback) {
        return null;
      }

      return result
        ? {
            ...fallback,
            summary: result.summary,
            status: result.status,
          }
        : fallback;
    })
    .filter((card): card is ConsultationToolCardDto => card !== null);
}

function buildStrategySnapshot(input: {
  merchant: MerchantProfileDto;
  previousSnapshot: StrategySnapshotDto | null;
  userMessages: string[];
  knowledgeMatches?: KnowledgeSearchMatchDto[];
  assetEdit?: StrategyAssetEditorPatch;
}): StrategySnapshotDto {
  const mergedUserText = input.userMessages.join(" ");
  const knowledgeText = (input.knowledgeMatches ?? []).map((match) => match.content).join(" ");
  const assetEdit = input.assetEdit;
  const serviceAnchor =
    input.merchant.serviceItems[0] ?? input.merchant.industry ?? "本地生活服务";
  const audiences = mergeEditedStrategyList({
    edited: assetEdit?.targetAudiences,
    fallback: [
      ...(input.previousSnapshot?.targetAudiences ?? []),
      ...extractKeywordMatches(mergedUserText, [
        "白领女性",
        "产后妈妈",
        "附近居民",
        "精致宝妈",
        "健身人群",
        "体态调整人群",
      ]),
      ...extractKeywordMatches(knowledgeText, ["白领女性", "产后妈妈", "附近居民", "体态调整人群"]),
      ...extractKeywordMatches(input.merchant.brandSummary ?? "", [
        "白领女性",
        "产后妈妈",
        "附近居民",
        "体态调整人群",
      ]),
    ],
    maxItems: strategyAssetListLimits.targetAudiences,
  });
  const sellingPoints = mergeEditedStrategyList({
    edited: assetEdit?.coreSellingPoints,
    fallback: [
      ...(input.previousSnapshot?.coreSellingPoints ?? []),
      ...input.merchant.serviceItems.slice(0, 3),
      ...extractKeywordMatches(knowledgeText, [
        "真实案例",
        "专业评估",
        "体验课",
        "私教跟进",
        "到店转化",
        "信任建立",
      ]),
      input.merchant.brandSummary ?? "",
      input.merchant.regionSummary ?? "",
    ],
    maxItems: strategyAssetListLimits.coreSellingPoints,
  });
  const keyScenes = mergeEditedStrategyList({
    edited: assetEdit?.keyScenes,
    fallback: [
      ...(input.previousSnapshot?.keyScenes ?? []),
      ...extractKeywordMatches(mergedUserText, [
        "下班后恢复",
        "产后恢复",
        "周末探店",
        "首次体验课",
        "体态调整",
        "减脂塑形",
        "门店到访前决策",
      ]),
      ...extractKeywordMatches(knowledgeText, ["首次体验课", "门店到访前决策", "成交异议"]),
      input.merchant.regionSummary ?? "",
    ],
    maxItems: strategyAssetListLimits.keyScenes,
  });
  const strategyTags = uniqueStrings([
    "专业人设",
    "场景种草",
    "到店转化",
    knowledgeText ? "知识库命中" : "",
    mergedUserText.includes("视频") ? "视频优先" : "",
  ]).slice(0, 4);
  const positioning =
    assetEdit?.positioning ??
    `${input.merchant.name} 围绕 ${serviceAnchor} 提供更适合 ${audiences[0] || "高意向用户"} 的本地化服务，内容上优先突出 ${sellingPoints[0] || serviceAnchor}。`;
  const currentSuggestion =
    assetEdit?.currentSuggestion ??
    `建议先用「${strategyTags[0]} + ${strategyTags[1]}」做 3 条信任建立内容，再用 ${strategyTags.at(-1) ?? "到店转化"} 把咨询引到体验或到店动作。`;

  return {
    positioning,
    coreSellingPoints: sellingPoints,
    targetAudiences: audiences,
    keyScenes,
    currentSuggestion,
    strategyTags,
    contentCalendarDraft: buildContentCalendar({
      merchantName: input.merchant.name,
      serviceAnchor,
      strategyTags,
      sellingPoints,
    }),
    articleBrief: {
      workingTitle: `${serviceAnchor} 的 3 个高转化内容切口`,
      angle: `围绕 ${sellingPoints[0] || serviceAnchor} 做专业干货 + 场景共鸣`,
      callToAction: input.merchant.defaultCta[0] ?? "引导用户私信领取体验或咨询方案",
    },
    videoBrief: {
      workingTitle: `${input.merchant.name} 门店场景视频脚本`,
      hook: `先用 3 秒钩子把 ${audiences[0] || "高意向用户"} 的典型痛点说透`,
      outcome: "输出一条能直接进入视频工作台的门店信任感脚本",
    },
  };
}

async function resolveStrategyAssetEditorPatch(input: {
  state: ConsultationAgentLoopState;
  fallback: StrategyAssetEditorPatch;
}): Promise<StrategyAssetEditorPatch> {
  if (!getAiRuntimeApiKey()) {
    return input.fallback;
  }

  try {
    const messages = buildStrategyAssetEditorMessages(input.state);
    const response = await createStrategyAssetEditorCompletion({
      state: input.state,
      messages,
    });
    const toolCall = findStrategyAssetEditorToolCall(response.toolCalls);

    if (!toolCall) {
      const retryResponse = await createStrategyAssetEditorCompletion({
        state: input.state,
        model: response.model,
        messages: [
          ...messages,
          {
            role: "assistant",
            content: response.content || "",
          },
          {
            role: "user",
            content:
              "你上一次没有调用 update_strategy_asset_editor。请立刻调用该工具；如果本轮没有明确编辑，changedFields 传空数组。",
          },
        ],
      });
      const retryToolCall = findStrategyAssetEditorToolCall(retryResponse.toolCalls);

      if (!retryToolCall) {
        return input.fallback;
      }

      const retryParsed = parseStrategyAssetEditorToolArgs(
        retryToolCall.function.arguments,
      );

      return retryParsed.ok ? retryParsed.patch : input.fallback;
    }

    const parsed = parseStrategyAssetEditorToolArgs(toolCall.function.arguments);

    if (parsed.ok) {
      return parsed.patch;
    }

    const retryResponse = await createStrategyAssetEditorCompletion({
      state: input.state,
      model: response.model,
      messages: [
        ...messages,
        {
          role: "assistant",
          content: response.content || "",
          toolCalls: [toolCall],
        },
        {
          role: "tool",
          toolCallId: toolCall.id,
          content: buildStrategyAssetEditorValidationToolResult(parsed.error),
        },
      ],
    });
    const retryToolCall = findStrategyAssetEditorToolCall(retryResponse.toolCalls);

    if (!retryToolCall) {
      return input.fallback;
    }

    const retryParsed = parseStrategyAssetEditorToolArgs(
      retryToolCall.function.arguments,
    );

    return retryParsed.ok ? retryParsed.patch : input.fallback;
  } catch {
    return input.fallback;
  }
}

function buildStrategyAssetEditorMessages(
  state: ConsultationAgentLoopState,
): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是咨询 Agent 的策略资产编辑器，只负责把右侧策略资产作为一个完整文档改写。",
        "你必须调用 update_strategy_asset_editor 工具，并传入完整 strategyAsset 文档，不要只传局部字段。",
        "strategyAsset 必须包含 positioning、coreSellingPoints、targetAudiences、keyScenes、currentSuggestion 五个字段。",
        "如果用户要求追加、补充或把刚才提到的内容放进策略资产，你要基于 currentStrategySnapshot 合并，并结合 recentConversation 理解指代。",
        "如果用户说'这5个'、'这些'、'刚才你说的'，由你根据 recentConversation 判断具体条目；runtime 不会替你解析中文指代。",
        "只写干净业务内容，不要包含聊天口语、编辑动作、Markdown 标记、引号或额外解释。",
        "不要凭空补默认门店客群、到店人群或与当前商家不匹配的旧模板。",
        "如果用户只是追问、聊天或信息不足，strategyAsset 原样返回 currentStrategySnapshot，changedFields 传空数组。",
        "字段说明：positioning=我们是谁；targetAudiences=服务谁；keyScenes=核心场景；coreSellingPoints=核心卖点；currentSuggestion=当前建议。",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        userMessage: state.userContent,
        recentConversation: state.conversationMessages.slice(-8),
        recentUserMessages: state.userMessages.slice(-4),
        currentStrategySnapshot: {
          positioning: state.session.strategySnapshot.positioning,
          coreSellingPoints: state.session.strategySnapshot.coreSellingPoints,
          targetAudiences: state.session.strategySnapshot.targetAudiences,
          keyScenes: state.session.strategySnapshot.keyScenes,
          currentSuggestion: state.session.strategySnapshot.currentSuggestion,
        },
        limits: strategyAssetListLimits,
      }),
    },
  ];
}

async function createStrategyAssetEditorCompletion(input: {
  state: ConsultationAgentLoopState;
  messages: ChatMessage[];
  model?: string;
}) {
  return createChatCompletion({
    runtime: input.state.llmRuntime,
    model: input.model || input.state.consultationAgent.model,
    messages: input.messages,
    tools: [strategyAssetEditorTool],
    toolChoice: {
      type: "function",
      function: {
        name: "update_strategy_asset_editor",
      },
    },
  });
}

function findStrategyAssetEditorToolCall(toolCalls: AiRuntimeToolCall[]) {
  return toolCalls.find(
    (call) => call.function.name === "update_strategy_asset_editor",
  );
}

function buildStrategyAssetEditorValidationToolResult(error: string) {
  return JSON.stringify({
    ok: false,
    errorType: "tool_arguments_validation_failed",
    error,
    retryInstruction:
      "请重新调用 update_strategy_asset_editor。arguments 必须包含完整 strategyAsset 文档，并符合工具 schema；changedFields 只能标记本轮实际改动字段；字段值只能写干净业务正文，不要包含聊天口语、编辑动作、Markdown、引号或额外解释。",
  });
}

const strategyAssetEditorTool: AiRuntimeTool = {
  type: "function",
  function: {
    name: "update_strategy_asset_editor",
    description:
      "编辑右侧策略资产。传入完整 strategyAsset 文档；不要把聊天口语、Markdown 或编辑指令写入字段。",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        changedFields: {
          type: "array",
          items: {
            type: "string",
            enum: strategyAssetFieldKeys,
          },
          description: "本轮明确要更新的字段。没有明确编辑时传空数组。",
        },
        strategyAsset: {
          type: "object",
          additionalProperties: false,
          properties: {
            positioning: {
              type: "string",
              description: "产品/品牌定位的干净正文。",
            },
            coreSellingPoints: {
              type: "array",
              items: { type: "string" },
              maxItems: strategyAssetListLimits.coreSellingPoints,
              description: "完整核心卖点列表。",
            },
            targetAudiences: {
              type: "array",
              items: { type: "string" },
              maxItems: strategyAssetListLimits.targetAudiences,
              description: "完整目标客群列表。",
            },
            keyScenes: {
              type: "array",
              items: { type: "string" },
              maxItems: strategyAssetListLimits.keyScenes,
              description: "完整核心场景列表。",
            },
            currentSuggestion: {
              type: "string",
              description: "当前建议正文。",
            },
          },
          required: [
            "positioning",
            "coreSellingPoints",
            "targetAudiences",
            "keyScenes",
            "currentSuggestion",
          ],
        },
        changeSummary: {
          type: "string",
          description: "本轮修改摘要，给 runtime 记录用，不展示给商家。",
        },
      },
      required: ["changedFields", "strategyAsset"],
    },
  },
};

function parseStrategyAssetEditorToolArgs(
  value: string,
): StrategyAssetEditorToolParseResult {
  const parsed = parseJsonObject(value);

  if (!parsed) {
    return {
      ok: false,
      error: "工具 arguments 必须是合法的 JSON object。",
    };
  }

  const validated = strategyAssetEditorToolArgsSchema.safeParse(parsed);

  if (!validated.success) {
    return {
      ok: false,
      error: formatStrategyAssetEditorSchemaError(validated.error),
    };
  }

  return normalizeStrategyAssetEditorToolArgs(validated.data);
}

function normalizeStrategyAssetEditorToolArgs(
  args: StrategyAssetEditorToolArgs,
): StrategyAssetEditorToolParseResult {
  const changedFields = uniqueFieldKeys(args.changedFields);
  const patch = buildStrategyAssetSnapshotPatch(args.strategyAsset, changedFields);
  const invalidFields: StrategyAssetFieldKey[] = [];

  if (!patch.positioning) {
    invalidFields.push("positioning");
  }

  if (!patch.currentSuggestion) {
    invalidFields.push("currentSuggestion");
  }

  if (invalidFields.length > 0) {
    return {
      ok: false,
      error: `strategyAsset.${invalidFields.join("、")} 缺少可保存的非空值。`,
    };
  }

  return {
    ok: true,
    patch,
  };
}

function formatStrategyAssetEditorSchemaError(error: z.ZodError) {
  const details = error.issues
    .map((issue) => {
      const path = issue.path.join(".") || "arguments";
      return `${path}: ${issue.message}`;
    })
    .join("；");

  return details || "工具 arguments 不符合 update_strategy_asset_editor schema。";
}

function buildStrategyAssetSnapshotPatch(
  strategyAsset: Pick<
    StrategySnapshotDto,
    "positioning" | "coreSellingPoints" | "targetAudiences" | "keyScenes" | "currentSuggestion"
  >,
  changedFields: StrategyAssetFieldKey[] = [],
): StrategyAssetEditorPatch {
  return {
    positioning: cleanModelStrategyText(strategyAsset.positioning) ?? undefined,
    coreSellingPoints: cleanModelStrategyList(strategyAsset.coreSellingPoints),
    targetAudiences: cleanModelStrategyList(strategyAsset.targetAudiences),
    keyScenes: cleanModelStrategyList(strategyAsset.keyScenes),
    currentSuggestion: cleanModelStrategyText(strategyAsset.currentSuggestion) ?? undefined,
    changedFields: uniqueFieldKeys(changedFields),
  };
}

function mergeEditedStrategyList(input: {
  edited?: string[];
  fallback: string[];
  maxItems: number;
}) {
  const source = input.edited !== undefined ? input.edited : input.fallback;

  return uniqueStrings(source).slice(0, input.maxItems);
}

function cleanModelStrategyList(value: unknown) {
  return uniqueStrings(
    toStringArrayValue(value)
      .map(cleanModelStrategyText)
      .filter((item): item is string => Boolean(item)),
  ).slice(0, 10);
}

function cleanModelStrategyText(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized ? clipText(normalized, 180) : null;
}

function summarizeStrategyAssetEdit(edit: StrategyAssetEditorPatch) {
  const summaries = edit.changedFields
    .map((field) => {
      if (field === "targetAudiences" && edit.targetAudiences?.length) {
        return `目标客群 -> ${edit.targetAudiences.join("、")}`;
      }

      if (field === "coreSellingPoints" && edit.coreSellingPoints?.length) {
        return `核心卖点 -> ${edit.coreSellingPoints.join("、")}`;
      }

      if (field === "keyScenes" && edit.keyScenes?.length) {
        return `关键场景 -> ${edit.keyScenes.join("、")}`;
      }

      if (field === "positioning" && edit.positioning) {
        return `产品定位 -> ${clipText(edit.positioning, 48)}`;
      }

      if (field === "currentSuggestion" && edit.currentSuggestion) {
        return `当前建议 -> ${clipText(edit.currentSuggestion, 48)}`;
      }

      return null;
    })
    .filter((summary): summary is string => Boolean(summary));

  return summaries.join("；") || "策略资产";
}

function toStrategyAssetEditorPayload(edit: StrategyAssetEditorPatch) {
  return {
    mode: "strategy_asset_editor",
    changedFields: edit.changedFields,
    positioning: edit.positioning ?? null,
    coreSellingPoints: edit.coreSellingPoints ?? null,
    targetAudiences: edit.targetAudiences ?? null,
    keyScenes: edit.keyScenes ?? null,
    currentSuggestion: edit.currentSuggestion ?? null,
  };
}

function uniqueFieldKeys(values: StrategyAssetFieldKey[]) {
  const seen = new Set<StrategyAssetFieldKey>();
  const result: StrategyAssetFieldKey[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

function buildKnowledgeQuery(input: {
  merchant: MerchantProfileDto;
  userContent: string;
  previousSnapshot: StrategySnapshotDto;
}) {
  return [
    input.userContent,
    input.merchant.industry ?? "",
    input.merchant.serviceItems.join(" "),
    input.previousSnapshot.positioning,
    input.previousSnapshot.strategyTags.join(" "),
    input.previousSnapshot.targetAudiences.join(" "),
  ]
    .filter(Boolean)
    .join(" ");
}

function buildKnowledgeContextBlock(matches: KnowledgeSearchMatchDto[]) {
  if (matches.length === 0) {
    return null;
  }

  return {
    policy: "参考 hermes-agent/agent/prompt_builder.py：只注入已扫描并入库的受控上下文片段。",
    matches: matches.map((match) => ({
      documentTitle: match.documentTitle,
      chunkId: match.chunkId,
      scope: match.scope,
      score: match.score,
      excerpt: match.content.slice(0, 220),
    })),
  };
}

function buildKnowledgeReplyHint(matches: KnowledgeSearchMatchDto[]) {
  if (matches.length === 0) {
    return "";
  }

  const titles = uniqueStrings(matches.map((match) => match.documentTitle)).slice(0, 2);
  return `我还参考了「${titles.join("、")}」里的平台方法论或商家上下文片段，先把它作为受控上下文合并进判断。`;
}

function buildAgentLoopReplyHint(toolResults: ConsultationAgentToolResult[]) {
  const completedTools = toolResults
    .filter((result) => result.status === "completed")
    .map((result) => result.toolName);

  if (completedTools.length === 0) {
    return "";
  }

  return `我按 ${completedTools.length} 个能力步骤跑完一轮诊断（${completedTools
    .slice(0, 4)
    .join(" / ")}）。`;
}

function isStrategySnapshot(value: unknown): value is StrategySnapshotDto {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.positioning === "string" &&
    Array.isArray(record.coreSellingPoints) &&
    Array.isArray(record.targetAudiences) &&
    Array.isArray(record.keyScenes) &&
    typeof record.currentSuggestion === "string" &&
    Array.isArray(record.strategyTags) &&
    Array.isArray(record.contentCalendarDraft)
  );
}

function buildContentCalendar(input: {
  merchantName: string;
  serviceAnchor: string;
  strategyTags: string[];
  sellingPoints: string[];
}): StrategySnapshotDto["contentCalendarDraft"] {
  const tags = input.strategyTags.length > 0 ? input.strategyTags : ["专业人设", "场景种草", "到店转化"];
  const sellingPoint = input.sellingPoints[0] || input.serviceAnchor;

  return [
    {
      id: randomUUID(),
      dayLabel: "周一",
      contentType: "article",
      strategyTag: tags[0],
      title: `${input.serviceAnchor} 常见误区拆解`,
      summary: `用一篇干货内容把 ${sellingPoint} 的专业价值讲清楚。`,
    },
    {
      id: randomUUID(),
      dayLabel: "周三",
      contentType: "video",
      strategyTag: tags[1] ?? tags[0],
      title: `${input.merchantName} 门店一镜到底体验`,
      summary: "展示门店环境、真实体验流程和用户会感知到的安全感。",
    },
    {
      id: randomUUID(),
      dayLabel: "周五",
      contentType: "article",
      strategyTag: tags[2] ?? tags[0],
      title: `${input.serviceAnchor} 到店前最常见的顾虑`,
      summary: "正面回答价格、效果、时间安排等成交前异议。",
    },
    {
      id: randomUUID(),
      dayLabel: "周日",
      contentType: "video",
      strategyTag: tags.at(-1) ?? tags[0],
      title: "体验邀约短视频",
      summary: "把咨询动作落到私信、预约或体验券领取上。",
    },
  ];
}

function extractKeywordMatches(source: string, keywords: string[]) {
  return keywords.filter((keyword) => source.includes(keyword));
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toStringArrayValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return typeof value === "string" ? [value] : [];
}

function clipText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}
