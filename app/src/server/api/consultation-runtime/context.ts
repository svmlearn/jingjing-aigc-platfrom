import type { StrategySnapshotDto } from "@/contracts/consultation";
import type { MerchantProfileDto } from "@/contracts/merchant";
import type { KnowledgeSearchMatchDto } from "@/contracts/knowledge";
import type { ChatMessage } from "@/server/api/ai-runtime";
import type {
  ConsultationAgentLoopState,
  ConsultationAgentRuntimeSettings,
  ConsultationAgentToolResult,
  ConsultationMentionRouting,
  ExpertTurnNote,
  SharedConsultationState,
} from "@/server/api/consultation-runtime/types";
import { getConsultationBusinessToolCatalog } from "@/server/api/consultation-runtime/tools";
import { clipText, uniqueStrings } from "@/server/api/consultation-runtime/utils";
import type {
  ConsultationContextPreflightAction,
  ConsultationContextPreflightReport,
} from "@/server/api/consultation-runtime/context-preflight";
export type {
  ConsultationContextPreflightAction,
  ConsultationContextPreflightReport,
} from "@/server/api/consultation-runtime/context-preflight";
export {
  enforceConsultationMessageBudget,
} from "@/server/api/consultation-runtime/context-preflight";

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

export type ConsultationContextBoundarySnapshot = {
  policy: "consultation_context_boundary_v1";
  boundaryId: string;
  budget: ContextBudgetReport;
  compactBoundary: {
    policy: "context_compact_boundary_v1";
    status: "applied" | "not_applied";
    reason: string;
    reports: ConsultationContextPreflightReport[];
  };
  budgetBuckets: ContextBudgetReport["buckets"];
  sources: Record<string, unknown>;
};

export type ConsultationContextPackMode = "slim_v2";

export type ConsultationSelectedContextPack =
  | "light_chat"
  | "strategy_edit"
  | "knowledge_answer"
  | "calendar_work"
  | "benchmark_search"
  | "history_reference";

export type ConsultationContextOmission = {
  field: string;
  reason:
    | "not_relevant_to_intent"
    | "over_budget"
    | "debug_only"
    | "duplicate_authority"
    | "legacy_field_removed";
  availableInDebug: boolean;
};

export type ConsultationSelectedKnowledgeMatch = {
  documentTitle: string;
  chunkId: string;
  documentId: string;
  scope: KnowledgeSearchMatchDto["scope"];
  score: number;
  content: string;
  query: string | null;
  toolCallId: string | null;
  turn: number | null;
  freshness: "current_turn" | "history" | "unknown";
  evidenceRole:
    | "project_fact"
    | "methodology"
    | "sales_talk"
    | "material_capability"
    | "benchmark_content"
    | "merchant_memory"
    | "conversation_history"
    | "general";
};

