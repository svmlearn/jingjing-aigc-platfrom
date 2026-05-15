import "server-only";

import type {
  ContentCalendarItemDto,
  ConsultationSessionDetailDto,
  MerchantStrategyAssetDto,
  StrategySnapshotDto,
} from "@/contracts/consultation";
import type { DailyContentTaskDto } from "@/contracts/daily-task";
import type { ContentDraftBundleDto, ContentVariantDto } from "@/contracts/draft";
import type {
  MaterialLibraryItemDto,
  MaterialWorkbenchReferenceDto,
  MaterialWorkbenchTarget,
} from "@/contracts/material";
import { getConsultationSessionDetail } from "@/lib/db/consultation-repository";
import { emptyStrategySnapshot, toStrategySnapshot } from "@/lib/strategy-snapshot";
import {
  buildStrategyAssetMarkdown,
  getMerchantStrategyAssetDocument,
} from "@/lib/db/merchant-strategy-asset-repository";
import {
  appendContentDraftRevisionTrace,
  appendContentVariantToDraft,
  assertContentVariantAccess,
  createDraftWithVariants,
  createManualSourceItem,
  getDraftBundleByMerchant,
  listDraftBundlesByMerchant,
  updateContentVariantScript,
} from "@/lib/db/content-draft-repository";
import {
  consumeMaterialWorkbenchReference,
  getMaterialLibraryItemById,
  getMaterialWorkbenchReference,
  listMaterialLibraryItems,
} from "@/lib/db/material-library-repository";
import {
  buildMaterialRoutingTrace,
  materialMatchesRetrievalTarget,
} from "@/lib/material-routing";
import { readMaterialRetrievalTrace } from "@/lib/material-retrieval";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import { getDailyContentTaskForUser } from "@/server/api/daily-content-task-service";
import { searchKnowledgeChunks } from "@/lib/db/knowledge-repository";
import { getPlatformSettings } from "@/lib/db/platform-admin-repository";
import { buildRoundtableSnapshotForInput } from "@/server/api/roundtable-consultation-service";
import {
  AiRuntimeError,
  createChatCompletion,
  getAiRuntimeApiKey,
} from "@/server/api/ai-runtime";
import { ApiError } from "@/server/api/errors";
import {
  classifyVideoScriptRevisionIntent,
  validateScriptProductionBrief,
  type ScriptProductionBrief,
} from "@/server/api/video-script-production-agent";
import { assertVideoScriptVariantAccess } from "@/lib/db/video-edit-job-repository";
import { buildVideoScriptContext, type VideoScriptScene } from "@/server/api/video-growth-context";
import {
  formatSetVideoScriptForStorage,
  runVideoWorkbenchAgentRuntime,
  setVideoScriptScenesToVideoScenes,
  type VideoWorkbenchAgentConversationMessage,
} from "@/server/api/video-workbench-agent-runtime";
import {
  ARTICLE_PROMPT_VERSION,
  ArticlePromptParseError,
  buildArticleGenerationMessages,
  parseArticleGenerationResponse,
  type ArticlePlaybook,
  type ArticleGeneratedVariant,
  type ArticlePromptContext,
  type ArticlePromptMode,
  type ArticlePromptTraceMode,
} from "@/server/api/article-prompt-templates";
import { buildDeterministicArticleRiskNotes } from "@/server/api/article-risk-notes";

type GenerationMode = "create" | "rewrite";
type GenerationSource = "consultation_calendar" | "material_center" | "manual" | "daily_task";
type WorkbenchKind = "article" | "video";
type ContentVariantAccessContext = Awaited<ReturnType<typeof assertContentVariantAccess>>;
type SelectedCalendarItemSnapshot = ContentCalendarItemDto & {
  targetPlatform: "xiaohongshu" | "douyin";
  contentGoal: string | null;
};
type RetrievalReference = {
  id: string;
  title: string;
  summary: string | null;
  source: "knowledge_base" | "material_library";
  usageType?: string | null;
  score?: number | null;
  matchReasons?: string[];
};
type ArticleMaterialRetrievalContext = {
  target: "copy_context" | "article_image_asset";
  retrievalQueries: {
    copyContext: string;
    articleImageAsset: string;
  };
  copyContextRefs: RetrievalReference[];
  imageAssetRefs: Array<Record<string, unknown>>;
  imageBrief: {
    prompt: string;
    reason: string;
  } | null;
  degradationNotices: string[];
};

async function getConsultationSessionWithMerchantStrategy(input: {
  merchantId: string;
  sessionId: string;
}): Promise<ConsultationSessionDetailDto> {
  const [session, merchantStrategyAsset] = await Promise.all([
    getConsultationSessionDetail(input),
    getMerchantStrategyAssetDocument(input.merchantId),
  ]);

  return merchantStrategyAsset
    ? {
        ...session,
        strategySnapshot: merchantStrategyAsset.strategySnapshot,
        strategyAsset: merchantStrategyAsset,
      }
    : session;
}

async function buildDailyTaskSession(input: {
  merchantId: string;
  dailyTask?: DailyContentTaskDto | null;
}): Promise<ConsultationSessionDetailDto> {
  const merchantStrategyAsset = await getMerchantStrategyAssetDocument(input.merchantId);
  const baseSnapshot = merchantStrategyAsset?.strategySnapshot ?? emptyStrategySnapshot;
  const task = input.dailyTask ?? null;
  const articleCalendarItem = task
    ? buildDailyTaskCalendarItem(task, "article")
    : null;
  const videoCalendarItem = task ? buildDailyTaskCalendarItem(task, "video") : null;
  const strategyTags = compactStrings([
    task?.theme ?? "",
    task?.articleTask.strategyTag ?? "",
    task?.videoTask.strategyTag ?? "",
    ...baseSnapshot.strategyTags,
  ]);
  const strategySnapshot: StrategySnapshotDto = {
    ...baseSnapshot,
    positioning: firstString(baseSnapshot.positioning, "房地产项目内容营销") ?? "",
    coreSellingPoints: baseSnapshot.coreSellingPoints.length
      ? baseSnapshot.coreSellingPoints
      : compactStrings([
          task?.theme ?? "",
          "项目区位、配套成熟度、上车门槛和客户决策顾虑",
        ]),
    targetAudiences: baseSnapshot.targetAudiences.length
      ? baseSnapshot.targetAudiences
      : ["有购房、换房或投资需求的本地客户"],
    keyScenes: baseSnapshot.keyScenes.length
      ? baseSnapshot.keyScenes
      : ["项目现场或周边配套口播", "客户常见问题拆解", "项目卖点实拍补充"],
    currentSuggestion:
      firstString(
        task?.theme,
        task?.articleTask.summary,
        task?.videoTask.summary,
        baseSnapshot.currentSuggestion,
      ) ?? "围绕团队内容日历生成今日内容。",
    strategyTags,
    contentCalendarDraft: compactCalendarItems([
      articleCalendarItem,
      videoCalendarItem,
      ...baseSnapshot.contentCalendarDraft,
    ]),
    articleBrief: {
      workingTitle:
        firstString(task?.articleTask.title, baseSnapshot.articleBrief?.workingTitle) ??
        "今日图文任务",
      angle:
        firstString(task?.articleTask.summary, baseSnapshot.articleBrief?.angle) ??
        "围绕团队内容日历生成小红书图文。",
      callToAction:
        firstString(baseSnapshot.articleBrief?.callToAction, "私信咨询，获取项目资料。") ??
        "私信咨询，获取项目资料。",
    },
    videoBrief: {
      workingTitle:
        firstString(task?.videoTask.title, baseSnapshot.videoBrief?.workingTitle) ??
        "今日视频任务",
      hook:
        firstString(task?.videoTask.summary, baseSnapshot.videoBrief?.hook) ??
        "用真人口播讲清今日项目机会。",
      outcome:
        firstString(baseSnapshot.videoBrief?.outcome, "让客户愿意私信咨询项目情况。") ??
        "让客户愿意私信咨询项目情况。",
    },
  };
  const strategyAsset: MerchantStrategyAssetDto = merchantStrategyAsset
    ? {
        ...merchantStrategyAsset,
        strategySnapshot,
        strategyMarkdown: appendDailyTaskMarkdown(
          merchantStrategyAsset.strategyMarkdown,
          task,
        ),
      }
    : {
        merchantId: input.merchantId,
        strategySnapshot,
        strategyMarkdown: buildStrategyAssetMarkdown(strategySnapshot),
        canonicalSnapshot: strategySnapshot,
        compiledContext: null,
        updatedAt: task?.updatedAt ?? new Date().toISOString(),
      };
  const timestamp = task?.updatedAt ?? strategyAsset.updatedAt ?? new Date().toISOString();

  return {
    id: task ? `daily-task:${task.id}` : "daily-task:workspace-context",
    merchantId: input.merchantId,
    title: task ? `今日任务：${task.theme}` : "共享内容上下文",
    status: "active",
    currentStage: null,
    strategySnapshot,
    strategyAsset,
    summaryText: task
      ? [
          `团队主题：${task.theme}`,
          `图文任务：${task.articleTask.title}`,
          `视频任务：${task.videoTask.title}`,
        ].join("\n")
      : "使用团队共享知识库和素材库生成内容。",
    latestMessagePreview: null,
    lastMessageAt: timestamp,
    createdAt: task?.createdAt ?? timestamp,
    updatedAt: timestamp,
    messages: [],
    events: [],
  };
}

