import "server-only";

import type { ContentCalendarItemDto, StrategySnapshotDto } from "@/contracts/consultation";
import type {
  DailyContentTaskDto,
  DailyContentTaskItemDto,
  DailyContentWorkspaceDto,
} from "@/contracts/daily-task";
import type { MaterialLibraryItemDto } from "@/contracts/material";
import { listMaterialLibraryItems } from "@/lib/db/material-library-repository";
import { buildMaterialRoutingTrace } from "@/lib/material-routing";
import { getOperationalMerchantWorkspaceByUserId } from "@/lib/db/merchant-repository";
import { getMerchantStrategyAssetDocument } from "@/lib/db/merchant-strategy-asset-repository";
import {
  getDailyContentTask,
  getDailyContentTaskById,
  upsertDailyContentTask,
} from "@/lib/db/daily-content-task-repository";
import {
  buildGeneratedArticlePackage,
  buildGeneratedVideoScriptPackage,
  buildProjectIntro,
} from "@/server/api/member-content-builders";
import {
  collectContentCalendarGuidanceSummary,
  collectContentCalendarKnowledgeRefs,
} from "@/lib/content-calendar-guidance";

export async function getDailyContentWorkspaceForUser(input: {
  userId: string;
  date?: string | null;
}): Promise<DailyContentWorkspaceDto> {
  const workspace = await getOperationalMerchantWorkspaceByUserId(input.userId);
  const strategyAsset = await getMerchantStrategyAssetDocument(workspace.merchantProfile.id).catch(
    () => null,
  );
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
    project: buildProjectIntro({
      merchant: workspace.merchantProfile,
      snapshot: strategyAsset?.strategySnapshot ?? null,
      today,
    }),
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

export async function upsertDailyContentTasksFromCalendarForUser(input: {
  userId: string;
  merchantId: string;
  startDate: string;
  days: number;
  snapshot: StrategySnapshotDto;
  consultationSessionId?: string | null;
  sourceUpdatedAt?: string | null;
}): Promise<DailyContentTaskDto[]> {
  const calendar = input.snapshot.contentCalendarDraft;

  if (calendar.length === 0) {
    return [];
  }

  const tasks: DailyContentTaskDto[] = [];
  const days = Math.min(Math.max(input.days, 1), 7);

  for (let index = 0; index < days; index += 1) {
    const taskDate = addDays(input.startDate, index);
    const item = calendar[index % calendar.length] ?? null;
    const seed = hashSeed(`${input.userId}:${taskDate}:consultation_calendar:${item?.id ?? index}`);
    const selectedCalendarItems = uniqueCalendarItems([item]);
    const calendarGuidance = collectContentCalendarGuidanceSummary(selectedCalendarItems);
    const calendarKnowledgeRefs = collectContentCalendarKnowledgeRefs(selectedCalendarItems).slice(
      0,
      8,
    );
    const theme =
      item?.strategyTag ||
      item?.title ||
      input.snapshot.strategyTags[index % Math.max(input.snapshot.strategyTags.length, 1)] ||
      input.snapshot.currentSuggestion ||
      "团队内容日历";
    const retrievalQuery = buildDailyMaterialRetrievalQuery({
      theme,
      articleItem: item,
      videoItem: item,
      snapshot: input.snapshot,
      calendarGuidance,
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
    const materialRefs = articleImageMaterials.slice(0, 6).map((material) => ({
      ...buildMaterialRoutingTrace(material),
      platform: material.platform,
    }));
    const materialHints = compactStrings([
      item?.summary,
      ...copyContextMaterials.slice(0, 4).map((material) => material.title),
      ...(calendarGuidance?.materialHints ?? []),
      ...(calendarGuidance?.assetCapabilityHints ?? []),
    ]).slice(0, 10);

    tasks.push(
      await upsertDailyContentTask({
        merchantId: input.merchantId,
        userId: input.userId,
        taskDate,
        theme,
        teamCalendarSource: {
          source: "consultation_calendar",
          consultationSessionId: input.consultationSessionId ?? null,
          updatedAt: input.sourceUpdatedAt ?? null,
          strategyTags: input.snapshot.strategyTags,
          calendarItemIds: compactStrings([item?.id]),
          calendarItems: selectedCalendarItems,
          calendarGuidance,
        },
        articleTask: buildTaskItem({
          kind: "article",
          item,
          snapshot: input.snapshot,
          materialHints,
          imageMaterials: articleImageMaterials,
          seed,
        }),
        videoTask: buildTaskItem({
          kind: "video",
          item,
          snapshot: input.snapshot,
          materialHints,
          imageMaterials: articleImageMaterials,
          seed: seed + 9,
        }),
        knowledgeRefs: [
          {
            source: "consultation_calendar",
            title: "咨询台团队内容日历",
            summary: item?.summary ?? input.snapshot.currentSuggestion ?? "使用本次咨询日历生成。",
            consultationSessionId: input.consultationSessionId ?? null,
            calendarItemId: item?.id ?? null,
          },
          ...buildCalendarGuidanceKnowledgeRefs(calendarGuidance),
          ...calendarKnowledgeRefs,
          ...copyContextMaterials.slice(0, 4).map((material) => ({
            source: "material_library",
            title: material.title,
            summary: material.description ?? material.engagementLabel ?? "可作为文案/脚本表达参考。",
            usageType: material.usageType,
            retrievalTargets: material.retrievalTargets,
          })),
        ],
        materialRefs,
      }),
    );
  }

  return tasks;
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
  const selectedCalendarItems = [articleItem, videoItem];
  const calendarGuidance = collectContentCalendarGuidanceSummary(selectedCalendarItems);
  const calendarKnowledgeRefs = collectContentCalendarKnowledgeRefs(selectedCalendarItems).slice(
    0,
    8,
  );
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
    calendarGuidance,
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
  const materialHints = compactStrings([
    ...copyContextMaterials.slice(0, 4).map((item) => item.title),
    ...(calendarGuidance?.materialHints ?? []),
  ]).slice(0, 8);

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
      calendarGuidance,
    },
    articleTask: buildTaskItem({
      kind: "article",
      item: articleItem,
      snapshot,
      materialHints,
      imageMaterials: articleImageMaterials,
      seed,
    }),
    videoTask: buildTaskItem({
      kind: "video",
      item: videoItem,
      snapshot,
      materialHints,
      imageMaterials: articleImageMaterials,
      seed: seed + 9,
    }),
    knowledgeRefs: [
      {
        source: "merchant_strategy_asset",
        title: "团队内容日历",
        summary: snapshot?.currentSuggestion ?? "使用团队共享项目资料生成。",
      },
      ...buildCalendarGuidanceKnowledgeRefs(calendarGuidance),
      ...calendarKnowledgeRefs,
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
  calendarGuidance: ReturnType<typeof collectContentCalendarGuidanceSummary>;
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
    ...(input.calendarGuidance?.mustUseFacts ?? []),
    ...(input.calendarGuidance?.contentAngles ?? []),
    ...(input.calendarGuidance?.materialHints ?? []),
    ...(input.calendarGuidance?.assetCapabilityHints ?? []),
    ...(input.calendarGuidance?.shotConstraints ?? []),
  ]).join(" ");
}

function buildCalendarGuidanceKnowledgeRefs(
  calendarGuidance: ReturnType<typeof collectContentCalendarGuidanceSummary>,
) {
  if (!calendarGuidance) {
    return [];
  }

  const summary = compactStrings([
    ...calendarGuidance.mustUseFacts.slice(0, 3),
    ...calendarGuidance.contentAngles.slice(0, 2),
  ]).join("；");

  return [
    {
      source: "team_calendar_guidance",
      title: "知识库选题指导",
      summary: summary || "根据咨询台命中的用户知识库资料生成内容任务。",
      usageType: "calendar_guidance",
      retrievalTargets: ["copy_context", "script_context"],
      mustUseFacts: calendarGuidance.mustUseFacts,
      sellingPointHints: calendarGuidance.sellingPointHints,
      audienceHints: calendarGuidance.audienceHints,
      contentAngles: calendarGuidance.contentAngles,
      complianceNotes: calendarGuidance.complianceNotes,
      materialHints: calendarGuidance.materialHints,
      assetCapabilityHints: calendarGuidance.assetCapabilityHints,
      shotConstraints: calendarGuidance.shotConstraints,
      retrievalTrace: calendarGuidance.retrievalTrace,
      knowledgeRefIds: calendarGuidance.knowledgeRefIds,
    },
  ];
}

function buildTaskItem(input: {
  kind: "article" | "video";
  item: ContentCalendarItemDto | null;
  snapshot: StrategySnapshotDto | null;
  materialHints: string[];
  imageMaterials: MaterialLibraryItemDto[];
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
    generatedArticle:
      input.kind === "article"
        ? buildGeneratedArticlePackage({
            title: withAngle(input.item?.title || defaultTitle, angle),
            summary: input.item?.summary || defaultSummary,
            snapshot: input.snapshot,
            materialHints: input.materialHints,
            imageMaterials: input.imageMaterials,
            seed: input.seed,
          })
        : null,
    generatedVideoScript:
      input.kind === "video"
        ? buildGeneratedVideoScriptPackage({
            title: withAngle(input.item?.title || defaultTitle, angle),
            summary: input.item?.summary || defaultSummary,
            snapshot: input.snapshot,
            materialHints: input.materialHints,
            seed: input.seed,
          })
        : null,
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

function uniqueCalendarItems(items: Array<ContentCalendarItemDto | null | undefined>) {
  const seen = new Set<string>();
  const result: ContentCalendarItemDto[] = [];

  for (const item of items) {
    if (!item || seen.has(item.id)) {
      continue;
    }

    seen.add(item.id);
    result.push(item);
  }

  return result;
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
