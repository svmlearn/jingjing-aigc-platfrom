import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import type {
  ConsultationExpertRosterItemDto,
  ConsultationSessionDetailDto,
  ConsultationToolCardDto,
  MerchantStrategyAssetDto,
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
  buildStrategyAssetMarkdown,
  ensureMerchantStrategyAssetDocument,
  getMerchantStrategyAssetDocument,
  upsertMerchantStrategyAssetDocument,
} from "@/lib/db/merchant-strategy-asset-repository";
import {
  consumeMerchantCredits,
  ensureMerchantCreditAccount,
  getConsultationDefaultRouteBinding,
  listAgentConfigs,
  recordAgentTestRun,
  recordAgentRuntimeSnapshot,
  recordMerchantUsageEvent,
  updateMerchantUsageEvent,
} from "@/lib/db/agent-console-repository";
import {
  getMerchantProfileById,
  getOperationalMerchantProfileByOwnerUserId,
} from "@/lib/db/merchant-repository";
import { getPlatformSettings } from "@/lib/db/platform-admin-repository";
import {
  buildConsultationContextInjection,
  buildContextBudgetReport,
  buildContextInjectionSystemPrompt,
  buildAgentSoulPrompt,
  buildExpertTurnNotes,
  buildExpertContainerPrompt,
  buildSharedConsultationState,
  buildKnowledgeContextBlock,
} from "@/server/api/consultation-runtime/context";
import {
  resolveConsultationAgentRuntime,
  resolveMentionedConsultationAgentRuntime,
} from "@/server/api/consultation-runtime/experts";
import {
  guardStrategyAssetEditorPatch,
  type StrategyAssetGuardDecision,
  type StrategyAssetGuardFieldKey,
  type StrategyAssetGuardPatch,
  type StrategyAssetGuardSource,
} from "@/server/api/consultation-runtime/guards";
import {
  buildActiveSkillPrompt,
  buildSkillCatalogPrompt,
  buildSkillDependencyWarnings,
  buildSkillDisclosure,
  selectActiveConsultationSkills,
} from "@/server/api/consultation-runtime/skills";
import {
  buildBusinessToolPrompt,
  getConsultationBusinessToolCatalog,
} from "@/server/api/consultation-runtime/tools";
import { createBenchmarkMaterialsForMerchant } from "@/server/api/material-library-service";
import { retrieveConsultationKnowledge } from "@/server/api/consultation-runtime/rag";
import {
  runConsultationRuntime,
  type ConsultationRuntimeSnapshotRecord,
} from "@/server/api/consultation-runtime/runtime";
import type {
  ConsultationAgentLoopState,
  ConsultationAgentRuntimeSettings,
  ConsultationAgentToolCall,
  ConsultationAgentToolResult,
  ConsultationConversationMessage,
  ConsultationMentionRouting,
} from "@/server/api/consultation-runtime/types";
import {
  clipText,
  toStringArrayValue,
  uniqueStrings,
} from "@/server/api/consultation-runtime/utils";
import {
  AiRuntimeError,
  type AiRuntimeTool,
  type AiRuntimeToolCall,
  type ChatMessage,
  createChatCompletion,
  getAiRuntimeApiKey,
} from "@/server/api/ai-runtime";
import { ApiError } from "@/server/api/errors";

export async function listConsultationSessionsForUser(userId: string) {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(userId);
  const [sessions, merchantStrategyAsset] = await Promise.all([
    listConsultationSessions(merchant.id),
    getMerchantStrategyAssetDocument(merchant.id),
  ]);

  if (!merchantStrategyAsset) {
    return sessions;
  }

  return sessions.map((session) => ({
    ...session,
    strategySnapshot: merchantStrategyAsset.strategySnapshot,
    strategyAsset: merchantStrategyAsset,
  }));
}

export async function listConsultationExpertsForUser(
  userId: string,
): Promise<ConsultationExpertRosterItemDto[]> {
  await getOperationalMerchantProfileByOwnerUserId(userId);

  try {
    const [agents, routeBinding] = await Promise.all([
      listAgentConfigs(),
      getConsultationDefaultRouteBinding(),
    ]);
    const defaultAgentId =
      routeBinding?.status === "active" ? routeBinding.agentId ?? null : null;

    return agents
      .filter((agent) => agent.serviceStatus === "enabled")
      .map((agent) => ({
        agentId: agent.id,
        agentKey: agent.agentKey,
        displayName: agent.displayName,
        mentionLabel: agent.displayName.replace(/^@/, ""),
        roleDescription: agent.roleDescription,
        description: agent.description,
        isDefault: agent.id === defaultAgentId,
      }))
      .sort((first, second) => {
        if (first.isDefault !== second.isDefault) {
          return first.isDefault ? -1 : 1;
        }

        return first.displayName.localeCompare(second.displayName, "zh-CN");
      });
  } catch {
    return [];
  }
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
  const strategyAsset = await ensureMerchantStrategyAssetDocument({
    merchantId: merchant.id,
    fallback: initialStrategySnapshot,
  });
  const session = await createConsultationSession({
    merchantId: merchant.id,
    title: input.title ?? `${merchant.name} 咨询诊断`,
    currentStage: "商家画像读取",
    strategySnapshot: strategyAsset.strategySnapshot,
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
            activeSoulVersion: consultationAgent.container.activeSoulVersion?.versionNo ?? null,
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
      positioning: strategyAsset.strategySnapshot.positioning,
      nextAction: "先补充你的主力客群、核心服务和最想解决的获客问题。",
    },
  });

  return getConsultationSessionDetail({
    merchantId: merchant.id,
    sessionId: session.id,
  }).then((detail) => attachRoundtableState(attachStrategyAssetToSession(detail, strategyAsset)));
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
  const merchantStrategyAssetDocument = await getMerchantStrategyAssetDocument(merchant.id);

  return merchantStrategyAssetDocument
    ? attachRoundtableState({
        ...session,
        strategySnapshot: merchantStrategyAssetDocument.strategySnapshot,
        strategyAsset: merchantStrategyAssetDocument,
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

function attachStrategyAssetToSession<T extends ConsultationSessionDetailDto>(
  session: T,
  strategyAsset: MerchantStrategyAssetDto | null,
): T {
  if (!strategyAsset) {
    return session;
  }

  return {
    ...session,
    strategySnapshot: strategyAsset.strategySnapshot,
    strategyAsset,
  };
}

export async function sendConsultationMessageForUser(input: {
  userId: string;
  sessionId: string;
  content: string;
}) {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const [{ consultationAgent, knowledgeRuntime, llmRuntime, membershipPlans }, session, existingMerchantStrategyAsset] = await Promise.all([
    getPlatformSettings(),
    getConsultationSessionDetail({
      merchantId: merchant.id,
      sessionId: input.sessionId,
    }),
    getMerchantStrategyAssetDocument(merchant.id),
  ]);
  const runtime = await resolveConsultationAgentRuntime({
    fallback: consultationAgent,
  });
  const effectiveSession: ConsultationSessionDetailDto = {
    ...session,
    strategySnapshot: existingMerchantStrategyAsset?.strategySnapshot ?? session.strategySnapshot,
    strategyAsset: existingMerchantStrategyAsset ?? null,
  };

  if (resolveRoundtableState(effectiveSession)) {
    return sendRoundtableMessageForUser(input);
  }

  const routedRuntime = await resolveMentionedConsultationAgentRuntime({
    fallback: consultationAgent,
    defaultRuntime: runtime.consultationAgent,
    content: input.content,
  });
  await assertConsultationAgentAvailable({
    consultationAgent: routedRuntime.consultationAgent,
    mentionRouting: routedRuntime.routing,
  });
  const effectiveUserContent = routedRuntime.routing.cleanedContent;
  const entitlement = await checkConsultationEntitlement({
    merchant,
    agentId: routedRuntime.consultationAgent.container?.agent.id ?? null,
    membershipPlans,
  });

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
    userContent: effectiveUserContent,
    userMessages: allUserMessages,
    conversationMessages,
    consultationAgent: routedRuntime.consultationAgent,
    mentionRouting: routedRuntime.routing,
    knowledgeRuntime,
    llmRuntime,
  });

  await recordConsultationUsageSafely({
    merchantId: merchant.id,
    agentId: routedRuntime.consultationAgent.container?.agent.id ?? null,
    entitlement,
    runtimeSnapshot: loopResult.runtimeSnapshot,
  });

  await recordConsultationRuntimeSnapshotSafely({
    sessionId: effectiveSession.id,
    messageId: userMessage.id,
    stageLabel: loopResult.nextStage,
    runtimeSnapshot: loopResult.runtimeSnapshot,
  });

  await createConsultationEvent({
    sessionId: effectiveSession.id,
    eventType: "strategy_snapshot.updated",
    stageLabel: loopResult.nextStage,
    payload: {
      round: loopResult.nextRound,
      strategyTags: loopResult.strategySnapshot.strategyTags,
      calendarCount: loopResult.strategySnapshot.contentCalendarDraft.length,
      strategyMarkdownChars: loopResult.strategyMarkdown.length,
      loopIterations: loopResult.toolResults.length,
      mentionRouting: loopResult.mentionRouting,
      agentContainer: loopResult.agentContainer,
    },
  });
  const persistedStrategyAsset = await upsertMerchantStrategyAssetDocument({
    merchantId: merchant.id,
    strategySnapshot: loopResult.strategySnapshot,
    strategyMarkdown: loopResult.strategyMarkdown,
    canonicalSnapshot: loopResult.strategySnapshot,
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
      settings: routedRuntime.consultationAgent,
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
        runtimeDesign: "bounded_business_tool_loop_v1",
        agentContainer: loopResult.agentContainer,
        mentionRouting: loopResult.mentionRouting,
        expertTraffic: {
          policy: "short_term_expert_traffic_v1",
          sharedConsultationState: loopResult.sharedConsultationState,
          recentExpertTurnNotes: loopResult.expertTurnNotes,
          latestExpertTurnNote: loopResult.latestExpertTurnNote,
        },
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
    strategyAsset: persistedStrategyAsset,
  }));
}