export async function generateArticleDraftForUser(input: {
  userId: string;
  sessionId?: string | null;
  dailyTaskId?: string | null;
  goal?: string | null;
  extraRequirement?: string | null;
  toneStyle?: string | null;
  mode?: GenerationMode | null;
  source?: GenerationSource | null;
  calendarItemId?: string | null;
  materialId?: string | null;
  materialReferenceId?: string | null;
  strategyTag?: string | null;
  articlePlaybook?: ArticlePlaybook | null;
}): Promise<ContentDraftBundleDto> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const dailyTask = input.dailyTaskId
    ? await getDailyContentTaskForUser({
        userId: input.userId,
        dailyTaskId: input.dailyTaskId,
      })
    : null;
  const session = input.sessionId
    ? await getConsultationSessionWithMerchantStrategy({
        merchantId: merchant.id,
        sessionId: input.sessionId,
      })
    : await buildDailyTaskSession({
        merchantId: merchant.id,
        dailyTask,
      });
  const materialContext = await resolveMaterialContext({
    merchantId: merchant.id,
    materialId: input.materialId,
    materialReferenceId: input.materialReferenceId,
    targetWorkbench: "article",
  });
  const generationContext = resolveGenerationContext({
    source: input.source,
    calendarItemId: input.calendarItemId,
    strategyTag: input.strategyTag,
    session,
    material: materialContext.material,
    targetWorkbench: "article",
  });
  const roundtableContext = buildRoundtableSnapshotForInput(session);
  const mode: GenerationMode =
    input.mode ?? (materialContext.material ? "rewrite" : "create");

  if (mode === "rewrite" && !materialContext.material) {
    throw new ApiError(
      400,
      "ARTICLE_REWRITE_MATERIAL_REQUIRED",
      "改写模式需要先选择参考素材。",
    );
  }

  const workingTitle =
    materialContext.material
      ? `改写：${materialContext.material.title}`
      : generationContext.selectedCalendarItem?.title ??
        session.strategySnapshot.articleBrief?.workingTitle ??
        `${merchant.name} 的图文内容草稿`;
  const sourceItem = await createManualSourceItem({
    merchantId: merchant.id,
    platform: "xiaohongshu",
    title: workingTitle,
    bodyText:
      buildSourceText({
        extraRequirement: input.extraRequirement,
        material: materialContext.material,
        fallback: session.summaryText ?? workingTitle,
      }),
    tracePayload: {
      consultation_session_id: input.sessionId ? session.id : null,
      synthetic_session_id: input.sessionId ? null : session.id,
      daily_task_id: dailyTask?.id ?? null,
      generated_kind: "article",
      generation_mode: mode,
      generation_source: generationContext.source,
      calendar_item_id: generationContext.calendarItemId,
      selected_calendar_item: generationContext.selectedCalendarItem,
      strategy_tag: generationContext.strategyTag,
      material_item_id: materialContext.material?.id ?? null,
      material_reference_id: materialContext.reference?.id ?? input.materialReferenceId ?? null,
    },
  });
  const angle =
    input.goal ??
    generationContext.selectedCalendarItem?.summary ??
    session.strategySnapshot.articleBrief?.angle ??
    null;
  const materialSnapshot = buildMaterialSnapshot(materialContext.material, materialContext.reference);
  const articleRetrieval = await collectArticleMaterialRetrieval({
    merchantId: merchant.id,
    selectedMaterial: materialContext.material,
    session,
    selectedCalendarItem: generationContext.selectedCalendarItem,
    contentGoal: angle,
    extraRequirement: input.extraRequirement ?? null,
  });
  const articleContext = buildArticlePromptContext({
    selectedCalendarItem: generationContext.selectedCalendarItem,
    strategySnapshot: session.strategySnapshot,
    strategyAssetMarkdown: resolveStrategyAssetMarkdown(session),
    articlePlaybook: input.articlePlaybook ?? "balanced_seed",
    merchantProfile: buildMerchantSnapshot(merchant),
    materialContext: materialSnapshot,
    retrievalContext: articleRetrieval,
    contentGoal: angle,
    extraRequirement: input.extraRequirement ?? null,
    toneStyle: input.toneStyle ?? null,
  });
  const articleGeneration = await generateArticleVariantsWithLlm({
    mode,
    context: articleContext,
    expectedVariantCount: "multiple",
  });
  const articleRiskNotes = compactStrings([
    ...articleGeneration.riskNotes,
    ...buildDeterministicArticleRiskNotes({
      variants: articleGeneration.variants,
      forbiddenWords: merchant.forbiddenWords,
      materialRefs: dailyTask?.materialRefs ?? [],
    }),
  ]).slice(0, 10);

  const draftBundle = await createDraftWithVariants({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    sourceItemId: sourceItem.id,
    workingTitle,
    rewriteGoal: angle,
    inputSnapshot: {
      source: generationContext.source,
      dailyTaskId: dailyTask?.id ?? null,
      teamTheme: dailyTask?.theme ?? null,
      teamCalendarSource: dailyTask?.teamCalendarSource ?? null,
      consultationSessionId: input.sessionId ? session.id : null,
      syntheticSessionId: input.sessionId ? null : session.id,
      calendarItemId: generationContext.calendarItemId,
      selectedCalendarItem: generationContext.selectedCalendarItem,
      strategySnapshot: session.strategySnapshot,
      strategyAssetMarkdown: articleContext.strategyAssetMarkdown,
      roundtableContext,
      merchantProfile: buildMerchantSnapshot(merchant),
      matchedProjectMaterials: articleRetrieval.imageAssetRefs,
      knowledgeRefs: [
        ...(dailyTask?.knowledgeRefs ?? []),
        ...articleRetrieval.copyContextRefs,
      ],
      materialRetrieval: articleRetrieval,
      generationMode: mode,
      strategyTag: generationContext.strategyTag,
      articlePlaybook: articleContext.articlePlaybook,
      extraRequirement: input.extraRequirement ?? null,
      toneStyle: input.toneStyle ?? null,
      materialContext: materialSnapshot,
      coverCopySuggestions: compactStrings(
        articleGeneration.variants.flatMap((variant) => variant.coverCopySuggestions),
      ).slice(0, 3),
      imageStructureSuggestions: compactStrings(
        [
          ...articleGeneration.variants.flatMap((variant) => variant.imageStructureSuggestions),
          articleRetrieval.imageBrief?.prompt ?? "",
        ],
      ).slice(0, 5),
      writingNotes: articleGeneration.variants.map((variant) => variant.rationale).filter(Boolean),
      promptMode: mode,
      promptVersion: ARTICLE_PROMPT_VERSION,
      llmTrace: articleGeneration.trace,
      riskNotes: articleRiskNotes,
    },
    commentInsights: {
      audiences: session.strategySnapshot.targetAudiences,
      strategyTags: session.strategySnapshot.strategyTags,
      referenceMaterialTitle: materialContext.material?.title ?? null,
      referenceMaterialEngagement: materialContext.material?.engagementLabel ?? null,
      articlePlaybook: articleContext.articlePlaybook,
      promptMode: articleGeneration.trace.mode,
      promptVersion: ARTICLE_PROMPT_VERSION,
      riskNotes: articleRiskNotes,
    },
    variants: articleGeneration.variants.map((variant) => ({
      platform: "xiaohongshu",
      variantType: "note",
      title: variant.title,
      bodyText: variant.bodyText,
      hashtags: variant.hashtags.length ? variant.hashtags : buildHashtags(session),
      ctaText: variant.ctaText || null,
    })),
  });

  await consumeMaterialReferenceIfNeeded({
    merchantId: merchant.id,
    materialId: materialContext.material?.id ?? input.materialId ?? null,
    materialReferenceId: input.materialReferenceId,
    targetWorkbench: "article",
    draftId: draftBundle.draft.id,
  });

  return draftBundle;
}

