import "server-only";

import { z } from "zod";

import type {
  ConsultationMessageDto,
  ConsultationSessionDetailDto,
  RoundtableAgentRole,
  RoundtableHandoffDto,
  RoundtableInterviewPhaseKey,
  RoundtablePhaseKey,
  RoundtablePhaseOutputDto,
  RoundtableSessionStatus,
  RoundtableStateDto,
  StrategySnapshotDto,
} from "@/contracts/consultation";
import type { MerchantProfileDto } from "@/contracts/merchant";
import {
  createConsultationEvent,
  createConsultationMessage,
  createConsultationSession,
  getConsultationSessionDetail,
  updateConsultationSession,
} from "@/lib/db/consultation-repository";
import {
  ensureMerchantStrategyAsset,
  upsertMerchantStrategyAsset,
} from "@/lib/db/merchant-strategy-asset-repository";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import { getPlatformSettings } from "@/lib/db/platform-admin-repository";
import { createChatCompletion, getAiRuntimeApiKey } from "@/server/api/ai-runtime";
import { ApiError } from "@/server/api/errors";

type RoundtableSessionDetail = ConsultationSessionDetailDto & {
  roundtable: RoundtableStateDto | null;
};

type RoundtableAction =
  | "complete_phase"
  | "confirm_phase_summary"
  | "return_to_phase"
  | "save_strategy_candidate";

type RoundtableExpertContainer = {
  phaseKey: RoundtableInterviewPhaseKey;
  title: string;
  agentRole: RoundtableAgentRole;
  agentName: string;
  outputTitle: string;
  outputFields: string[];
  focus: string;
  evidenceRule: string;
  container: {
    agentKey: string;
    displayName: string;
    systemPrompt: string;
    skills: string[];
    knowledgePolicy: string;
    toolPolicy: "interview_only" | "summarize_phase" | "synthesize_strategy";
  };
};

const roundtablePhaseOrder: RoundtableInterviewPhaseKey[] = ["asset", "skill", "marketing"];

const expertContainers: Record<RoundtableInterviewPhaseKey, RoundtableExpertContainer> = {
  asset: {
    phaseKey: "asset",
    title: "资产盘点",
    agentRole: "asset_manager",
    agentName: "资产盘点官",
    outputTitle: "asset_diagnosis",
    outputFields: ["life_context", "available_assets", "real_stories", "material_clues", "constraints", "risk_boundaries"],
    focus: "生活状态、经营资源、过往经历、真实案例、素材线索和表达禁区",
    evidenceRule: "只记录用户明确说过或能从商家资料直接得出的资产事实；用户反问、没听懂、情绪反馈不能写成资产。",
    container: {
      agentKey: "roundtable_asset_manager",
      displayName: "资产盘点官",
      systemPrompt: "专注盘点商家的真实资产、生活状态、经营资源、故事素材与表达边界。",
      skills: ["资产追问", "事实抽取", "素材边界识别"],
      knowledgePolicy: "读取商家资料和本阶段 transcript；只接收前序结构化摘要，不默认读取全量跨阶段 transcript。",
      toolPolicy: "interview_only",
    },
  },
  skill: {
    phaseKey: "skill",
    title: "技能洞察",
    agentRole: "skill_mapper",
    agentName: "技能洞察官",
    outputTitle: "skill_diagnosis",
    outputFields: ["skill_clusters", "repeatable_methods", "proof_points", "differentiators", "content_voice_clues"],
    focus: "可复制能力、服务方法、判断标准、可信证明和表达优势",
    evidenceRule: "只基于资产摘要和当前技能访谈抽取能力；没有方法、证明或优势时必须标记信息不足，不能补模板。",
    container: {
      agentKey: "roundtable_skill_mapper",
      displayName: "技能洞察官",
      systemPrompt: "专注把资产事实转成可复制能力、服务方法、证明点与表达优势。",
      skills: ["能力聚类", "方法论抽取", "证明点识别"],
      knowledgePolicy: "读取资产阶段摘要和当前技能访谈；不编造未被资产或 transcript 支撑的方法。",
      toolPolicy: "summarize_phase",
    },
  },
  marketing: {
    phaseKey: "marketing",
    title: "营销策略",
    agentRole: "marketing_strategist",
    agentName: "营销策略官",
    outputTitle: "marketing_strategy",
    outputFields: ["positioning", "target_audiences", "core_selling_points", "content_pillars", "strategy_tags", "cta_suggestions", "risk_boundaries"],
    focus: "目标客群、内容定位、核心卖点、选题方向、CTA 和风险边界",
    evidenceRule: "营销判断必须引用资产和技能阶段摘要；缺少事实时输出信息不足，不得编造客群、卖点或 CTA。",
    container: {
      agentKey: "roundtable_marketing_strategist",
      displayName: "营销策略官",
      systemPrompt: "专注把资产与技能阶段产物转成内容定位、目标客群、卖点、选题与 CTA。",
      skills: ["定位收束", "卖点表达", "内容策略设计"],
      knowledgePolicy: "读取资产与技能阶段摘要、本阶段访谈和商家资料；策略判断必须可追溯到前序事实。",
      toolPolicy: "synthesize_strategy",
    },
  },
};

const phaseMeta = expertContainers;

const moderatorName = "主持人";

const roundtableQuestionSchema = z
  .object({
    message: z.string().trim().min(1).max(1200),
    intent: z.string().trim().max(200).optional(),
    shouldSuggestPhaseComplete: z.boolean().optional(),
  })
  .strict();

const roundtablePhaseSummarySchema = z
  .object({
    isSufficient: z.boolean(),
    insufficientReason: z.string().trim().max(500).nullable().optional(),
    missingQuestions: z.array(z.string().trim().min(1).max(240)).max(5).optional(),
    title: z.string().trim().min(1).max(120),
    fields: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(80),
            items: z.array(z.string().trim().min(1).max(180)).min(1).max(5),
          })
          .strict(),
      )
      .min(2)
      .max(10),
    handoffSummary: z.string().trim().min(1).max(500),
    confidence: z.enum(["low", "medium", "high"]),
  })
  .strict();