export async function runAgentDebugTest(input: {
  agentId: string;
  merchantId: string;
  inputMessage: string;
}) {
  const [merchant, { consultationAgent, knowledgeRuntime, llmRuntime }, existingMerchantStrategyAsset] =
    await Promise.all([
      getMerchantProfileById(input.merchantId),
      getPlatformSettings(),
      getMerchantStrategyAssetDocument(input.merchantId),
    ]);
  const resolvedRuntime = await resolveConsultationAgentRuntime({
    fallback: consultationAgent,
    agentId: input.agentId,
    allowNonEnabled: true,
    promptMode: "draft_or_active",
  });
  const now = new Date().toISOString();
  const strategySnapshot =
    existingMerchantStrategyAsset?.strategySnapshot ??
    buildStrategySnapshot({
      merchant,
      previousSnapshot: null,
      userMessages: [],
    });
  const session: ConsultationSessionDetailDto = {
    id: `agent_debug_${randomUUID()}`,
    merchantId: merchant.id,
    title: "Agent 调试会话",
    status: "active",
    currentStage: "Agent 调试",
    strategySnapshot,
    strategyAsset: existingMerchantStrategyAsset ?? {
      merchantId: merchant.id,
      strategySnapshot,
      strategyMarkdown: buildStrategyAssetMarkdown(strategySnapshot),
      canonicalSnapshot: strategySnapshot,
      compiledContext: null,
      updatedAt: now,
    },
    summaryText: `${merchant.name} 的 Agent 调试运行。`,
    latestMessagePreview: input.inputMessage,
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
    messages: [],
    events: [],
    roundtable: null,
  };
  const mentionRouting: ConsultationMentionRouting = {
    mode: "mentioned_agent",
    rawMention: null,
    cleanedContent: input.inputMessage,
    targetAgentId: resolvedRuntime.consultationAgent.container?.agent.id ?? input.agentId,
    targetAgentKey: resolvedRuntime.consultationAgent.container?.agent.agentKey ?? null,
    targetDisplayName:
      resolvedRuntime.consultationAgent.container?.agent.displayName ?? null,
    availableMentions: resolvedRuntime.consultationAgent.container
      ? [resolvedRuntime.consultationAgent.container.agent.displayName]
      : [],
  };

  try {
    const loopResult = await runConsultationAgentLoop({
      merchant,
      session,
      userContent: input.inputMessage,
      userMessages: [input.inputMessage],
      conversationMessages: [{ role: "user", content: input.inputMessage }],
      mentionRouting,
      consultationAgent: resolvedRuntime.consultationAgent,
      knowledgeRuntime,
      llmRuntime,
      emitRuntimeEvent: async () => {
        // Admin debug runs must not write real consultation sessions or events.
      },
    });
    const testRun = await recordAgentTestRun({
      agentId: loopResult.runtimeSnapshot.agentId ?? input.agentId,
      merchantId: merchant.id,
      inputMessage: input.inputMessage,
      promptVersionId: loopResult.runtimeSnapshot.promptVersionId,
      candidateSkillIds: loopResult.runtimeSnapshot.candidateSkillIds,
      actualSkillIds: loopResult.runtimeSnapshot.actualSkillIds,
      knowledgeSetIds: loopResult.runtimeSnapshot.knowledgeSetIds,
      knowledgeMatchIds: loopResult.runtimeSnapshot.knowledgeMatchIds,
      memoryMatchIds: loopResult.runtimeSnapshot.memoryMatchIds,
      toolSummary: loopResult.runtimeSnapshot.toolCallSummary,
      assistantOutput: loopResult.assistantContent,
      status: "succeeded",
      model: loopResult.runtimeSnapshot.model,
    });

    return {
      testRun,
      assistantOutput: loopResult.assistantContent,
      runtimeSnapshot: loopResult.runtimeSnapshot,
      toolResults: loopResult.toolResults,
      knowledgeMatches: loopResult.knowledgeMatches,
      memoryMatches: getMerchantMemoryMatches(loopResult.knowledgeMatches),
      skillDisclosure: loopResult.skillDisclosure,
      skillDependencyWarnings: buildSkillDependencyWarnings(resolvedRuntime.consultationAgent),
      agentContainer: loopResult.agentContainer,
    };
  } catch (error) {
    const errorSummary = error instanceof Error ? error.message : "Agent 调试运行失败";
    const testRun = await recordAgentTestRun({
      agentId: input.agentId,
      merchantId: merchant.id,
      inputMessage: input.inputMessage,
      candidateSkillIds: resolvedRuntime.consultationAgent.skillCatalog.map((skill) => skill.id),
      actualSkillIds: [],
      knowledgeSetIds: resolvedRuntime.consultationAgent.container?.knowledgeSetIds ?? [],
      knowledgeMatchIds: [],
      memoryMatchIds: [],
      toolSummary: {
        errorSummary,
      },
      assistantOutput: null,
      status: "failed",
      errorSummary,
      model: resolvedRuntime.consultationAgent.model,
    });

    return {
      testRun,
      assistantOutput: null,
      runtimeSnapshot: null,
      toolResults: [],
      knowledgeMatches: [],
      memoryMatches: [],
      skillDisclosure: buildSkillDisclosure(resolvedRuntime.consultationAgent),
      skillDependencyWarnings: buildSkillDependencyWarnings(resolvedRuntime.consultationAgent),
      agentContainer: resolvedRuntime.consultationAgent.container
        ? {
            agentId: resolvedRuntime.consultationAgent.container.agent.id,
            agentKey: resolvedRuntime.consultationAgent.container.agent.agentKey,
            displayName: resolvedRuntime.consultationAgent.container.agent.displayName,
            activePromptVersion:
              resolvedRuntime.consultationAgent.container.activePromptVersion?.versionNo ?? null,
            activeSoulVersion:
              resolvedRuntime.consultationAgent.container.activeSoulVersion?.versionNo ?? null,
            knowledgeSetIds: resolvedRuntime.consultationAgent.container.knowledgeSetIds,
            knowledgeDocumentIds: resolvedRuntime.consultationAgent.container.knowledgeDocumentIds,
          }
        : null,
    };
  }
}