export async function reviseArticleDraftForUser(input: {
  userId: string;
  contentVariantId: string;
  revisionInstruction: string;
  toneStyle?: string | null;
}): Promise<{
  variant: NonNullable<ContentDraftBundleDto["selectedVariant"]>;
  llmTrace: {
    promptVersion: typeof ARTICLE_PROMPT_VERSION;
    mode: ArticlePromptTraceMode;
    model?: string;
    error?: string;
  };
  riskNotes: string[];
}> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const currentVariant = await assertContentVariantAccess({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    contentVariantId: input.contentVariantId,
    variantType: "note",
  });

  if (!currentVariant.bodyText?.trim()) {
    throw new ApiError(
      409,
      "ARTICLE_BODY_TEXT_REQUIRED",
      "图文版本缺少正文，无法修订。",
    );
  }

  const originalContext = toRecord(currentVariant.inputSnapshot);
  const articleGeneration = await generateArticleVariantsWithLlm({
    mode: "revise",
    context: buildArticlePromptContext({
      selectedCalendarItem: originalContext.selectedCalendarItem ?? null,
      strategySnapshot: originalContext.strategySnapshot ?? null,
      strategyAssetMarkdown:
        firstString(originalContext.strategyAssetMarkdown) ??
        buildStrategyAssetMarkdown(toStrategySnapshotSafe(originalContext.strategySnapshot)),
      articlePlaybook: normalizeArticlePlaybook(originalContext.articlePlaybook),
      merchantProfile: originalContext.merchantProfile ?? buildMerchantSnapshot(merchant),
      materialContext: originalContext.materialContext ?? null,
      retrievalContext: originalContext.materialRetrieval ?? null,
      contentGoal: firstString(originalContext.contentGoal, originalContext.rewriteGoal) ?? null,
      extraRequirement: firstString(originalContext.extraRequirement) ?? null,
      toneStyle: input.toneStyle ?? firstString(originalContext.toneStyle) ?? null,
    }),
    currentVariant: {
      title: currentVariant.title,
      bodyText: currentVariant.bodyText,
      hashtags: currentVariant.hashtags,
      ctaText: currentVariant.ctaText,
    },
    revisionInstruction: input.revisionInstruction,
    expectedVariantCount: "single",
  });
  const revised = articleGeneration.variants[0];

  if (!revised) {
    throw new ApiError(500, "ARTICLE_REVISION_EMPTY", "图文修订没有返回可用版本。");
  }

  const variant = await appendContentVariantToDraft({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    draftId: currentVariant.draftId,
    platform: "xiaohongshu",
    variantType: "note",
    title: revised.title,
    bodyText: revised.bodyText,
    hashtags: revised.hashtags.length ? revised.hashtags : currentVariant.hashtags,
    ctaText: revised.ctaText || currentVariant.ctaText,
    reviewStatus: "review_pending",
  });
  const trace = {
    promptMode: "revise",
    promptVersion: ARTICLE_PROMPT_VERSION,
    sourceVariantId: currentVariant.contentVariantId,
    newVariantId: variant.id,
    revisionInstruction: input.revisionInstruction,
    llmTrace: articleGeneration.trace,
    riskNotes: articleGeneration.riskNotes,
    createdAt: new Date().toISOString(),
  };

  await appendContentDraftRevisionTrace({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    draftId: currentVariant.draftId,
    trace,
  });

  return {
    variant,
    llmTrace: articleGeneration.trace,
    riskNotes: articleGeneration.riskNotes,
  };
}

