import "server-only";

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

const roundtablePhaseOrder: RoundtableInterviewPhaseKey[] = ["asset", "skill", "marketing"];

const phaseMeta: Record<
  RoundtableInterviewPhaseKey,
  {
    title: string;
    agentRole: RoundtableAgentRole;
    agentName: string;
    outputTitle: string;
    defaultFields: string[];
    focus: string;
  }
> = {
  asset: {
    title: "资产盘点",
    agentRole: "asset_manager",
    agentName: "资产盘点官",
    outputTitle: "asset_diagnosis",
    defaultFields: ["生活状态", "可用资产", "真实故事", "素材线索", "约束条件", "风险边界"],
    focus: "生活状态、经营资源、过往经历、真实案例、素材线索和表达禁区",
  },
  skill: {
    title: "技能洞察",
    agentRole: "skill_mapper",
    agentName: "技能洞察官",
    outputTitle: "skill_diagnosis",
    defaultFields: ["技能模块", "可复制方法", "可信证明", "差异化优势", "表达线索"],
    focus: "可复制能力、服务方法、判断标准、可信证明和表达优势",
  },
  marketing: {
    title: "营销策略",
    agentRole: "marketing_strategist",
    agentName: "营销策略官",
    outputTitle: "marketing_strategy",
    defaultFields: ["定位判断", "目标客群", "核心卖点", "内容栏目", "CTA 建议", "风险边界"],
    focus: "目标客群、内容定位、核心卖点、选题方向、CTA 和风险边界",
  },
};

const moderatorName = "主持人";

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
  const userText = phaseMessages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n");

  if (userText.trim().length < 12) {
    await createConsultationMessage({
      sessionId: input.session.id,
      role: "assistant",
      content: `现在的信息还不够生成 ${phaseMeta[phaseKey].outputTitle}。你可以先补充一个真实例子、一个约束条件，或一个你不希望账号使用的表达方式。`,
      stageLabel: phaseMeta[phaseKey].title,
      toolCards: buildRoundtableToolCards(input.state),
      visibleSummary: buildRoundtableVisibleSummary({
        state: input.state,
        phaseKey,
        agentName: phaseMeta[phaseKey].agentName,
      }),
    });

    return getRoundtableSessionDetail({
      merchantId: input.merchant.id,
      sessionId: input.session.id,
    });
  }

  const now = new Date().toISOString();
  const output = buildPhaseOutput({
    phaseKey,
    messages: phaseMessages,
    createdAt: now,
  });
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
  const strategyCandidate = buildRoundtableStrategyCandidate({
    merchant: input.merchant,
    state: input.state,
  });
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
  const fallback = buildFallbackQuestion(input);

  if (!getAiRuntimeApiKey()) {
    return fallback;
  }

  try {
    const { llmRuntime } = await getPlatformSettings();
    const response = await createChatCompletion({
      runtime: llmRuntime,
      model: llmRuntime.primaryModel,
      messages: [
        {
          role: "system",
          content: [
            `你是圆桌咨询里的${phaseMeta[input.phaseKey].agentName}。`,
            `你只负责${phaseMeta[input.phaseKey].focus}。`,
            "每次只问 1 个主问题，可以带 1 到 2 个提示。",
            "不要直接替用户编造事实，不要跳到其他专家阶段。",
            "用自然中文回复，不要输出 JSON 或 Markdown 表格。",
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
            previousPhaseOutputs: input.state.phaseOutputs,
            recentUserContent: input.recentUserContent,
            currentPhaseMessages: input.phaseMessages.slice(-8).map((message) => ({
              role: message.role,
              content: message.content,
            })),
            fallbackDraft: fallback,
          }),
        },
      ],
    });

    return response.content.trim() || fallback;
  } catch {
    return fallback;
  }
}