async function assertConsultationAgentAvailable(input: {
  consultationAgent: ConsultationAgentRuntimeSettings;
  mentionRouting: ConsultationMentionRouting;
}) {
  if (input.consultationAgent.container) {
    return;
  }

  const enabledAgents = await listEnabledConsultationAgentsSafely();

  if (enabledAgents.length > 0) {
    throw new ApiError(
      409,
      "CONSULTATION_AGENT_REQUIRED",
      "请选择一个专家开始咨询。",
      {
        mentionRouting: input.mentionRouting,
        availableExperts: enabledAgents.map((agent) => ({
          agentId: agent.id,
          agentKey: agent.agentKey,
          displayName: agent.displayName,
        })),
      },
    );
  }

  throw new ApiError(
    503,
    "CONSULTATION_AGENT_UNCONFIGURED",
    "咨询服务暂未配置，请联系平台管理员。",
    {
      mentionRouting: input.mentionRouting,
    },
  );
}

async function listEnabledConsultationAgentsSafely() {
  try {
    return (await listAgentConfigs()).filter((agent) => agent.serviceStatus === "enabled");
  } catch {
    return [];
  }
}

function getMerchantMemoryMatches(matches: KnowledgeSearchMatchDto[]) {
  return matches
    .filter((match) => match.metadata.contentKind === "merchant_memory")
    .map((match) => ({
      chunkId: match.chunkId,
      documentId: match.documentId,
      documentTitle: match.documentTitle,
      score: match.score,
    }));
}

type ConsultationEntitlementCheck = {
  mode: "merchant_credit";
  allowed: true;
  cost: number;
  creditAccountId: string | null;
  reservedUsageEventId: string | null;
};

async function checkConsultationEntitlement(input: {
  merchant: MerchantProfileDto;
  agentId?: string | null;
  membershipPlans: Awaited<ReturnType<typeof getPlatformSettings>>["membershipPlans"];
}): Promise<ConsultationEntitlementCheck> {
  const cost = 1;
  const planGrant = input.membershipPlans[input.merchant.plan]?.dailyCredits ?? 0;
  const creditAccount = await ensureMerchantCreditAccount({
    merchantId: input.merchant.id,
    initialBalance: planGrant,
    reason: input.merchant.plan === "free" ? "signup_bonus" : "subscription_period_grant",
  });

  if (!creditAccount) {
    return {
      mode: "merchant_credit",
      allowed: true,
      cost: 0,
      creditAccountId: null,
      reservedUsageEventId: null,
    };
  }

  if (creditAccount.balance < cost) {
    await recordMerchantUsageEvent({
      merchantId: input.merchant.id,
      actionType: "AGENT_USAGE_CONSULTATION_MESSAGE",
      agentId: input.agentId ?? null,
      estimatedCost: cost,
      actualCost: 0,
      status: "failed",
      metadata: {
        reason: "merchant_credit_insufficient",
        balance: creditAccount.balance,
      },
    });

    throw new ApiError(
      402,
      "MERCHANT_CREDIT_INSUFFICIENT",
      "当前积分不足，无法继续使用该 AI 能力。请升级会员或补充积分。",
    );
  }

  const reservedUsageEvent = await recordMerchantUsageEvent({
    merchantId: input.merchant.id,
    actionType: "AGENT_USAGE_CONSULTATION_MESSAGE",
    agentId: input.agentId ?? null,
    estimatedCost: cost,
    actualCost: null,
    status: "reserved",
    metadata: {
      reason: "credit_reserved_before_runtime",
      balanceBefore: creditAccount.balance,
    },
  });

  return {
    mode: "merchant_credit",
    allowed: true,
    cost,
    creditAccountId: creditAccount.id,
    reservedUsageEventId: reservedUsageEvent?.id ?? null,
  };
}

