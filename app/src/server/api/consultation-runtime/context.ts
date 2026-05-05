import type { StrategySnapshotDto } from "@/contracts/consultation";
import type { MerchantProfileDto } from "@/contracts/merchant";
import type { KnowledgeSearchMatchDto } from "@/contracts/knowledge";
import type {
  ConsultationAgentRuntimeSettings,
  ConsultationAgentToolResult,
  ConsultationMentionRouting,
  ExpertTurnNote,
  SharedConsultationState,
} from "@/server/api/consultation-runtime/types";
import { getConsultationBusinessToolCatalog } from "@/server/api/consultation-runtime/tools";
import { clipText, uniqueStrings } from "@/server/api/consultation-runtime/utils";

export type ContextBudgetReport = {
  policy: "char_budget_v1";
  totalChars: number;
  buckets: Array<{
    key: string;
    chars: number;
    limit: number;
    truncated: boolean;
  }>;
};

export function buildExpertContainerPrompt(
  consultationAgent: ConsultationAgentRuntimeSettings,
) {
  if (!consultationAgent.container) {
    return "【专家容器】当前使用默认咨询 Agent。";
  }

  const { agent } = consultationAgent.container;

  return [
    "【专家容器】",
    `当前专家：${agent.displayName} (${agent.agentKey})。`,
    agent.roleDescription ? `角色说明：${agent.roleDescription}` : "",
    agent.description ? `后台描述：${agent.description}` : "",
    "专家只决定本轮身份、能力与知识边界；整场咨询上下文由 runtime 的 ContextInjector 提供。",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildConsultationContextInjection(input: {
  merchant: MerchantProfileDto;
  round: number;
  userContent: string;
  sessionSummary?: string | null;
  strategySnapshot: StrategySnapshotDto;
  strategyMarkdown?: string | null;
  consultationAgent: ConsultationAgentRuntimeSettings;
  knowledgeMatches: KnowledgeSearchMatchDto[];
  toolResults: ConsultationAgentToolResult[];
  sharedConsultationState: SharedConsultationState;
  expertTurnNotes: ExpertTurnNote[];
}) {
  const sessionSummary = input.sessionSummary ?? null;
  const budget = buildContextBudgetReport({
    merchant: input.merchant,
    strategySnapshot: input.strategySnapshot,
    strategyMarkdown: input.strategyMarkdown ?? "",
    userContent: input.userContent,
    sessionSummary,
    knowledgeMatches: input.knowledgeMatches,
    toolResults: input.toolResults,
    consultationAgent: input.consultationAgent,
    sharedConsultationState: input.sharedConsultationState,
    expertTurnNotes: input.expertTurnNotes,
  });

  return {
    policy: "consultation_context_injector_v1",
    runtimeBoundary:
      "共享咨询上下文独立于专家容器；@ 只切换目标专家，不清空历史与策略资产。",
    budget,
    targetExpert: input.consultationAgent.container
      ? {
          agentId: input.consultationAgent.container.agent.id,
          agentKey: input.consultationAgent.container.agent.agentKey,
          displayName: input.consultationAgent.container.agent.displayName,
          activePromptVersion:
            input.consultationAgent.container.activePromptVersion?.versionNo ?? null,
          knowledgeSetIds: input.consultationAgent.container.knowledgeSetIds,
          knowledgeDocumentIds: input.consultationAgent.container.knowledgeDocumentIds,
        }
      : null,
    mentionRouting: input.consultationAgent.container
      ? {
          activeAgentId: input.consultationAgent.container.agent.id,
          activeAgentKey: input.consultationAgent.container.agent.agentKey,
          activeDisplayName: input.consultationAgent.container.agent.displayName,
        }
      : null,
    sessionContext: {
      merchantId: input.merchant.id,
      merchantName: input.merchant.name,
      round: input.round,
      sessionSummary,
      latestUserMessage: input.userContent,
      strategySnapshot: input.strategySnapshot,
      strategyMarkdown: input.strategyMarkdown ?? "",
      knowledgeMatchCount: input.knowledgeMatches.length,
      toolResults: input.toolResults.map((result) => ({
        label: getConsultationContextToolLabel(result.toolName),
        status: result.status,
        summary: result.summary,
        })),
    },
    expertTraffic: buildExpertTrafficContextBlock({
      sharedConsultationState: input.sharedConsultationState,
      expertTurnNotes: input.expertTurnNotes,
    }),
  };
}

export function buildContextBudgetReport(input: {
  merchant: MerchantProfileDto;
  strategySnapshot: StrategySnapshotDto;
  strategyMarkdown?: string | null;
  userContent: string;
  sessionSummary: string | null;
  consultationAgent: ConsultationAgentRuntimeSettings;
  knowledgeMatches: KnowledgeSearchMatchDto[];
  toolResults: ConsultationAgentToolResult[];
  sharedConsultationState?: SharedConsultationState | null;
  expertTurnNotes?: ExpertTurnNote[];
}): ContextBudgetReport {
  const buckets = [
    buildBudgetBucket("merchant", input.merchant, 1600),
    buildBudgetBucket("strategySnapshot", input.strategySnapshot, 2600),
    buildBudgetBucket("strategyMarkdown", input.strategyMarkdown ?? "", 8000),
    buildBudgetBucket("currentUserMessage", input.userContent, 1000),
    buildBudgetBucket("sessionSummary", input.sessionSummary ?? "", 1200),
    buildBudgetBucket("activeSkillBodies", input.consultationAgent.activeSkills.map((skill) => skill.body), 4200),
    buildBudgetBucket("knowledgeMatches", input.knowledgeMatches.map((match) => match.content), 4200),
    buildBudgetBucket("toolResults", input.toolResults.map((result) => result.summary), 1600),
    buildBudgetBucket("sharedConsultationState", input.sharedConsultationState ?? null, 2400),
    buildBudgetBucket("expertTurnNotes", input.expertTurnNotes ?? [], 3200),
  ];

  return {
    policy: "char_budget_v1",
    totalChars: buckets.reduce((sum, bucket) => sum + bucket.chars, 0),
    buckets,
  };
}

function buildBudgetBucket(key: string, value: unknown, limit: number) {
  const chars = JSON.stringify(value ?? "").length;

  return {
    key,
    chars,
    limit,
    truncated: chars > limit,
  };
}

function getConsultationContextToolLabel(
  toolName: ConsultationAgentToolResult["toolName"],
) {
  return (
    getConsultationBusinessToolCatalog().find((tool) => tool.key === toolName)?.label ??
    "咨询步骤"
  );
}

export function buildContextInjectionSystemPrompt(
  contextInjection: ReturnType<typeof buildConsultationContextInjection>,
) {
  return [
    "【上下文工程注入器】",
    contextInjection.runtimeBoundary,
    "你必须把 sessionContext 视为本轮共享事实层，不能因为切换专家而遗忘先前策略资产。",
    "如果 targetExpert 为空，使用默认咨询身份；如果不为空，遵循该专家身份和知识边界。",
    "【短期专家交通】",
    "expertTraffic 是当前 session 内的短期共享白板，不是长期 memory，也不是用户本轮新输入。",
    "当 recentExpertTurnNotes 中有上一位专家的结论、未解决问题或 handoffForNextExpert 时，本轮专家必须接住这些信息，避免从零开始。",
    "专家之间只通过 sharedConsultationState 与 ExpertTurnNote 交接；不要模拟后台专家对话，也不要让多个专家并发抢答。",
  ].join("\n");
}

export function buildKnowledgeContextBlock(matches: KnowledgeSearchMatchDto[]) {
  if (matches.length === 0) {
    return null;
  }

  return {
    policy: "controlled_context_chunks_only",
    matches: matches.map((match) => ({
      documentTitle: match.documentTitle,
      chunkId: match.chunkId,
      scope: match.scope,
      score: match.score,
      excerpt: match.content.slice(0, 220),
    })),
  };
}

export function buildSharedConsultationState(input: {
  merchant: MerchantProfileDto;
  strategySnapshot: StrategySnapshotDto;
  strategyMarkdown?: string | null;
  userContent: string;
  sessionSummary?: string | null;
  mentionRouting: ConsultationMentionRouting;
  expertTurnNotes: ExpertTurnNote[];
}): SharedConsultationState {
  const merchantFacts = uniqueStrings([
    input.strategySnapshot.positioning,
    ...input.strategySnapshot.coreSellingPoints,
    ...input.strategySnapshot.targetAudiences,
    ...input.strategySnapshot.keyScenes,
  ])
    .filter(Boolean)
    .slice(0, 10);
  const openQuestions = uniqueStrings(
    input.expertTurnNotes.flatMap((note) => note.openQuestionsForUser),
  ).slice(0, 6);
  const strategySnapshotSummary = [
    input.strategySnapshot.positioning,
    input.strategySnapshot.currentSuggestion,
  ]
    .filter(Boolean)
    .join(" / ");

  return {
    merchantProfileSummary: clipText(
      [
        input.merchant.name,
        input.merchant.industry,
        input.merchant.serviceItems.length > 0
          ? `服务项目：${input.merchant.serviceItems.join("、")}`
          : "",
        input.merchant.defaultCta.length > 0
          ? `默认 CTA：${input.merchant.defaultCta.join("、")}`
          : "",
      ]
        .filter(Boolean)
        .join("；"),
      520,
    ),
    currentGoal: input.strategySnapshot.currentSuggestion || input.sessionSummary || null,
    knownFacts: merchantFacts,
    openQuestions,
    strategySnapshotSummary: clipText(strategySnapshotSummary || input.strategyMarkdown || "", 700),
    expertTurnNotes: input.expertTurnNotes,
    unresolvedConflicts: [],
    latestUserIntent: clipText(
      [
        input.mentionRouting.rawMention ? `用户指定 ${input.mentionRouting.rawMention}` : "",
        input.userContent,
      ]
        .filter(Boolean)
        .join(" "),
      700,
    ),
  };
}

export function buildExpertTurnNotes(input: {
  sessionMessages: Array<{
    id: string;
    role: string;
    visibleSummary?: Record<string, unknown> | null;
    createdAt?: string | null;
  }>;
  limit?: number;
}): ExpertTurnNote[] {
  const limit = input.limit ?? 4;

  return input.sessionMessages
    .filter((message) => message.role === "assistant")
    .map(readExpertTurnNoteFromVisibleSummary)
    .filter((note): note is ExpertTurnNote => note !== null)
    .slice(-limit);
}

export function buildExpertTrafficContextBlock(input: {
  sharedConsultationState: SharedConsultationState;
  expertTurnNotes: ExpertTurnNote[];
}) {
  return {
    policy: "short_term_expert_traffic_v1",
    description:
      "short-term expert traffic：同一咨询 session 内的共享状态和专家回执。它只用于短期交通，不写入长期 memory。",
    sharedConsultationState: input.sharedConsultationState,
    recentExpertTurnNotes: input.expertTurnNotes.map((note) => ({
      agentId: note.agentId,
      agentKey: note.agentKey,
      displayName: note.displayName,
      turnId: note.turnId,
      whatIUnderstood: note.whatIUnderstood,
      whatIChanged: note.whatIChanged,
      openQuestionsForUser: note.openQuestionsForUser,
      handoffForNextExpert: note.handoffForNextExpert,
      confidence: note.confidence,
    })),
  };
}

export function buildLatestExpertTurnNote(input: {
  sessionId: string;
  round: number;
  consultationAgent: ConsultationAgentRuntimeSettings;
  userContent: string;
  strategySnapshot: StrategySnapshotDto;
  toolResults: ConsultationAgentToolResult[];
  assistantContent: string;
}): ExpertTurnNote {
  const agent = input.consultationAgent.container?.agent ?? null;
  const changedSummary = summarizeExpertChanges(input.toolResults);
  const openQuestionsForUser = extractOpenQuestions(input.assistantContent);
  const whatIUnderstood = clipText(
    [
      input.userContent,
      input.strategySnapshot.currentSuggestion,
    ]
      .filter(Boolean)
      .join(" / "),
    520,
  );

  return {
    agentId: agent?.id ?? null,
    agentKey: agent?.agentKey ?? null,
    displayName: agent?.displayName ?? null,
    turnId: `${input.sessionId}:round:${input.round}:agent:${agent?.agentKey ?? "default"}`,
    whatIUnderstood,
    whatIChanged: changedSummary,
    openQuestionsForUser,
    handoffForNextExpert: clipText(
      [
        changedSummary,
        openQuestionsForUser.length > 0
          ? `下一位专家优先接这个问题：${openQuestionsForUser[0]}`
          : `下一位专家可继续围绕当前建议推进：${input.strategySnapshot.currentSuggestion}`,
      ].join(" "),
      620,
    ),
    confidence: resolveExpertTurnConfidence(input.toolResults, openQuestionsForUser),
    createdAt: new Date().toISOString(),
  };
}

function readExpertTurnNoteFromVisibleSummary(message: {
  id: string;
  visibleSummary?: Record<string, unknown> | null;
}): ExpertTurnNote | null {
  const expertTraffic = readRecord(readRecord(message.visibleSummary?.agentLoop)?.expertTraffic);
  const rawNote =
    readRecord(expertTraffic?.latestExpertTurnNote) ??
    readRecord(readRecord(message.visibleSummary?.agentLoop)?.latestExpertTurnNote);

  if (!rawNote) {
    return null;
  }

  return normalizeExpertTurnNote(rawNote, message.id);
}

function normalizeExpertTurnNote(
  rawNote: Record<string, unknown>,
  fallbackTurnId: string,
): ExpertTurnNote | null {
  const whatIUnderstood = stringValue(rawNote.whatIUnderstood);
  const whatIChanged = stringValue(rawNote.whatIChanged);
  const handoffForNextExpert = stringValue(rawNote.handoffForNextExpert);

  if (!whatIUnderstood && !whatIChanged && !handoffForNextExpert) {
    return null;
  }

  return {
    agentId: nullableStringValue(rawNote.agentId),
    agentKey: nullableStringValue(rawNote.agentKey),
    displayName: nullableStringValue(rawNote.displayName),
    turnId: stringValue(rawNote.turnId) || fallbackTurnId,
    whatIUnderstood: clipText(whatIUnderstood || handoffForNextExpert, 520),
    whatIChanged: clipText(whatIChanged || "上一轮专家未记录明确改动。", 420),
    openQuestionsForUser: stringArrayValue(rawNote.openQuestionsForUser).slice(0, 6),
    handoffForNextExpert: clipText(
      handoffForNextExpert || whatIChanged || whatIUnderstood,
      620,
    ),
    confidence: confidenceValue(rawNote.confidence),
    createdAt: nullableStringValue(rawNote.createdAt),
  };
}

function summarizeExpertChanges(toolResults: ConsultationAgentToolResult[]) {
  const completed = toolResults.filter((result) => result.status === "completed");

  if (completed.length === 0) {
    return "本轮没有写入新的策略资产或内容任务，主要完成理解、追问或风险确认。";
  }

  return clipText(
    completed
      .map((result) => `${getConsultationContextToolLabel(result.toolName)}：${result.summary}`)
      .join("；"),
    620,
  );
}

function extractOpenQuestions(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  const questions = normalized
    .split(/(?<=[？?])/u)
    .map((part) => part.trim())
    .filter((part) => /[？?]$/.test(part))
    .map((part) => clipText(part, 220));

  return uniqueStrings(questions).slice(0, 4);
}

function resolveExpertTurnConfidence(
  toolResults: ConsultationAgentToolResult[],
  openQuestionsForUser: string[],
): ExpertTurnNote["confidence"] {
  if (toolResults.some((result) => result.toolName === "update_strategy_snapshot" && result.status === "completed")) {
    return "high";
  }

  if (openQuestionsForUser.length > 0) {
    return "medium";
  }

  return "low";
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableStringValue(value: unknown) {
  const normalized = stringValue(value);
  return normalized || null;
}

function stringArrayValue(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter(Boolean)
    : [];
}

function confidenceValue(value: unknown): ExpertTurnNote["confidence"] {
  return value === "high" || value === "medium" || value === "low" ? value : "medium";
}