const strategyCandidateSchema = z
  .object({
    positioning: z.string().trim().min(1).max(500),
    coreSellingPoints: z.array(z.string().trim().min(1).max(120)).min(1).max(8),
    targetAudiences: z.array(z.string().trim().min(1).max(120)).min(1).max(8),
    keyScenes: z.array(z.string().trim().min(1).max(140)).min(1).max(8),
    currentSuggestion: z.string().trim().min(1).max(800),
    strategyTags: z.array(z.string().trim().min(1).max(40)).min(1).max(8),
    contentCalendarDraft: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(80),
            dayLabel: z.string().trim().min(1).max(40),
            contentType: z.enum(["article", "video"]),
            strategyTag: z.string().trim().min(1).max(80),
            title: z.string().trim().min(1).max(120),
            summary: z.string().trim().min(1).max(240),
          })
          .strict(),
      )
      .min(3)
      .max(7),
    articleBrief: z
      .object({
        workingTitle: z.string().trim().min(1).max(120),
        angle: z.string().trim().min(1).max(240),
        callToAction: z.string().trim().min(1).max(120),
      })
      .strict(),
    videoBrief: z
      .object({
        workingTitle: z.string().trim().min(1).max(120),
        hook: z.string().trim().min(1).max(240),
        outcome: z.string().trim().min(1).max(240),
      })
      .strict(),
  })
  .strict();

export async function createRoundtableConsultationSessionForUser(input: {
  userId: string;
  title?: string | null;
}): Promise<RoundtableSessionDetail> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const now = new Date().toISOString();
  const strategySnapshot = await ensureMerchantStrategyAsset({
    merchantId: merchant.id,
    fallback: buildInitialStrategySnapshot(merchant),
  });
  const state = buildInitialRoundtableState(now);
  const session = await createConsultationSession({
    merchantId: merchant.id,
    title: input.title ?? `${merchant.name} 圆桌咨询`,
    currentStage: getRoundtableStageLabel(state),
    strategySnapshot,
    summaryText: "圆桌咨询已开始，当前由资产盘点官先梳理真实资产和表达边界。",
  });

  await writeRoundtableStateEvent({
    sessionId: session.id,
    state,
    reason: "created",
  });
  await createConsultationMessage({
    sessionId: session.id,
    role: "assistant",
    content: buildModeratorOpening(merchant),
    stageLabel: "圆桌咨询开场",
    toolCards: buildRoundtableToolCards(state),
    visibleSummary: buildRoundtableVisibleSummary({
      state,
      phaseKey: "intro",
      agentName: moderatorName,
    }),
  });
  await createConsultationMessage({
    sessionId: session.id,
    role: "assistant",
    content: await buildRoundtableQuestion({
      merchant,
      state,
      phaseKey: "asset",
      recentUserContent: "",
      phaseMessages: [],
    }),
    stageLabel: phaseMeta.asset.title,
    toolCards: buildRoundtableToolCards(state),
    visibleSummary: buildRoundtableVisibleSummary({
      state,
      phaseKey: "asset",
      agentName: phaseMeta.asset.agentName,
    }),
  });

  return getRoundtableSessionDetail({
    merchantId: merchant.id,
    sessionId: session.id,
  });
}

export async function sendRoundtableMessageForUser(input: {
  userId: string;
  sessionId: string;
  content: string;
}): Promise<RoundtableSessionDetail> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const session = await getConsultationSessionDetail({
    merchantId: merchant.id,
    sessionId: input.sessionId,
  });
  const state = requireRoundtableState(session);
  const phaseKey = getCurrentInterviewPhase(state);

  if (!phaseKey || !isInterviewingStatus(state.status)) {
    throw new ApiError(
      409,
      "ROUNDTABLE_PHASE_NOT_INTERVIEWING",
      "当前圆桌阶段正在等待确认，先处理阶段摘要或策略候选。",
    );
  }

  const userMessage = await createConsultationMessage({
    sessionId: session.id,
    role: "user",
    content: input.content,
    stageLabel: phaseMeta[phaseKey].title,
    visibleSummary: buildRoundtableVisibleSummary({
      state,
      phaseKey,
      agentName: "商家",
    }),
  });
  const nextMessages = [...session.messages, userMessage];
  const phaseMessages = getMessagesForPhase(nextMessages, phaseKey);
  const assistantContent = await buildRoundtableQuestion({
    merchant,
    state,
    phaseKey,
    recentUserContent: input.content,
    phaseMessages,
  });

  await createConsultationMessage({
    sessionId: session.id,
    role: "assistant",
    content: assistantContent,
    stageLabel: phaseMeta[phaseKey].title,
    toolCards: buildRoundtableToolCards(state),
    visibleSummary: buildRoundtableVisibleSummary({
      state,
      phaseKey,
      agentName: phaseMeta[phaseKey].agentName,
    }),
  });
  await createConsultationEvent({
    sessionId: session.id,
    eventType: "roundtable.interview.turn_completed",
    stageLabel: phaseMeta[phaseKey].title,
    payload: {
      phaseKey,
      agentRole: phaseMeta[phaseKey].agentRole,
      userMessageId: userMessage.id,
      messageCount: phaseMessages.length,
    },
  });

  return getRoundtableSessionDetail({
    merchantId: merchant.id,
    sessionId: session.id,
  });
}

export async function runRoundtableActionForUser(input: {
  userId: string;
  sessionId: string;
  action: RoundtableAction;
}): Promise<RoundtableSessionDetail> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const session = await getConsultationSessionDetail({
    merchantId: merchant.id,
    sessionId: input.sessionId,
  });
  const state = requireRoundtableState(session);

  if (input.action === "complete_phase") {
    return completeRoundtablePhase({ merchant, session, state });
  }

  if (input.action === "confirm_phase_summary") {
    return confirmRoundtablePhaseSummary({ merchant, session, state });
  }

  if (input.action === "return_to_phase") {
    return returnRoundtableToInterview({ merchant, session, state });
  }

  return saveRoundtableStrategyCandidate({ merchant, session, state });
}

export function attachRoundtableState<T extends ConsultationSessionDetailDto>(
  session: T,
): T & { roundtable: RoundtableStateDto | null } {
  return {
    ...session,
    roundtable: resolveRoundtableState(session),
  };
}

export function resolveRoundtableState(
  session: Pick<ConsultationSessionDetailDto, "events">,
): RoundtableStateDto | null {
  const event = [...session.events]
    .reverse()
    .find((item) => item.eventType === "roundtable.state.updated");
  const state = toRecord(event?.payload).state;

  return toRoundtableState(state);
}