export async function runVideoWorkbenchScriptAgentForUser(input: {
  userId: string;
  sessionId?: string | null;
  dailyTaskId?: string | null;
  goal?: string | null;
  userMessage: string;
  messages?: Array<{ role: "user" | "assistant" | "agent"; content: string }>;
  intent?: "chat" | "generate" | "revise" | null;
  contentVariantId?: string | null;
  draftId?: string | null;
  materialId?: string | null;
  materialReferenceId?: string | null;
  source?: GenerationSource | null;
  calendarItemId?: string | null;
  strategyTag?: string | null;
}): Promise<{
  assistantMessage: string;
  draftBundle: ContentDraftBundleDto | null;
  selectedVariant: ContentDraftBundleDto["selectedVariant"] | null;
  toolApplied: boolean;
  toolMode: "create" | "revise" | null;
  changeSummary: string | null;
  trace: Record<string, unknown>;
}> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const resolvedCurrentScript = await resolveVideoWorkbenchCurrentScript({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    contentVariantId: input.contentVariantId,
    draftId: input.draftId,
    requireVariant: input.intent === "revise",
  });
  let currentVariant = resolvedCurrentScript.currentVariant;
  const currentSnapshot = toRecord(currentVariant?.inputSnapshot);
  const resolvedSessionId =
    input.sessionId ??
    firstString(currentSnapshot.consultationSessionId, currentSnapshot.sessionId) ??
    null;
  const resolvedDailyTaskId =
    input.dailyTaskId ?? firstString(currentSnapshot.dailyTaskId) ?? null;
  const dailyTask = resolvedDailyTaskId
    ? await getDailyContentTaskForUser({
        userId: input.userId,
        dailyTaskId: resolvedDailyTaskId,
      })
    : null;
  const materialContext = await resolveMaterialContext({
    merchantId: merchant.id,
    materialId: input.materialId,
    materialReferenceId: input.materialReferenceId,
    targetWorkbench: "video",
  });
  const session = resolvedSessionId
    ? await getConsultationSessionWithMerchantStrategy({
        merchantId: merchant.id,
        sessionId: resolvedSessionId,
      })
    : dailyTask
      ? await buildDailyTaskSession({
          merchantId: merchant.id,
          dailyTask,
        })
      : null;

  if (!session) {
    return {
      assistantMessage:
        "我还没有拿到已确认的咨询策略。请先从咨询台或内容日历进入视频工作台，再让我生成或修改脚本。",
      draftBundle: null,
      selectedVariant: null,
      toolApplied: false,
      toolMode: null,
      changeSummary: null,
      trace: {
        mode: "context_required",
      },
    };
  }

  const generationContext = resolveGenerationContext({
    source: input.source,
    calendarItemId: input.calendarItemId ?? firstString(currentSnapshot.calendarItemId) ?? null,
    strategyTag: input.strategyTag ?? firstString(currentSnapshot.strategyTag) ?? null,
    session,
    material: materialContext.material,
    targetWorkbench: "video",
  });
  const roundtableContext = buildRoundtableSnapshotForInput(session);
  const materialSnapshot = buildMaterialSnapshot(materialContext.material, materialContext.reference);
  const selectedVideoCalendarItem =
    generationContext.selectedCalendarItem?.contentType === "video"
      ? {
          id: generationContext.selectedCalendarItem.id,
          dayLabel: generationContext.selectedCalendarItem.dayLabel,
          contentType: "video" as const,
          strategyTag: generationContext.selectedCalendarItem.strategyTag,
          title: generationContext.selectedCalendarItem.title,
          summary: generationContext.selectedCalendarItem.summary,
        }
      : null;
  const scriptContext = buildVideoScriptContext({
    merchant,
    session,
    strategyAssetMarkdown: resolveStrategyAssetMarkdown(session),
    extraRequirement: input.userMessage ?? null,
    materialContext: materialSnapshot,
    strategyTag: generationContext.strategyTag,
    selectedCalendarItem: selectedVideoCalendarItem,
  });
  const platformSettings = await getPlatformSettings();
  const scriptProductionBriefBase = buildVideoScriptProductionBrief({
    merchant,
    session,
    materialSnapshot,
    goal: firstString(
      input.goal,
      generationContext.selectedCalendarItem?.title,
      generationContext.selectedCalendarItem?.summary,
    ) ?? null,
    extraRequirement: input.userMessage ?? null,
    strategyTag: generationContext.strategyTag,
    strategyAssetMarkdown: resolveStrategyAssetMarkdown(session),
  });
  const scriptEvidenceReferences = await collectScriptProductionEvidence({
    merchantId: merchant.id,
    brief: scriptProductionBriefBase,
    retrievalTopK: platformSettings.scriptProductionAgent.retrievalTopK,
  });
  const scriptProductionBrief = {
    ...scriptProductionBriefBase,
    evidenceReferences: scriptEvidenceReferences,
  };
  const scriptRetrievalContext = {
    target: "script_context",
    evidenceReferences: scriptEvidenceReferences,
    degradationNotices: compactStrings([
      scriptEvidenceReferences.some((reference) => reference.source === "knowledge_base")
        ? ""
        : "没有命中文本知识库，视频脚本将基于咨询策略和基础项目资料降级生成。",
      scriptEvidenceReferences.some((reference) => reference.source === "material")
        ? ""
        : "没有命中爆款内容参考，脚本将使用内置结构模板组织 hook 和节奏。",
    ]),
  };
  const briefValidation = validateScriptProductionBrief(scriptProductionBrief);
  const forceToolMode =
    input.intent === "generate"
      ? currentVariant?.scriptText?.trim()
        ? "revise"
        : "create"
      : input.intent === "revise"
        ? "revise"
        : null;

  if (forceToolMode && !briefValidation.ready) {
    return {
      assistantMessage: [
        "当前咨询策略还不足以生成正式视频脚本，我需要先补齐这些信息：",
        ...briefValidation.questions.map((question) => `· ${question}`),
      ].join("\n"),
      draftBundle: null,
      selectedVariant: currentVariant
        ? {
            id: currentVariant.contentVariantId,
            draftId: currentVariant.draftId,
            platform: "douyin",
            variantType: "video_script",
            versionNo: 1,
            title: currentVariant.title,
            scriptText: currentVariant.scriptText,
            hashtags: currentVariant.hashtags ?? [],
            ctaText: currentVariant.ctaText,
            productionScenes: [],
            reviewStatus: currentVariant.reviewStatus,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : null,
      toolApplied: false,
      toolMode: null,
      changeSummary: null,
      trace: {
        mode: "brief_incomplete",
        missingFields: briefValidation.missingFields,
      },
    };
  }

  const result = await runVideoWorkbenchAgentRuntime({
    llmRuntime: platformSettings.llmRuntime,
    agentSettings: platformSettings.scriptProductionAgent,
    conversationMessages: normalizeWorkbenchAgentMessages(input.messages ?? []),
    userMessage: input.userMessage,
    forceToolMode,
    contextPack: {
      entryContext: {
        source: generationContext.source,
        sessionId: resolvedSessionId ? session.id : null,
        syntheticSessionId: resolvedSessionId ? null : session.id,
        dailyTaskId: dailyTask?.id ?? null,
        calendarItemId: generationContext.calendarItemId,
        syntheticSession: !resolvedSessionId,
        teamTheme: dailyTask?.theme ?? null,
        selectedCalendarItem: generationContext.selectedCalendarItem,
        strategyTag: generationContext.strategyTag,
      },
      confirmedStrategy: {
        positioning: session.strategySnapshot.positioning,
        targetAudiences: session.strategySnapshot.targetAudiences,
        coreSellingPoints: session.strategySnapshot.coreSellingPoints,
        keyScenes: session.strategySnapshot.keyScenes,
        currentSuggestion: session.strategySnapshot.currentSuggestion,
        videoBrief: session.strategySnapshot.videoBrief ?? null,
        strategyAssetMarkdown: resolveStrategyAssetMarkdown(session),
        merchantProfile: buildMerchantSnapshot(merchant),
        forbiddenExpressions: merchant.forbiddenWords,
      },
      workspaceState: {
        draftId: currentVariant?.draftId ?? resolvedCurrentScript.draftBundle?.draft.id ?? input.draftId ?? null,
        currentVariantId: currentVariant?.contentVariantId ?? null,
        status: currentVariant?.scriptText?.trim()
          ? currentVariant.reviewStatus === "approved"
            ? "confirmed"
            : "draft"
          : "empty",
        title: currentVariant?.title ?? null,
        scriptText: currentVariant?.scriptText ?? null,
        ctaText: currentVariant?.ctaText ?? null,
      },
      materialContext: materialSnapshot,
      retrievalContext: scriptRetrievalContext,
      briefValidation,
    },
    setVideoScript: async (toolInput) => {
      const scenes = setVideoScriptScenesToVideoScenes(toolInput);
      const storedScriptText = formatSetVideoScriptForStorage(toolInput);

      if (toolInput.mode === "revise") {
        if (!currentVariant) {
          throw new ApiError(
            409,
            "VIDEO_SCRIPT_REVISION_TARGET_REQUIRED",
            "右侧还没有可修改的脚本，请先生成初版脚本。",
          );
        }

        const revisionResult = await updateVideoScriptVariantWithDraftFallback({
          merchantId: merchant.id,
          createdByUserId: input.userId,
          draftId: currentVariant.draftId,
          currentVariant,
          title: toolInput.title,
          scriptText: storedScriptText,
          hashtags: buildHashtags(session),
          ctaText: toolInput.ctaText,
        });
        const variant = revisionResult.variant;
        currentVariant = revisionResult.currentVariant;

        await appendContentDraftRevisionTrace({
          merchantId: merchant.id,
          createdByUserId: input.userId,
          draftId: currentVariant.draftId,
          trace: {
            promptMode: "video_workbench_agent",
            sourceVariantId: revisionResult.sourceVariantId,
            updatedVariantId: variant.id,
            fallbackApplied: revisionResult.fallbackApplied,
            changeSummary: toolInput.changeSummary,
            userMessage: input.userMessage,
            createdAt: new Date().toISOString(),
          },
        });

        const bundle = await getDraftBundleByMerchant({
          merchantId: merchant.id,
          createdByUserId: input.userId,
          draftId: currentVariant.draftId,
        });

        return {
          draftBundle: attachProductionScenesToVariant(bundle, variant.id, scenes),
        };
      }

      const workingTitle =
        toolInput.title ||
        materialContext.material?.title ||
        generationContext.selectedCalendarItem?.title ||
        session.strategySnapshot.videoBrief?.workingTitle ||
        `${merchant.name} 的视频脚本`;
      const sourceItem = await createManualSourceItem({
        merchantId: merchant.id,
        platform: "douyin",
        title: workingTitle,
        scriptText: buildSourceText({
          extraRequirement: input.userMessage,
          material: materialContext.material,
          fallback: session.summaryText ?? workingTitle,
        }),
        tracePayload: {
          consultation_session_id: resolvedSessionId ? session.id : null,
          synthetic_session_id: resolvedSessionId ? null : session.id,
          daily_task_id: dailyTask?.id ?? null,
          generated_kind: "video_script",
          generation_source: generationContext.source,
          calendar_item_id: generationContext.calendarItemId,
          selected_calendar_item: generationContext.selectedCalendarItem,
          strategy_tag: generationContext.strategyTag,
          material_item_id: materialContext.material?.id ?? null,
          material_reference_id: materialContext.reference?.id ?? input.materialReferenceId ?? null,
          script_agent_mode: "video_workbench_agent",
        },
      });
      const draftBundle = await createDraftWithVariants({
        merchantId: merchant.id,
        createdByUserId: input.userId,
        sourceItemId: sourceItem.id,
        workingTitle,
        rewriteGoal: input.goal ?? session.strategySnapshot.videoBrief?.hook ?? null,
        inputSnapshot: {
          source: generationContext.source,
          dailyTaskId: dailyTask?.id ?? null,
          teamTheme: dailyTask?.theme ?? null,
          teamCalendarSource: dailyTask?.teamCalendarSource ?? null,
          consultationSessionId: resolvedSessionId ? session.id : null,
          syntheticSessionId: resolvedSessionId ? null : session.id,
          calendarItemId: generationContext.calendarItemId,
          selectedCalendarItem: generationContext.selectedCalendarItem,
          strategySnapshot: session.strategySnapshot,
          strategyAssetMarkdown: resolveStrategyAssetMarkdown(session),
          roundtableContext,
          merchantProfile: buildMerchantSnapshot(merchant),
          matchedProjectMaterials: dailyTask?.materialRefs ?? [],
          knowledgeRefs: dailyTask?.knowledgeRefs ?? [],
          strategyTag: generationContext.strategyTag,
          extraRequirement: input.userMessage ?? null,
          materialContext: materialSnapshot,
          scriptContext,
          scriptProductionBrief,
          materialRetrieval: scriptRetrievalContext,
          videoWorkbenchAgent: {
            mode: "set_video_script",
            changeSummary: toolInput.changeSummary,
          },
        },
        commentInsights: {
          audiences: session.strategySnapshot.targetAudiences,
          scenes: session.strategySnapshot.keyScenes,
          referenceMaterialTitle: materialContext.material?.title ?? null,
          referenceMaterialEngagement: materialContext.material?.engagementLabel ?? null,
          scriptChangeSummary: toolInput.changeSummary,
          scriptAgentMode: "video_workbench_agent",
        },
        variants: [
          {
            platform: "douyin",
            variantType: "video_script",
            title: toolInput.title,
            scriptText: storedScriptText,
            productionScenes: scenes,
            hashtags: buildHashtags(session),
            ctaText: toolInput.ctaText,
            reviewStatus: "review_pending",
          },
        ],
      });
      const draftBundleWithScenes = attachProductionScenesToVariant(
        draftBundle,
        draftBundle.selectedVariant?.id ?? draftBundle.variants[0]?.id ?? null,
        scenes,
      );

      await consumeMaterialReferenceIfNeeded({
        merchantId: merchant.id,
        materialId: materialContext.material?.id ?? input.materialId ?? null,
        materialReferenceId: input.materialReferenceId,
        targetWorkbench: "video",
        draftId: draftBundle.draft.id,
      });

      return {
        draftBundle: draftBundleWithScenes,
      };
    },
  });

  return {
    assistantMessage: result.assistantMessage,
    draftBundle: result.draftBundle,
    selectedVariant: result.draftBundle?.selectedVariant ?? null,
    toolApplied: result.toolApplied,
    toolMode: result.toolMode,
    changeSummary: result.changeSummary,
    trace: result.trace,
  };
}

