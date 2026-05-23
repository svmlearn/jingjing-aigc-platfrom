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
  getContentGenerationBatchById,
  listContentGenerationJobsByBatchId,
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
  getConsultationSessionDetail,
  updateConsultationSession,
} from "@/lib/db/consultation-repository";
import {
  buildStrategyAssetMarkdown,
  upsertMerchantStrategyAssetDocument,
} from "@/lib/db/merchant-strategy-asset-repository";
import {
  buildContentCalendarRevisionId,
  markContentCalendarTeamContentGenerated,
} from "@/lib/content-calendar-revision";
import {
  buildDifyImageRenderUrl,
  mapDifyArticleToMemberPackage,
  mapDifyVideoToMemberPackage,
  parseDifyFinalJson,
  type DifyFinalJson,
} from "@/server/api/dify-final-json-mapper";
import { runDifyWorkflow } from "@/server/api/dify-workflow-client";
import {
  getDailyContentWorkspaceForUser,
  upsertDailyContentTasksFromCalendarForUser,
} from "@/server/api/daily-content-task-service";
import { ApiError } from "@/server/api/errors";
import { getObjectStorageProvider } from "@/server/storage";

type BatchMemberScope = "self" | "active_members";

type CreateBatchResult = {
  batch: ContentGenerationBatchDto;
  jobs: ContentGenerationJobDto[];
};

type BatchStatusResult = {
  batch: ContentGenerationBatchDto;
  jobs: ContentGenerationJobDto[];
};

type RunNextJobResult = {
  job: ContentGenerationJobDto | null;
  processed: boolean;
};

const defaultDifyWorkflowVersion = "v3.1";
const difyInputMaxChars = 5800;

export async function createDifyDailyTaskGenerationBatchForUser(input: {
  userId: string;
  date?: string | null;
  days?: number;
  memberScope?: BatchMemberScope;
  extraRequirement?: string | null;
  consultationSessionId?: string | null;
}): Promise<CreateBatchResult> {
  const workspace = await getOperationalMerchantWorkspaceByUserId(input.userId);
  const days = clampDays(input.days);
  const startDate = normalizeDate(input.date);
  const consultationSession = input.consultationSessionId
    ? await getConsultationSessionDetail({
        merchantId: workspace.merchantProfile.id,
        sessionId: input.consultationSessionId,
      })
    : null;
  const consultationCalendar = consultationSession?.strategySnapshot.contentCalendarDraft ?? [];
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
    const tasks = consultationCalendar.length
      ? await upsertDailyContentTasksFromCalendarForUser({
          userId: member.userId,
          merchantId: workspace.merchantProfile.id,
          startDate,
          days,
          snapshot: consultationSession!.strategySnapshot,
          consultationSessionId: consultationSession!.id,
          sourceUpdatedAt: consultationSession!.updatedAt,
        })
      : [memberWorkspace.today, ...memberWorkspace.upcoming].slice(0, days);

    for (const task of tasks) {
      const calendarItemId = readFirstCalendarItemId(task.teamCalendarSource);
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
        calendarItemId,
        idempotencyKey: [
          workspace.merchantProfile.id,
          member.userId,
          task.taskDate,
          calendarItemId ?? "daily-task",
          getDifyWorkflowVersion(),
        ].join(":"),
        inputSnapshot,
      });
    }
  }

  const result = await createContentGenerationBatch({
    merchantId: workspace.merchantProfile.id,
    createdByUserId: input.userId,
    source: consultationCalendar.length ? "consultation_calendar" : "daily_task",
    workflowProvider: "dify",
    workflowVersion: getDifyWorkflowVersion(),
    calendarSnapshot: {
      date: startDate,
      days,
      source: consultationCalendar.length ? "consultation_calendar" : "daily_content_tasks",
      consultationSessionId: consultationSession?.id ?? null,
      calendarRevisionId: consultationCalendar.length
        ? buildContentCalendarRevisionId(consultationCalendar)
        : null,
      contentCalendarGeneration: consultationSession?.strategySnapshot.contentCalendarGeneration ?? null,
      calendarItemIds: consultationCalendar.map((item) => item.id),
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

  if (consultationCalendar.length && consultationSession) {
    const strategySnapshot = markContentCalendarTeamContentGenerated(
      consultationSession.strategySnapshot,
      {
        batchId: result.batch.id,
        generatedAt: result.batch.createdAt,
        generatedByUserId: input.userId,
        generatedJobCount: result.jobs.length,
      },
    );
    const strategyMarkdown = buildStrategyAssetMarkdown(strategySnapshot);

    await Promise.all([
      updateConsultationSession({
        merchantId: workspace.merchantProfile.id,
        sessionId: consultationSession.id,
        strategySnapshot,
        summaryText: strategySnapshot.currentSuggestion,
      }),
      upsertMerchantStrategyAssetDocument({
        merchantId: workspace.merchantProfile.id,
        strategySnapshot,
        strategyMarkdown,
        canonicalSnapshot: strategySnapshot,
      }),
    ]);
  }

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

export async function getDifyContentGenerationBatchStatusForUser(input: {
  userId: string;
  batchId: string;
}): Promise<BatchStatusResult> {
  const workspace = await getOperationalMerchantWorkspaceByUserId(input.userId);
  const batch = await getContentGenerationBatchById(input.batchId);

  if (batch.merchantId !== workspace.merchantProfile.id) {
    throw new ApiError(404, "CONTENT_GENERATION_BATCH_NOT_FOUND", "生成批次不存在。");
  }

  const jobs = await listContentGenerationJobsByBatchId(batch.id);

  if (workspace.role === "owner" || batch.createdByUserId === input.userId) {
    return { batch, jobs };
  }

  return {
    batch,
    jobs: jobs.filter((job) => job.memberUserId === input.userId),
  };
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
        memberUploadPolicy: videoPackage.scenes.some((scene) => scene.required)
          ? "talking_head_required_only"
          : null,
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
    const retryable = isRetryableDifyContentGenerationError(error);

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
      retryable,
    });

    return { job: failedJob, processed: true };
  }
}