export function buildRoundtableSnapshotForInput(
  session: Pick<ConsultationSessionDetailDto, "events">,
) {
  const state = resolveRoundtableState(session);

  if (!state) {
    return null;
  }

  return {
    mode: state.mode,
    status: state.status,
    currentPhase: state.currentPhase,
    phaseOutputs: state.phaseOutputs,
    handoffTrace: state.handoffTrace,
    strategySavedAt: state.strategySavedAt ?? null,
  };
}

async function completeRoundtablePhase(input: {
  merchant: MerchantProfileDto;
  session: ConsultationSessionDetailDto;
  state: RoundtableStateDto;
}): Promise<RoundtableSessionDetail> {
  const phaseKey = getCurrentInterviewPhase(input.state);

  if (!phaseKey || !isInterviewingStatus(input.state.status)) {
    throw new ApiError(
      409,
      "ROUNDTABLE_PHASE_CANNOT_COMPLETE",
      "当前阶段不能生成摘要，请先完成正在等待的确认动作。",
    );
  }

  const phaseMessages = getMessagesForPhase(input.session.messages, phaseKey);
  const summaryResult = await buildPhaseOutputWithModel({
    merchant: input.merchant,
    state: input.state,
    phaseKey,
    messages: phaseMessages,
    createdAt: new Date().toISOString(),
  });

  if (summaryResult.status !== "ready") {
    await createConsultationMessage({
      sessionId: input.session.id,
      role: "assistant",
      content: formatPhaseSummaryBlockedMessage({
        phaseKey,
        reason: summaryResult.reason,
        missingQuestions: summaryResult.missingQuestions,
      }),
      stageLabel: phaseMeta[phaseKey].title,
      toolCards: buildRoundtableToolCards(input.state),
      visibleSummary: buildRoundtableVisibleSummary({
        state: input.state,
        phaseKey,
        agentName: phaseMeta[phaseKey].agentName,
      }),
    });
    await createConsultationEvent({
      sessionId: input.session.id,
      eventType: "roundtable.phase_summary.blocked",
      stageLabel: phaseMeta[phaseKey].title,
      payload: {
        phaseKey,
        reason: summaryResult.reason,
        missingQuestions: summaryResult.missingQuestions,
      },
    });

    return getRoundtableSessionDetail({
      merchantId: input.merchant.id,
      sessionId: input.session.id,
    });
  }

  const now = new Date().toISOString();
  const output = {
    ...summaryResult.output,
    createdAt: now,
  };
  const nextState: RoundtableStateDto = {
    ...input.state,
    status: getSummarizingStatus(phaseKey),
    phaseOutputs: {
      ...input.state.phaseOutputs,
      [phaseKey]: output,
    },
    updatedAt: now,
  };

  await persistRoundtableState({
    merchantId: input.merchant.id,
    sessionId: input.session.id,
    state: nextState,
    reason: "phase_summary_ready",
    summaryText: output.handoffSummary,
  });
  await createConsultationMessage({
    sessionId: input.session.id,
    role: "assistant",
    content: formatPhaseSummaryMessage(output),
    stageLabel: `${phaseMeta[phaseKey].title}摘要`,
    toolCards: buildRoundtableToolCards(nextState),
    visibleSummary: buildRoundtableVisibleSummary({
      state: nextState,
      phaseKey,
      agentName: phaseMeta[phaseKey].agentName,
      phaseOutput: output,
    }),
  });

  return getRoundtableSessionDetail({
    merchantId: input.merchant.id,
    sessionId: input.session.id,
  });
}

async function confirmRoundtablePhaseSummary(input: {
  merchant: MerchantProfileDto;
  session: ConsultationSessionDetailDto;
  state: RoundtableStateDto;
}): Promise<RoundtableSessionDetail> {
  const phaseKey = getCurrentInterviewPhase(input.state);

  if (!phaseKey || input.state.status !== getSummarizingStatus(phaseKey)) {
    throw new ApiError(
      409,
      "ROUNDTABLE_SUMMARY_NOT_READY",
      "当前没有可确认的阶段摘要。",
    );
  }

  const output = input.state.phaseOutputs[phaseKey];

  if (!output) {
    throw new ApiError(
      409,
      "ROUNDTABLE_PHASE_OUTPUT_MISSING",
      "当前阶段摘要缺失，请重新生成。",
    );
  }

  if (phaseKey === "marketing") {
    return enterRoundtableSynthesis({
      merchant: input.merchant,
      session: input.session,
      state: input.state,
    });
  }

  const nextPhase = phaseKey === "asset" ? "skill" : "marketing";
  const now = new Date().toISOString();
  const handoff: RoundtableHandoffDto = {
    fromPhase: phaseKey,
    toPhase: nextPhase,
    handoffSummary: output.handoffSummary,
    includedContextKeys: output.fields.map((field) => field.label),
    excludedContextReason: "第一版只传阶段结构化摘要，不默认传全量 transcript。",
    createdAt: now,
  };
  const nextState: RoundtableStateDto = {
    ...input.state,
    status: getInterviewingStatus(nextPhase),
    currentPhase: nextPhase,
    currentAgentRole: phaseMeta[nextPhase].agentRole,
    handoffTrace: [...input.state.handoffTrace, handoff],
    updatedAt: now,
  };

  await persistRoundtableState({
    merchantId: input.merchant.id,
    sessionId: input.session.id,
    state: nextState,
    reason: "phase_summary_confirmed",
    summaryText: handoff.handoffSummary,
  });
  await createConsultationMessage({
    sessionId: input.session.id,
    role: "assistant",
    content: await buildRoundtableQuestion({
      merchant: input.merchant,
      state: nextState,
      phaseKey: nextPhase,
      recentUserContent: "",
      phaseMessages: [],
    }),
    stageLabel: phaseMeta[nextPhase].title,
    toolCards: buildRoundtableToolCards(nextState),
    visibleSummary: buildRoundtableVisibleSummary({
      state: nextState,
      phaseKey: nextPhase,
      agentName: phaseMeta[nextPhase].agentName,
    }),
  });

  return getRoundtableSessionDetail({
    merchantId: input.merchant.id,
    sessionId: input.session.id,
  });
}