export type ConsultationSlimContextPack = {
  policy: "consultation_context_pack_selector_v2";
  contextPackMode: ConsultationContextPackMode;
  selectedContextPack: ConsultationSelectedContextPack;
  expertRouting: {
    activeAgentKey: string | null;
    activeDisplayName: string | null;
    roleDescription: string | null;
    knowledgeSetIds: string[];
    knowledgeDocumentIds: string[];
    rawMention: string | null;
  };
  selectedKnowledgeMatches: ConsultationSelectedKnowledgeMatch[];
  selectedContextDecision: {
    intent: ConsultationSelectedContextPack;
    included: string[];
    omitted: ConsultationContextOmission[];
  };
  debug: {
    budget: ContextBudgetReport;
    allKnowledgeMatchCount: number;
    selectedKnowledgeMatchIds: string[];
  };
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
    "专家只决定本轮身份、能力与知识边界；整场咨询上下文由 runtime 选择后的 slim context pack 提供。",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAgentSoulPrompt(
  consultationAgent: ConsultationAgentRuntimeSettings,
) {
  if (!consultationAgent.container?.activeSoulVersion || !consultationAgent.soulPrompt?.trim()) {
    return null;
  }

  return [
    "【soul.md】",
    "以下定义当前专家人格、语气、acknowledgement 和互动节奏。必须遵循，但不得覆盖 agent.md、平台硬规则或账号安全边界。",
    consultationAgent.soulPrompt,
  ].join("\n");
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
          activeSoulVersion:
            input.consultationAgent.container.activeSoulVersion?.versionNo ?? null,
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
    buildBudgetBucket("soul.md", input.consultationAgent.soulPrompt ?? "", 1600),
    buildBudgetBucket("activeSkillBodies", input.consultationAgent.activeSkills.map((skill) => skill.body), 4200),
    buildBudgetBucket("activeSkillReferences", input.consultationAgent.activeSkills.map((skill) => skill.references), 1200),
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

export function buildConsultationSlimContextPack(input: {
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
  mentionRouting: ConsultationMentionRouting;
}): ConsultationSlimContextPack {
  const selectedContextPack = resolveSelectedContextPack(input.userContent);
  const budget = buildContextBudgetReport({
    merchant: input.merchant,
    strategySnapshot: input.strategySnapshot,
    strategyMarkdown: input.strategyMarkdown ?? "",
    userContent: input.userContent,
    sessionSummary: input.sessionSummary ?? null,
    consultationAgent: input.consultationAgent,
    knowledgeMatches: input.knowledgeMatches,
    toolResults: input.toolResults,
    sharedConsultationState: input.sharedConsultationState,
    expertTurnNotes: input.expertTurnNotes,
  });
  const selectedKnowledgeMatches = buildSelectedKnowledgeMatches({
    matches: shouldIncludeKnowledgeInContext(selectedContextPack)
      ? input.knowledgeMatches
      : [],
    round: input.round,
    limit: 5,
  });
  const omitted = buildContextOmissions({
    selectedContextPack,
    budget,
    selectedKnowledgeMatches,
    allKnowledgeMatchCount: input.knowledgeMatches.length,
  });
  const included = [
    "merchant",
    "userMessage",
    "round",
    "expertRouting",
    "strategySnapshot",
    selectedKnowledgeMatches.length > 0 ? "currentKnowledgeMatches" : null,
  ].filter((field): field is string => Boolean(field));

  return {
    policy: "consultation_context_pack_selector_v2",
    contextPackMode: "slim_v2",
    selectedContextPack,
    expertRouting: buildExpertRoutingContext({
      consultationAgent: input.consultationAgent,
      mentionRouting: input.mentionRouting,
    }),
    selectedKnowledgeMatches,
    selectedContextDecision: {
      intent: selectedContextPack,
      included,
      omitted,
    },
    debug: {
      budget,
      allKnowledgeMatchCount: input.knowledgeMatches.length,
      selectedKnowledgeMatchIds: selectedKnowledgeMatches.map((match) => match.chunkId),
    },
  };
}

export function buildContextBoundarySnapshot(input: {
  state: ConsultationAgentLoopState;
  toolResults: ConsultationAgentToolResult[];
}): ConsultationContextBoundarySnapshot {
  const { state } = input;
  const slimContextPack = buildConsultationSlimContextPack({
    merchant: state.merchant,
    round: state.nextRound,
    userContent: state.userContent,
    sessionSummary: state.session.summaryText ?? null,
    strategySnapshot: state.strategySnapshot,
    strategyMarkdown: state.strategyMarkdown,
    consultationAgent: state.consultationAgent,
    knowledgeMatches: state.knowledgeMatches,
    toolResults: input.toolResults,
    sharedConsultationState: state.sharedConsultationState,
    expertTurnNotes: state.expertTurnNotes,
    mentionRouting: state.mentionRouting,
  });
  const budget = slimContextPack.debug.budget;
  const agentContainer = state.consultationAgent.container;
  const recentConversation = state.conversationMessages.slice(-8);
  const memoryMatches = state.knowledgeMatches.filter(
    (match) => match.metadata.contentKind === "merchant_memory",
  );
  const preflightReports = normalizePreflightReports(state.contextPreflightReports ?? []);
  const preflightApplied = preflightReports.some(
    (report) => report.clippedMessageCount > 0 || report.omittedMessageCount > 0,
  );

  return {
    policy: "consultation_context_boundary_v1",
    boundaryId: `${state.session.id}:round:${state.nextRound}:context`,
    budget,
    compactBoundary: {
      policy: "context_compact_boundary_v1",
      status: preflightApplied ? "applied" : "not_applied",
      reason: preflightApplied
        ? "consultation_context_preflight_enforcer_v1_applied_before_llm_call"
        : "consultation_context_preflight_enforcer_v1_checked_no_compaction_needed",
      reports: preflightReports,
    },
    budgetBuckets: budget.buckets,
    sources: {
      session: {
        sessionId: state.session.id,
        round: state.nextRound,
        summaryPresent: Boolean(state.session.summaryText?.trim()),
        summaryChars: state.session.summaryText?.length ?? 0,
        previousMessageCount: state.session.messages.length,
        conversationMessageCount: state.conversationMessages.length,
        recentConversation: recentConversation.map((message, index) => ({
          offsetFromTail: recentConversation.length - index,
          role: message.role,
          chars: message.content.length,
        })),
      },
      currentUserMessage: {
        chars: state.userContent.length,
        mentionRouting: state.mentionRouting,
      },
      strategyAsset: {
        markdownChars: state.strategyMarkdown.length,
        strategyTags: state.strategySnapshot.strategyTags,
        fieldCounts: {
          coreSellingPoints: state.strategySnapshot.coreSellingPoints.length,
          targetAudiences: state.strategySnapshot.targetAudiences.length,
          keyScenes: state.strategySnapshot.keyScenes.length,
          contentCalendarDraft: state.strategySnapshot.contentCalendarDraft.length,
        },
        hasArticleBrief: Boolean(state.strategySnapshot.articleBrief),
        hasVideoBrief: Boolean(state.strategySnapshot.videoBrief),
      },
      agentAssets: {
        agentId: agentContainer?.agent.id ?? null,
        agentKey: agentContainer?.agent.agentKey ?? null,
        promptVersionId: agentContainer?.activePromptVersion?.id ?? null,
        promptVersionNo: agentContainer?.activePromptVersion?.versionNo ?? null,
        soulVersionId: agentContainer?.activeSoulVersion?.id ?? null,
        soulVersionNo: agentContainer?.activeSoulVersion?.versionNo ?? null,
      },
      skills: {
        candidateSkillIds: state.consultationAgent.skillCatalog.map((skill) => skill.id),
        activeSkillIds: state.consultationAgent.activeSkills.map((skill) => skill.id),
        activeSkillReferenceCount: state.consultationAgent.activeSkills.reduce(
          (sum, skill) => sum + skill.references.length,
          0,
        ),
      },
      knowledge: {
        policy: "controlled_context_chunks_only",
        matchCount: state.knowledgeMatches.length,
        matchIds: uniqueStrings(state.knowledgeMatches.map((match) => match.chunkId)),
        selectedMatchIds: slimContextPack.debug.selectedKnowledgeMatchIds,
        selectedMatches: slimContextPack.selectedKnowledgeMatches.map((match) => ({
          chunkId: match.chunkId,
          documentId: match.documentId,
          documentTitle: match.documentTitle,
          score: match.score,
          query: match.query,
          toolCallId: match.toolCallId,
          turn: match.turn,
          freshness: match.freshness,
          evidenceRole: match.evidenceRole,
        })),
        matches: state.knowledgeMatches.map((match) => ({
          chunkId: match.chunkId,
          documentId: match.documentId,
          documentTitle: match.documentTitle,
          scope: match.scope,
          score: match.score,
          contentKind: match.metadata.contentKind ?? null,
        })),
        memoryMatchIds: uniqueStrings(memoryMatches.map((match) => match.chunkId)),
      },
      tools: {
        count: input.toolResults.length,
        completed: input.toolResults
          .filter((result) => result.status === "completed")
          .map((result) => result.toolName),
        skipped: input.toolResults
          .filter((result) => result.status === "skipped")
          .map((result) => result.toolName),
        failed: input.toolResults
          .filter((result) => result.status === "failed")
          .map((result) => result.rawToolName ?? result.toolName),
        results: input.toolResults.map((result) => ({
          callId: result.callId,
          toolName: result.toolName,
          rawToolName: result.rawToolName ?? null,
          status: result.status,
          summary: result.summary,
          errorType: result.payload.errorType ?? null,
        })),
      },
      expertTraffic: {
        sharedStateKnownFacts: state.sharedConsultationState.knownFacts.length,
        sharedStateOpenQuestions: state.sharedConsultationState.openQuestions.length,
        expertTurnNoteCount: state.expertTurnNotes.length,
      },
      selectedContext: {
        contextPackMode: slimContextPack.contextPackMode,
        selectedContextPack: slimContextPack.selectedContextPack,
        selectedContextDecision: slimContextPack.selectedContextDecision,
        omittedContext: slimContextPack.selectedContextDecision.omitted,
      },
    },
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

function normalizePreflightReports(
  reports: Record<string, unknown>[],
): ConsultationContextPreflightReport[] {
  return reports
    .map((report) => {
      const record = readRecord(report);

      if (!record || record.policy !== "consultation_context_preflight_enforcer_v1") {
        return null;
      }

      const actions = Array.isArray(record.actions)
        ? record.actions
            .map((action) => readRecord(action))
            .filter((action): action is Record<string, unknown> => Boolean(action))
            .map((action) => ({
              messageIndex: typeof action.messageIndex === "number" ? action.messageIndex : -1,
              role: isChatMessageRole(action.role) ? action.role : "user",
              reason: isPreflightActionReason(action.reason)
                ? action.reason
                : "message_omitted",
              beforeChars: typeof action.beforeChars === "number" ? action.beforeChars : 0,
              afterChars: typeof action.afterChars === "number" ? action.afterChars : 0,
            }))
        : [];
      const maxTotalChars = typeof record.maxTotalChars === "number" ? record.maxTotalChars : 0;
      const finalChars = typeof record.finalChars === "number" ? record.finalChars : 0;

      return {
        policy: "consultation_context_preflight_enforcer_v1",
        phase: typeof record.phase === "string" ? record.phase : "unknown",
        maxTotalChars,
        originalChars: typeof record.originalChars === "number" ? record.originalChars : 0,
        finalChars,
        clippedMessageCount:
          typeof record.clippedMessageCount === "number" ? record.clippedMessageCount : 0,
        omittedMessageCount:
          typeof record.omittedMessageCount === "number" ? record.omittedMessageCount : 0,
        hardBudgetSatisfied:
          typeof record.hardBudgetSatisfied === "boolean"
            ? record.hardBudgetSatisfied
            : finalChars <= maxTotalChars,
        overflowReason:
          typeof record.overflowReason === "string" ? record.overflowReason : null,
        actions,
      };
    })
    .filter((report): report is ConsultationContextPreflightReport => Boolean(report));
}

function isChatMessageRole(value: unknown): value is ChatMessage["role"] {
  return value === "system" || value === "user" || value === "assistant" || value === "tool";
}

function isPreflightActionReason(
  value: unknown,
): value is ConsultationContextPreflightAction["reason"] {
  return (
    value === "system_clipped" ||
    value === "user_json_compacted" ||
    value === "user_clipped" ||
    value === "tool_result_compacted" ||
    value === "assistant_clipped" ||
    value === "message_omitted" ||
    value === "hard_budget_unavoidable"
  );
}

function getConsultationContextToolLabel(
  toolName: ConsultationAgentToolResult["toolName"],
) {
  if (toolName === "unknown_tool") {
    return "工具校验失败";
  }

  if (toolName === "request_user_clarification") {
    return "需要用户补充";
  }

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

export function buildSlimContextPackSystemPrompt(
  contextPack: ConsultationSlimContextPack,
) {
  const lines = [
    "【上下文包 slim_v2】",
    `本轮上下文包：${contextPack.selectedContextPack}。`,
    "主模型只能把 user JSON 顶层 strategySnapshot 视为当前策略资产权威入口；不要假设还有另一份隐藏策略资产。",
    "currentKnowledgeMatches 只代表本轮被选择的 evidence；未出现在其中的历史知识命中，不要当成本轮依据。",
    "工具结果的权威来源只能是 native role=tool 消息或 JSON tool_result；不要依赖 user JSON 中的重复工具摘要。",
    "内部调试字段只用于 runtimeSnapshot，不要向用户暴露。",
    "如果工具结果是 skipped、failed、guardrail rejected 或未完成，最终回复必须承认本轮未写入或未完成，不能声称已经更新。",
  ];

  if (contextPack.selectedKnowledgeMatches.length > 0) {
    lines.push(
      `本轮 selected evidence 数量：${contextPack.selectedKnowledgeMatches.length}。由你结合用户问题判断如何引用，不能编造未提供的事实。`,
    );
  }

  return lines.join("\n");
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

function buildExpertRoutingContext(input: {
  consultationAgent: ConsultationAgentRuntimeSettings;
  mentionRouting: ConsultationMentionRouting;
}): ConsultationSlimContextPack["expertRouting"] {
  const container = input.consultationAgent.container;

  return {
    activeAgentKey: container?.agent.agentKey ?? input.mentionRouting.targetAgentKey,
    activeDisplayName: container?.agent.displayName ?? input.mentionRouting.targetDisplayName,
    roleDescription: container?.agent.roleDescription ?? null,
    knowledgeSetIds: container?.knowledgeSetIds ?? [],
    knowledgeDocumentIds: container?.knowledgeDocumentIds ?? [],
    rawMention: input.mentionRouting.rawMention,
  };
}

function resolveSelectedContextPack(userContent: string): ConsultationSelectedContextPack {
  const normalized = userContent.toLowerCase();

  if (/(刚才|上次|前面|之前|历史|回顾)/u.test(userContent)) {
    return "history_reference";
  }

  if (/(对标|爆款|小红书|抖音|博主|竞品|链接|主页|评论区)/u.test(userContent)) {
    return "benchmark_search";
  }

  if (/(日历|选题|团队内容|图文|视频|脚本|标题|摘要|周一|周二|周三|周四|周五|周六|周日|下周|本周)/u.test(userContent)) {
    return "calendar_work";
  }

  if (/(知识库|资料|文件|文档|总结|盘点|读取|检索|方法论|话术|素材)/u.test(userContent)) {
    return "knowledge_answer";
  }

  if (/(策略|定位|卖点|客群|场景|建议|资产|沉淀|补充|修改|更新)/u.test(userContent)) {
    return "strategy_edit";
  }

  if (/\b(calendar|strategy|knowledge|benchmark|script|video|title)\b/u.test(normalized)) {
    return "knowledge_answer";
  }

  return "light_chat";
}

function shouldIncludeKnowledgeInContext(pack: ConsultationSelectedContextPack) {
  return pack === "knowledge_answer" ||
    pack === "calendar_work" ||
    pack === "benchmark_search" ||
    pack === "history_reference";
}

function buildSelectedKnowledgeMatches(input: {
  matches: KnowledgeSearchMatchDto[];
  round: number;
  limit: number;
}): ConsultationSelectedKnowledgeMatch[] {
  const seenDocuments = new Set<string>();
  const seenChunks = new Set<string>();
  const sortedMatches = [...input.matches].sort((first, second) => {
    const firstFreshness = getFreshnessRank(first);
    const secondFreshness = getFreshnessRank(second);

    if (firstFreshness !== secondFreshness) {
      return secondFreshness - firstFreshness;
    }

    return second.score - first.score;
  });
  const selected: KnowledgeSearchMatchDto[] = [];

  for (const match of sortedMatches) {
    if (selected.length >= input.limit || seenChunks.has(match.chunkId)) {
      continue;
    }

    if (seenDocuments.has(match.documentId) && selected.length < Math.ceil(input.limit / 2)) {
      continue;
    }

    seenChunks.add(match.chunkId);
    seenDocuments.add(match.documentId);
    selected.push(match);
  }

  for (const match of sortedMatches) {
    if (selected.length >= input.limit) {
      break;
    }

    if (seenChunks.has(match.chunkId)) {
      continue;
    }

    seenChunks.add(match.chunkId);
    selected.push(match);
  }

  return selected.map((match) => ({
    documentTitle: match.documentTitle,
    chunkId: match.chunkId,
    documentId: match.documentId,
    scope: match.scope,
    score: match.score,
    content: clipText(match.content, 900),
    query: stringMetadata(match, "query"),
    toolCallId: stringMetadata(match, "toolCallId"),
    turn: numberMetadata(match, "turn") ?? input.round,
    freshness: freshnessMetadata(match),
    evidenceRole: inferEvidenceRole(match),
  }));
}

function buildContextOmissions(input: {
  selectedContextPack: ConsultationSelectedContextPack;
  budget: ContextBudgetReport;
  selectedKnowledgeMatches: ConsultationSelectedKnowledgeMatch[];
  allKnowledgeMatchCount: number;
}): ConsultationContextOmission[] {
  const omissions: ConsultationContextOmission[] = [
    {
      field: "contextInjection",
      reason: "legacy_field_removed",
      availableInDebug: false,
    },
    {
      field: "toolResults",
      reason: "duplicate_authority",
      availableInDebug: true,
    },
    {
      field: "skillDisclosure",
      reason: "debug_only",
      availableInDebug: true,
    },
    {
      field: "budget",
      reason: "debug_only",
      availableInDebug: true,
    },
    {
      field: "expertTraffic",
      reason: "debug_only",
      availableInDebug: true,
    },
  ];

  if (input.selectedContextPack !== "strategy_edit") {
    omissions.push({
      field: "strategyMarkdown",
      reason: "not_relevant_to_intent",
      availableInDebug: true,
    });
  }

  if (input.allKnowledgeMatchCount > input.selectedKnowledgeMatches.length) {
    omissions.push({
      field: "allKnowledgeMatches",
      reason: "over_budget",
      availableInDebug: true,
    });
  }

  for (const bucket of input.budget.buckets) {
    if (!bucket.truncated) {
      continue;
    }

    omissions.push({
      field: bucket.key,
      reason: "over_budget",
      availableInDebug: true,
    });
  }

  return omissions;
}

function getFreshnessRank(match: KnowledgeSearchMatchDto) {
  const freshness = freshnessMetadata(match);

  if (freshness === "current_turn") {
    return 2;
  }

  if (freshness === "history") {
    return 1;
  }

  return 0;
}

function freshnessMetadata(
  match: KnowledgeSearchMatchDto,
): ConsultationSelectedKnowledgeMatch["freshness"] {
  const value = stringMetadata(match, "freshness");

  if (value === "current_turn" || value === "history") {
    return value;
  }

  return "unknown";
}

function inferEvidenceRole(
  match: KnowledgeSearchMatchDto,
): ConsultationSelectedKnowledgeMatch["evidenceRole"] {
  const contentKind = stringMetadata(match, "contentKind") ?? stringMetadata(match, "kind");
  const haystack = `${match.documentTitle} ${match.content}`.toLowerCase();

  if (contentKind === "merchant_memory") {
    return "merchant_memory";
  }

  if (/(素材|镜头|画面|视频|拍摄|补拍|asset|material)/u.test(haystack)) {
    return "material_capability";
  }

  if (/(话术|转化|成交|私信|销售|异议)/u.test(haystack)) {
    return "sales_talk";
  }

  if (/(方法论|怎么|如何|步骤|原则|避坑|指南)/u.test(haystack)) {
    return "methodology";
  }

  if (/(爆款|对标|小红书|抖音|博主|评论)/u.test(haystack)) {
    return "benchmark_content";
  }

  if (/(历史|对话|刚才|上次)/u.test(haystack)) {
    return "conversation_history";
  }

  if (match.scope === "merchant") {
    return "project_fact";
  }

  return "general";
}

function stringMetadata(match: KnowledgeSearchMatchDto, key: string) {
  const value = match.metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberMetadata(match: KnowledgeSearchMatchDto, key: string) {
  const value = match.metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

export function extractOpenQuestions(content: string) {
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