function isRetryableDifyContentGenerationError(error: unknown) {
  if (error instanceof ApiError && error.code === "DIFY_API_KEY_MISSING") {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  return !message.includes("DIFY_API_KEY_MISSING");
}

async function buildDifyJobInputSnapshot(input: {
  task: DailyContentTaskDto;
  merchantName: string;
  merchantSummary: string;
  defaultCta: string[];
  member: { userId: string; displayName?: string | null; role: string };
  extraRequirement?: string | null;
}) {
  const [imageAssets, videoAssetCapabilities] = await Promise.all([
    listImageAssetsForDify({
      merchantId: input.task.merchantId,
      task: input.task,
    }),
    listVideoAssetCapabilitiesForDify({
      merchantId: input.task.merchantId,
      task: input.task,
    }),
  ]);
  const viralReferences = buildViralReferences(input.task);
  const calendarTask = buildCalendarTaskPayload(input.task, {
    videoAssetCapabilities,
  });
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
    videoAssetCapabilities,
  });
  const difyCalendarTask = buildDifyCalendarTaskForDify(calendarTask);
  const difyViralReferences = viralReferences.map(compactKnowledgeRefForDify).slice(0, 8);
  const difyImageAssets = imageAssets.map(compactImageAssetForDify).slice(0, 8);
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
    videoAssetCapabilities,
    viralReferences,
    fallbackKnowledgeText,
    extraRequirement,
    fallbackCta: input.defaultCta[0] ?? null,
    difyInputs: {
      calendar_task_json: stringifyDifyJsonInput(difyCalendarTask),
      viral_references_json: stringifyDifyJsonInput(difyViralReferences),
      image_assets_json: stringifyDifyJsonInput(difyImageAssets),
      fallback_knowledge_text: clampDifyInputText(fallbackKnowledgeText),
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
  const query = buildTaskMaterialRetrievalQuery(input.task);
  const materials = await listMaterialLibraryItems({
    merchantId: input.merchantId,
    retrievalTarget: "article_image_asset",
    query,
    limit: 12,
  }).catch(() => []);

  return Promise.all(materials.map(buildDifyImageAssetPayload));
}