async function enterRoundtableSynthesis(input: {
  merchant: MerchantProfileDto;
  session: ConsultationSessionDetailDto;
  state: RoundtableStateDto;
}): Promise<RoundtableSessionDetail> {
  const now = new Date().toISOString();
  const marketingOutput = input.state.phaseOutputs.marketing;
  const handoff: RoundtableHandoffDto | null = marketingOutput
    ? {
        fromPhase: "marketing",
        toPhase: "synthesis",
        handoffSummary: marketingOutput.handoffSummary,
        includedContextKeys: marketingOutput.fields.map((field) => field.label),
        excludedContextReason: "主持人汇总读取三阶段结构化产物，不读取全量 transcript。",
        createdAt: now,
      }
    : null;
  const strategyCandidate = await buildRoundtableStrategyCandidateWithModel({
    merchant: input.merchant,
    state: input.state,
  });

  if (!strategyCandidate) {
    await createConsultationMessage({
      sessionId: input.session.id,
      role: "assistant",
      content:
        "主持人：圆桌汇总暂时没有生成成功。我不会用模板策略覆盖你的信息，请稍后重试，或返回营销策略官继续补充关键事实后再汇总。",
      stageLabel: "圆桌汇总失败",
      toolCards: buildRoundtableToolCards(input.state),
      visibleSummary: buildRoundtableVisibleSummary({
        state: input.state,
        phaseKey: "synthesis",
        agentName: moderatorName,
      }),
    });
    await createConsultationEvent({
      sessionId: input.session.id,
      eventType: "roundtable.synthesis.blocked",
      stageLabel: "圆桌汇总失败",
      payload: {
        reason: "strategy_candidate_model_generation_failed",
      },
    });

    return getRoundtableSessionDetail({
      merchantId: input.merchant.id,
      sessionId: input.session.id,
    });
  }

  const nextState: RoundtableStateDto = {
    ...input.state,
    status: "synthesis_review",
    currentPhase: "synthesis",
    currentAgentRole: "moderator",
    strategyCandidate,
    handoffTrace: handoff ? [...input.state.handoffTrace, handoff] : input.state.handoffTrace,
    updatedAt: now,
  };

  await persistRoundtableState({
    merchantId: input.merchant.id,
    sessionId: input.session.id,
    state: nextState,
    reason: "synthesis_ready",
    summaryText: strategyCandidate.currentSuggestion,
  });
  await createConsultationMessage({
    sessionId: input.session.id,
    role: "assistant",
    content: formatSynthesisMessage(strategyCandidate),
    stageLabel: "圆桌汇总确认",
    toolCards: buildRoundtableToolCards(nextState),
    visibleSummary: buildRoundtableVisibleSummary({
      state: nextState,
      phaseKey: "synthesis",
      agentName: moderatorName,
    }),
  });

  return getRoundtableSessionDetail({
    merchantId: input.merchant.id,
    sessionId: input.session.id,
  });
}

async function returnRoundtableToInterview(input: {
  merchant: MerchantProfileDto;
  session: ConsultationSessionDetailDto;
  state: RoundtableStateDto;
}): Promise<RoundtableSessionDetail> {
  const phaseKey =
    input.state.currentPhase === "synthesis"
      ? "marketing"
      : getCurrentInterviewPhase(input.state);

  if (!phaseKey) {
    throw new ApiError(
      409,
      "ROUNDTABLE_RETURN_TARGET_MISSING",
      "当前圆桌阶段不能返回补充。",
    );
  }

  const now = new Date().toISOString();
  const nextState: RoundtableStateDto = {
    ...input.state,
    status: getInterviewingStatus(phaseKey),
    currentPhase: phaseKey,
    currentAgentRole: phaseMeta[phaseKey].agentRole,
    strategyCandidate:
      input.state.currentPhase === "synthesis" ? null : input.state.strategyCandidate ?? null,
    updatedAt: now,
  };

  await persistRoundtableState({
    merchantId: input.merchant.id,
    sessionId: input.session.id,
    state: nextState,
    reason: "returned_to_interview",
    summaryText: `已返回${phaseMeta[phaseKey].title}继续补充。`,
  });
  await createConsultationMessage({
    sessionId: input.session.id,
    role: "assistant",
    content: `${phaseMeta[phaseKey].agentName}：好的，我们先不进入下一步。请补充一个你认为刚才没有说完整的事实，尤其是会影响后续内容判断的真实限制或案例。`,
    stageLabel: phaseMeta[phaseKey].title,
    toolCards: buildRoundtableToolCards(nextState),
    visibleSummary: buildRoundtableVisibleSummary({
      state: nextState,
      phaseKey,
      agentName: phaseMeta[phaseKey].agentName,
    }),
  });

  return getRoundtableSessionDetail({
    merchantId: input.merchant.id,
    sessionId: input.session.id,
  });
}

async function saveRoundtableStrategyCandidate(input: {
  merchant: MerchantProfileDto;
  session: ConsultationSessionDetailDto;
  state: RoundtableStateDto;
}): Promise<RoundtableSessionDetail> {
  if (input.state.status !== "synthesis_review" || !input.state.strategyCandidate) {
    throw new ApiError(
      409,
      "ROUNDTABLE_STRATEGY_CANDIDATE_NOT_READY",
      "圆桌策略候选还没有生成，暂时不能保存。",
    );
  }

  const now = new Date().toISOString();
  const nextState: RoundtableStateDto = {
    ...input.state,
    status: "strategy_saved",
    currentPhase: "synthesis",
    currentAgentRole: "moderator",
    strategySavedAt: now,
    updatedAt: now,
  };

  await upsertMerchantStrategyAsset({
    merchantId: input.merchant.id,
    strategySnapshot: input.state.strategyCandidate,
  });
  await persistRoundtableState({
    merchantId: input.merchant.id,
    sessionId: input.session.id,
    state: nextState,
    reason: "strategy_saved",
    strategySnapshot: input.state.strategyCandidate,
    summaryText: input.state.strategyCandidate.currentSuggestion,
    status: "completed",
  });
  await createConsultationMessage({
    sessionId: input.session.id,
    role: "assistant",
    content:
      "主持人：已保存为当前策略快照。接下来可以从内容日历进入图文工作台或视频工作台，圆桌阶段摘要会作为本次生成的上下文快照保留。",
    stageLabel: "圆桌策略已保存",
    toolCards: buildRoundtableToolCards(nextState),
    visibleSummary: buildRoundtableVisibleSummary({
      state: nextState,
      phaseKey: "synthesis",
      agentName: moderatorName,
    }),
  });

  return getRoundtableSessionDetail({
    merchantId: input.merchant.id,
    sessionId: input.session.id,
  });
}

