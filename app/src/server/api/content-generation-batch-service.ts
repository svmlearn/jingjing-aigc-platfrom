import "server-only";

import type {
  ContentGenerationBatchDto,
  ContentGenerationJobDto,
} from "@/contracts/content-generation";
import type { DailyContentTaskDto } from "@/contracts/daily-task";
import type { ContentVariantDto } from "@/contracts/draft";
import type { MaterialLibraryItemDto } from "@/contracts/material";
import type { MediaAssetDto } from "@/contracts/media";
import { createDraftWithVariants, createManualSourceItem } from "@/lib/db/content-draft-repository";
import {
  claimNextContentGenerationJob,
  createContentGenerationBatch,
  markContentGenerationJobFailed,
  markContentGenerationJobSucceeded,
} from "@/lib/db/content-generation-repository";
import { updateDailyContentTaskGeneratedContent } from "@/lib/db/daily-content-task-repository";
import { listMaterialLibraryItems } from "@/lib/db/material-library-repository";
import { listAssetObjectsByOwner } from "@/lib/db/media-repository";
import {
  getOperationalMerchantWorkspaceByUserId,
  listActiveMerchantTeamMembersByMerchant,
} from "@/lib/db/merchant-repository";
import {
  buildDifyImageRenderUrl,
  mapDifyArticleToMemberPackage,
  mapDifyVideoToMemberPackage,
  parseDifyFinalJson,
  type DifyFinalJson,
} from "@/server/api/dify-final-json-mapper";
import { runDifyWorkflow } from "@/server/api/dify-workflow-client";
import { getDailyContentWorkspaceForUser } from "@/server/api/daily-content-task-service";
import { getObjectStorageProvider } from "@/server/storage";

type BatchMemberScope = "self" | "active_members";

type CreateBatchResult = {
  batch: ContentGenerationBatchDto;
  jobs: ContentGenerationJobDto[];
};

type RunNextJobResult = {
  job: ContentGenerationJobDto | null;
  processed: boolean;
};

const defaultDifyWorkflowVersion = "v3.1";

export async function createDifyDailyTaskGenerationBatchForUser(input: {
  userId: string;
  date?: string | null;
  days?: number;
  memberScope?: BatchMemberScope;
  extraRequirement?: string | null;
}): Promise<CreateBatchResult> {
  const workspace = await getOperationalMerchantWorkspaceByUserId(input.userId);
  const days = clampDays(input.days);
  const startDate = normalizeDate(input.date);
  const members =
    input.memberScope === "active_members" && workspace.role === "owner"
      ? await listActiveMerchantTeamMembersByMerchant(workspace.merchantProfile.id)
      : [];
  const memberTargets = members.length
    ? members.map((member) => ({
        userId: member.userId,
        displayName: member.displayName,
        role: member.role,
      }))
    : [
        {
          userId: input.userId,
          displayName: workspace.merchantProfile.contactName ?? workspace.merchantProfile.name,
          role: workspace.role,
        },
      ];
  const jobs: Array<{
    memberUserId: string;
    dailyTaskId: string;
    taskDate: string;
    calendarItemId?: string | null;
    idempotencyKey: string;
    inputSnapshot: Record<string, unknown>;
  }> = [];

  for (const member of memberTargets) {
    const memberWorkspace = await getDailyContentWorkspaceForUser({
      userId: member.userId,
      date: startDate,
    });
    const tasks = [memberWorkspace.today, ...memberWorkspace.upcoming].slice(0, days);

    for (const task of tasks) {
      const inputSnapshot = await buildDifyJobInputSnapshot({
        task,
        merchantName: memberWorkspace.project.projectName,
        merchantSummary: memberWorkspace.project.summary,
        defaultCta: workspace.merchantProfile.defaultCta,
        member,
        extraRequirement: input.extraRequirement,
      });

      jobs.push({
        memberUserId: member.userId,
        dailyTaskId: task.id,
        taskDate: task.taskDate,
        calendarItemId: readFirstCalendarItemId(task.teamCalendarSource),
        idempotencyKey: [
          workspace.merchantProfile.id,
          member.userId,
          task.taskDate,
          getDifyWorkflowVersion(),
        ].join(":"),
        inputSnapshot,
      });
    }
  }

  const result = await createContentGenerationBatch({
    merchantId: workspace.merchantProfile.id,
    createdByUserId: input.userId,
    source: "daily_task",
    workflowProvider: "dify",
    workflowVersion: getDifyWorkflowVersion(),
    calendarSnapshot: {
      date: startDate,
      days,
      source: "daily_content_tasks",
    },
    memberScopeSnapshot: {
      scope: input.memberScope ?? "self",
      members: memberTargets.map((member) => ({
        userId: member.userId,
        displayName: member.displayName,
        role: member.role,
      })),
    },
    jobs,
  });

  for (const job of result.jobs) {
    await updateDailyContentTaskGeneratedContent({
      merchantId: job.merchantId,
      userId: job.memberUserId,
      taskId: job.dailyTaskId,
      articleTaskPatch: {
        generationStatus: "pending",
        generationJobId: job.id,
        contentDraftId: null,
        contentVariantId: null,
      },
      videoTaskPatch: {
        generationStatus: "pending",
        generationJobId: job.id,
        contentDraftId: null,
        contentVariantId: null,
      },
    });
  }

  return result;
}