async function resolveVideoWorkbenchCurrentScript(input: {
  merchantId: string;
  createdByUserId?: string | null;
  contentVariantId?: string | null;
  draftId?: string | null;
  requireVariant?: boolean;
}): Promise<{
  currentVariant: ContentVariantAccessContext | null;
  draftBundle: ContentDraftBundleDto | null;
}> {
  let draftBundle: ContentDraftBundleDto | null | undefined;
  const loadDraftBundle = async () => {
    if (draftBundle !== undefined) {
      return draftBundle;
    }

    if (!input.draftId) {
      draftBundle = null;
      return draftBundle;
    }

    try {
      draftBundle = await getDraftBundleByMerchant({
        merchantId: input.merchantId,
        createdByUserId: input.createdByUserId,
        draftId: input.draftId,
      });
    } catch (error) {
      if (input.requireVariant || !isNotFoundApiError(error)) {
        throw error;
      }

      draftBundle = null;
    }

    return draftBundle;
  };

  if (input.contentVariantId) {
    try {
      const currentVariant = await assertContentVariantAccess({
        merchantId: input.merchantId,
        createdByUserId: input.createdByUserId,
        contentVariantId: input.contentVariantId,
        variantType: "video_script",
      });

      if (input.draftId && currentVariant.draftId !== input.draftId) {
        const bundle = await loadDraftBundle();
        const fallbackVariant = bundle ? getSelectedVideoScriptVariantContext(bundle) : null;

        if (fallbackVariant) {
          return {
            currentVariant: fallbackVariant,
            draftBundle: bundle,
          };
        }

        if (input.requireVariant) {
          throw new ApiError(
            409,
            "VIDEO_SCRIPT_REVISION_TARGET_REQUIRED",
            "当前脚本版本已刷新或失效，请刷新页面后重试，或点击重新生成脚本。",
          );
        }

        return {
          currentVariant: null,
          draftBundle: bundle,
        };
      }

      return {
        currentVariant,
        draftBundle: draftBundle ?? null,
      };
    } catch (error) {
      if (input.requireVariant && !input.draftId) {
        throw error;
      }

      if (!isNotFoundApiError(error)) {
        throw error;
      }
    }
  }

  const bundle = await loadDraftBundle();
  const fallbackVariant = bundle ? getSelectedVideoScriptVariantContext(bundle) : null;

  if (!fallbackVariant && input.requireVariant) {
    throw new ApiError(
      409,
      "VIDEO_SCRIPT_REVISION_TARGET_REQUIRED",
      "当前脚本版本已刷新或失效，请刷新页面后重试，或点击重新生成脚本。",
    );
  }

  return {
    currentVariant: fallbackVariant,
    draftBundle: bundle,
  };
}

async function updateVideoScriptVariantWithDraftFallback(input: {
  merchantId: string;
  createdByUserId?: string | null;
  draftId: string;
  currentVariant: ContentVariantAccessContext;
  title?: string | null;
  scriptText: string;
  hashtags: string[];
  ctaText?: string | null;
}): Promise<{
  variant: ContentVariantDto;
  currentVariant: ContentVariantAccessContext;
  sourceVariantId: string;
  fallbackApplied: boolean;
}> {
  const update = (variant: ContentVariantAccessContext) =>
    updateContentVariantScript({
      merchantId: input.merchantId,
      createdByUserId: input.createdByUserId,
      contentVariantId: variant.contentVariantId,
      title: input.title,
      scriptText: input.scriptText,
      hashtags: input.hashtags,
      ctaText: input.ctaText,
      reviewStatus: "review_pending",
    });

  try {
    return {
      variant: await update(input.currentVariant),
      currentVariant: input.currentVariant,
      sourceVariantId: input.currentVariant.contentVariantId,
      fallbackApplied: false,
    };
  } catch (error) {
    if (!isNotFoundApiError(error)) {
      throw error;
    }
  }

  const latestBundle = await getDraftBundleByMerchant({
    merchantId: input.merchantId,
    createdByUserId: input.createdByUserId,
    draftId: input.draftId,
  });
  const latestVariant = getSelectedVideoScriptVariantContext(latestBundle);

  if (latestVariant) {
    return {
      variant: await update(latestVariant),
      currentVariant: latestVariant,
      sourceVariantId: input.currentVariant.contentVariantId,
      fallbackApplied: true,
    };
  }

  const createdVariant = await appendContentVariantToDraft({
    merchantId: input.merchantId,
    createdByUserId: input.createdByUserId,
    draftId: input.draftId,
    platform: "douyin",
    variantType: "video_script",
    title: input.title,
    scriptText: input.scriptText,
    hashtags: input.hashtags,
    ctaText: input.ctaText,
    reviewStatus: "review_pending",
  });

  return {
    variant: createdVariant,
    currentVariant: toContentVariantAccessContext({
      merchantId: input.merchantId,
      createdByUserId: input.createdByUserId ?? latestBundle.draft.createdByUserId ?? null,
      inputSnapshot: latestBundle.draft.inputSnapshot ?? null,
      variant: createdVariant,
    }),
    sourceVariantId: input.currentVariant.contentVariantId,
    fallbackApplied: true,
  };
}

function getSelectedVideoScriptVariantContext(
  draftBundle: ContentDraftBundleDto,
): ContentVariantAccessContext | null {
  const selectedVariant =
    (draftBundle.selectedVariant?.variantType === "video_script"
      ? draftBundle.selectedVariant
      : null) ??
    draftBundle.variants.find(
      (variant) =>
        variant.variantType === "video_script" &&
        variant.id === draftBundle.draft.selectedVariantId,
    ) ??
    draftBundle.variants.find((variant) => variant.variantType === "video_script") ??
    null;

  if (!selectedVariant) {
    return null;
  }

  return toContentVariantAccessContext({
    merchantId: draftBundle.draft.merchantId,
    createdByUserId: draftBundle.draft.createdByUserId ?? null,
    inputSnapshot: draftBundle.draft.inputSnapshot ?? null,
    variant: selectedVariant,
  });
}

function toContentVariantAccessContext(input: {
  merchantId: string;
  createdByUserId?: string | null;
  inputSnapshot: Record<string, unknown> | null;
  variant: ContentVariantDto;
}): ContentVariantAccessContext {
  return {
    merchantId: input.merchantId,
    createdByUserId: input.createdByUserId ?? null,
    draftId: input.variant.draftId,
    contentVariantId: input.variant.id,
    variantType: input.variant.variantType,
    title: input.variant.title,
    bodyText: input.variant.bodyText,
    scriptText: input.variant.scriptText,
    hashtags: input.variant.hashtags,
    ctaText: input.variant.ctaText,
    reviewStatus: input.variant.reviewStatus,
    inputSnapshot: input.inputSnapshot,
  };
}

function isNotFoundApiError(error: unknown) {
  return error instanceof ApiError && error.status === 404;
}

export async function generateVideoScriptForUser(input: {
  userId: string;
  sessionId?: string | null;
  dailyTaskId?: string | null;
  goal?: string | null;
  extraRequirement?: string | null;
  materialId?: string | null;
  materialReferenceId?: string | null;
  source?: GenerationSource | null;
  calendarItemId?: string | null;
  strategyTag?: string | null;
}): Promise<ContentDraftBundleDto> {
  const result = await runVideoWorkbenchScriptAgentForUser({
    userId: input.userId,
    sessionId: input.sessionId,
    dailyTaskId: input.dailyTaskId,
    goal: input.goal,
    userMessage: input.extraRequirement
      ? `请根据这些补充要求生成一版视频脚本：${input.extraRequirement}`
      : "请根据当前上下文生成一版视频脚本。",
    intent: "generate",
    materialId: input.materialId,
    materialReferenceId: input.materialReferenceId,
    source: input.source,
    calendarItemId: input.calendarItemId,
    strategyTag: input.strategyTag,
  });

  if (!result.draftBundle) {
    throw new ApiError(
      409,
      "VIDEO_SCRIPT_NOT_CREATED",
      result.assistantMessage || "脚本 Agent 还没有生成可用脚本。",
    );
  }

  return result.draftBundle;
}