function buildTaskMaterialRetrievalQuery(task: DailyContentTaskDto) {
  const teamCalendarSource = toRecord(task.teamCalendarSource);
  const calendarGuidance = toRecord(teamCalendarSource.calendarGuidance);

  return [
    task.theme,
    task.articleTask.title,
    task.articleTask.summary,
    task.videoTask.title,
    task.videoTask.summary,
    ...task.articleTask.materialHints,
    ...task.videoTask.materialHints,
    ...(readStringArray(calendarGuidance.mustUseFacts) ?? []),
    ...(readStringArray(calendarGuidance.contentAngles) ?? []),
    ...(readStringArray(calendarGuidance.materialHints) ?? []),
    ...(readStringArray(calendarGuidance.assetCapabilityHints) ?? []),
    ...(readStringArray(calendarGuidance.shotConstraints) ?? []),
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");
}

async function listVideoAssetCapabilitiesForDify(input: {
  merchantId: string;
  task: DailyContentTaskDto;
}) {
  const materials = await listMaterialLibraryItems({
    merchantId: input.merchantId,
    retrievalTarget: "video_edit_asset",
    query: buildTaskMaterialRetrievalQuery(input.task),
    limit: 12,
  }).catch(() => []);

  return materials.map(buildDifyVideoAssetCapabilityPayload);
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

function buildDifyVideoAssetCapabilityPayload(material: MaterialLibraryItemDto) {
  const analysis = toRecord(material.analysisPayload);
  const structureSummary = toRecord(analysis.structureSummary);
  const tracePayload = toRecord(analysis.tracePayload);

  return {
    id: material.id,
    title: material.title,
    description: material.description,
    sourceKind: material.sourceKind,
    usageType: material.usageType,
    retrievalTargets: material.retrievalTargets,
    platform: material.platform,
    materialType: material.materialType,
    assetQueryText: [
      material.title,
      material.description,
      material.engagementLabel,
      readString(structureSummary.visualSummary),
      readString(tracePayload.visualSummary),
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .join("\n"),
    sceneTags: readStringArray(structureSummary.sceneTags) ?? [],
    shotTypes: readStringArray(structureSummary.shotTypes) ?? [],
    constraints: readStringArray(structureSummary.shotConstraints) ?? [],
  };
}

function buildCalendarTaskPayload(
  task: DailyContentTaskDto,
  options: {
    videoAssetCapabilities?: Array<ReturnType<typeof buildDifyVideoAssetCapabilityPayload>>;
  } = {},
) {
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
    videoAssetCapabilities: options.videoAssetCapabilities ?? [],
  };
}

function buildViralReferences(task: DailyContentTaskDto) {
  return [
    ...task.knowledgeRefs.map((item, index) => ({
      id: readString(item.id) ?? `knowledge-${index + 1}`,
      source: readString(item.source) ?? "knowledge_ref",
      title: readString(item.title) ?? "知识库参考",
      summary: readString(item.summary),
      usageType: readString(item.usageType),
      retrievalTargets: readStringArray(item.retrievalTargets),
      documentId: readString(item.documentId),
      chunkId: readString(item.chunkId),
      documentTitle: readString(item.documentTitle),
      sourceName: readString(item.sourceName),
      scope: readString(item.scope),
      excerpt: readString(item.excerpt),
      mustUseFacts: readStringArray(item.mustUseFacts),
      contentAngles: readStringArray(item.contentAngles),
      complianceNotes: readStringArray(item.complianceNotes),
      materialHints: readStringArray(item.materialHints),
      assetCapabilityHints: readStringArray(item.assetCapabilityHints),
      shotConstraints: readStringArray(item.shotConstraints),
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

function buildDifyCalendarTaskForDify(
  calendarTask: ReturnType<typeof buildCalendarTaskPayload>,
) {
  const teamCalendarSource = toRecord(calendarTask.teamCalendarSource);

  return {
    id: calendarTask.id,
    taskDate: calendarTask.taskDate,
    theme: clampText(calendarTask.theme, 160),
    status: calendarTask.status,
    teamCalendarSource: compactTeamCalendarSourceForDify(teamCalendarSource),
    articleTask: compactContentTaskForDify(calendarTask.articleTask),
    videoTask: compactContentTaskForDify(calendarTask.videoTask),
    knowledgeRefs: calendarTask.knowledgeRefs.map(compactKnowledgeRefForDify).slice(0, 5),
    materialRefs: calendarTask.materialRefs.map(compactMaterialRefForDify).slice(0, 5),
    videoAssetCapabilities: calendarTask.videoAssetCapabilities
      .map(compactVideoAssetCapabilityForDify)
      .slice(0, 6),
  };
}

function compactTeamCalendarSourceForDify(source: Record<string, unknown>) {
  const calendarGuidance = toRecord(source.calendarGuidance);
  const calendarItems = Array.isArray(source.calendarItems) ? source.calendarItems : [];

  return {
    source: readString(source.source),
    consultationSessionId: readString(source.consultationSessionId),
    calendarItemIds: readStringArray(source.calendarItemIds)?.slice(0, 7) ?? [],
    calendarItems: calendarItems.map(compactCalendarItemForDify).slice(0, 7),
    calendarGuidance: {
      source: readString(calendarGuidance.source),
      summary: clampText(readString(calendarGuidance.summary), 280),
      mustUseFacts: takeStringList(calendarGuidance.mustUseFacts, 4, 180),
      sellingPointHints: takeStringList(calendarGuidance.sellingPointHints, 4, 160),
      audienceHints: takeStringList(calendarGuidance.audienceHints, 3, 140),
      contentAngles: takeStringList(calendarGuidance.contentAngles, 4, 160),
      complianceNotes: takeStringList(calendarGuidance.complianceNotes, 4, 180),
      materialHints: takeStringList(calendarGuidance.materialHints, 4, 140),
      assetCapabilityHints: takeStringList(calendarGuidance.assetCapabilityHints, 4, 160),
      shotConstraints: takeStringList(calendarGuidance.shotConstraints, 4, 180),
      knowledgeRefs: toRecordArray(calendarGuidance.knowledgeRefs)
        .map(compactKnowledgeRefForDify)
        .slice(0, 4),
    },
  };
}

function compactCalendarItemForDify(value: unknown) {
  const item = toRecord(value);

  return {
    id: readString(item.id),
    dayLabel: readString(item.dayLabel),
    contentType: readString(item.contentType),
    title: clampText(readString(item.title), 140),
    summary: clampText(readString(item.summary), 220),
    strategyTag: clampText(readString(item.strategyTag), 80),
  };
}

function compactContentTaskForDify(
  task: ReturnType<typeof buildCalendarTaskPayload>["articleTask"],
) {
  return {
    title: clampText(task.title, 140),
    summary: clampText(task.summary, 240),
    strategyTag: clampText(task.strategyTag, 80),
    contentGoal: clampText(task.contentGoal, 160),
    suggestedPlatform: task.suggestedPlatform,
    materialHints: task.materialHints.map((item) => clampText(item, 100)).slice(0, 4),
  };
}

function compactKnowledgeRefForDify(item: Record<string, unknown>) {
  return {
    id: readString(item.id),
    source: readString(item.source),
    title: clampText(readString(item.title) ?? readString(item.documentTitle), 120),
    summary: clampText(readString(item.summary), 220),
    documentId: readString(item.documentId),
    chunkId: readString(item.chunkId),
    sourceName: clampText(readString(item.sourceName), 80),
    excerpt: clampText(readString(item.excerpt), 260),
    mustUseFacts: takeStringList(item.mustUseFacts, 3, 150),
    contentAngles: takeStringList(item.contentAngles, 3, 140),
    materialHints: takeStringList(item.materialHints, 3, 120),
    assetCapabilityHints: takeStringList(item.assetCapabilityHints, 3, 140),
    shotConstraints: takeStringList(item.shotConstraints, 3, 160),
    complianceNotes: takeStringList(item.complianceNotes, 3, 150),
  };
}

function compactMaterialRefForDify(item: Record<string, unknown>) {
  return {
    id: readString(item.id),
    sourceKind: readString(item.sourceKind),
    title: clampText(readString(item.title), 120),
    usageType: readString(item.usageType),
    retrievalTargets: readStringArray(item.retrievalTargets)?.slice(0, 4) ?? [],
  };
}

function compactVideoAssetCapabilityForDify(
  item: ReturnType<typeof buildDifyVideoAssetCapabilityPayload>,
) {
  return {
    id: item.id,
    title: clampText(item.title, 120),
    description: clampText(item.description, 220),
    sourceKind: item.sourceKind,
    usageType: item.usageType,
    platform: item.platform,
    materialType: item.materialType,
    sceneTags: item.sceneTags.slice(0, 6),
    shotTypes: item.shotTypes.slice(0, 6),
    constraints: item.constraints.map((value) => clampText(value, 140)).slice(0, 4),
    assetQueryText: clampText(item.assetQueryText, 260),
  };
}

function compactImageAssetForDify(item: Awaited<ReturnType<typeof buildDifyImageAssetPayload>>) {
  return {
    id: item.id,
    title: clampText(item.title, 120),
    description: clampText(item.description, 220),
    sourceKind: item.sourceKind,
    usageType: item.usageType,
    retrievalTargets: item.retrievalTargets?.slice(0, 4) ?? [],
    cosPath: item.cosPath,
    url: item.url,
    assetQueryText: clampText(item.assetQueryText, 260),
  };
}

function buildFallbackKnowledgeText(input: {
  task: DailyContentTaskDto;
  merchantName: string;
  merchantSummary: string;
  videoAssetCapabilities?: Array<ReturnType<typeof buildDifyVideoAssetCapabilityPayload>>;
}) {
  return [
    `项目：${input.merchantName}`,
    `项目概况：${input.merchantSummary}`,
    `日期：${input.task.taskDate}`,
    `主题：${input.task.theme}`,
    `图文任务：${input.task.articleTask.title}。${input.task.articleTask.summary}`,
    `视频任务：${input.task.videoTask.title}。${input.task.videoTask.summary}`,
    "视频画面生成原则：把日历素材提示、视频素材能力和成员可补拍方式作为画面边界；未在知识库或素材能力中出现的客户签约、客户访谈、政策文件、价格收益数据、老业主反馈等，不要写成确定已有素材或确定事实。",
    ...input.task.knowledgeRefs.map(formatKnowledgeRefForFallbackText),
    ...(input.videoAssetCapabilities ?? []).map(formatVideoAssetCapabilityForFallbackText),
  ]
    .filter(Boolean)
    .join("\n");
}

function formatKnowledgeRefForFallbackText(item: Record<string, unknown>) {
  const title = readString(item.title) ?? readString(item.documentTitle) ?? "知识库参考";
  const summary = readString(item.summary) ?? readString(item.excerpt);
  const mustUseFacts = readStringArray(item.mustUseFacts) ?? [];
  const contentAngles = readStringArray(item.contentAngles) ?? [];
  const complianceNotes = readStringArray(item.complianceNotes) ?? [];
  const materialHints = readStringArray(item.materialHints) ?? [];
  const assetCapabilityHints = readStringArray(item.assetCapabilityHints) ?? [];
  const shotConstraints = readStringArray(item.shotConstraints) ?? [];
  const parts = [
    summary ? `${title}：${summary}` : title,
    mustUseFacts.length ? `必须参考：${mustUseFacts.join("；")}` : "",
    contentAngles.length ? `内容角度：${contentAngles.join("；")}` : "",
    materialHints.length ? `素材提示：${materialHints.join("；")}` : "",
    assetCapabilityHints.length ? `素材能力：${assetCapabilityHints.join("；")}` : "",
    shotConstraints.length ? `镜头边界：${shotConstraints.join("；")}` : "",
    complianceNotes.length ? `边界：${complianceNotes.join("；")}` : "",
  ].filter(Boolean);

  return parts.join("\n");
}

function formatVideoAssetCapabilityForFallbackText(
  item: ReturnType<typeof buildDifyVideoAssetCapabilityPayload>,
) {
  const parts = [
    `视频素材能力：${item.title}`,
    item.description ? `可用画面：${item.description}` : "",
    item.sceneTags.length ? `场景标签：${item.sceneTags.join("；")}` : "",
    item.shotTypes.length ? `镜头类型：${item.shotTypes.join("；")}` : "",
    item.constraints.length ? `素材限制：${item.constraints.join("；")}` : "",
    item.assetQueryText ? `检索描述：${item.assetQueryText}` : "",
  ].filter(Boolean);

  return parts.join("\n");
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
    durationSeconds: scene.durationSec,
    shotRequirement: scene.taskDescription,
    visual: scene.visualDescription,
    voiceover: scene.voiceover,
    subtitle: scene.subtitle,
    materials: [scene.assetQuery, scene.filmingGuide.location, ...scene.filmingGuide.tips].filter(
      (value): value is string => Boolean(value?.trim()),
    ),
    requiresUserUpload: scene.requiresUserUpload,
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
    return clampDifyInputText(value);
  }

  if (value === null || value === undefined) {
    return "";
  }

  return stringifyDifyJsonInput(value);
}

function stringifyDifyJsonInput(value: unknown) {
  const text = JSON.stringify(value);

  if (text.length <= difyInputMaxChars) {
    return text;
  }

  return JSON.stringify({
    truncated: true,
    note: `Input exceeded ${difyInputMaxChars} characters and was compacted before calling Dify.`,
    summary: clampText(text, difyInputMaxChars - 160),
  });
}

function clampDifyInputText(value: string) {
  return clampText(value, difyInputMaxChars);
}

function clampText(value: string | null | undefined, maxChars: number) {
  if (!value) {
    return value ?? null;
  }

  const trimmed = value.trim();

  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(maxChars - 16, 0)).trimEnd()}...（已截断）`;
}

function takeStringList(value: unknown, maxItems: number, maxChars: number) {
  return (readStringArray(value) ?? [])
    .map((item) => clampText(item, maxChars) ?? "")
    .slice(0, maxItems);
}

function toRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object" && !Array.isArray(item)),
      )
    : [];
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

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const items = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  return items.length ? items : null;
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
