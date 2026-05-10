import "server-only";

import type { ContentCalendarItemDto, StrategySnapshotDto } from "@/contracts/consultation";
import type {
  DailyContentTaskDto,
  DailyContentTaskItemDto,
  DailyContentWorkspaceDto,
} from "@/contracts/daily-task";
import { listMaterialLibraryItems } from "@/lib/db/material-library-repository";
import { buildMaterialRoutingTrace } from "@/lib/material-routing";
import { getOperationalMerchantWorkspaceByUserId } from "@/lib/db/merchant-repository";
import { getMerchantStrategyAssetDocument } from "@/lib/db/merchant-strategy-asset-repository";
import {
  getDailyContentTask,
  getDailyContentTaskById,
  upsertDailyContentTask,
} from "@/lib/db/daily-content-task-repository";

export async function getDailyContentWorkspaceForUser(input: {
  userId: string;
  date?: string | null;
}): Promise<DailyContentWorkspaceDto> {
  const workspace = await getOperationalMerchantWorkspaceByUserId(input.userId);
  const taskDate = normalizeDate(input.date);
  const today = await getOrCreateDailyContentTaskForUser({
    userId: input.userId,
    merchantId: workspace.merchantProfile.id,
    taskDate,
  });
  const upcoming: DailyContentTaskDto[] = [];

  for (let index = 1; index <= 7; index += 1) {
    upcoming.push(
      await getOrCreateDailyContentTaskForUser({
        userId: input.userId,
        merchantId: workspace.merchantProfile.id,
        taskDate: addDays(taskDate, index),
      }),
    );
  }

  return {
    today,
    upcoming,
    role: workspace.role,
  };
}

export async function getDailyContentTaskForUser(input: {
  userId: string;
  dailyTaskId: string;
}): Promise<DailyContentTaskDto> {
  const workspace = await getOperationalMerchantWorkspaceByUserId(input.userId);
  return getDailyContentTaskById({
    merchantId: workspace.merchantProfile.id,
    userId: input.userId,
    taskId: input.dailyTaskId,
  });
}

async function getOrCreateDailyContentTaskForUser(input: {
  userId: string;
  merchantId: string;
  taskDate: string;
}): Promise<DailyContentTaskDto> {
  const existing = await getDailyContentTask(input);

  if (existing) {
    return existing;
  }

  const strategyAsset = await getMerchantStrategyAssetDocument(input.merchantId);
  const snapshot = strategyAsset?.strategySnapshot ?? null;
  const calendar = snapshot?.contentCalendarDraft ?? [];
  const seed = hashSeed(`${input.userId}:${input.taskDate}`);
  const articleItem = pickCalendarItem(calendar, "article", seed);
  const videoItem = pickCalendarItem(calendar, "video", seed + 3);
  const theme =
    articleItem?.strategyTag ||
    videoItem?.strategyTag ||
    snapshot?.strategyTags[seed % Math.max(snapshot.strategyTags.length, 1)] ||
    "今日项目内容";
  const retrievalQuery = buildDailyMaterialRetrievalQuery({
    theme,
    articleItem,
    videoItem,
    snapshot,
  });
  const [articleImageMaterials, copyContextMaterials] = await Promise.all([
    listMaterialLibraryItems({
      merchantId: input.merchantId,
      retrievalTarget: "article_image_asset",
      query: retrievalQuery,
      limit: 24,
    }).catch(() => []),
    listMaterialLibraryItems({
      merchantId: input.merchantId,
      retrievalTarget: "copy_context",
      query: retrievalQuery,
      limit: 12,
    }).catch(() => []),
  ]);
  const materialRefs = articleImageMaterials.slice(0, 6).map((item) => ({
    ...buildMaterialRoutingTrace(item),
    platform: item.platform,
  }));
  const materialHints = copyContextMaterials.slice(0, 4).map((item) => item.title);

  return upsertDailyContentTask({
    merchantId: input.merchantId,
    userId: input.userId,
    taskDate: input.taskDate,
    theme,
    teamCalendarSource: {
      source: "merchant_strategy_asset",
      updatedAt: strategyAsset?.updatedAt ?? null,
      strategyTags: snapshot?.strategyTags ?? [],
      calendarItemIds: compactStrings([articleItem?.id, videoItem?.id]),
    },
    articleTask: buildTaskItem({
      kind: "article",
      item: articleItem,
      snapshot,
      materialHints,
      seed,
    }),
    videoTask: buildTaskItem({
      kind: "video",
      item: videoItem,
      snapshot,
      materialHints,
      seed: seed + 9,
    }),
    knowledgeRefs: [
      {
        source: "merchant_strategy_asset",
        title: "团队内容日历",
        summary: snapshot?.currentSuggestion ?? "使用团队共享项目资料生成。",
      },
      ...copyContextMaterials.slice(0, 4).map((item) => ({
        source: "material_library",
        title: item.title,
        summary: item.description ?? item.engagementLabel ?? "可作为文案/脚本表达参考。",
        usageType: item.usageType,
        retrievalTargets: item.retrievalTargets,
      })),
    ],
    materialRefs,
  });
}