export async function reviseVideoScriptForUser(input: {
  userId: string;
  contentVariantId: string;
  sessionId: string;
  revisionInstruction: string;
  materialId?: string | null;
  materialReferenceId?: string | null;
  strategyTag?: string | null;
}): Promise<
  | {
      revisionIntent: "semantic";
      variant: NonNullable<ContentDraftBundleDto["selectedVariant"]>;
      agentTrace: Record<string, unknown>;
    }
  | {
      revisionIntent: "production";
      contentVariantId: string;
      instructionText: string;
    }
> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const currentVariant = await assertVideoScriptVariantAccess({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    contentVariantId: input.contentVariantId,
  });
  const revisionIntent = classifyVideoScriptRevisionIntent(input.revisionInstruction);

  if (revisionIntent === "production") {
    return {
      revisionIntent,
      contentVariantId: input.contentVariantId,
      instructionText: input.revisionInstruction,
    };
  }

  if (!currentVariant.scriptText?.trim()) {
    throw new ApiError(
      409,
      "VIDEO_SCRIPT_TEXT_REQUIRED",
      "视频脚本缺少正文，无法修订。",
    );
  }

  const platformSettings = await getPlatformSettings();

  if (!platformSettings.scriptProductionAgent.revisionEnabled) {
    throw new ApiError(
      409,
      "SCRIPT_PRODUCTION_REVISION_DISABLED",
      "脚本制作 Agent 修订入口未启用。",
    );
  }

  const result = await runVideoWorkbenchScriptAgentForUser({
    userId: input.userId,
    sessionId: input.sessionId,
    userMessage: input.revisionInstruction,
    intent: "revise",
    contentVariantId: input.contentVariantId,
    materialId: input.materialId,
    materialReferenceId: input.materialReferenceId,
    strategyTag: input.strategyTag,
  });

  if (!result.selectedVariant) {
    throw new ApiError(
      409,
      "VIDEO_SCRIPT_NOT_REVISED",
      result.assistantMessage || "脚本 Agent 还没有完成脚本修改。",
    );
  }

  return {
    revisionIntent,
    variant: result.selectedVariant,
    agentTrace: result.trace,
  };
}

function attachProductionScenesToVariant(
  draftBundle: ContentDraftBundleDto,
  variantId: string | null | undefined,
  scenes: VideoScriptScene[],
): ContentDraftBundleDto {
  if (!variantId) {
    return draftBundle;
  }

  const variants = draftBundle.variants.map((variant) =>
    variant.id === variantId
      ? {
          ...variant,
          productionScenes: scenes,
        }
      : variant,
  );

  return {
    ...draftBundle,
    variants,
    selectedVariant:
      variants.find((variant) => variant.id === variantId) ??
      draftBundle.selectedVariant ??
      variants[0] ??
      null,
  };
}