async function getRoundtableSessionDetail(input: {
  merchantId: string;
  sessionId: string;
}): Promise<RoundtableSessionDetail> {
  return attachRoundtableState(
    await getConsultationSessionDetail({
      merchantId: input.merchantId,
      sessionId: input.sessionId,
    }),
  );
}

async function persistRoundtableState(input: {
  merchantId: string;
  sessionId: string;
  state: RoundtableStateDto;
  reason: string;
  summaryText?: string | null;
  strategySnapshot?: StrategySnapshotDto;
  status?: "active" | "completed" | "archived";
}) {
  await writeRoundtableStateEvent({
    sessionId: input.sessionId,
    state: input.state,
    reason: input.reason,
  });
  await updateConsultationSession({
    merchantId: input.merchantId,
    sessionId: input.sessionId,
    status: input.status,
    currentStage: getRoundtableStageLabel(input.state),
    strategySnapshot: input.strategySnapshot,
    summaryText: input.summaryText,
  });
}

async function writeRoundtableStateEvent(input: {
  sessionId: string;
  state: RoundtableStateDto;
  reason: string;
}) {
  await createConsultationEvent({
    sessionId: input.sessionId,
    eventType: "roundtable.state.updated",
    stageLabel: getRoundtableStageLabel(input.state),
    payload: {
      reason: input.reason,
      state: input.state,
    },
  });
}

async function buildRoundtableQuestion(input: {
  merchant: MerchantProfileDto;
  state: RoundtableStateDto;
  phaseKey: RoundtableInterviewPhaseKey;
  recentUserContent: string;
  phaseMessages: ConsultationMessageDto[];
}) {
  if (!getAiRuntimeApiKey()) {
    return `${phaseMeta[input.phaseKey].agentName}：当前模型运行时还没有配置好，我不能假装自己在自主访谈。请先配置 LLM runtime 后继续圆桌咨询。`;
  }

  try {
    const { llmRuntime } = await getPlatformSettings();
    const response = await createChatCompletion({
      runtime: llmRuntime,
      model: llmRuntime.primaryModel,
      responseFormat: "json_object",
      messages: [
        {
          role: "system",
          content: [
            "你是圆桌咨询里的自主访谈 Agent，不是固定脚本机器人。",
            buildRoundtableExpertContainerPrompt(input.phaseKey),
            `当前身份：${phaseMeta[input.phaseKey].agentName}。`,
            `当前职责：${phaseMeta[input.phaseKey].focus}。`,
            phaseMeta[input.phaseKey].evidenceRule,
            "你必须根据用户最近回答、当前阶段 transcript、前序阶段摘要，自主判断下一步最值得追问的问题。",
            "如果用户表示没听懂、反问或困惑，先用更具体的话解释你想问什么，再换一种问法；不要重复原问题。",
            "每次只提出 1 个主问题，可以附 1 到 2 个具体示例帮助用户回答。",
            "不得跨阶段做其他专家的工作，不得编造用户没有说过的事实。",
            '只输出 JSON：{"message":"给商家的自然语言回复","intent":"本轮追问意图","shouldSuggestPhaseComplete":false}。',
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            merchant: {
              name: input.merchant.name,
              industry: input.merchant.industry,
              serviceItems: input.merchant.serviceItems,
              brandSummary: input.merchant.brandSummary,
            },
            phaseKey: input.phaseKey,
            phaseGoal: phaseMeta[input.phaseKey].focus,
            outputContract: phaseMeta[input.phaseKey].outputFields,
            previousPhaseOutputs: input.state.phaseOutputs,
            recentUserContent: input.recentUserContent,
            currentPhaseMessages: input.phaseMessages.slice(-8).map((message) => ({
              role: message.role,
              content: message.content,
            })),
          }),
        },
      ],
    });
    const parsed = parseModelJson({
      content: response.content,
      schema: roundtableQuestionSchema,
    });

    return parsed.message;
  } catch {
    return `${phaseMeta[input.phaseKey].agentName}：这一轮追问生成失败了。我不会用固定话术继续，请稍后重试，或检查模型运行时配置。`;
  }
}

function buildInitialRoundtableState(now: string): RoundtableStateDto {
  return {
    mode: "roundtable",
    status: "asset_interviewing",
    currentPhase: "asset",
    currentAgentRole: "asset_manager",
    startedAt: now,
    updatedAt: now,
    phaseOutputs: {},
    handoffTrace: [],
    strategyCandidate: null,
    strategySavedAt: null,
  };
}

function buildInitialStrategySnapshot(merchant: MerchantProfileDto): StrategySnapshotDto {
  const serviceAnchor = merchant.serviceItems[0] ?? merchant.industry ?? "本地生活服务";

  return {
    positioning: `${merchant.name} 围绕 ${serviceAnchor} 提供本地化服务，等待圆桌咨询补齐真实资产、技能优势和营销策略。`,
    coreSellingPoints: merchant.serviceItems.slice(0, 3),
    targetAudiences: [],
    keyScenes: [],
    currentSuggestion: "先完成圆桌咨询，再保存为策略快照并进入内容生产。",
    strategyTags: ["圆桌咨询"],
    contentCalendarDraft: [],
    articleBrief: null,
    videoBrief: null,
  };
}

function buildModeratorOpening(merchant: MerchantProfileDto) {
  return [
    `主持人：欢迎进入 ${merchant.name} 的圆桌咨询。`,
    "这不是多人群聊，而是固定顺序的专家访谈：先由资产盘点官帮你说清已有资源和真实故事，再由技能洞察官识别可表达的能力，最后由营销策略官把它转成内容定位和选题方向。",
    "每一阶段结束前都会生成结构化摘要，下一位专家只读取必要摘要，不默认读取全量聊天记录。",
  ].join("\n");
}

async function buildPhaseOutputWithModel(input: {
  merchant: MerchantProfileDto;
  state: RoundtableStateDto;
  phaseKey: RoundtableInterviewPhaseKey;
  messages: ConsultationMessageDto[];
  createdAt: string;
}): Promise<
  | {
      status: "ready";
      output: RoundtablePhaseOutputDto;
    }
  | {
      status: "blocked";
      reason: string;
      missingQuestions: string[];
    }