async function recordConsultationUsageSafely(input: {
  merchantId: string;
  agentId?: string | null;
  entitlement: ConsultationEntitlementCheck;
  runtimeSnapshot: ConsultationRuntimeSnapshotRecord;
}) {
  if (!input.entitlement.creditAccountId || input.entitlement.cost <= 0) {
    await recordMerchantUsageEvent({
      merchantId: input.merchantId,
      actionType: "AGENT_USAGE_CONSULTATION_MESSAGE",
      agentId: input.agentId ?? null,
      estimatedCost: 0,
      actualCost: 0,
      status: "skipped",
      metadata: {
        reason: "credit_gate_not_configured",
        runtimeModel: input.runtimeSnapshot.model,
        promptVersionId: input.runtimeSnapshot.promptVersionId,
        soulVersionId: input.runtimeSnapshot.soulVersionId,
      },
    }).catch(() => null);
    return;
  }

  try {
    const usageMetadata = {
      runtimeModel: input.runtimeSnapshot.model,
      promptVersionId: input.runtimeSnapshot.promptVersionId,
      soulVersionId: input.runtimeSnapshot.soulVersionId,
      candidateSkillIds: input.runtimeSnapshot.candidateSkillIds,
      actualSkillIds: input.runtimeSnapshot.actualSkillIds,
      knowledgeSetIds: input.runtimeSnapshot.knowledgeSetIds,
    };
    const usageEvent = input.entitlement.reservedUsageEventId
      ? await updateMerchantUsageEvent({
          usageEventId: input.entitlement.reservedUsageEventId,
          actualCost: input.entitlement.cost,
          status: "consumed",
          metadata: {
            ...usageMetadata,
            reservationStatus: "consumed_after_runtime_success",
          },
        })
      : await recordMerchantUsageEvent({
          merchantId: input.merchantId,
          actionType: "AGENT_USAGE_CONSULTATION_MESSAGE",
          agentId: input.agentId ?? null,
          estimatedCost: input.entitlement.cost,
          actualCost: input.entitlement.cost,
          status: "consumed",
          metadata: {
            ...usageMetadata,
            reservationStatus: "missing_reservation_fallback",
          },
        });

    await consumeMerchantCredits({
      merchantId: input.merchantId,
      creditAccountId: input.entitlement.creditAccountId,
      amount: input.entitlement.cost,
      relatedUsageEventId: usageEvent?.id ?? null,
      reason: "consultation_agent_message",
    });
  } catch (error) {
    await recordMerchantUsageEvent({
      merchantId: input.merchantId,
      actionType: "AGENT_USAGE_CONSULTATION_MESSAGE",
      agentId: input.agentId ?? null,
      estimatedCost: input.entitlement.cost,
      actualCost: 0,
      status: "failed",
      metadata: {
        reason: "usage_compensation_required",
        reservedUsageEventId: input.entitlement.reservedUsageEventId,
        error: error instanceof Error ? error.message : "Unknown usage recording error.",
      },
    }).catch(() => null);
  }
}

type StrategyAssetFieldKey = StrategyAssetGuardFieldKey;
type StrategyAssetEditorPatch = StrategyAssetGuardPatch;
type StrategyAssetEditorResolution = {
  patch: StrategyAssetEditorPatch;
  guard: StrategyAssetGuardDecision;
};

async function recordConsultationRuntimeSnapshotSafely(input: {
  sessionId: string;
  messageId: string;
  stageLabel: string;
  runtimeSnapshot: ConsultationRuntimeSnapshotRecord;
}) {
  try {
    await recordAgentRuntimeSnapshot({
      sessionId: input.sessionId,
      messageId: input.messageId,
      agentId: input.runtimeSnapshot.agentId,
      promptVersionId: input.runtimeSnapshot.promptVersionId,
      candidateSkillIds: input.runtimeSnapshot.candidateSkillIds,
      actualSkillIds: input.runtimeSnapshot.actualSkillIds,
      knowledgeSetIds: input.runtimeSnapshot.knowledgeSetIds,
      knowledgeMatchIds: input.runtimeSnapshot.knowledgeMatchIds,
      memoryMatchIds: input.runtimeSnapshot.memoryMatchIds,
      toolCallSummary: input.runtimeSnapshot.toolCallSummary,
      model: input.runtimeSnapshot.model,
    });
  } catch (error) {
    try {
      await createConsultationEvent({
        sessionId: input.sessionId,
        eventType: "agent.runtime_snapshot.failed",
        stageLabel: input.stageLabel,
        payload: {
          error:
            error instanceof Error
              ? error.message
              : "Unknown runtime snapshot persistence error.",
        },
      });
    } catch {
      // Snapshot telemetry must never block the merchant-facing consultation response.
    }
  }
}

