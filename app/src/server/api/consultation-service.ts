import "server-only";

import { randomUUID } from "node:crypto";

import type {
  ConsultationSessionDetailDto,
  ConsultationToolCardDto,
  StrategySnapshotDto,
} from "@/contracts/consultation";
import type { MerchantProfileDto } from "@/contracts/merchant";
import type { ConsultationAgentSettingsDto } from "@/contracts/knowledge";
import {
  createConsultationEvent,
  createConsultationMessage,
  createConsultationSession,
  getConsultationSessionDetail,
  listConsultationSessions,
  updateConsultationSession,
} from "@/lib/db/consultation-repository";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import { getPlatformSettings } from "@/lib/db/platform-admin-repository";

export async function listConsultationSessionsForUser(userId: string) {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(userId);
  return listConsultationSessions(merchant.id);
}

export async function createConsultationSessionForUser(input: {
  userId: string;
  title?: string | null;
}): Promise<ConsultationSessionDetailDto> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const { consultationAgent } = await getPlatformSettings();
  const strategySnapshot = buildStrategySnapshot({
    merchant,
    previousSnapshot: null,
    userMessages: [],
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
    },
  });
  await createConsultationMessage({
    sessionId: session.id,
    role: "assistant",
    content: buildGreetingMessage(merchant),
    stageLabel: "商家画像读取",
    toolCards: buildToolCards(merchant, consultationAgent, "商家画像读取"),
    visibleSummary: {
      positioning: strategySnapshot.positioning,
      nextAction: "先补充你的主力客群、核心服务和最想解决的获客问题。",
    },
  });

  return getConsultationSessionDetail({
    merchantId: merchant.id,
    sessionId: session.id,
  });
}