> {
  const userMessageCount = input.messages.filter((message) => message.role === "user").length;

  if (!getAiRuntimeApiKey()) {
    return {
      status: "blocked",
      reason: "模型运行时未配置，无法生成可信阶段摘要。",
      missingQuestions: ["请先配置 LLM runtime，再重新生成阶段摘要。"],
    };
  }

  if (userMessageCount === 0) {
    return {
      status: "blocked",
      reason: "当前阶段还没有用户回答，不能生成阶段摘要。",
      missingQuestions: [`请先回答${phaseMeta[input.phaseKey].agentName}的一个核心问题。`],
    };
  }

  try {
    const { llmRuntime } = await getPlatformSettings();
    const response = await createChatCompletion({
      runtime: llmRuntime,
      model: llmRuntime.primaryModel,
      responseFormat: "json_object",
      messages: [
        {
          role: "system",
          content: [
            "你是圆桌咨询的阶段摘要 Agent。",
            buildRoundtableExpertContainerPrompt(input.phaseKey),
            `当前阶段：${phaseMeta[input.phaseKey].title} / ${phaseMeta[input.phaseKey].agentName}。`,
            `阶段职责：${phaseMeta[input.phaseKey].focus}。`,
            `输出字段契约：${phaseMeta[input.phaseKey].outputFields.join(", ")}。`,
            phaseMeta[input.phaseKey].evidenceRule,
            "你只能抽取用户在当前阶段明确表达过的事实，以及前序阶段摘要中允许带入的事实。",
            "用户说「没懂」「什么意思」「不知道」这类内容，只能作为沟通状态，不能写成业务事实或阶段产物。",
            "如果当前 transcript 不足以支持结构化产物，isSufficient 必须为 false，并给出 missingQuestions。",
            "如果 isSufficient 为 true，fields 中每个 item 都必须是干净业务事实，不要重复、不要堆砌原文、不要写解释过程。",
            "只输出 JSON，不输出 Markdown。",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            merchant: {
              name: input.merchant.name,
              industry: input.merchant.industry,
              serviceItems: input.merchant.serviceItems,
              brandSummary: input.merchant.brandSummary,
              forbiddenWords: input.merchant.forbiddenWords,
            },
            phaseKey: input.phaseKey,
            previousPhaseOutputs: input.state.phaseOutputs,
            transcript: input.messages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
            requiredJsonShape: {
              isSufficient: "boolean",
              insufficientReason: "string|null",
              missingQuestions: ["string"],
              title: phaseMeta[input.phaseKey].outputTitle,
              fields: [{ label: "field name", items: ["fact from transcript"] }],
              handoffSummary: "short summary for next expert",
              confidence: "low|medium|high",
            },
          }),
        },
      ],
    });
    const parsed = parseModelJson({
      content: response.content,
      schema: roundtablePhaseSummarySchema,
    });

    if (!parsed.isSufficient) {
      return {
        status: "blocked",
        reason: parsed.insufficientReason || "当前阶段信息不足。",
        missingQuestions: parsed.missingQuestions ?? [],
      };
    }

    return {
      status: "ready",
      output: {
        phaseKey: input.phaseKey,
        agentRole: phaseMeta[input.phaseKey].agentRole,
        title: parsed.title,
        fields: parsed.fields,
        handoffSummary: parsed.handoffSummary,
        confidence: parsed.confidence,
        sourceMessageIds: input.messages.map((message) => message.id),
        createdAt: input.createdAt,
      },
    };
  } catch {
    return {
      status: "blocked",
      reason: "阶段摘要模型输出不可用或结构化校验失败，未写入阶段产物。",
      missingQuestions: ["请补充一个更具体的事实后重试，或稍后重新生成摘要。"],
    };
  }
}

async function buildRoundtableStrategyCandidateWithModel(input: {
  merchant: MerchantProfileDto;
  state: RoundtableStateDto;
}): Promise<StrategySnapshotDto | null> {
  if (!getAiRuntimeApiKey()) {
    return null;
  }

  try {
    const { llmRuntime } = await getPlatformSettings();
    const response = await createChatCompletion({
      runtime: llmRuntime,
      model: llmRuntime.primaryModel,
      responseFormat: "json_object",
      messages: [
        {
          role: "system",
          content: [
            "你是圆桌咨询主持人的策略汇总 Agent。",
            "你只能读取三阶段结构化产物，不读取全量 transcript。",
            "输出必须是可保存的 strategySnapshot JSON，字段包括 positioning、coreSellingPoints、targetAudiences、keyScenes、currentSuggestion、strategyTags、contentCalendarDraft、articleBrief、videoBrief。",
            "不得编造阶段产物没有支持的商家事实；如果需要泛化，只能写成策略假设和低承诺表达。",
            "内容日历必须能进入图文/视频工作台，至少 3 条，图文和视频都要有。",
            "不要输出 Markdown，只输出 JSON。",
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
              forbiddenWords: input.merchant.forbiddenWords,
            },
            phaseOutputs: input.state.phaseOutputs,
            requiredJsonShape: {
              positioning: "string",
              coreSellingPoints: ["string"],
              targetAudiences: ["string"],
              keyScenes: ["string"],
              currentSuggestion: "string",
              strategyTags: ["string"],
              contentCalendarDraft: [
                {
                  id: "stable string id",
                  dayLabel: "Day 1",
                  contentType: "article|video",
                  strategyTag: "string",
                  title: "string",
                  summary: "string",
                },
              ],
              articleBrief: {
                workingTitle: "string",
                angle: "string",
                callToAction: "string",
              },
              videoBrief: {
                workingTitle: "string",
                hook: "string",
                outcome: "string",
              },
            },
          }),
        },
      ],
    });

    return parseModelJson({
      content: response.content,
      schema: strategyCandidateSchema,
    });
  } catch {
    return null;
  }
}

function formatPhaseSummaryMessage(output: RoundtablePhaseOutputDto) {
  const meta = phaseMeta[output.phaseKey];
  const body = output.fields
    .map((field) => `${field.label}：${field.items.join("；") || "待补充"}`)
    .join("\n");

  return [
    `${meta.agentName}：我先把这一阶段整理成 ${output.title}。`,
    body,
    `交接摘要：${output.handoffSummary}`,
    "你可以确认进入下一位专家，也可以返回继续补充。",
  ].join("\n");
}