const strategyAssetFieldKeys = [
  "positioning",
  "coreSellingPoints",
  "targetAudiences",
  "keyScenes",
  "currentSuggestion",
  "strategyMarkdown",
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
    strategyMarkdown: z.string().trim().min(1).max(24000),
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

async function runConsultationAgentLoop(input: {
  merchant: MerchantProfileDto;
  session: ConsultationSessionDetailDto;
  userContent: string;
  userMessages: string[];
  conversationMessages: ConsultationConversationMessage[];
  mentionRouting: ConsultationMentionRouting;
  consultationAgent: ConsultationAgentRuntimeSettings;
  knowledgeRuntime: KnowledgeRuntimeSettingsDto;
  llmRuntime: Awaited<ReturnType<typeof getPlatformSettings>>["llmRuntime"];
  emitRuntimeEvent?: (event: {
    eventType: string;
    stageLabel: string;
    payload: Record<string, unknown>;
  }) => Promise<void>;
}) {
  const nextRound = input.userMessages.length;
  const maxConversationRounds = Math.max(1, input.consultationAgent.maxRounds);
  const initialStage = "咨询诊断中";
  const expertTurnNotes = buildExpertTurnNotes({
    sessionMessages: input.session.messages,
  });
  const sharedConsultationState = buildSharedConsultationState({
    merchant: input.merchant,
    strategySnapshot: input.session.strategySnapshot,
    strategyMarkdown: input.session.strategyAsset?.strategyMarkdown,
    userContent: input.userContent,
    sessionSummary: input.session.summaryText,
    mentionRouting: input.mentionRouting,
    expertTurnNotes,
  });
  const state: ConsultationAgentLoopState = {
    merchant: input.merchant,
    session: input.session,
    userContent: input.userContent,
    userMessages: input.userMessages,
    conversationMessages: input.conversationMessages,
    mentionRouting: input.mentionRouting,
    nextRound,
    nextStage: initialStage,
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
    strategyMarkdown:
      input.session.strategyAsset?.strategyMarkdown ??
      buildStrategyAssetMarkdown(input.session.strategySnapshot),
    plannerTrace: [],
    sharedConsultationState,
    expertTurnNotes,
  };
  state.contextBudget = buildContextBudgetReport({
    merchant: state.merchant,
    strategySnapshot: state.strategySnapshot,
    strategyMarkdown: state.strategyMarkdown,
    userContent: state.userContent,
    sessionSummary: state.session.summaryText ?? null,
    consultationAgent: state.consultationAgent,
    knowledgeMatches: state.knowledgeMatches,
    toolResults: [],
    sharedConsultationState: state.sharedConsultationState,
    expertTurnNotes: state.expertTurnNotes,
  });
  const toolBudget = Math.max(1, input.consultationAgent.enabledTools.length);
  const runtimeResult = await runConsultationRuntime({
    state,
    maxConversationRounds,
    toolBudget,
    emitEvent: async (event) => {
      if (input.emitRuntimeEvent) {
        await input.emitRuntimeEvent({
          eventType: event.eventType,
          stageLabel: initialStage,
          payload: event.payload,
        });
        return;
      }

      await createConsultationEvent({
        sessionId: input.session.id,
        eventType: event.eventType,
        stageLabel: initialStage,
        payload: event.payload,
      });
    },
    dispatchTool: (currentState, toolCall) =>
      dispatchConsultationTool(toolCall, currentState),
    applyToolResultToState: (currentState, result) =>
      applyToolResultToState(result, currentState),
    buildAssistantReply: ({ state: currentState, toolResults }) =>
      buildAssistantReplyWithModel({
        merchant: currentState.merchant,
        round: currentState.nextRound,
        userContent: currentState.userContent,
        sessionSummary: currentState.session.summaryText ?? null,
        strategySnapshot: currentState.strategySnapshot,
        strategyMarkdown: currentState.strategyMarkdown,
        knowledgeMatches: currentState.knowledgeMatches,
        toolResults,
        consultationAgent: currentState.consultationAgent,
        llmRuntime: currentState.llmRuntime,
        sharedConsultationState: currentState.sharedConsultationState,
        expertTurnNotes: currentState.expertTurnNotes,
      }),
  });
  const nextStage = resolveConsultationStageLabel({
    userContent: state.userContent,
    toolResults: runtimeResult.toolResults,
  });
  state.nextStage = nextStage;

  return {
    nextRound: state.nextRound,
    nextStage,
    strategySnapshot: state.strategySnapshot,
    strategyMarkdown: state.strategyMarkdown,
    knowledgeMatches: state.knowledgeMatches,
    toolResults: runtimeResult.toolResults,
    agentContainer: state.consultationAgent.container
      ? {
          agentId: state.consultationAgent.container.agent.id,
          agentKey: state.consultationAgent.container.agent.agentKey,
          displayName: state.consultationAgent.container.agent.displayName,
          activePromptVersion: state.consultationAgent.container.activePromptVersion?.versionNo ?? null,
          activeSoulVersion: state.consultationAgent.container.activeSoulVersion?.versionNo ?? null,
          knowledgeSetIds: state.consultationAgent.container.knowledgeSetIds,
          knowledgeDocumentIds: state.consultationAgent.container.knowledgeDocumentIds,
        }
      : null,
    mentionRouting: state.mentionRouting,
    skillDisclosure: buildSkillDisclosure(state.consultationAgent),
    sharedConsultationState: state.sharedConsultationState,
    expertTurnNotes: state.expertTurnNotes,
    latestExpertTurnNote: runtimeResult.latestExpertTurnNote,
    assistantContent: runtimeResult.assistantReply.content,
    runtimeSnapshot: runtimeResult.runtimeSnapshot,
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
    const retrieval = await retrieveConsultationKnowledge({
      state,
      query,
      topK,
      knowledgeDocumentIds: call.args.knowledgeDocumentIds,
    });
    const matches = retrieval.matches;

    return {
      callId: call.id,
      toolName: call.toolName,
      status: matches.length > 0 ? "completed" : "skipped",
      summary:
        matches.length > 0
          ? `检索平台方法论与商家上下文，命中 ${matches.length} 个受控片段。`
          : "暂无 indexed 知识片段命中，使用商家基础资料与会话上下文兜底。",
      payload: {
        ...retrieval.payload,
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

  if (call.toolName === "search_benchmark_materials") {
    return dispatchBenchmarkMaterialTool(call, state);
  }

  if (call.toolName === "update_strategy_snapshot") {
    const assetEdit = await resolveStrategyAssetEditorPatch({
      state,
      fallback: buildStrategyAssetSnapshotPatch(state.session.strategySnapshot),
    });
    const strategyWriteApplied = assetEdit.guard.allowed && assetEdit.patch.changedFields.length > 0;
    const strategySnapshot = strategyWriteApplied
      ? buildStrategySnapshot({
          merchant: state.merchant,
          previousSnapshot: state.session.strategySnapshot,
          userMessages: state.userMessages,
          knowledgeMatches: state.knowledgeMatches,
          assetEdit: assetEdit.patch,
        })
      : state.session.strategySnapshot;
    const strategyMarkdown = strategyWriteApplied
      ? assetEdit.patch.strategyMarkdown ?? buildStrategyAssetMarkdown(strategySnapshot)
      : state.strategyMarkdown;

    return {
      callId: call.id,
      toolName: call.toolName,
      status: strategyWriteApplied ? "completed" : "skipped",
      summary: strategyWriteApplied
        ? `策略资产 Editor 已更新：${summarizeStrategyAssetEdit(assetEdit.patch)}。`
        : assetEdit.guard.summary,
      payload: {
        strategySnapshot,
        strategyMarkdown,
        editorPatch: toStrategyAssetEditorPayload(assetEdit.patch),
        guardrail: {
          allowed: assetEdit.guard.allowed,
          reasonCode: assetEdit.guard.reasonCode,
          summary: assetEdit.guard.summary,
          warnings: assetEdit.guard.warnings,
        },
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

function applyToolResultToState(
  result: ConsultationAgentToolResult,
  state: ConsultationAgentLoopState,
) {
  if (result.toolName === "retrieve_knowledge_base") {
    state.knowledgeMatches = result.knowledgeMatches ?? [];
  }

  if (result.toolName === "update_strategy_snapshot") {
    const strategySnapshot = result.payload.strategySnapshot;
    const strategyMarkdown = result.payload.strategyMarkdown;

    if (isStrategySnapshot(strategySnapshot)) {
      state.strategySnapshot = strategySnapshot;
    }

    if (typeof strategyMarkdown === "string" && strategyMarkdown.trim()) {
      state.strategyMarkdown = strategyMarkdown;
    }

    state.sharedConsultationState = buildSharedConsultationState({
      merchant: state.merchant,
      strategySnapshot: state.strategySnapshot,
      strategyMarkdown: state.strategyMarkdown,
      userContent: state.userContent,
      sessionSummary: state.session.summaryText,
      mentionRouting: state.mentionRouting,
      expertTurnNotes: state.expertTurnNotes,
    });
  }
}

async function dispatchBenchmarkMaterialTool(
  call: ConsultationAgentToolCall,
  state: ConsultationAgentLoopState,
): Promise<ConsultationAgentToolResult> {
  const platform = parseBenchmarkPlatform(call.args.platform);
  const findMethod = call.args.findMethod === "profile" ? "profile" : "keyword";
  const keyword = typeof call.args.keyword === "string" ? call.args.keyword.trim() : "";
  const profileUrl = typeof call.args.profileUrl === "string" ? call.args.profileUrl.trim() : "";
  const count =
    typeof call.args.count === "number" && Number.isFinite(call.args.count)
      ? Math.min(Math.max(Math.trunc(call.args.count), 1), 10)
      : 5;
  const target = findMethod === "profile" ? profileUrl : keyword;

  if (!target) {
    return {
      callId: call.id,
      toolName: call.toolName,
      status: "skipped",
      summary: "对标素材检索缺少关键词或博主主页链接，本轮跳过。",
      payload: {
        reason: "missing_benchmark_target",
      },
    };
  }

  try {
    const materials = await createBenchmarkMaterialsForMerchant({
      merchantId: state.merchant.id,
      createdByUserId: state.merchant.ownerUserId ?? "consultation_agent",
      merchantName: state.merchant.name,
      platform,
      findMethod,
      keyword: findMethod === "keyword" ? target : undefined,
      profileUrl: findMethod === "profile" ? target : undefined,
      count,
    });
    const readyMaterials = materials.filter((material) => material.status === "ready");

    return {
      callId: call.id,
      toolName: call.toolName,
      status: readyMaterials.length > 0 ? "completed" : "skipped",
      summary:
        readyMaterials.length > 0
          ? `已检索并沉淀 ${readyMaterials.length} 条${platform === "douyin" ? "抖音" : "小红书"}对标素材，可用于选题和爆款结构拆解。`
          : "对标素材检索未拿到可用结果，已保留配置或失败状态供排查。",
      payload: {
        platform,
        findMethod,
        target,
        count: materials.length,
        materials: materials.map((material) => ({
          id: material.id,
          title: material.title,
          materialType: material.materialType,
          creatorName: material.creatorName,
          engagementLabel: material.engagementLabel,
          originalUrl: material.originalUrl,
          status: material.status,
        })),
      },
    };
  } catch (error) {
    return {
      callId: call.id,
      toolName: call.toolName,
      status: "skipped",
      summary:
        error instanceof Error
          ? `对标素材检索失败：${error.message}`
          : "对标素材检索失败。",
      payload: {
        platform,
        findMethod,
        target,
        error: error instanceof Error ? error.message : "Unknown benchmark material error.",
      },
    };
  }
}

function parseBenchmarkPlatform(value: unknown): "xiaohongshu" | "douyin" {
  return value === "douyin" ? "douyin" : "xiaohongshu";
}

function buildGreetingMessage(merchant: MerchantProfileDto) {
  const service = merchant.serviceItems[0] ?? merchant.industry ?? "本地服务";
  return `你好，欢迎来到静境商家平台。我已经先读取了 ${merchant.name} 的基础资料。接下来我会帮你把「${service}」这条业务线梳理成更清晰的定位、卖点、目标客群和内容策略。先告诉我：你现在最想提升的是到店咨询、私信转化，还是账号的人设种草？`;
}

function buildAssistantReply(input: {
  merchant: MerchantProfileDto;
  round: number;
  userContent: string;
  sessionSummary?: string | null;
  strategySnapshot: StrategySnapshotDto;
  strategyMarkdown?: string | null;
  knowledgeMatches: KnowledgeSearchMatchDto[];
  toolResults?: ConsultationAgentToolResult[];
}) {
  const knowledgeHint = buildKnowledgeReplyHint(input.knowledgeMatches);
  const loopHint = buildAgentLoopReplyHint(input.toolResults ?? []);
  const strategyWriteCompleted = hasCompletedConsultationTool(
    input.toolResults ?? [],
    "update_strategy_snapshot",
  );
  const contentCalendarCompleted = hasCompletedConsultationTool(
    input.toolResults ?? [],
    "update_content_calendar",
  );
  const lowInformationTurn = isLowInformationConsultationTurn(input.userContent);
  const processQuestion = isConsultationProcessQuestion(input.userContent);

  if (processQuestion) {
    return `你说得对，真正的咨询应该先问实际情况。${loopHint}${knowledgeHint}我先不改右侧策略资产，也不把现有模板当成结论。先从四个事实里选一个告诉我就行：你现在最想提升到店、私信还是账号人设？当前最想推的服务是哪一个？最近客户最常问或最犹豫的点是什么？你希望内容把用户引到什么动作？`;
  }

  if (lowInformationTurn) {
    const service = input.merchant.serviceItems[0] ?? input.merchant.industry ?? "核心服务";
    return `你现在还不确定方向也没关系。${loopHint}${knowledgeHint}我先不改右侧策略资产，建议先从三个入口里选一个：到店咨询、私信转化、账号人设种草。如果让我给默认建议，我会先围绕「${service}」做一条到店转化主线，再反推人设内容和场景种草。你更想先看哪一个方向？`;
  }

  if (!strategyWriteCompleted) {
    return `我先不急着把策略沉淀成结论。${loopHint}${knowledgeHint}为了避免套模板，先确认一个最关键事实：你现在最想解决的是“没人咨询”“有人问但不成交”“内容不知道发什么”，还是“想把某个服务项目推起来”？你先回答一个点，我再把它写进右侧策略资产。`;
  }

  if (input.round === 1) {
    return `收到，我已经把这轮目标收进右侧策略资产里。${loopHint}${knowledgeHint}现在看，${input.strategySnapshot.positioning}。下一步我想把人群和场景再钉牢一点: 你最优先想拿下的是哪一类人，她们通常会在什么场景下开始认真考虑你这项服务？`;
  }

  if (input.round === 2) {
    return `这条信息很关键，我已经把它合并到右侧客群和内容场景里。${loopHint}${knowledgeHint}当前建议是：${input.strategySnapshot.currentSuggestion}。再补最后一个关键问题: 现阶段最容易卡成交的异议是什么，是价格、效果可信度、时间安排，还是门店距离与体验顾虑？`;
  }

  const calendarHint = contentCalendarCompleted
    ? "右侧内容日历已经更新，你现在可以进入图文工作台生成笔记草稿，或者进入视频工作台生成脚本并继续推进视频任务。"
    : "下一步先确认右侧策略资产，再生成内容日历和图文/视频任务会更稳。";
  return `策略已经够落地了，我先帮你沉淀成可执行结论。${loopHint}${knowledgeHint}${input.strategySnapshot.currentSuggestion}。${calendarHint}`;
}

async function buildAssistantReplyWithModel(input: {
  merchant: MerchantProfileDto;
  round: number;
  userContent: string;
  sessionSummary?: string | null;
  strategySnapshot: StrategySnapshotDto;
  strategyMarkdown?: string | null;
  knowledgeMatches: KnowledgeSearchMatchDto[];
  toolResults?: ConsultationAgentToolResult[];
  consultationAgent: ConsultationAgentRuntimeSettings;
  llmRuntime: Awaited<ReturnType<typeof getPlatformSettings>>["llmRuntime"];
  sharedConsultationState: ConsultationAgentLoopState["sharedConsultationState"];
  expertTurnNotes: ConsultationAgentLoopState["expertTurnNotes"];
}): Promise<{
  content: string;
  mode: "llm" | "fallback_no_key" | "fallback_error";
  model?: string;
  error?: string;
}> {
  const fallback = buildAssistantReply(input);
  const contextInjection = buildConsultationContextInjection({
    merchant: input.merchant,
    round: input.round,
    userContent: input.userContent,
    sessionSummary: input.sessionSummary ?? null,
    strategySnapshot: input.strategySnapshot,
    strategyMarkdown: input.strategyMarkdown ?? "",
    consultationAgent: input.consultationAgent,
    knowledgeMatches: input.knowledgeMatches,
    toolResults: input.toolResults ?? [],
    sharedConsultationState: input.sharedConsultationState,
    expertTurnNotes: input.expertTurnNotes,
  });

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
            buildAgentSoulPrompt(input.consultationAgent),
            buildExpertContainerPrompt(input.consultationAgent),
            buildSkillCatalogPrompt(input.consultationAgent),
            buildActiveSkillPrompt(input.consultationAgent.activeSkills),
            buildBusinessToolPrompt(input.consultationAgent.enabledTools),
            buildContextInjectionSystemPrompt(contextInjection),
            "你只输出给商家的中文自然语言回复，不要输出 JSON、Markdown 表格或内部工具名。",
            "必须基于已完成工具结果、策略快照和受控知识库片段回答；如果信息不足，提出一个最关键的追问。",
            "如果工具结果已经显示策略资产被编辑，要先确认已按用户要求写入；不要反过来劝用户保持旧结构，也不要把已执行的明确编辑再改成优先级追问。",
            "当你列出目标客群、核心卖点或核心场景时，只能逐字使用 strategySnapshot 中已经存在的条目；不要补充未写入右侧策略资产的新条目。",
          ]
            .filter((item): item is string => Boolean(item))
            .join("\n"),
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
            contextInjection,
            strategySnapshot: input.strategySnapshot,
            knowledgeMatches: input.knowledgeMatches.map((match) => ({
              title: match.documentTitle,
              score: match.score,
              content: match.content.slice(0, 600),
            })),
            toolResults: (input.toolResults ?? []).map((result) => ({
              label: getConsultationToolDisplayLabel(result.toolName),
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
          ? `已按受控上下文策略注入 ${knowledgeMatches.length} 个片段，来源：${matchedTitles.join("、")}。`
          : `按 Top ${settings.retrievalTopK} 规则检索，暂无 indexed 知识片段命中。`,
      status: knowledgeMatches.length > 0 ? "completed" : "skipped",
    },
    update_strategy_snapshot: {
      key: "update_strategy_snapshot",
      label: "编辑策略资产",
      summary: `本轮尚未写入策略资产，等待明确业务信息后再同步到「${stageLabel}」。`,
      status: "skipped",
    },
    update_content_calendar: {
      key: "update_content_calendar",
      label: "更新内容日历",
      summary: "策略资产确认前，本轮不生成内容日历。",
      status: "skipped",
    },
    generate_article_brief: {
      key: "generate_article_brief",
      label: "生成图文任务草案",
      summary: "策略资产确认前，本轮不生成图文任务草案。",
      status: "skipped",
    },
    generate_video_brief: {
      key: "generate_video_brief",
      label: "生成视频任务草案",
      summary: "策略资产确认前，本轮不生成视频任务草案。",
      status: "skipped",
    },
    read_history: {
      key: "read_history",
      label: "读取历史内容",
      summary: "本轮尚未读取历史内容。",
      status: "skipped",
    },
    search_benchmark_materials: {
      key: "search_benchmark_materials",
      label: "检索对标素材",
      summary: "本轮尚未检索外部对标素材。",
      status: "skipped",
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
}): Promise<StrategyAssetEditorResolution> {
  if (!getAiRuntimeApiKey()) {
    return guardResolvedStrategyAssetEdit({
      state: input.state,
      patch: input.fallback,
      source: "fallback_no_key",
    });
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
        return guardResolvedStrategyAssetEdit({
          state: input.state,
          patch: input.fallback,
          source: "tool_not_called",
        });
      }

      const retryParsed = parseStrategyAssetEditorToolArgs(
        retryToolCall.function.arguments,
      );

      return retryParsed.ok
        ? guardResolvedStrategyAssetEdit({
            state: input.state,
            patch: retryParsed.patch,
            source: "llm_tool",
          })
        : guardResolvedStrategyAssetEdit({
            state: input.state,
            patch: input.fallback,
            source: "validation_failed",
          });
    }

    const parsed = parseStrategyAssetEditorToolArgs(toolCall.function.arguments);

    if (parsed.ok) {
      return guardResolvedStrategyAssetEdit({
        state: input.state,
        patch: parsed.patch,
        source: "llm_tool",
      });
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
      return guardResolvedStrategyAssetEdit({
        state: input.state,
        patch: input.fallback,
        source: "validation_failed",
      });
    }

    const retryParsed = parseStrategyAssetEditorToolArgs(
      retryToolCall.function.arguments,
    );

    return retryParsed.ok
      ? guardResolvedStrategyAssetEdit({
          state: input.state,
          patch: retryParsed.patch,
          source: "llm_tool",
        })
      : guardResolvedStrategyAssetEdit({
          state: input.state,
          patch: input.fallback,
          source: "validation_failed",
        });
  } catch {
    return guardResolvedStrategyAssetEdit({
      state: input.state,
      patch: input.fallback,
      source: "runtime_error",
    });
  }
}

function guardResolvedStrategyAssetEdit(input: {
  state: ConsultationAgentLoopState;
  patch: StrategyAssetEditorPatch;
  source: StrategyAssetGuardSource;
}): StrategyAssetEditorResolution {
  const guard = guardStrategyAssetEditorPatch({
    previousSnapshot: input.state.session.strategySnapshot,
    previousMarkdown: input.state.strategyMarkdown,
    userContent: input.state.userContent,
    patch: input.patch,
    source: input.source,
  });

  return {
    patch: guard.patch,
    guard,
  };
}

function buildStrategyAssetEditorMessages(
  state: ConsultationAgentLoopState,
): ChatMessage[] {
  const contextInjection = buildConsultationContextInjection({
    merchant: state.merchant,
    round: state.nextRound,
    userContent: state.userContent,
    sessionSummary: state.session.summaryText,
    strategySnapshot: state.session.strategySnapshot,
    strategyMarkdown: state.session.strategyAsset?.strategyMarkdown ?? state.strategyMarkdown,
    consultationAgent: state.consultationAgent,
    knowledgeMatches: state.knowledgeMatches,
    toolResults: [],
    sharedConsultationState: state.sharedConsultationState,
    expertTurnNotes: state.expertTurnNotes,
  });

  return [
    {
      role: "system",
      content: [
        "你是咨询 Agent 的策略资产编辑器，只负责把右侧策略资产作为一个完整文档改写。",
        buildExpertContainerPrompt(state.consultationAgent),
        buildAgentSoulPrompt(state.consultationAgent),
        buildContextInjectionSystemPrompt(contextInjection),
        "你必须调用 update_strategy_asset_editor 工具，并传入完整 strategyAsset 文档，不要只传局部字段。",
        "strategyAsset 必须包含 positioning、coreSellingPoints、targetAudiences、keyScenes、currentSuggestion、strategyMarkdown 六个字段。",
        "strategyMarkdown 是右侧策略资产的主文档，允许用 Markdown 章节自由沉淀用户洞察、内容方向、风控边界、待验证想法；不要把它压缩成固定字段。",
        "如果用户要求追加、补充或把刚才提到的内容放进策略资产，你要基于 currentStrategySnapshot 合并，并结合 recentConversation 理解指代。",
        "如果用户说'这5个'、'这些'、'刚才你说的'，由你根据 recentConversation 判断具体条目；runtime 不会替你解析中文指代。",
        "固定字段只写干净业务内容，不要包含聊天口语、编辑动作、Markdown 标记、引号或额外解释；strategyMarkdown 可以包含 Markdown 标题和列表。",
        "不要凭空补默认门店客群、到店人群或与当前商家不匹配的旧模板。",
        "如果用户只是追问、聊天或信息不足，strategyAsset 原样返回 currentStrategySnapshot，changedFields 传空数组。",
        "字段说明：positioning=我们是谁；targetAudiences=服务谁；keyScenes=核心场景；coreSellingPoints=核心卖点；currentSuggestion=当前建议；strategyMarkdown=完整策略资产文档。",
      ]
        .filter((item): item is string => Boolean(item))
        .join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        userMessage: state.userContent,
        mentionRouting: state.mentionRouting,
        contextInjection,
        recentConversation: state.conversationMessages.slice(-8),
        recentUserMessages: state.userMessages.slice(-4),
        currentStrategySnapshot: {
          positioning: state.session.strategySnapshot.positioning,
          coreSellingPoints: state.session.strategySnapshot.coreSellingPoints,
          targetAudiences: state.session.strategySnapshot.targetAudiences,
          keyScenes: state.session.strategySnapshot.keyScenes,
          currentSuggestion: state.session.strategySnapshot.currentSuggestion,
          strategyMarkdown: state.strategyMarkdown,
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
      "请重新调用 update_strategy_asset_editor。arguments 必须包含完整 strategyAsset 文档，并符合工具 schema；changedFields 只能标记本轮实际改动字段；固定字段只能写干净业务正文，strategyMarkdown 写完整 Markdown 策略资产文档。",
  });
}

const strategyAssetEditorTool: AiRuntimeTool = {
  type: "function",
  function: {
    name: "update_strategy_asset_editor",
    description:
      "编辑右侧策略资产。传入完整 strategyAsset 文档；固定字段保持干净正文，strategyMarkdown 保存完整 Markdown 策略资产文档。",
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
            strategyMarkdown: {
              type: "string",
              description:
                "完整策略资产 Markdown 文档。可包含当前定位、用户洞察、小红书表达方向、风控边界、待验证想法等自由章节。",
            },
          },
          required: [
            "positioning",
            "coreSellingPoints",
            "targetAudiences",
            "keyScenes",
            "currentSuggestion",
            "strategyMarkdown",
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
  > & {
    strategyMarkdown?: string | null;
  },
  changedFields: StrategyAssetFieldKey[] = [],
): StrategyAssetEditorPatch {
  return {
    positioning: cleanModelStrategyText(strategyAsset.positioning) ?? undefined,
    coreSellingPoints: cleanModelStrategyList(strategyAsset.coreSellingPoints),
    targetAudiences: cleanModelStrategyList(strategyAsset.targetAudiences),
    keyScenes: cleanModelStrategyList(strategyAsset.keyScenes),
    currentSuggestion: cleanModelStrategyText(strategyAsset.currentSuggestion) ?? undefined,
    strategyMarkdown: cleanModelStrategyMarkdown(strategyAsset.strategyMarkdown) ?? undefined,
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

function cleanModelStrategyMarkdown(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\r\n/g, "\n").trim();

  return normalized ? clipText(normalized, 24000) : null;
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

      if (field === "strategyMarkdown" && edit.strategyMarkdown) {
        return `策略资产文档 -> ${clipText(edit.strategyMarkdown.replace(/\n+/g, " "), 48)}`;
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
    strategyMarkdown: edit.strategyMarkdown ?? null,
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

function buildKnowledgeReplyHint(matches: KnowledgeSearchMatchDto[]) {
  if (matches.length === 0) {
    return "";
  }

  const titles = uniqueStrings(matches.map((match) => match.documentTitle)).slice(0, 2);
  return `我还参考了「${titles.join("、")}」里的平台方法论或商家上下文片段，先把它作为受控上下文合并进判断。`;
}

function buildAgentLoopReplyHint(toolResults: ConsultationAgentToolResult[]) {
  const completedToolNames = toolResults
    .filter((result) => result.status === "completed")
    .map((result) => result.toolName);
  const contextLabels = completedToolNames
    .filter((toolName) =>
      toolName === "read_merchant_profile" ||
      toolName === "retrieve_knowledge_base" ||
      toolName === "read_history",
    )
    .map((toolName) => getConsultationToolDisplayLabel(toolName));

  if (contextLabels.length === 0) {
    return "";
  }

  return `我先参考了${contextLabels.slice(0, 3).join("、")}。`;
}

function getConsultationToolDisplayLabel(
  toolName: ConsultationAgentToolResult["toolName"],
) {
  return (
    getConsultationBusinessToolCatalog().find((tool) => tool.key === toolName)?.label ??
    "咨询步骤"
  );
}

function hasCompletedConsultationTool(
  toolResults: ConsultationAgentToolResult[],
  toolName: ConsultationAgentToolResult["toolName"],
) {
  return toolResults.some((result) => result.toolName === toolName && result.status === "completed");
}

function resolveConsultationStageLabel(input: {
  userContent: string;
  toolResults: ConsultationAgentToolResult[];
}) {
  if (hasCompletedConsultationTool(input.toolResults, "update_content_calendar")) {
    return "策略沉淀完成";
  }

  if (hasCompletedConsultationTool(input.toolResults, "update_strategy_snapshot")) {
    return "策略资产待确认";
  }

  if (isLowInformationConsultationTurn(input.userContent) || isConsultationProcessQuestion(input.userContent)) {
    return "实际情况确认中";
  }

  return "实际情况确认中";
}

function isLowInformationConsultationTurn(content: string) {
  const normalized = content
    .replace(/^@[^\n，,。]+[，,。\s]*/, "")
    .replace(/\s+/g, "");

  if (normalized.length <= 8) {
    return true;
  }

  const hasVagueIntent =
    /不清楚|不知道|没想好|没思路|没有想法|有什么建议|你.*建议|怎么做|怎么办|随便/.test(
      normalized,
    );
  const hasConcreteStrategySignal =
    /定位|客群|人群|卖点|价格|异议|效果|时间|距离|到店|私信|转化|门店|内容|小红书|抖音|套餐|课程|服务|项目|体验/.test(
      normalized,
    );

  return hasVagueIntent && !hasConcreteStrategySignal;
}

function isConsultationProcessQuestion(content: string) {
  const normalized = content
    .replace(/^@[^\n，,。]+[，,。\s]*/, "")
    .replace(/\s+/g, "");

  return /(?:不应该|是不是应该|应该|为什么不|先)(?:.*)(?:问|了解|确认)(?:.*)(?:实际情况|情况|现状|需求|问题|目标)/.test(
    normalized,
  );
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