function buildFallbackQuestion(input: {
  merchant: MerchantProfileDto;
  state: RoundtableStateDto;
  phaseKey: RoundtableInterviewPhaseKey;
  recentUserContent: string;
  phaseMessages: ConsultationMessageDto[];
}) {
  const phaseUserMessageCount = input.phaseMessages.filter((message) => message.role === "user").length;

  if (input.phaseKey === "asset") {
    const questions = [
      `我是资产盘点官。先不急着做营销定位，我们先看 ${input.merchant.name} 已经有什么。你现在最稳定能拿出来的真实资源、客户故事或服务过程是什么？`,
      "这些真实案例大概来自哪几类客户？能不能挑一个你印象最深、最能体现你服务方式的例子说说？",
      "你有哪些表达边界是绝对不想碰的，比如不想制造焦虑、不想夸大效果，或不想用过度承诺的说法？",
    ];
    return questions[Math.min(phaseUserMessageCount, questions.length - 1)];
  }

  if (input.phaseKey === "skill") {
    const assetSummary = input.state.phaseOutputs.asset?.handoffSummary ?? "资产摘要还不够完整";
    const questions = [
      `我是技能洞察官。我先接住上一阶段的资产摘要：${assetSummary}。这些经历背后，你最擅长解决的一个具体问题是什么？`,
      "当客户遇到这个问题时，你通常会按什么判断标准或步骤处理？请讲一个可复用的方法。",
      "有什么证明能让陌生用户相信你，例如案例反馈、资质、复购、经验年限或标准流程？",
    ];
    return questions[Math.min(phaseUserMessageCount, questions.length - 1)];
  }

  const assetSummary = input.state.phaseOutputs.asset?.handoffSummary ?? "资产摘要不足";
  const skillSummary = input.state.phaseOutputs.skill?.handoffSummary ?? "技能摘要不足";
  const questions = [
    `我是营销策略官。我会基于前两位专家的结论做判断：资产是「${assetSummary}」，技能是「${skillSummary}」。你更想优先建立信任，还是更想把咨询转化做起来？`,
    "如果要让一条内容更容易带来咨询，目标用户最常卡在哪个点：不知道值不值、担心效果、担心价格，还是不知道怎么开始？",
    "你希望内容里的行动引导是什么：私信咨询、到店体验、领取资料、预约评估，还是先关注账号？",
  ];
  return questions[Math.min(phaseUserMessageCount, questions.length - 1)];
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

function buildPhaseOutput(input: {
  phaseKey: RoundtableInterviewPhaseKey;
  messages: ConsultationMessageDto[];
  createdAt: string;
}): RoundtablePhaseOutputDto {
  const userMessages = input.messages.filter((message) => message.role === "user");
  const userText = userMessages.map((message) => message.content.trim()).filter(Boolean);
  const allText = userText.join(" ");
  const fields = phaseMeta[input.phaseKey].defaultFields.map((label, index) => ({
    label,
    items: buildFieldItems({
      label,
      text: allText,
      fallback: userText[index % Math.max(userText.length, 1)] ?? "用户已补充，待下一轮细化。",
    }),
  }));
  const handoffSummary = clipText(
    userText.slice(-3).join("；") ||
      fields
        .map((field) => `${field.label}: ${field.items.join("、")}`)
        .join("；"),
    220,
  );

  return {
    phaseKey: input.phaseKey,
    agentRole: phaseMeta[input.phaseKey].agentRole,
    title: phaseMeta[input.phaseKey].outputTitle,
    fields,
    handoffSummary,
    confidence: userText.join("").length > 120 ? "high" : userText.join("").length > 48 ? "medium" : "low",
    sourceMessageIds: input.messages.map((message) => message.id),
    createdAt: input.createdAt,
  };
}

function buildFieldItems(input: {
  label: string;
  text: string;
  fallback: string;
}) {
  const sentences = input.text
    .split(/[。！？!?；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const keywordHits = sentences.filter((sentence) => {
    if (input.label.includes("风险") || input.label.includes("边界")) {
      return /不想|不要|不能|避免|风险|夸大|承诺|焦虑/.test(sentence);
    }

    if (input.label.includes("故事") || input.label.includes("案例")) {
      return /案例|客户|故事|经历|反馈|复购/.test(sentence);
    }

    if (input.label.includes("CTA") || input.label.includes("转化")) {
      return /私信|到店|预约|咨询|领取|评估|体验/.test(sentence);
    }

    return sentence.length >= 6;
  });
  const items = (keywordHits.length ? keywordHits : [input.fallback])
    .map((item) => clipText(item, 64))
    .filter(Boolean);

  return uniqueStrings(items).slice(0, 3);
}

function buildRoundtableStrategyCandidate(input: {
  merchant: MerchantProfileDto;
  state: RoundtableStateDto;
}): StrategySnapshotDto {
  const asset = input.state.phaseOutputs.asset;
  const skill = input.state.phaseOutputs.skill;
  const marketing = input.state.phaseOutputs.marketing;
  const serviceAnchor = input.merchant.serviceItems[0] ?? input.merchant.industry ?? "本地服务";
  const marketingFields = flattenOutputFields(marketing);
  const skillFields = flattenOutputFields(skill);
  const assetFields = flattenOutputFields(asset);
  const targetAudiences = pickFieldItems(marketing, ["目标客群"], [
    "谨慎决策型高意向用户",
    "需要先建立信任再咨询的潜在客户",
  ]);
  const coreSellingPoints = uniqueStrings([
    ...pickFieldItems(marketing, ["核心卖点"], []),
    ...pickFieldItems(skill, ["可信证明", "差异化优势", "技能模块"], []),
    ...input.merchant.serviceItems.slice(0, 2),
  ]).slice(0, 6);
  const keyScenes = uniqueStrings([
    ...pickFieldItems(asset, ["真实故事", "素材线索", "生活状态"], []),
    ...pickFieldItems(marketing, ["内容栏目"], []),
  ]).slice(0, 6);
  const strategyTags = uniqueStrings([
    "圆桌咨询",
    marketingFields.includes("案例") || assetFields.includes("案例") ? "真实案例" : "信任建立",
    skillFields.includes("方法") || skillFields.includes("流程") ? "方法拆解" : "专业表达",
    "轻转化",
  ]).slice(0, 4);
  const positioning =
    pickFirst(marketing, "定位判断") ??
    `${input.merchant.name} 以真实资产和可验证技能为基础，面向${targetAudiences[0] ?? "高意向用户"}提供 ${serviceAnchor} 内容咨询与转化承接。`;
  const currentSuggestion =
    marketing?.handoffSummary ??
    `建议先用「${strategyTags.join(" + ")}」建立信任，再把咨询引导到 ${input.merchant.defaultCta[0] ?? "私信或预约"}。`;

  return {
    positioning,
    coreSellingPoints,
    targetAudiences,
    keyScenes,
    currentSuggestion,
    strategyTags,
    contentCalendarDraft: [
      {
        id: "roundtable-calendar-1",
        dayLabel: "Day 1",
        contentType: "article",
        strategyTag: strategyTags[1] ?? "真实案例",
        title: `${serviceAnchor} 的一个真实案例拆解`,
        summary: asset?.handoffSummary ?? "用真实经历建立第一层信任。",
      },
      {
        id: "roundtable-calendar-2",
        dayLabel: "Day 2",
        contentType: "video",
        strategyTag: strategyTags[2] ?? "方法拆解",
        title: `${input.merchant.name} 的服务判断过程`,
        summary: skill?.handoffSummary ?? "把可复制方法拍成短视频脚本。",
      },
      {
        id: "roundtable-calendar-3",
        dayLabel: "Day 3",
        contentType: "article",
        strategyTag: strategyTags[3] ?? "轻转化",
        title: "用户最常见顾虑的答疑",
        summary: marketing?.handoffSummary ?? "围绕咨询异议做轻转化内容。",
      },
    ],
    articleBrief: {
      workingTitle: `${serviceAnchor} 的真实案例与避坑答疑`,
      angle: asset?.handoffSummary ?? "真实案例 + 方法说明 + 风险边界",
      callToAction: input.merchant.defaultCta[0] ?? "私信咨询或预约评估",
    },
    videoBrief: {
      workingTitle: `${input.merchant.name} 圆桌咨询短视频脚本`,
      hook: targetAudiences[0]
        ? `先说出 ${targetAudiences[0]} 最常见的一个顾虑`
        : "先用一个真实问题切入",
      outcome: "输出一条基于圆桌阶段摘要的视频脚本",
    },
  };
}

function flattenOutputFields(output?: RoundtablePhaseOutputDto) {
  return (
    output?.fields
      .flatMap((field) => field.items)
      .join(" ") ?? ""
  );
}

function pickFieldItems(
  output: RoundtablePhaseOutputDto | undefined,
  labels: string[],
  fallback: string[],
) {
  const values =
    output?.fields
      .filter((field) => labels.some((label) => field.label.includes(label)))
      .flatMap((field) => field.items) ?? [];

  return uniqueStrings(values.length ? values : fallback).slice(0, 6);
}

function pickFirst(output: RoundtablePhaseOutputDto | undefined, label: string) {
  return output?.fields.find((field) => field.label.includes(label))?.items[0] ?? null;
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
      label: "固定专家链",
      summary: "按资产盘点官 -> 技能洞察官 -> 营销策略官 -> 主持人汇总推进。",
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
      phaseOutput: input.phaseOutput ?? null,
    },
  };
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

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function clipText(value: string, maxLength: number) {
  const text = value.trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