function formatPhaseSummaryBlockedMessage(input: {
  phaseKey: RoundtableInterviewPhaseKey;
  reason: string;
  missingQuestions: string[];
}) {
  const meta = phaseMeta[input.phaseKey];
  const questions = input.missingQuestions.length
    ? input.missingQuestions.map((question) => `- ${question}`).join("\n")
    : "- 请补充一个能支撑本阶段判断的具体事实。";

  return [
    `${meta.agentName}：我现在不能把这一阶段写成 ${meta.outputTitle}，因为${input.reason}`,
    "为了避免把无效信息写进后续专家上下文，请先补充：",
    questions,
  ].join("\n");
}

function formatSynthesisMessage(strategyCandidate: StrategySnapshotDto) {
  return [
    "主持人：三位专家的阶段摘要已经汇总成策略候选，请确认是否保存为当前策略快照。",
    `定位：${strategyCandidate.positioning}`,
    `核心卖点：${strategyCandidate.coreSellingPoints.join("、") || "待补充"}`,
    `目标客群：${strategyCandidate.targetAudiences.join("、") || "待补充"}`,
    `策略标签：${strategyCandidate.strategyTags.join("、") || "圆桌咨询"}`,
    `当前建议：${strategyCandidate.currentSuggestion}`,
  ].join("\n");
}

function buildRoundtableToolCards(state: RoundtableStateDto) {
  const completedCount = roundtablePhaseOrder.filter(
    (phaseKey) => state.phaseOutputs[phaseKey],
  ).length;

  return [
    {
      key: "roundtable_fixed_sequence",
      label: "专家容器编排",
      summary: "主持人控制阶段边界；每位专家由内置专家容器提供身份、技能、知识边界和工具策略。",
      status: "completed" as const,
    },
    {
      key: "roundtable_phase_outputs",
      label: "阶段摘要",
      summary: `已生成 ${completedCount}/3 个结构化阶段摘要。`,
      status: completedCount > 0 ? ("completed" as const) : ("skipped" as const),
    },
    {
      key: "roundtable_handoff_policy",
      label: "上下文交接",
      summary: "下一位专家只读取必要阶段摘要，不默认读取全量 transcript。",
      status: "completed" as const,
    },
  ];
}

function buildRoundtableVisibleSummary(input: {
  state: RoundtableStateDto;
  phaseKey: RoundtablePhaseKey;
  agentName: string;
  phaseOutput?: RoundtablePhaseOutputDto;
}) {
  return {
    roundtable: {
      mode: "roundtable",
      status: input.state.status,
      phaseKey: input.phaseKey,
      agentRole: input.state.currentAgentRole,
      agentName: input.agentName,
      expertContainer:
        input.phaseKey === "asset" || input.phaseKey === "skill" || input.phaseKey === "marketing"
          ? phaseMeta[input.phaseKey].container
          : null,
      phaseOutput: input.phaseOutput ?? null,
    },
  };
}

function buildRoundtableExpertContainerPrompt(phaseKey: RoundtableInterviewPhaseKey) {
  const expert = phaseMeta[phaseKey].container;

  return [
    "【专家容器】",
    `agentKey: ${expert.agentKey}`,
    `displayName: ${expert.displayName}`,
    `systemPrompt: ${expert.systemPrompt}`,
    `skills: ${expert.skills.join("、")}`,
    `knowledgePolicy: ${expert.knowledgePolicy}`,
    `toolPolicy: ${expert.toolPolicy}`,
    "专家容器只决定本阶段身份和能力；圆桌共享上下文由主持人和 handoffTrace 统一注入。",
  ].join("\n");
}

function parseModelJson<T>(input: {
  content: string;
  schema: z.ZodType<T>;
}): T {
  const parsed = JSON.parse(stripJsonFence(input.content));
  return input.schema.parse(parsed);
}

function stripJsonFence(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return fenced?.[1]?.trim() ?? trimmed;
}

function requireRoundtableState(session: ConsultationSessionDetailDto) {
  const state = resolveRoundtableState(session);

  if (!state) {
    throw new ApiError(
      409,
      "ROUNDTABLE_STATE_MISSING",
      "当前咨询会话不是圆桌咨询，不能执行圆桌动作。",
    );
  }

  return state;
}

function getCurrentInterviewPhase(state: RoundtableStateDto): RoundtableInterviewPhaseKey | null {
  return roundtablePhaseOrder.includes(state.currentPhase as RoundtableInterviewPhaseKey)
    ? (state.currentPhase as RoundtableInterviewPhaseKey)
    : null;
}

function isInterviewingStatus(status: RoundtableSessionStatus) {
  return status === "asset_interviewing" || status === "skill_interviewing" || status === "marketing_interviewing";
}

function getInterviewingStatus(phaseKey: RoundtableInterviewPhaseKey): RoundtableSessionStatus {
  if (phaseKey === "asset") return "asset_interviewing";
  if (phaseKey === "skill") return "skill_interviewing";
  return "marketing_interviewing";
}

function getSummarizingStatus(phaseKey: RoundtableInterviewPhaseKey): RoundtableSessionStatus {
  if (phaseKey === "asset") return "asset_summarizing";
  if (phaseKey === "skill") return "skill_summarizing";
  return "marketing_summarizing";
}

function getMessagesForPhase(
  messages: ConsultationMessageDto[],
  phaseKey: RoundtableInterviewPhaseKey,
) {
  return messages.filter((message) => {
    const roundtable = toRecord(message.visibleSummary.roundtable);
    return roundtable.phaseKey === phaseKey;
  });
}

function getRoundtableStageLabel(state: RoundtableStateDto) {
  if (state.status === "synthesis_review") {
    return "圆桌咨询 · 汇总确认";
  }

  if (state.status === "strategy_saved") {
    return "圆桌咨询 · 策略已保存";
  }

  const phaseKey = getCurrentInterviewPhase(state);

  if (!phaseKey) {
    return "圆桌咨询";
  }

  return state.status.endsWith("summarizing")
    ? `圆桌咨询 · ${phaseMeta[phaseKey].title}摘要确认`
    : `圆桌咨询 · ${phaseMeta[phaseKey].title}中`;
}