function buildDailyMaterialRetrievalQuery(input: {
  theme: string;
  articleItem: ContentCalendarItemDto | null;
  videoItem: ContentCalendarItemDto | null;
  snapshot: StrategySnapshotDto | null;
}) {
  return compactStrings([
    input.theme,
    input.articleItem?.title,
    input.articleItem?.summary,
    input.videoItem?.title,
    input.videoItem?.summary,
    ...(input.snapshot?.coreSellingPoints ?? []),
    ...(input.snapshot?.targetAudiences ?? []),
    ...(input.snapshot?.keyScenes ?? []),
    ...(input.snapshot?.strategyTags ?? []),
  ]).join(" ");
}

function buildTaskItem(input: {
  kind: "article" | "video";
  item: ContentCalendarItemDto | null;
  snapshot: StrategySnapshotDto | null;
  materialHints: string[];
  seed: number;
}): DailyContentTaskItemDto {
  const angle = pickAngle(input.seed);
  const defaultTitle =
    input.kind === "article"
      ? input.snapshot?.articleBrief?.workingTitle || "今日图文：项目卖点种草"
      : input.snapshot?.videoBrief?.workingTitle || "今日视频：真人口播讲项目机会";
  const defaultSummary =
    input.kind === "article"
      ? input.snapshot?.articleBrief?.angle || input.snapshot?.currentSuggestion || "围绕今日团队主题生成小红书图文。"
      : input.snapshot?.videoBrief?.hook || input.snapshot?.currentSuggestion || "围绕今日团队主题生成可拍摄口播脚本。";

  return {
    kind: input.kind,
    title: withAngle(input.item?.title || defaultTitle, angle),
    summary: input.item?.summary
      ? `${input.item.summary} 表达角度：${angle}。`
      : `${defaultSummary} 表达角度：${angle}。`,
    strategyTag:
      input.item?.strategyTag ??
      input.snapshot?.strategyTags[input.seed % Math.max(input.snapshot.strategyTags.length, 1)] ??
      null,
    contentGoal: input.kind === "article" ? "图文种草" : "短视频获客",
    suggestedPlatform: input.kind === "article" ? "xiaohongshu" : "douyin",
    materialHints: input.materialHints,
  };
}

function pickCalendarItem(
  calendar: ContentCalendarItemDto[],
  kind: "article" | "video",
  seed: number,
) {
  const candidates = calendar.filter((item) => item.contentType === kind);
  const pool = candidates.length ? candidates : calendar;
  return pool.length ? pool[seed % pool.length] ?? null : null;
}

function pickAngle(seed: number) {
  const angles = ["本地客户视角", "低总价上车", "成熟配套", "真实顾虑拆解", "成交逻辑"];
  return angles[seed % angles.length] ?? angles[0];
}

function withAngle(title: string, angle: string) {
  return title.includes(angle) ? title : `${title} · ${angle}`;
}

function normalizeDate(value?: string | null) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function hashSeed(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function compactStrings(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value?.trim()));
}