export async function runNextDifyContentGenerationJob(): Promise<RunNextJobResult> {
  const job = await claimNextContentGenerationJob({ provider: "dify" });

  if (!job) {
    return { job: null, processed: false };
  }

  await updateDailyContentTaskGeneratedContent({
    merchantId: job.merchantId,
    userId: job.memberUserId,
    taskId: job.dailyTaskId,
    articleTaskPatch: {
      generationStatus: "running",
      generationJobId: job.id,
    },
    videoTaskPatch: {
      generationStatus: "running",
      generationJobId: job.id,
    },
  }).catch(() => undefined);

  try {
    const workflowResult = await runDifyWorkflow({
      inputs: readDifyWorkflowInputs(job.inputSnapshot),
      user: `member-${job.memberUserId}`,
    });
    const finalJson = parseDifyFinalJson(workflowResult.finalResultJson);
    const generatedAt = new Date().toISOString();
    const articlePackage = mapDifyArticleToMemberPackage({
      finalJson,
      generatedAt,
      fallbackCta: readFallbackCta(job.inputSnapshot),
    });
    const videoPackage = mapDifyVideoToMemberPackage({
      finalJson,
      generatedAt,
      fallbackTitle: jobTitleFromSnapshot(job.inputSnapshot),
    });
    const draftBundle = await createDifyDraftBundle({
      job,
      finalJson,
      rawOutputs: workflowResult.rawOutputs,
    });
    const articleVariant = draftBundle.variants.find((variant) => variant.variantType === "note");
    const videoVariant = draftBundle.variants.find(
      (variant) => variant.variantType === "video_script",
    );

    await updateDailyContentTaskGeneratedContent({
      merchantId: job.merchantId,
      userId: job.memberUserId,
      taskId: job.dailyTaskId,
      articleTaskPatch: {
        generatedArticle: articlePackage,
        generationStatus: "succeeded",
        generationJobId: job.id,
        contentDraftId: draftBundle.draft.id,
        contentVariantId: articleVariant?.id ?? null,
      },
      videoTaskPatch: {
        generatedVideoScript: videoPackage,
        generationStatus: "succeeded",
        generationJobId: job.id,
        contentDraftId: draftBundle.draft.id,
        contentVariantId: videoVariant?.id ?? null,
      },
      status: "generated",
    });

    const updatedJob = await markContentGenerationJobSucceeded({
      jobId: job.id,
      outputJson: finalJson as unknown as Record<string, unknown>,
      qualityReview: {
        status: finalJson.status,
        riskTerms: finalJson.quality.riskTerms,
      },
      difyWorkflowRunId: workflowResult.workflowRunId ?? null,
      contentDraftId: draftBundle.draft.id,
      articleVariantId: articleVariant?.id ?? null,
      videoVariantId: videoVariant?.id ?? null,
    });

    return { job: updatedJob, processed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dify 生成任务失败。";

    await updateDailyContentTaskGeneratedContent({
      merchantId: job.merchantId,
      userId: job.memberUserId,
      taskId: job.dailyTaskId,
      articleTaskPatch: {
        generationStatus: "failed",
        generationJobId: job.id,
      },
      videoTaskPatch: {
        generationStatus: "failed",
        generationJobId: job.id,
      },
    }).catch(() => undefined);

    const failedJob = await markContentGenerationJobFailed({
      jobId: job.id,
      errorMessage: message,
      retryable: false,
    });

    return { job: failedJob, processed: true };
  }
}

async function buildDifyJobInputSnapshot(input: {
  task: DailyContentTaskDto;
  merchantName: string;
  merchantSummary: string;
  defaultCta: string[];
  member: { userId: string; displayName?: string | null; role: string };
  extraRequirement?: string | null;
}) {
  const imageAssets = await listImageAssetsForDify({
    merchantId: input.task.merchantId,
    task: input.task,
  });
  const viralReferences = buildViralReferences(input.task);
  const calendarTask = buildCalendarTaskPayload(input.task);
  const memberProfile = {
    userId: input.member.userId,
    displayName: input.member.displayName ?? null,
    role: input.member.role,
  };
  const accountProfile = {
    merchantId: input.task.merchantId,
    name: input.merchantName,
    summary: input.merchantSummary,
    defaultCta: input.defaultCta,
  };
  const fallbackKnowledgeText = buildFallbackKnowledgeText({
    task: input.task,
    merchantName: input.merchantName,
    merchantSummary: input.merchantSummary,
  });
  const extraRequirement = input.extraRequirement?.trim() ?? "";

  return {
    source: "daily_task",
    workflowProvider: "dify",
    workflowVersion: getDifyWorkflowVersion(),
    dailyTaskId: input.task.id,
    taskDate: input.task.taskDate,
    calendarTask,
    memberProfile,
    accountProfile,
    imageAssets,
    viralReferences,
    fallbackKnowledgeText,
    extraRequirement,
    fallbackCta: input.defaultCta[0] ?? null,
    difyInputs: {
      calendar_task_json: JSON.stringify(calendarTask),
      viral_references_json: JSON.stringify(viralReferences),
      image_assets_json: JSON.stringify(imageAssets),
      fallback_knowledge_text: fallbackKnowledgeText,
      extra_requirement: extraRequirement,
      member_profile_json: JSON.stringify(memberProfile),
      account_profile_json: JSON.stringify(accountProfile),
    },
  };
}

async function listImageAssetsForDify(input: {
  merchantId: string;
  task: DailyContentTaskDto;
}) {
  const query = [
    input.task.theme,
    input.task.articleTask.title,
    input.task.articleTask.summary,
    input.task.videoTask.title,
    input.task.videoTask.summary,
  ].join(" ");
  const materials = await listMaterialLibraryItems({
    merchantId: input.merchantId,
    retrievalTarget: "article_image_asset",
    query,
    limit: 12,
  }).catch(() => []);

  return Promise.all(materials.map(buildDifyImageAssetPayload));
}

async function buildDifyImageAssetPayload(material: MaterialLibraryItemDto) {
  const assets = await listAssetObjectsByOwner({
    ownerType: "source_item",
    ownerId: material.sourceItemId ?? material.id,
  }).catch(() => []);
  const primaryImage = assets.find((asset) => asset.assetType === "image") ?? null;
  const storagePath = primaryImage ? buildStoragePath(primaryImage) : material.originalUrl ?? null;

  return {
    id: material.id,
    title: material.title,
    description: material.description,
    sourceKind: material.sourceKind,
    usageType: material.usageType,
    retrievalTargets: material.retrievalTargets,
    cosPath: storagePath,
    url: primaryImage ? buildSignedPreviewUrl(primaryImage) : material.originalUrl ?? null,
    originalUrl: material.originalUrl,
    assetObjectId: primaryImage?.id ?? null,
    assetQueryText: [material.title, material.description, material.engagementLabel]
      .filter((value): value is string => Boolean(value?.trim()))
      .join("\n"),
  };
}

function buildCalendarTaskPayload(task: DailyContentTaskDto) {
  return {
    id: task.id,
    taskDate: task.taskDate,
    theme: task.theme,
    status: task.status,
    teamCalendarSource: task.teamCalendarSource,
    articleTask: {
      title: task.articleTask.title,
      summary: task.articleTask.summary,
      strategyTag: task.articleTask.strategyTag,
      contentGoal: task.articleTask.contentGoal,
      suggestedPlatform: task.articleTask.suggestedPlatform,
      materialHints: task.articleTask.materialHints,
    },
    videoTask: {
      title: task.videoTask.title,
      summary: task.videoTask.summary,
      strategyTag: task.videoTask.strategyTag,
      contentGoal: task.videoTask.contentGoal,
      suggestedPlatform: task.videoTask.suggestedPlatform,
      materialHints: task.videoTask.materialHints,
    },
    knowledgeRefs: task.knowledgeRefs,
    materialRefs: task.materialRefs,
  };
}

function buildViralReferences(task: DailyContentTaskDto) {
  return [
    ...task.knowledgeRefs.map((item, index) => ({
      id: readString(item.id) ?? `knowledge-${index + 1}`,
      source: item.source ?? "knowledge_ref",
      title: item.title ?? "知识库参考",
      summary: item.summary ?? null,
      usageType: item.usageType ?? null,
      retrievalTargets: item.retrievalTargets ?? null,
    })),
    ...task.materialRefs
      .filter((item) => item.sourceKind === "benchmark")
      .map((item, index) => ({
        id: readString(item.id) ?? `benchmark-${index + 1}`,
        source: "material_library",
        title: item.title ?? "对标素材",
        usageType: item.usageType ?? null,
        retrievalTargets: item.retrievalTargets ?? null,
      })),
  ];
}

function buildFallbackKnowledgeText(input: {
  task: DailyContentTaskDto;
  merchantName: string;
  merchantSummary: string;
}) {
  return [
    `项目：${input.merchantName}`,
    `项目概况：${input.merchantSummary}`,
    `日期：${input.task.taskDate}`,
    `主题：${input.task.theme}`,
    `图文任务：${input.task.articleTask.title}。${input.task.articleTask.summary}`,
    `视频任务：${input.task.videoTask.title}。${input.task.videoTask.summary}`,
    ...input.task.knowledgeRefs.map((item) =>
      [item.title, item.summary].filter((value) => typeof value === "string" && value).join("："),
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

function readDifyWorkflowInputs(snapshot: Record<string, unknown>) {
  const inputs = toRecord(snapshot.difyInputs);

  return {
    calendar_task_json: stringifyDifyInput(inputs.calendar_task_json ?? snapshot.calendarTask),
    viral_references_json: stringifyDifyInput(inputs.viral_references_json ?? snapshot.viralReferences),
    image_assets_json: stringifyDifyInput(inputs.image_assets_json ?? snapshot.imageAssets),
    fallback_knowledge_text: stringifyDifyInput(
      inputs.fallback_knowledge_text ?? snapshot.fallbackKnowledgeText,
    ),
    extra_requirement: stringifyDifyInput(inputs.extra_requirement ?? snapshot.extraRequirement),
    member_profile_json: stringifyDifyInput(inputs.member_profile_json ?? snapshot.memberProfile),
    account_profile_json: stringifyDifyInput(inputs.account_profile_json ?? snapshot.accountProfile),
  };
}

async function createDifyDraftBundle(input: {
  job: ContentGenerationJobDto;
  finalJson: DifyFinalJson;
  rawOutputs?: Record<string, unknown> | null;
}) {
  const scriptText = formatVideoScriptText(input.finalJson);
  const sourceItem = await createManualSourceItem({
    merchantId: input.job.merchantId,
    platform: "xiaohongshu",
    title: input.finalJson.article.title,
    bodyText: input.finalJson.article.copyText,
    scriptText,
    tracePayload: {
      source: "dify",
      contentGenerationJobId: input.job.id,
      workflowProvider: input.job.workflowProvider,
      workflowVersion: input.job.workflowVersion,
    },
  });

  return createDraftWithVariants({
    merchantId: input.job.merchantId,
    createdByUserId: input.job.memberUserId,
    sourceItemId: sourceItem.id,
    workingTitle: input.finalJson.article.title,
    rewriteGoal: "Dify 内容日历批量生成",
    status: "review_pending",
    inputSnapshot: {
      source: "dify_daily_task_generation",
      contentGenerationJobId: input.job.id,
      dailyTaskId: input.job.dailyTaskId,
      taskDate: input.job.taskDate,
      difyFinalJson: input.finalJson,
      difyRawOutputs: input.rawOutputs ?? null,
    },
    variants: [
      {
        platform: "xiaohongshu",
        variantType: "note",
        title: input.finalJson.article.title,
        bodyText: input.finalJson.article.copyText,
        hashtags: extractHashtags(input.finalJson.article.copyText),
        ctaText: readFallbackCta(input.job.inputSnapshot),
        reviewStatus: "review_pending",
      },
      {
        platform: "douyin",
        variantType: "video_script",
        title: input.finalJson.video.scenes[0]?.title ?? input.finalJson.article.title,
        scriptText,
        hashtags: [],
        ctaText:
          [...input.finalJson.video.scenes].reverse().find((scene) => scene.voiceover.trim())
            ?.voiceover ?? null,
        productionScenes: input.finalJson.video.scenes.map(mapDifySceneToProductionScene),
        reviewStatus: "review_pending",
      },
    ],
  });
}

function mapDifySceneToProductionScene(
  scene: DifyFinalJson["video"]["scenes"][number],
): NonNullable<ContentVariantDto["productionScenes"]>[number] {
  return {
    sceneNo: scene.sceneNo,
    timeRange: scene.timeRange,
    shotRequirement: scene.taskDescription,
    visual: scene.visualDescription,
    voiceover: scene.voiceover,
    subtitle: scene.subtitle,
    materials: [scene.assetQuery, scene.filmingGuide.location, ...scene.filmingGuide.tips].filter(
      (value): value is string => Boolean(value?.trim()),
    ),
    cameraMovement: scene.shotLanguage.cameraMovement || scene.filmingGuide.method,
    purpose: scene.purpose,
    fallbackShot: scene.filmingGuide.method,
  };
}

function formatVideoScriptText(finalJson: DifyFinalJson) {
  return [
    `故事线：${finalJson.video.storyOutline}`,
    `预计时长：${finalJson.video.estimatedDuration}`,
    `BGM：${finalJson.video.bgm}`,
    `口吻：${finalJson.video.toneOfVoice}`,
    "",
    ...finalJson.video.scenes.map((scene) =>
      [
        `镜头 ${scene.sceneNo}｜${scene.timeRange}｜${scene.title}`,
        `画面：${scene.visualDescription}`,
        `口播：${scene.voiceover}`,
        `字幕：${scene.subtitle}`,
        `拍法：${scene.filmingGuide.method}`,
        `素材检索：${scene.assetQuery}`,
      ].join("\n"),
    ),
  ].join("\n\n");
}

function buildStoragePath(asset: MediaAssetDto) {
  if (asset.storageProvider === "tencent_cos") {
    return asset.bucketName ? `cos://${asset.bucketName}/${asset.storageKey}` : asset.storageKey;
  }

  if (asset.storageProvider === "aliyun_oss") {
    return asset.bucketName ? `oss://${asset.bucketName}/${asset.storageKey}` : asset.storageKey;
  }

  return asset.storageKey;
}

function buildSignedPreviewUrl(asset: MediaAssetDto) {
  try {
    if (asset.storageProvider === "tencent_cos" || asset.storageProvider === "aliyun_oss") {
      return getObjectStorageProvider(asset.storageProvider).createSignedReadUrl({
        bucketName: asset.bucketName,
        storageKey: asset.storageKey,
        expiresInSeconds: 3600,
      });
    }
  } catch {
    return buildDifyImageRenderUrl(buildStoragePath(asset));
  }

  return buildDifyImageRenderUrl(buildStoragePath(asset));
}

function stringifyDifyInput(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return "";
  }

  return JSON.stringify(value);
}

function extractHashtags(text: string): string[] {
  return Array.from(new Set(text.match(/#[^\s#，,。；;、]+/g) ?? [])).map((tag) =>
    tag.replace(/^#/, ""),
  );
}

function readFallbackCta(snapshot: Record<string, unknown>) {
  return readString(snapshot.fallbackCta) ?? "想了解具体户型和看房安排，可以私信我。";
}

function jobTitleFromSnapshot(snapshot: Record<string, unknown>) {
  const task = toRecord(snapshot.calendarTask);
  const videoTask = toRecord(task.videoTask);
  return readString(videoTask.title);
}

function readFirstCalendarItemId(value: Record<string, unknown>) {
  const ids = value.calendarItemIds;
  return Array.isArray(ids) && typeof ids[0] === "string" ? ids[0] : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clampDays(value: number | undefined) {
  return Math.min(Math.max(value ?? 7, 1), 7);
}

function normalizeDate(value?: string | null) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return new Date().toISOString().slice(0, 10);
}

function getDifyWorkflowVersion() {
  return process.env.DIFY_WORKFLOW_VERSION?.trim() || defaultDifyWorkflowVersion;
}