export async function getConsultationSessionForUser(input: {
  userId: string;
  sessionId: string;
}) {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  return getConsultationSessionDetail({
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
  const [{ consultationAgent }, session] = await Promise.all([
    getPlatformSettings(),
    getConsultationSessionDetail({
      merchantId: merchant.id,
      sessionId: input.sessionId,
    }),
  ]);

  const userMessage = await createConsultationMessage({
    sessionId: session.id,
    role: "user",
    content: input.content,
    stageLabel: session.currentStage,
  });
  const allUserMessages = [...session.messages, userMessage]
    .filter((message) => message.role === "user")
    .map((message) => message.content);
  const nextRound = allUserMessages.length;
  const nextStage =
    nextRound >= 3 ? "策略沉淀完成" : nextRound === 2 ? "内容策略收束" : "目标客群梳理";
  const strategySnapshot = buildStrategySnapshot({
    merchant,
    previousSnapshot: session.strategySnapshot,
    userMessages: allUserMessages,
  });
  const assistantContent = buildAssistantReply({
    merchant,
    round: nextRound,
    userContent: input.content,
    strategySnapshot,
  });

  await createConsultationEvent({
    sessionId: session.id,
    eventType: "strategy_snapshot.updated",
    stageLabel: nextStage,
    payload: {
      round: nextRound,
      strategyTags: strategySnapshot.strategyTags,
      calendarCount: strategySnapshot.contentCalendarDraft.length,
    },
  });
  await updateConsultationSession({
    merchantId: merchant.id,
    sessionId: session.id,
    currentStage: nextStage,
    strategySnapshot,
    summaryText: strategySnapshot.currentSuggestion,
  });
  await createConsultationMessage({
    sessionId: session.id,
    role: "assistant",
    content: assistantContent,
    stageLabel: nextStage,
    toolCards: buildToolCards(merchant, consultationAgent, nextStage),
    visibleSummary: {
      positioning: strategySnapshot.positioning,
      strategyTags: strategySnapshot.strategyTags,
      nextAction:
        nextRound >= 3
          ? "已经可以进入图文工作台或视频工作台继续创作。"
          : "继续补充你最想拿下的场景、用户异议或成交目标。",
    },
  });

  return getConsultationSessionDetail({
    merchantId: merchant.id,
    sessionId: session.id,
  });
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
}) {
  if (input.round === 1) {
    return `收到，我先把你的目标收进策略资产里。现在看，${input.strategySnapshot.positioning}。下一步我想把人群和场景再钉牢一点: 你最优先想拿下的是哪一类人，她们通常会在什么场景下开始认真考虑你这项服务？`;
  }

  if (input.round === 2) {
    return `这条信息很关键，我已经把它合并到客群和内容场景里。当前建议是：${input.strategySnapshot.currentSuggestion}。再补最后一个关键问题: 现阶段最容易卡成交的异议是什么，是价格、效果可信度、时间安排，还是门店距离与体验顾虑？`;
  }

  return `策略已经够落地了，我先帮你沉淀成可执行结论。${input.strategySnapshot.currentSuggestion}。右侧内容日历已经更新，你现在可以直接进入图文工作台生成笔记草稿，或者进入视频工作台生成脚本并继续推进视频任务。`;
}

function buildToolCards(
  merchant: MerchantProfileDto,
  settings: ConsultationAgentSettingsDto,
  stageLabel: string,
): ConsultationToolCardDto[] {
  const cards: Record<string, ConsultationToolCardDto> = {
    read_merchant_profile: {
      key: "read_merchant_profile",
      label: "读取商家资料",
      summary: `已读取 ${merchant.name} 的基础资料与服务信息。`,
      status: "completed",
    },
    retrieve_knowledge_base: {
      key: "retrieve_knowledge_base",
      label: "检索平台知识库",
      summary: `按 Top ${settings.retrievalTopK} 规则准备咨询参考上下文。`,
      status: "completed",
    },
    update_strategy_snapshot: {
      key: "update_strategy_snapshot",
      label: "更新策略快照",
      summary: `已同步定位、卖点、客群与当前建议到「${stageLabel}」。`,
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

  return settings.enabledTools.map((tool) => cards[tool]).filter(Boolean);
}

function buildStrategySnapshot(input: {
  merchant: MerchantProfileDto;
  previousSnapshot: StrategySnapshotDto | null;
  userMessages: string[];
}): StrategySnapshotDto {
  const mergedUserText = input.userMessages.join(" ");
  const serviceAnchor =
    input.merchant.serviceItems[0] ?? input.merchant.industry ?? "本地生活服务";
  const audiences = uniqueStrings([
    ...extractKeywordMatches(mergedUserText, [
      "白领女性",
      "产后妈妈",
      "附近居民",
      "精致宝妈",
      "健身人群",
      "门店周边上班族",
      "体态调整人群",
      "新客体验人群",
    ]),
    ...extractKeywordMatches(input.merchant.brandSummary ?? "", [
      "白领女性",
      "产后妈妈",
      "附近居民",
      "体态调整人群",
    ]),
    input.previousSnapshot?.targetAudiences?.[0] ?? "",
    "门店 3 公里内高意向到店人群",
  ]).slice(0, 3);
  const sellingPoints = uniqueStrings([
    ...input.merchant.serviceItems.slice(0, 3),
    input.merchant.brandSummary ?? "",
    input.merchant.regionSummary ?? "",
    input.previousSnapshot?.coreSellingPoints?.[0] ?? "",
  ]).slice(0, 3);
  const keyScenes = uniqueStrings([
    ...extractKeywordMatches(mergedUserText, [
      "下班后恢复",
      "产后恢复",
      "周末探店",
      "首次体验课",
      "体态调整",
      "减脂塑形",
      "门店到访前决策",
    ]),
    input.merchant.regionSummary ?? "",
    "门店首次咨询前的信任建立",
  ]).slice(0, 3);
  const strategyTags = uniqueStrings([
    "专业人设",
    "场景种草",
    "到店转化",
    mergedUserText.includes("视频") ? "视频优先" : "",
  ]).slice(0, 4);
  const positioning = `${input.merchant.name} 围绕 ${serviceAnchor} 提供更适合 ${audiences[0]} 的本地化服务，内容上优先突出 ${sellingPoints[0] || serviceAnchor}。`;
  const currentSuggestion = `建议先用「${strategyTags[0]} + ${strategyTags[1]}」做 3 条信任建立内容，再用 ${strategyTags.at(-1) ?? "到店转化"} 把咨询引到体验或到店动作。`;

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
      hook: `先用 3 秒钩子把 ${audiences[0]} 的典型痛点说透`,
      outcome: "输出一条能直接进入视频工作台的门店信任感脚本",
    },
  };
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
