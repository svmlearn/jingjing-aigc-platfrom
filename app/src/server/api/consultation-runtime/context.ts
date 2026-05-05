import type { StrategySnapshotDto } from "@/contracts/consultation";
import type { MerchantProfileDto } from "@/contracts/merchant";
import type { KnowledgeSearchMatchDto } from "@/contracts/knowledge";
import type {
  ConsultationAgentRuntimeSettings,
  ConsultationAgentToolResult,
} from "@/server/api/consultation-runtime/types";
import { getConsultationBusinessToolCatalog } from "@/server/api/consultation-runtime/tools";

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
  consultationAgent: ConsultationAgentRuntimeSettings;
  knowledgeMatches: KnowledgeSearchMatchDto[];
  toolResults: ConsultationAgentToolResult[];
}) {
  const sessionSummary = input.sessionSummary ?? null;
  const budget = buildContextBudgetReport({
    merchant: input.merchant,
    strategySnapshot: input.strategySnapshot,
    userContent: input.userContent,
    sessionSummary,
    knowledgeMatches: input.knowledgeMatches,
    toolResults: input.toolResults,
    consultationAgent: input.consultationAgent,
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
      knowledgeMatchCount: input.knowledgeMatches.length,
      toolResults: input.toolResults.map((result) => ({
        label: getConsultationContextToolLabel(result.toolName),
        status: result.status,
        summary: result.summary,
      })),
    },
  };
}

export function buildContextBudgetReport(input: {
  merchant: MerchantProfileDto;
  strategySnapshot: StrategySnapshotDto;
  userContent: string;
  sessionSummary: string | null;
  consultationAgent: ConsultationAgentRuntimeSettings;
  knowledgeMatches: KnowledgeSearchMatchDto[];
  toolResults: ConsultationAgentToolResult[];
}): ContextBudgetReport {
  const buckets = [
    buildBudgetBucket("merchant", input.merchant, 1600),
    buildBudgetBucket("strategySnapshot", input.strategySnapshot, 2600),
    buildBudgetBucket("currentUserMessage", input.userContent, 1000),
    buildBudgetBucket("sessionSummary", input.sessionSummary ?? "", 1200),
    buildBudgetBucket("activeSkillBodies", input.consultationAgent.activeSkills.map((skill) => skill.body), 4200),
    buildBudgetBucket("knowledgeMatches", input.knowledgeMatches.map((match) => match.content), 4200),
    buildBudgetBucket("toolResults", input.toolResults.map((result) => result.summary), 1600),
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
