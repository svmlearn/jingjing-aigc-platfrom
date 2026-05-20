import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import type {
  ContentCalendarItemDto,
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
  buildSkillReferencePrompt,
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
  ConsultationAgentToolKey,
  ConsultationAgentToolResult,
  ConsultationConversationMessage,
  ConsultationMentionRouting,
} from "@/server/api/consultation-runtime/types";
import {
  clipText,
  toStringArrayValue,
  uniqueStrings,
} from "@/server/api/consultation-runtime/utils";
import { emptyStrategySnapshot } from "@/lib/strategy-snapshot";
import {
  attachGuidanceToContentCalendar,
  buildMerchantKnowledgeCalendarGuidance,
} from "@/lib/content-calendar-guidance";
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
  const initialStrategySnapshot = buildInitialStrategySnapshot(merchant);
  const strategyAsset = await ensureMerchantStrategyAssetDocument({
    merchantId: merchant.id,
    fallback: initialStrategySnapshot,
  });
  const session = await createConsultationSession({
    merchantId: merchant.id,
    title: input.title ?? `${merchant.name} 咨询诊断`,
    currentStage: "用户信息读取",
    strategySnapshot: strategyAsset.strategySnapshot,
    summaryText: `${merchant.name} 的首轮咨询会话已建立，等待补充个人背景、可提供价值与当前目标。`,
  });

  await createConsultationEvent({
    sessionId: session.id,
    eventType: "session.created",
    stageLabel: "用户信息读取",
    payload: {
      userName: merchant.name,
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
    stageLabel: "用户信息读取",
    toolCards: buildToolCards({
      merchant,
      settings: consultationAgent,
      stageLabel: "用户信息读取",
    }),
    visibleSummary: {
      positioning: strategyAsset.strategySnapshot.positioning,
      nextAction: "先补充你的个人背景、可提供的能力和当前最想解决的问题。",
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

type QueuedConsultationMessageProcessing = {
  status: "queued";
  userMessageId: string;
  entitlement: ConsultationEntitlementCheck;
};

export async function sendConsultationMessageForUser(input: {
  userId: string;
  sessionId: string;
  content: string;
}) {
  const queued = await enqueueConsultationMessageForUser(input);

  if (!queued.processing) {
    return queued.session;
  }

  return processQueuedConsultationMessageForUser({
    userId: input.userId,
    sessionId: input.sessionId,
    userMessageId: queued.processing.userMessageId,
    entitlement: queued.processing.entitlement,
  });
}

export async function enqueueConsultationMessageForUser(input: {
  userId: string;
  sessionId: string;
  content: string;
}): Promise<{
  session: ConsultationSessionDetailDto;
  processing: QueuedConsultationMessageProcessing | null;
}> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const [{ consultationAgent, membershipPlans }, session, existingMerchantStrategyAsset] = await Promise.all([
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
    return {
      session: await sendRoundtableMessageForUser(input),
      processing: null,
    };
  }

  if (hasPendingAssistantReply(effectiveSession)) {
    throw new ApiError(
      409,
      "CONSULTATION_REPLY_PENDING",
      "上一条消息还在处理中，请等 AI 回复完成后再继续发送。",
    );
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

  await createConsultationEvent({
    sessionId: effectiveSession.id,
    eventType: "agent.loop.queued",
    stageLabel: "思考中",
    payload: {
      mode: "async_background_v1",
      sourceMessageId: userMessage.id,
      mentionRouting: routedRuntime.routing,
      agentContainer: routedRuntime.consultationAgent.container
        ? {
            agentId: routedRuntime.consultationAgent.container.agent.id,
            agentKey: routedRuntime.consultationAgent.container.agent.agentKey,
            displayName: routedRuntime.consultationAgent.container.agent.displayName,
            activePromptVersion: routedRuntime.consultationAgent.container.activePromptVersion?.versionNo ?? null,
            activeSoulVersion: routedRuntime.consultationAgent.container.activeSoulVersion?.versionNo ?? null,
          }
        : null,
    },
  });

  const updatedSession = await getConsultationSessionDetail({
    merchantId: merchant.id,
    sessionId: effectiveSession.id,
  });

  return {
    session: attachRoundtableState(
      attachStrategyAssetToSession(updatedSession, existingMerchantStrategyAsset),
    ),
    processing: {
      status: "queued",
      userMessageId: userMessage.id,
      entitlement,
    },
  };
}

export async function processQueuedConsultationMessageForUser(input: {
  userId: string;
  sessionId: string;
  userMessageId: string;
  entitlement?: ConsultationEntitlementCheck;
}) {
  try {
    return await processQueuedConsultationMessageForUserUnsafe(input);
  } catch (error) {
    await markQueuedConsultationMessageFailed({
      ...input,
      error,
    });
    throw error;
  }
}

async function processQueuedConsultationMessageForUserUnsafe(input: {
  userId: string;
  sessionId: string;
  userMessageId: string;
  entitlement?: ConsultationEntitlementCheck;
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
  const effectiveSession: ConsultationSessionDetailDto = {
    ...session,
    strategySnapshot: existingMerchantStrategyAsset?.strategySnapshot ?? session.strategySnapshot,
    strategyAsset: existingMerchantStrategyAsset ?? null,
  };
  const sourceMessageIndex = effectiveSession.messages.findIndex(
    (message) => message.id === input.userMessageId && message.role === "user",
  );

  if (sourceMessageIndex < 0) {
    throw new ApiError(
      404,
      "CONSULTATION_MESSAGE_NOT_FOUND",
      "Queued consultation message not found.",
    );
  }

  const messagesAfterSource = effectiveSession.messages.slice(sourceMessageIndex + 1);

  if (messagesAfterSource.some((message) => message.role === "assistant")) {
    return attachRoundtableState(
      attachStrategyAssetToSession(effectiveSession, existingMerchantStrategyAsset),
    );
  }

  if (resolveRoundtableState(effectiveSession)) {
    return attachRoundtableState(
      attachStrategyAssetToSession(effectiveSession, existingMerchantStrategyAsset),
    );
  }

  const sourceMessage = effectiveSession.messages[sourceMessageIndex];
  if (!sourceMessage) {
    throw new ApiError(
      404,
      "CONSULTATION_MESSAGE_NOT_FOUND",
      "Queued consultation message not found.",
    );
  }
  const previousMessages = effectiveSession.messages.slice(0, sourceMessageIndex);
  const messagesThroughSource = effectiveSession.messages.slice(0, sourceMessageIndex + 1);
  const runtime = await resolveConsultationAgentRuntime({
    fallback: consultationAgent,
  });
  const routedRuntime = await resolveMentionedConsultationAgentRuntime({
    fallback: consultationAgent,
    defaultRuntime: runtime.consultationAgent,
    content: sourceMessage.content,
  });
  await assertConsultationAgentAvailable({
    consultationAgent: routedRuntime.consultationAgent,
    mentionRouting: routedRuntime.routing,
  });
  const effectiveUserContent = routedRuntime.routing.cleanedContent;
  const entitlement =
    input.entitlement ??
    (await checkConsultationEntitlement({
      merchant,
      agentId: routedRuntime.consultationAgent.container?.agent.id ?? null,
      membershipPlans,
    }));
  const allUserMessages = messagesThroughSource
    .filter((message) => message.role === "user")
    .map((message) => message.content);
  const conversationMessages = messagesThroughSource
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
    session: {
      ...effectiveSession,
      messages: previousMessages,
    },
    userContent: effectiveUserContent,
    userMessages: allUserMessages,
    conversationMessages,
    consultationAgent: routedRuntime.consultationAgent,
    mentionRouting: routedRuntime.routing,
    knowledgeRuntime,
    llmRuntime,
  });
  const teamCalendarSnapshot = loopResult.strategySnapshot;
  const knowledgeCalendarGuidance = buildMerchantKnowledgeCalendarGuidance({
    matches: loopResult.knowledgeMatches,
    snapshot: teamCalendarSnapshot,
  });
  const finalizedStrategySnapshot = knowledgeCalendarGuidance
    ? {
        ...teamCalendarSnapshot,
        contentCalendarDraft: attachGuidanceToContentCalendar({
          calendar: teamCalendarSnapshot.contentCalendarDraft,
          guidance: knowledgeCalendarGuidance,
        }),
      }
    : teamCalendarSnapshot;
  const finalizedStrategyMarkdown =
    finalizedStrategySnapshot === loopResult.strategySnapshot
      ? loopResult.strategyMarkdown
      : buildStrategyAssetMarkdown(finalizedStrategySnapshot);

  await recordConsultationUsageSafely({
    merchantId: merchant.id,
    agentId: routedRuntime.consultationAgent.container?.agent.id ?? null,
    entitlement,
    runtimeSnapshot: loopResult.runtimeSnapshot,
  });

  await recordConsultationRuntimeSnapshotSafely({
    sessionId: effectiveSession.id,
    messageId: sourceMessage.id,
    stageLabel: loopResult.nextStage,
    runtimeSnapshot: loopResult.runtimeSnapshot,
  });

  await createConsultationEvent({
    sessionId: effectiveSession.id,
    eventType: "strategy_snapshot.updated",
    stageLabel: loopResult.nextStage,
    payload: {
      round: loopResult.nextRound,
      strategyTags: finalizedStrategySnapshot.strategyTags,
      calendarCount: finalizedStrategySnapshot.contentCalendarDraft.length,
      knowledgeGuidanceRefCount: knowledgeCalendarGuidance?.knowledgeRefs.length ?? 0,
      strategyMarkdownChars: finalizedStrategyMarkdown.length,
      loopIterations: loopResult.toolResults.length,
      mentionRouting: loopResult.mentionRouting,
      agentContainer: loopResult.agentContainer,
    },
  });
  const persistedStrategyAsset = await upsertMerchantStrategyAssetDocument({
    merchantId: merchant.id,
    strategySnapshot: finalizedStrategySnapshot,
    strategyMarkdown: finalizedStrategyMarkdown,
    canonicalSnapshot: finalizedStrategySnapshot,
  });
  await updateConsultationSession({
    merchantId: merchant.id,
    sessionId: effectiveSession.id,
    currentStage: loopResult.nextStage,
    strategySnapshot: finalizedStrategySnapshot,
    summaryText: finalizedStrategySnapshot.currentSuggestion,
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
      positioning: finalizedStrategySnapshot.positioning,
      strategyTags: finalizedStrategySnapshot.strategyTags,
      knowledgeContext: buildKnowledgeContextBlock(loopResult.knowledgeMatches),
      calendarKnowledgeGuidance: knowledgeCalendarGuidance
        ? {
            source: knowledgeCalendarGuidance.source,
            refCount: knowledgeCalendarGuidance.knowledgeRefs.length,
            mustUseFacts: knowledgeCalendarGuidance.mustUseFacts.slice(0, 5),
          }
        : null,
      agentLoop: {
        mode:
          loopResult.runtimeDesign === "native_tool_calling_loop_v1"
            ? "native_tool_calling_loop"
            : "bounded_tool_loop",
        runtimeDesign: loopResult.runtimeDesign,
        plannerMode: loopResult.plannerMode,
        terminalReason: loopResult.terminalReason,
        fallbackReason: loopResult.fallbackReason,
        agentContainer: loopResult.agentContainer,
        mentionRouting: loopResult.mentionRouting,
        expertTraffic: {
          policy: "short_term_expert_traffic_v1",
          sharedConsultationState: loopResult.sharedConsultationState,
          recentExpertTurnNotes: loopResult.expertTurnNotes,
          latestExpertTurnNote: loopResult.latestExpertTurnNote,
        },
        skillDisclosure: loopResult.skillDisclosure,
        contextBoundary:
          loopResult.runtimeSnapshot.toolCallSummary.contextBoundary ?? null,
        toolResults: loopResult.toolResults.map((result) => ({
          tool: result.toolName,
          rawToolName: result.rawToolName ?? null,
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
  }).then((updatedSession) =>
    attachRoundtableState({
      ...updatedSession,
      strategySnapshot: finalizedStrategySnapshot,
      strategyAsset: persistedStrategyAsset,
    }),
  );
}

function hasPendingAssistantReply(session: ConsultationSessionDetailDto) {
  return session.messages.at(-1)?.role === "user";
}

async function markQueuedConsultationMessageFailed(input: {
  userId: string;
  sessionId: string;
  userMessageId: string;
  entitlement?: ConsultationEntitlementCheck;
  error: unknown;
}) {
  const errorCode =
    input.error instanceof ApiError
      ? input.error.code
      : input.error instanceof Error
        ? input.error.name
        : "UNKNOWN_ERROR";

  if (input.entitlement?.reservedUsageEventId) {
    await updateMerchantUsageEvent({
      usageEventId: input.entitlement.reservedUsageEventId,
      actualCost: 0,
      status: "failed",
      metadata: {
        reason: "async_consultation_runtime_failed",
        sourceMessageId: input.userMessageId,
        errorCode,
      },
    }).catch(() => null);
  }

  try {
    const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
    const session = await getConsultationSessionDetail({
      merchantId: merchant.id,
      sessionId: input.sessionId,
    });
    const sourceMessageIndex = session.messages.findIndex(
      (message) => message.id === input.userMessageId && message.role === "user",
    );

    if (sourceMessageIndex < 0) {
      return;
    }

    const alreadyAnswered = session.messages
      .slice(sourceMessageIndex + 1)
      .some((message) => message.role === "assistant");

    if (alreadyAnswered) {
      return;
    }

    await createConsultationEvent({
      sessionId: input.sessionId,
      eventType: "agent.loop.failed",
      stageLabel: "处理失败",
      payload: {
        mode: "async_background_v1",
        sourceMessageId: input.userMessageId,
        errorCode,
      },
    });
    await createConsultationMessage({
      sessionId: input.sessionId,
      role: "assistant",
      content: "刚才这条消息我已经收到，但后台处理时中断了。你可以稍后重发，或者换一种更短的方式继续。",
      stageLabel: session.currentStage ?? "处理失败",
      visibleSummary: {
        agentLoop: {
          mode: "async_background_v1",
          status: "failed",
          sourceMessageId: input.userMessageId,
          errorCode,
        },
        nextAction: "稍后重试，或把问题拆成更短的一条继续。",
      },
    });
  } catch {
    // Background failure recovery must not mask the original runtime error.
  }
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
    buildNativeToolCallingMessages: ({ state: currentState, toolResults }) =>
      buildNativeToolCallingMessages({
        state: currentState,
        toolResults,
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
    runtimeDesign: runtimeResult.runtimeDesign,
    plannerMode: runtimeResult.plannerMode,
    terminalReason: runtimeResult.terminalReason,
    fallbackReason: runtimeResult.fallbackReason,
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
      summary: `已读取 ${state.merchant.name} 的用户信息、已填写能力项与背景上下文。`,
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
          ? `检索平台方法论与用户知识库，命中 ${matches.length} 个受控片段。`
          : "暂无 indexed 知识片段命中，继续使用用户信息与会话上下文。",
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
    const incomingCalendar = normalizeContentCalendarToolItems(call.args.calendar);
    const calendar = incomingCalendar.length
      ? incomingCalendar
      : state.strategySnapshot.contentCalendarDraft;
    const strategySnapshot = incomingCalendar.length
      ? {
          ...state.strategySnapshot,
          contentCalendarDraft: calendar,
        }
      : state.strategySnapshot;
    const strategyMarkdown = buildStrategyAssetMarkdown(strategySnapshot);

    return {
      callId: call.id,
      toolName: call.toolName,
      status: calendar.length > 0 ? "completed" : "skipped",
      summary:
        incomingCalendar.length > 0
          ? `已写入 ${calendar.length} 条图文/视频混合营销日历。`
          : calendar.length > 0
            ? `已同步 ${calendar.length} 条图文/视频混合营销日历。`
          : "策略快照尚未生成内容日历。",
      payload: {
        calendarCount: calendar.length,
        calendar,
        strategySnapshot,
        strategyMarkdown,
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
  if (result.toolName === "retrieve_knowledge_base" && result.status !== "failed") {
    state.knowledgeMatches = mergeLoopKnowledgeMatches([
      ...state.knowledgeMatches,
      ...(result.knowledgeMatches ?? []),
    ]);
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

  if (result.toolName === "update_content_calendar") {
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

function mergeLoopKnowledgeMatches(matches: KnowledgeSearchMatchDto[]) {
  const seen = new Set<string>();
  const merged: KnowledgeSearchMatchDto[] = [];

  for (const match of matches) {
    if (seen.has(match.chunkId)) {
      continue;
    }

    seen.add(match.chunkId);
    merged.push(match);
  }

  return merged.slice(0, 24);
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
  const service = getMerchantServiceAnchor(merchant);

  if (service) {
    return `你好，欢迎来到静境咨询台。我已经先读取了 ${merchant.name} 的用户信息。接下来我会帮你把「${service}」这个方向梳理成更清晰的定位、可提供价值、目标对象和内容策略。先告诉我：你现在最想先看个人优势、服务切口，还是内容表达方向？`;
  }

  return `你好，欢迎来到静境咨询台。我已经先读取了 ${merchant.name} 的用户信息。不过当前信息里还没有你的职业背景、可提供能力和目标对象，我不会先替你假设行业。先告诉我：你是谁、主要擅长什么、现在最想先厘清个人优势、定位切口还是内容方向？`;
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
      content: buildAssistantErrorReply("AI 咨询服务暂时不可用，当前环境没有配置可用的模型密钥。"),
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
            buildSkillReferencePrompt(input.consultationAgent.activeSkills),
            buildBusinessToolPrompt(input.consultationAgent.enabledTools),
            buildContextInjectionSystemPrompt(contextInjection),
            "你只输出给用户的中文自然语言回复，不要输出 JSON、Markdown 表格或内部工具名。",
            "回答时可以使用已完成工具结果、策略快照和受控知识库片段；如果信息不足，可以提出一个最关键的追问。",
            "当 knowledgeMatches 已包含用户知识库片段时，由你结合用户问题判断如何引用；不要声称无法查看用户知识库或上传文件。",
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
    const errorMessage =
      error instanceof AiRuntimeError
        ? `${error.message}${error.status ? ` (${error.status})` : ""}`
        : error instanceof Error
          ? error.message
          : "Unknown AI runtime error.";
    const recoveredReply = buildRecoveredToolResultReply({
      toolResults: input.toolResults ?? [],
      errorMessage,
    });

    return {
      content: recoveredReply ?? buildAssistantErrorReply(errorMessage),
      mode: "fallback_error",
      error: errorMessage,
    };
  }
}

function buildRecoveredToolResultReply(input: {
  toolResults: ConsultationAgentToolResult[];
  errorMessage: string;
}) {
  const completedResults = input.toolResults.filter((result) => result.status === "completed");

  if (completedResults.length === 0) {
    return null;
  }

  const retrievedCount = completedResults.filter(
    (result) => result.toolName === "retrieve_knowledge_base",
  ).length;
  const strategyResult = completedResults.find(
    (result) => result.toolName === "update_strategy_snapshot",
  );
  const calendarResult = completedResults.find(
    (result) => result.toolName === "update_content_calendar",
  );

  if (!retrievedCount && !strategyResult && !calendarResult) {
    return null;
  }

  const lines = [
    "本轮自然语言总结生成超时了，但受控工具已经执行完成，已保留本轮写入结果。",
  ];

  if (retrievedCount > 0) {
    lines.push(`已完成 ${retrievedCount} 轮知识库检索，并把命中的资料纳入本轮上下文。`);
  }

  if (strategyResult) {
    lines.push(strategyResult.summary);
  }

  if (calendarResult) {
    lines.push(calendarResult.summary);
    lines.push("你可以先查看右侧内容日历；下一轮我会继续基于这些已写入结果协作。");
  }

  lines.push(`超时信息：${input.errorMessage}`);

  return lines.join("\n");
}

function buildAssistantErrorReply(detail: string) {
  return `抱歉，AI 咨询服务暂时出现问题，这条回复没有成功生成。问题：${detail} 请稍后重试。`;
}

function buildNativeToolCallingMessages(input: {
  state: ConsultationAgentLoopState;
  toolResults: ConsultationAgentToolResult[];
}): ChatMessage[] {
  const contextInjection = buildConsultationContextInjection({
    merchant: input.state.merchant,
    round: input.state.nextRound,
    userContent: input.state.userContent,
    sessionSummary: input.state.session.summaryText ?? null,
    strategySnapshot: input.state.strategySnapshot,
    strategyMarkdown: input.state.strategyMarkdown,
    consultationAgent: input.state.consultationAgent,
    knowledgeMatches: input.state.knowledgeMatches,
    toolResults: input.toolResults,
    sharedConsultationState: input.state.sharedConsultationState,
    expertTurnNotes: input.state.expertTurnNotes,
  });

  return [
    {
      role: "system",
      content: [
        input.state.consultationAgent.systemPrompt,
        buildAgentSoulPrompt(input.state.consultationAgent),
        buildExpertContainerPrompt(input.state.consultationAgent),
        buildSkillCatalogPrompt(input.state.consultationAgent),
        buildActiveSkillPrompt(input.state.consultationAgent.activeSkills),
        buildSkillReferencePrompt(input.state.consultationAgent.activeSkills),
        buildBusinessToolPrompt(input.state.consultationAgent.enabledTools),
        buildContextInjectionSystemPrompt(contextInjection),
        "你正在运行 native_tool_calling_loop_v1：工具必须通过 API tools 字段返回结构化 tool_calls，不要在正文里输出工具 JSON。",
        "当用户直接要求读取、查看、总结、盘点或分析用户知识库/已上传文件/资料时，请先调用 retrieve_knowledge_base 获取资料，再自行判断如何回答、追问或写入资产；不要声称无法读取用户知识库。",
        "做团队选题、营销日历、图文文案或视频脚本规划时，如果一次检索只覆盖项目事实、方法论、话术或素材边界中的一部分，可以用新的 query 再调用 retrieve_knowledge_base 深挖；写入类工具仍要在信息足够后再调用。",
        "如果用户明确列出多个检索维度，例如项目优势、选房方法论、异议转化话术、素材边界，你应把这些维度拆成不同 query 逐轮读取；不要只用一个大 query 命中几个 chunk 后直接写日历。",
        "生成视频选题、脚本方向或日历隐藏上下文时，画面描述必须根据已返回的素材能力、用户确认的场景或可补拍方式来写；没有素材依据的镜头不要写成确定方案。",
        "只有寒暄、轻问答、流程说明或完全不需要受控上下文时，才可以不调用工具直接回复。",
        "只有在用户明确要求沉淀、补充、写进右侧策略资产，或当前信息已经足够形成业务结论时，才调用 update_strategy_snapshot。",
        "当用户要求生成、补充或调整内容日历、营销日历、团队选题、本周图文/视频任务时，优先考虑调用 update_content_calendar，并传入可执行的 calendar 条目。",
        "轻问答、寒暄、流程追问、信息不足时，不要调用 update_strategy_snapshot；应该直接回答或追问一个关键事实。",
        "用户要求找对标、竞品、爆款、博主主页或提供小红书/抖音链接时，优先调用 search_benchmark_materials。",
        "需要方法论、案例、用户资料依据时，调用 retrieve_knowledge_base；用户提到刚才、上次、前面时，调用 read_history。",
        "工具返回 skipped 或 guardrail 拒写时，最终回复必须承认本轮未写入，不能声称已经更新。",
        "最终可见回复只输出给用户的中文自然语言，不要输出内部工具名、JSON、Markdown 表格或 debug payload。",
      ]
        .filter((item): item is string => Boolean(item))
        .join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        merchant: {
          name: input.state.merchant.name,
          industry: input.state.merchant.industry,
          serviceItems: input.state.merchant.serviceItems,
          defaultCta: input.state.merchant.defaultCta,
        },
        userMessage: input.state.userContent,
        round: input.state.nextRound,
        contextInjection,
        strategySnapshot: input.state.strategySnapshot,
        knowledgeMatches: input.state.knowledgeMatches.map((match) => ({
          title: match.documentTitle,
          score: match.score,
          content: match.content.slice(0, 600),
        })),
        toolResults: input.toolResults.map((result) => ({
          label: getConsultationToolDisplayLabel(result.toolName),
          status: result.status,
          summary: result.summary,
          guardrail: result.payload.guardrail ?? null,
        })),
        skillDisclosure: buildSkillDisclosure(input.state.consultationAgent),
      }),
    },
  ];
}

function buildToolCards(input: {
  merchant: MerchantProfileDto;
  settings: ConsultationAgentSettingsDto;
  stageLabel: string;
  knowledgeMatches?: KnowledgeSearchMatchDto[];
  toolResults?: ConsultationAgentToolResult[];
}): ConsultationToolCardDto[] {
  return (input.toolResults ?? []).map((result) => ({
    key: result.toolName,
    label: getConsultationToolDisplayLabel(result.toolName),
    summary: result.summary,
    status: result.status,
  }));
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
  const hasUsableSeed =
    hasMerchantStrategySeedFacts(input.merchant) ||
    hasStrategyAssetEditorFacts(assetEdit) ||
    hasUsableStrategySnapshot(input.previousSnapshot);

  if (!hasUsableSeed) {
    return createEmptyStrategySnapshot();
  }

  const audiences = mergeEditedStrategyList({
    edited: assetEdit?.targetAudiences,
    fallback: [
      ...(input.previousSnapshot?.targetAudiences ?? []),
      ...extractKeywordMatches(mergedUserText, [
        "创业者",
        "企业团队",
        "产品经理",
        "职场人",
        "转型人群",
        "AI团队",
      ]),
      ...extractKeywordMatches(knowledgeText, ["创业者", "企业团队", "产品经理", "职场人", "转型人群", "AI团队"]),
      ...extractKeywordMatches(input.merchant.brandSummary ?? "", [
        "创业者",
        "企业团队",
        "产品经理",
        "职场人",
        "转型人群",
        "AI团队",
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
        "产品判断",
        "方案设计",
        "方法论",
        "实战经验",
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
        "职业转型",
        "产品设计",
        "方案评审",
        "需求拆解",
        "AI落地",
        "内容表达",
      ]),
      ...extractKeywordMatches(knowledgeText, ["职业转型", "产品设计", "方案评审", "需求拆解", "AI落地", "内容表达"]),
      input.merchant.regionSummary ?? "",
    ],
    maxItems: strategyAssetListLimits.keyScenes,
  });
  const strategyTags = uniqueStrings([
    ...(input.previousSnapshot?.strategyTags ?? []),
    knowledgeText ? "知识库命中" : "",
    mergedUserText.includes("视频") ? "视频优先" : "",
  ]).slice(0, 4);
  const positioning =
    assetEdit?.positioning ??
    input.previousSnapshot?.positioning ??
    "";
  const currentSuggestion =
    assetEdit?.currentSuggestion ??
    input.previousSnapshot?.currentSuggestion ??
    "";

  return {
    positioning,
    coreSellingPoints: sellingPoints,
    targetAudiences: audiences,
    keyScenes,
    currentSuggestion,
    strategyTags,
    contentCalendarDraft: input.previousSnapshot?.contentCalendarDraft ?? [],
    articleBrief: input.previousSnapshot?.articleBrief ?? null,
    videoBrief: input.previousSnapshot?.videoBrief ?? null,
  };
}

function normalizeContentCalendarToolItems(value: unknown): ContentCalendarItemDto[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const usedIds = new Set<string>();

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const contentType = record.contentType === "video" ? "video" : "article";
      const title = cleanCalendarText(record.title, 100);
      const summary = cleanCalendarText(record.summary, 360);
      const dayLabel = cleanCalendarText(record.dayLabel, 24);

      if (!title || !summary || !dayLabel) {
        return null;
      }

      const requestedId = cleanCalendarText(record.id, 80);
      const fallbackId = `calendar-${index + 1}-${contentType}`;
      const id = uniqueCalendarItemId(requestedId || fallbackId, usedIds);

      return {
        id,
        dayLabel,
        contentType,
        strategyTag: cleanCalendarText(record.strategyTag, 40) || title,
        title,
        summary,
      };
    })
    .filter((item): item is ContentCalendarItemDto => Boolean(item))
    .slice(0, 14);
}

function cleanCalendarText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized ? clipText(normalized, maxLength) : "";
}

function uniqueCalendarItemId(baseId: string, usedIds: Set<string>) {
  const normalizedBase = baseId.replace(/\s+/g, "-").slice(0, 80) || "calendar-item";
  let candidate = normalizedBase;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${normalizedBase}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function buildInitialStrategySnapshot(merchant: MerchantProfileDto): StrategySnapshotDto {
  if (!hasMerchantStrategySeedFacts(merchant)) {
    return createEmptyStrategySnapshot();
  }

  return buildStrategySnapshot({
    merchant,
    previousSnapshot: null,
    userMessages: [],
  });
}

function createEmptyStrategySnapshot(): StrategySnapshotDto {
  return {
    ...emptyStrategySnapshot,
    coreSellingPoints: [],
    targetAudiences: [],
    keyScenes: [],
    strategyTags: [],
    contentCalendarDraft: [],
    articleBrief: null,
    videoBrief: null,
  };
}

function getMerchantServiceAnchor(merchant: MerchantProfileDto) {
  return firstCleanText([merchant.serviceItems[0], merchant.industry]);
}

function hasMerchantStrategySeedFacts(merchant: MerchantProfileDto) {
  return Boolean(
    getMerchantServiceAnchor(merchant) ||
      firstCleanText([
        merchant.brandSummary,
        merchant.regionSummary,
        merchant.toneStyle,
        merchant.defaultCta[0],
      ]),
  );
}

function hasStrategyAssetEditorFacts(assetEdit?: StrategyAssetEditorPatch) {
  if (!assetEdit) {
    return false;
  }

  return Boolean(
    firstCleanText([
      assetEdit.positioning,
      assetEdit.currentSuggestion,
      ...(assetEdit.coreSellingPoints ?? []),
      ...(assetEdit.targetAudiences ?? []),
      ...(assetEdit.keyScenes ?? []),
    ]),
  );
}

function hasUsableStrategySnapshot(snapshot: StrategySnapshotDto | null) {
  if (!snapshot) {
    return false;
  }

  return Boolean(
    firstCleanText([
      snapshot.positioning,
      snapshot.currentSuggestion,
      ...(snapshot.coreSellingPoints ?? []),
      ...(snapshot.targetAudiences ?? []),
      ...(snapshot.keyScenes ?? []),
    ]),
  );
}

function firstCleanText(values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim()).find((value): value is string => Boolean(value));
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
        "不要凭空补默认目标对象、经营场景或与当前用户不匹配的旧模板。",
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
          description: "本轮修改摘要，给 runtime 记录用，不展示给用户。",
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

function getConsultationToolDisplayLabel(
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

function hasCompletedConsultationTool(
  toolResults: ConsultationAgentToolResult[],
  toolName: ConsultationAgentToolKey,
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
    /定位|客群|人群|对象|用户|价值|优势|天赋|闪光点|职业|案例|价格|异议|效果|时间|内容|小红书|抖音|课程|服务|项目|体验/.test(
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