function toRoundtableState(value: unknown): RoundtableStateDto | null {
  const record = toRecord(value);

  if (record.mode !== "roundtable") {
    return null;
  }

  const status = toRoundtableStatus(record.status);
  const currentPhase = toRoundtablePhaseKey(record.currentPhase);
  const currentAgentRole = toRoundtableAgentRole(record.currentAgentRole);

  if (!status || !currentPhase || !currentAgentRole) {
    return null;
  }

  return {
    mode: "roundtable",
    status,
    currentPhase,
    currentAgentRole,
    startedAt: getString(record.startedAt, new Date().toISOString()),
    updatedAt: getString(record.updatedAt, new Date().toISOString()),
    phaseOutputs: toPhaseOutputs(record.phaseOutputs),
    handoffTrace: toHandoffTrace(record.handoffTrace),
    strategyCandidate: toStrategyCandidate(record.strategyCandidate),
    strategySavedAt: getNullableString(record.strategySavedAt),
  };
}

function toPhaseOutputs(value: unknown): RoundtableStateDto["phaseOutputs"] {
  const record = toRecord(value);
  const outputs: RoundtableStateDto["phaseOutputs"] = {};

  for (const phaseKey of roundtablePhaseOrder) {
    const output = toPhaseOutput(record[phaseKey], phaseKey);

    if (output) {
      outputs[phaseKey] = output;
    }
  }

  return outputs;
}

function toPhaseOutput(
  value: unknown,
  phaseKey: RoundtableInterviewPhaseKey,
): RoundtablePhaseOutputDto | null {
  const record = toRecord(value);
  const title = getString(record.title);

  if (!title) {
    return null;
  }

  return {
    phaseKey,
    agentRole: phaseMeta[phaseKey].agentRole,
    title,
    fields: toArray(record.fields)
      .map((field) => {
        const fieldRecord = toRecord(field);
        return {
          label: getString(fieldRecord.label),
          items: toStringArray(fieldRecord.items),
        };
      })
      .filter((field) => field.label.length > 0),
    handoffSummary: getString(record.handoffSummary),
    confidence:
      record.confidence === "high" || record.confidence === "medium" ? record.confidence : "low",
    sourceMessageIds: toStringArray(record.sourceMessageIds),
    createdAt: getString(record.createdAt, new Date().toISOString()),
  };
}

function toHandoffTrace(value: unknown): RoundtableHandoffDto[] {
  return toArray(value)
    .map((item) => {
      const record = toRecord(item);
      const fromPhase = toInterviewPhase(record.fromPhase);
      const toPhase =
        record.toPhase === "synthesis" ? "synthesis" : toInterviewPhase(record.toPhase);

      if (!fromPhase || !toPhase) {
        return null;
      }

      return {
        fromPhase,
        toPhase,
        handoffSummary: getString(record.handoffSummary),
        includedContextKeys: toStringArray(record.includedContextKeys),
        excludedContextReason: getString(record.excludedContextReason),
        createdAt: getString(record.createdAt, new Date().toISOString()),
      };
    })
    .filter((item): item is RoundtableHandoffDto => item !== null);
}

function toStrategyCandidate(value: unknown): StrategySnapshotDto | null {
  const record = toRecord(value);

  if (!Object.keys(record).length) {
    return null;
  }

  return {
    positioning: getString(record.positioning),
    coreSellingPoints: toStringArray(record.coreSellingPoints),
    targetAudiences: toStringArray(record.targetAudiences),
    keyScenes: toStringArray(record.keyScenes),
    currentSuggestion: getString(record.currentSuggestion),
    strategyTags: toStringArray(record.strategyTags),
    contentCalendarDraft: toArray(record.contentCalendarDraft)
      .map((item, index) => {
        const calendar = toRecord(item);
        return {
          id: getString(calendar.id, `roundtable-calendar-${index + 1}`),
          dayLabel: getString(calendar.dayLabel),
          contentType: calendar.contentType === "video" ? "video" as const : "article" as const,
          strategyTag: getString(calendar.strategyTag),
          title: getString(calendar.title),
          summary: getString(calendar.summary),
        };
      })
      .filter((item) => item.title.length > 0),
    articleBrief: toNullableArticleBrief(record.articleBrief),
    videoBrief: toNullableVideoBrief(record.videoBrief),
  };
}

function toNullableArticleBrief(value: unknown): StrategySnapshotDto["articleBrief"] {
  const record = toRecord(value);

  if (!Object.keys(record).length) {
    return null;
  }

  return {
    workingTitle: getString(record.workingTitle),
    angle: getString(record.angle),
    callToAction: getString(record.callToAction),
  };
}

function toNullableVideoBrief(value: unknown): StrategySnapshotDto["videoBrief"] {
  const record = toRecord(value);

  if (!Object.keys(record).length) {
    return null;
  }

  return {
    workingTitle: getString(record.workingTitle),
    hook: getString(record.hook),
    outcome: getString(record.outcome),
  };
}

function toRoundtableStatus(value: unknown): RoundtableSessionStatus | null {
  const allowed = new Set<RoundtableSessionStatus>([
    "intro",
    "asset_interviewing",
    "asset_summarizing",
    "skill_interviewing",
    "skill_summarizing",
    "marketing_interviewing",
    "marketing_summarizing",
    "synthesis_review",
    "strategy_saved",
    "failed",
    "archived",
  ]);

  return typeof value === "string" && allowed.has(value as RoundtableSessionStatus)
    ? (value as RoundtableSessionStatus)
    : null;
}

function toRoundtablePhaseKey(value: unknown): RoundtablePhaseKey | null {
  const allowed = new Set<RoundtablePhaseKey>(["intro", "asset", "skill", "marketing", "synthesis"]);

  return typeof value === "string" && allowed.has(value as RoundtablePhaseKey)
    ? (value as RoundtablePhaseKey)
    : null;
}

function toRoundtableAgentRole(value: unknown): RoundtableAgentRole | null {
  const allowed = new Set<RoundtableAgentRole>([
    "moderator",
    "asset_manager",
    "skill_mapper",
    "marketing_strategist",
  ]);

  return typeof value === "string" && allowed.has(value as RoundtableAgentRole)
    ? (value as RoundtableAgentRole)
    : null;
}

function toInterviewPhase(value: unknown): RoundtableInterviewPhaseKey | null {
  return typeof value === "string" && roundtablePhaseOrder.includes(value as RoundtableInterviewPhaseKey)
    ? (value as RoundtableInterviewPhaseKey)
    : null;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toStringArray(value: unknown): string[] {
  return toArray(value)
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function getNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