function normalizeWorkbenchAgentMessages(
  messages: Array<{ role: "user" | "assistant" | "agent"; content: string }>,
): VideoWorkbenchAgentConversationMessage[] {
  return messages
    .map((message) => ({
      role: message.role === "user" ? ("user" as const) : ("assistant" as const),
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0);
}

function buildVideoScriptProductionBrief(input: {
  merchant: Awaited<ReturnType<typeof getOperationalMerchantProfileByOwnerUserId>>;
  session: Awaited<ReturnType<typeof getConsultationSessionDetail>>;
  materialSnapshot: ReturnType<typeof buildMaterialSnapshot>;
  goal?: string | null;
  extraRequirement?: string | null;
  strategyTag?: string | null;
  strategyAssetMarkdown?: string | null;
}): ScriptProductionBrief {
  const snapshot = input.session.strategySnapshot;
  const material = input.materialSnapshot;
  const topicDirection =
    firstString(
      input.goal,
      snapshot.videoBrief?.workingTitle,
      snapshot.videoBrief?.hook,
      snapshot.currentSuggestion,
    ) ?? "";

  return {
    platform: "douyin",
    contentForm: "video",
    topicDirection,
    targetAudiences: snapshot.targetAudiences,
    accountPositioning: snapshot.positioning,
    businessScope: input.merchant.industry ?? null,
    contentScope: snapshot.videoBrief?.outcome ?? snapshot.currentSuggestion,
    productOrServiceInfo: compactStrings([
      ...input.merchant.serviceItems,
      ...snapshot.coreSellingPoints,
    ]),
    customerAdvantages: snapshot.coreSellingPoints,
    ctaOptions: compactStrings([
      ...input.merchant.defaultCta,
      snapshot.articleBrief?.callToAction ?? "",
    ]),
    forbiddenExpressions: input.merchant.forbiddenWords,
    brandTone: input.merchant.toneStyle ?? null,
    strategyAssetMarkdown: input.strategyAssetMarkdown ?? null,
    availableMaterials: material && material.retrievalTargets.includes("script_context")
      ? [
          {
            title: material.title ?? "",
            description: material.description ?? null,
            platform: material.platform ?? null,
            materialType: material.materialType ?? null,
            sourceKind: material.sourceKind ?? null,
            engagementLabel: material.engagementLabel ?? null,
          },
        ]
      : [],
    availableScenes: snapshot.keyScenes,
    customerRequirement: input.extraRequirement ?? null,
    consultationConclusion: {
      summaryText: input.session.summaryText ?? null,
      currentSuggestion: snapshot.currentSuggestion,
      videoHook: snapshot.videoBrief?.hook ?? null,
      videoOutcome: snapshot.videoBrief?.outcome ?? null,
      contentCalendarTag: input.strategyTag ?? snapshot.strategyTags[0] ?? null,
    },
  };
}

async function collectArticleMaterialRetrieval(input: {
  merchantId: string;
  selectedMaterial?: MaterialLibraryItemDto | null;
  session: ConsultationSessionDetailDto;
  selectedCalendarItem?: SelectedCalendarItemSnapshot | null;
  contentGoal?: string | null;
  extraRequirement?: string | null;
}): Promise<ArticleMaterialRetrievalContext> {
  const platformSettings = await getPlatformSettings();
  const copyQuery = compactStrings([
    input.selectedCalendarItem?.title ?? "",
    input.selectedCalendarItem?.summary ?? "",
    input.contentGoal ?? "",
    input.extraRequirement ?? "",
    input.session.strategySnapshot.currentSuggestion,
    ...input.session.strategySnapshot.coreSellingPoints,
    ...input.session.strategySnapshot.targetAudiences,
    ...input.session.strategySnapshot.strategyTags,
  ]).join(" ");
  const imageQuery = compactStrings([
    input.selectedCalendarItem?.title ?? "",
    input.selectedCalendarItem?.summary ?? "",
    input.contentGoal ?? "",
    input.extraRequirement ?? "",
    ...input.session.strategySnapshot.keyScenes,
    ...input.session.strategySnapshot.coreSellingPoints,
    ...input.session.strategySnapshot.strategyTags,
  ]).join(" ");
  const [knowledgeMatches, copyContextMaterials, imageMaterials] = await Promise.all([
    searchKnowledgeChunks({
      merchantId: input.merchantId,
      query: copyQuery,
      limit: Math.min(platformSettings.knowledgeRuntime.retrievalTopK, 6),
    }),
    listMaterialLibraryItems({
      merchantId: input.merchantId,
      retrievalTarget: "copy_context",
      query: copyQuery,
      limit: 6,
    }).catch(() => []),
    listMaterialLibraryItems({
      merchantId: input.merchantId,
      retrievalTarget: "article_image_asset",
      query: imageQuery,
      limit: 6,
    }).catch(() => []),
  ]);
  const materialRefs = copyContextMaterials.map(materialToRetrievalReference);
  const selectedMaterialRef =
    input.selectedMaterial &&
    materialMatchesRetrievalTarget(input.selectedMaterial, "copy_context")
      ? materialToRetrievalReference(input.selectedMaterial)
      : null;
  const copyContextRefs = dedupeRetrievalReferences([
    ...(selectedMaterialRef ? [selectedMaterialRef] : []),
    ...materialRefs,
    ...knowledgeMatches.map((match): RetrievalReference => ({
      id: match.chunkId,
      title: match.documentTitle,
      summary: match.content.slice(0, 280),
      source: "knowledge_base",
      usageType: "text_knowledge",
      score: match.score,
    })),
  ]).slice(0, 8);
  const imageAssetRefs = imageMaterials.map((material) => ({
    ...buildMaterialRoutingTrace(material),
    platform: material.platform,
    fileName: firstString(
      toRecord(toRecord(material.analysisPayload.tracePayload).materialAnalysis).fileName,
      material.title,
    ),
    description: material.description ?? null,
    retrievalTrace: readMaterialRetrievalTrace(material),
  }));
  const degradationNotices = compactStrings([
    copyContextRefs.length
      ? ""
      : "没有命中文本知识库或爆款内容，本次将基于日历任务和基础项目资料降级生成。",
    imageAssetRefs.length
      ? ""
      : "没有命中项目图片素材，本次只输出配图 brief/prompt，可后续上传项目图片提升匹配准确度。",
  ]);

  return {
    target: "copy_context",
    retrievalQueries: {
      copyContext: copyQuery,
      articleImageAsset: imageQuery,
    },
    copyContextRefs,
    imageAssetRefs,
    imageBrief: imageAssetRefs.length
      ? null
      : buildArticleImageBrief({
          selectedCalendarItem: input.selectedCalendarItem,
          contentGoal: input.contentGoal,
          strategySnapshot: input.session.strategySnapshot,
        }),
    degradationNotices,
  };
}

async function collectScriptProductionEvidence(input: {
  merchantId: string;
  brief: ScriptProductionBrief;
  retrievalTopK: number;
}): Promise<NonNullable<ScriptProductionBrief["evidenceReferences"]>> {
  const references: NonNullable<ScriptProductionBrief["evidenceReferences"]> = [];
  const query = compactStrings([
    input.brief.topicDirection,
    ...input.brief.targetAudiences,
    ...input.brief.productOrServiceInfo,
    ...input.brief.customerAdvantages,
    ...input.brief.ctaOptions,
    ...input.brief.availableScenes,
  ]).join(" ");
  const scriptReferenceMaterials = await listMaterialLibraryItems({
    merchantId: input.merchantId,
    retrievalTarget: "script_context",
    query,
    limit: Math.max(3, input.retrievalTopK),
  }).catch(() => []);

  for (const material of input.brief.availableMaterials) {
    if (!material.title && !material.description) {
      continue;
    }

    references.push({
      title: material.title || "参考素材",
      content: material.description ?? material.title,
      source: "material",
      score: null,
    });
  }

  for (const material of scriptReferenceMaterials) {
    const retrievalTrace = readMaterialRetrievalTrace(material);

    references.push({
      title: material.title,
      content: summarizeMaterialReference(material),
      source: "material",
      score: retrievalTrace?.score ?? null,
    });
  }

  if (input.brief.consultationConclusion.summaryText) {
    references.push({
      title: "咨询台摘要",
      content: input.brief.consultationConclusion.summaryText,
      source: "consultation",
      score: null,
    });
  }

  if (input.retrievalTopK > 0) {
    const matches = await searchKnowledgeChunks({
      merchantId: input.merchantId,
      query,
      limit: input.retrievalTopK,
    });

    for (const match of matches) {
      references.push({
        title: match.documentTitle,
        content: match.content.slice(0, 800),
        source: "knowledge_base",
        score: match.score,
      });
    }
  }

  return references.slice(0, Math.max(3, input.retrievalTopK + 3));
}

function materialToRetrievalReference(material: MaterialLibraryItemDto): RetrievalReference {
  const retrievalTrace = readMaterialRetrievalTrace(material);

  return {
    id: material.id,
    title: material.title,
    summary: summarizeMaterialReference(material),
    source: "material_library",
    usageType: material.usageType,
    score: retrievalTrace?.score ?? null,
    matchReasons: retrievalTrace?.matchReasons.map((reason) => reason.label),
  };
}

function summarizeMaterialReference(material: MaterialLibraryItemDto) {
  return compactStrings([
    material.description ?? "",
    material.engagementLabel ? `互动/状态：${material.engagementLabel}` : "",
    `用途：${material.usageType}`,
  ]).join("\n");
}

function dedupeRetrievalReferences(references: RetrievalReference[]) {
  const seen = new Set<string>();
  const result: RetrievalReference[] = [];

  for (const reference of references) {
    const key = `${reference.source}:${reference.id}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(reference);
  }

  return result;
}

function buildArticleImageBrief(input: {
  selectedCalendarItem?: SelectedCalendarItemSnapshot | null;
  contentGoal?: string | null;
  strategySnapshot: StrategySnapshotDto;
}) {
  const topic =
    firstString(
      input.selectedCalendarItem?.title,
      input.contentGoal,
      input.strategySnapshot.articleBrief?.workingTitle,
      input.strategySnapshot.currentSuggestion,
    ) ?? "项目图文内容";
  const scene =
    firstString(
      input.selectedCalendarItem?.summary,
      input.strategySnapshot.articleBrief?.angle,
      input.strategySnapshot.keyScenes[0],
    ) ?? "围绕真实项目场景表达";

  return {
    prompt: `生成一组小红书图文配图 brief：主题「${topic}」，画面围绕「${scene}」，优先包含封面、项目实景、空间/配套细节和结尾 CTA 页。`,
    reason: "当前没有可用图片素材，按 V2.4 降级为生图 brief/prompt。",
  };
}

export async function listContentRecordsForUser(input: {
  userId: string;
  limit?: number;
}) {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  return listDraftBundlesByMerchant({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    limit: input.limit,
  });
}

export async function getContentRecordForUser(input: {
  userId: string;
  draftId: string;
}) {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  return getDraftBundleByMerchant({
    merchantId: merchant.id,
    createdByUserId: input.userId,
    draftId: input.draftId,
  });
}

async function generateArticleVariantsWithLlm(input: {
  mode: ArticlePromptMode;
  context: ArticlePromptContext;
  currentVariant?: {
    title?: string | null;
    bodyText?: string | null;
    hashtags?: string[];
    ctaText?: string | null;
  };
  revisionInstruction?: string | null;
  expectedVariantCount: "single" | "multiple";
}): Promise<{
  variants: ArticleGeneratedVariant[];
  riskNotes: string[];
  trace: {
    promptVersion: typeof ARTICLE_PROMPT_VERSION;
    mode: ArticlePromptTraceMode;
    model?: string;
    error?: string;
  };
}> {
  if (!getAiRuntimeApiKey()) {
    throw new ApiError(
      503,
      "ARTICLE_GENERATION_MODEL_UNAVAILABLE",
      "AI 图文生成服务暂时不可用，当前环境没有配置可用模型密钥。",
    );
  }

  const platformSettings = await getPlatformSettings();

  try {
    const response = await createChatCompletion({
      runtime: platformSettings.llmRuntime,
      messages: buildArticleGenerationMessages({
        mode: input.mode,
        context: input.context,
        currentVariant: input.currentVariant,
        revisionInstruction: input.revisionInstruction,
      }),
    });
    const parsed = parseArticleGenerationResponse({
      content: response.content,
      expectedVariantCount: input.expectedVariantCount,
    });

    return {
      variants: parsed.variants,
      riskNotes: parsed.riskNotes,
      trace: {
        promptVersion: ARTICLE_PROMPT_VERSION,
        mode: "llm",
        model: response.model,
      },
    };
  } catch (error) {
    const errorMessage =
      error instanceof AiRuntimeError
        ? `${error.message}${error.status ? ` (${error.status})` : ""}`
        : error instanceof Error
          ? error.message
          : "Unknown article generation error.";

    console.error("[article-generation] llm error", {
      mode: error instanceof ArticlePromptParseError ? "parse_error" : "runtime_error",
      provider: platformSettings.llmRuntime.providerLabel,
      baseUrl: platformSettings.llmRuntime.baseUrl,
      model: platformSettings.llmRuntime.primaryModel,
      error: errorMessage,
    });

    throw new ApiError(
      error instanceof ArticlePromptParseError ? 502 : 503,
      error instanceof ArticlePromptParseError
        ? "ARTICLE_GENERATION_MODEL_OUTPUT_INVALID"
        : "ARTICLE_GENERATION_MODEL_FAILED",
      error instanceof ArticlePromptParseError
        ? `AI 图文生成返回内容无法解析：${errorMessage}`
        : `AI 图文生成失败：${errorMessage}`,
    );
  }
}

function buildArticlePromptContext(input: {
  selectedCalendarItem: unknown;
  strategySnapshot: unknown;
  strategyAssetMarkdown: string | null;
  articlePlaybook: ArticlePlaybook;
  merchantProfile: unknown;
  materialContext: unknown;
  retrievalContext: unknown;
  contentGoal: string | null;
  extraRequirement: string | null;
  toneStyle: string | null;
}): ArticlePromptContext {
  return {
    selectedCalendarItem: input.selectedCalendarItem,
    strategySnapshot: input.strategySnapshot,
    strategyAssetMarkdown: input.strategyAssetMarkdown,
    articlePlaybook: input.articlePlaybook,
    merchantProfile: input.merchantProfile,
    materialContext: input.materialContext,
    retrievalContext: input.retrievalContext,
    contentGoal: input.contentGoal,
    extraRequirement: input.extraRequirement,
    toneStyle: input.toneStyle,
    platform: "xiaohongshu",
  };
}

function buildHashtags(session: Awaited<ReturnType<typeof getConsultationSessionDetail>>) {
  return session.strategySnapshot.strategyTags.map((tag) => `#${tag}`);
}

async function resolveMaterialContext(input: {
  merchantId: string;
  materialId?: string | null;
  materialReferenceId?: string | null;
  targetWorkbench: MaterialWorkbenchTarget;
}): Promise<{
  material: MaterialLibraryItemDto | null;
  reference: MaterialWorkbenchReferenceDto | null;
}> {
  const reference = input.materialReferenceId
    ? await getMaterialWorkbenchReference({
        merchantId: input.merchantId,
        referenceId: input.materialReferenceId,
        targetWorkbench: input.targetWorkbench,
      })
    : null;
  const materialId = input.materialId ?? reference?.materialItemId ?? null;
  const material = materialId
    ? await getMaterialLibraryItemById({
        merchantId: input.merchantId,
        materialItemId: materialId,
      })
    : null;

  return {
    material,
    reference,
  };
}

async function consumeMaterialReferenceIfNeeded(input: {
  merchantId: string;
  materialId?: string | null;
  materialReferenceId?: string | null;
  targetWorkbench: MaterialWorkbenchTarget;
  draftId: string;
}) {
  if (!input.materialReferenceId) {
    return;
  }

  await consumeMaterialWorkbenchReference({
    merchantId: input.merchantId,
    referenceId: input.materialReferenceId,
    targetWorkbench: input.targetWorkbench,
    draftId: input.draftId,
    materialItemId: input.materialId,
  });
}

function resolveGenerationContext(input: {
  source?: GenerationSource | null;
  calendarItemId?: string | null;
  strategyTag?: string | null;
  session: Awaited<ReturnType<typeof getConsultationSessionDetail>>;
  material?: MaterialLibraryItemDto | null;
  targetWorkbench: WorkbenchKind;
}) {
  const source =
    input.source ??
    (input.calendarItemId
      ? "consultation_calendar"
      : input.material
        ? "material_center"
        : "manual");

  if (source === "daily_task") {
    const selectedCalendarItem =
      input.session.strategySnapshot.contentCalendarDraft.find(
        (item) => item.contentType === input.targetWorkbench,
      ) ?? null;

    return {
      source,
      calendarItemId: selectedCalendarItem?.id ?? null,
      selectedCalendarItem: selectedCalendarItem
        ? buildSelectedCalendarItemSnapshot(selectedCalendarItem)
        : null,
      strategyTag: input.strategyTag ?? selectedCalendarItem?.strategyTag ?? null,
    };
  }

  if (source !== "consultation_calendar") {
    return {
      source,
      calendarItemId: null,
      selectedCalendarItem: null,
      strategyTag: input.strategyTag ?? null,
    };
  }

  const calendarItemId = input.calendarItemId?.trim();
  if (!calendarItemId) {
    throw new ApiError(
      400,
      "CONTENT_CALENDAR_ITEM_REQUIRED",
      "从内容日历进入工作台时，必须携带 calendarItemId。",
    );
  }

  const selectedCalendarItem =
    input.session.strategySnapshot.contentCalendarDraft.find(
      (item) => item.id === calendarItemId,
    ) ?? null;
  if (!selectedCalendarItem) {
    throw new ApiError(
      409,
      "CONTENT_CALENDAR_ITEM_NOT_FOUND",
      "没有在当前咨询会话中找到对应的内容日历卡片。",
      { calendarItemId },
    );
  }

  if (selectedCalendarItem.contentType !== input.targetWorkbench) {
    throw new ApiError(
      409,
      "CONTENT_CALENDAR_WORKBENCH_MISMATCH",
      "内容日历卡片类型和当前工作台不一致。",
      {
        calendarItemId,
        calendarContentType: selectedCalendarItem.contentType,
        targetWorkbench: input.targetWorkbench,
      },
    );
  }

  return {
    source,
    calendarItemId,
    selectedCalendarItem: buildSelectedCalendarItemSnapshot(selectedCalendarItem),
    strategyTag: input.strategyTag ?? selectedCalendarItem.strategyTag ?? null,
  };
}

function buildSelectedCalendarItemSnapshot(
  item: ContentCalendarItemDto,
): SelectedCalendarItemSnapshot {
  return {
    id: item.id,
    dayLabel: item.dayLabel,
    contentType: item.contentType,
    strategyTag: item.strategyTag,
    title: item.title,
    summary: item.summary,
    targetPlatform: item.contentType === "video" ? "douyin" : "xiaohongshu",
    contentGoal: null,
  };
}

function buildDailyTaskCalendarItem(
  task: DailyContentTaskDto,
  contentType: "article" | "video",
): ContentCalendarItemDto {
  const taskItem = contentType === "article" ? task.articleTask : task.videoTask;

  return {
    id: `daily-task-${task.id}-${contentType}`,
    dayLabel: task.taskDate,
    contentType,
    strategyTag: taskItem.strategyTag ?? task.theme,
    title: taskItem.title,
    summary: taskItem.summary,
  };
}

function compactCalendarItems(
  items: Array<ContentCalendarItemDto | null | undefined>,
): ContentCalendarItemDto[] {
  const seen = new Set<string>();
  const compacted: ContentCalendarItemDto[] = [];

  for (const item of items) {
    if (!item?.title.trim() || seen.has(item.id)) {
      continue;
    }

    seen.add(item.id);
    compacted.push(item);
  }

  return compacted;
}

function appendDailyTaskMarkdown(markdown: string | null | undefined, task: DailyContentTaskDto | null) {
  const base = markdown?.trim() || "";

  if (!task) {
    return base;
  }

  return [
    base,
    "## 今日团队内容任务",
    `- 日期：${task.taskDate}`,
    `- 主题：${task.theme}`,
    `- 图文：${task.articleTask.title}｜${task.articleTask.summary}`,
    `- 视频：${task.videoTask.title}｜${task.videoTask.summary}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildMerchantSnapshot(
  merchant: Awaited<ReturnType<typeof getOperationalMerchantProfileByOwnerUserId>>,
) {
  return {
    id: merchant.id,
    name: merchant.name,
    industry: merchant.industry ?? null,
    serviceItems: merchant.serviceItems,
    brandSummary: merchant.brandSummary ?? null,
    regionSummary: merchant.regionSummary ?? null,
    toneStyle: merchant.toneStyle ?? null,
    defaultCta: merchant.defaultCta,
    forbiddenWords: merchant.forbiddenWords,
  };
}

function buildSourceText(input: {
  extraRequirement?: string | null;
  material?: MaterialLibraryItemDto | null;
  fallback: string;
}) {
  return [
    input.extraRequirement ?? null,
    input.material ? `参考素材：${input.material.title}` : null,
    input.material?.description ? `素材拆解：${input.material.description}` : null,
    input.fallback,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildMaterialSnapshot(
  material?: MaterialLibraryItemDto | null,
  reference?: MaterialWorkbenchReferenceDto | null,
) {
  if (!material && !reference) {
    return null;
  }

  return {
    referenceId: reference?.id ?? null,
    referenceStatus: reference?.status ?? null,
    materialId: material?.id ?? reference?.materialItemId ?? null,
    targetWorkbench: reference?.targetWorkbench ?? null,
    title: material?.title ?? null,
    platform: material?.platform ?? null,
    materialType: material?.materialType ?? null,
    sourceKind: material?.sourceKind ?? null,
    usageType: material?.usageType ?? null,
    retrievalTargets: material?.retrievalTargets ?? [],
    status: material?.status ?? null,
    engagementLabel: material?.engagementLabel ?? null,
    description: material?.description ?? null,
  };
}

function compactStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function resolveStrategyAssetMarkdown(session: ConsultationSessionDetailDto) {
  return (
    session.strategyAsset?.strategyMarkdown?.trim() ||
    buildStrategyAssetMarkdown(session.strategySnapshot)
  );
}

function normalizeArticlePlaybook(value: unknown): ArticlePlaybook {
  return value === "viral_generation" ||
    value === "traffic_rewrite" ||
    value === "compliance_safe" ||
    value === "ip_persona" ||
    value === "balanced_seed"
    ? value
    : "balanced_seed";
}

function toStrategySnapshotSafe(value: unknown): StrategySnapshotDto {
  return toStrategySnapshot(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}
