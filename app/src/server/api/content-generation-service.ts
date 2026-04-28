import "server-only";

import type { ContentDraftBundleDto } from "@/contracts/draft";
import type {
  MaterialLibraryItemDto,
  MaterialWorkbenchReferenceDto,
  MaterialWorkbenchTarget,
} from "@/contracts/material";
import { getConsultationSessionDetail } from "@/lib/db/consultation-repository";
import {
  appendContentVariantToDraft,
  createDraftWithVariants,
  createManualSourceItem,
  listDraftBundlesByMerchant,
} from "@/lib/db/content-draft-repository";
import {
  consumeMaterialWorkbenchReference,
  getMaterialLibraryItemById,
  getMaterialWorkbenchReference,
} from "@/lib/db/material-library-repository";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import { searchKnowledgeChunks } from "@/lib/db/knowledge-repository";
import { getPlatformSettings } from "@/lib/db/platform-admin-repository";
import {
  AiRuntimeError,
  createChatCompletion,
  getAiRuntimeApiKey,
} from "@/server/api/ai-runtime";
import { ApiError } from "@/server/api/errors";
import {
  SCRIPT_PRODUCTION_AGENT_PROMPT_VERSION,
  buildScriptProductionAgentMessages,
  classifyVideoScriptRevisionIntent,
  parseScriptProductionAgentResponse,
  validateScriptProductionBrief,
  type ScriptProductionBrief,
} from "@/server/api/video-script-production-agent";
import { assertVideoScriptVariantAccess } from "@/lib/db/video-edit-job-repository";
import {
  buildVideoScriptContext,
  buildVideoScriptCandidates,
  type VideoScriptCandidate,
} from "@/server/api/video-growth-context";
import {
  buildVideoChainTestDraftFixture,
  isVideoChainTestDraftEnabled,
} from "@/server/api/video-chain-test-draft";

type GenerationMode = "create" | "rewrite";

export async function generateArticleDraftForUser(input: {
  userId: string;
  sessionId: string;
  goal?: string | null;
  extraRequirement?: string | null;
  mode?: GenerationMode | null;
  materialId?: string | null;
  materialReferenceId?: string | null;
  strategyTag?: string | null;
}): Promise<ContentDraftBundleDto> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const session = await getConsultationSessionDetail({
    merchantId: merchant.id,
    sessionId: input.sessionId,
  });
  const materialContext = await resolveMaterialContext({
    merchantId: merchant.id,
    materialId: input.materialId,
    materialReferenceId: input.materialReferenceId,
    targetWorkbench: "article",
  });
  const mode: GenerationMode =
    input.mode ?? (materialContext.material ? "rewrite" : "create");
  const workingTitle =
    materialContext.material
      ? `改写：${materialContext.material.title}`
      : session.strategySnapshot.articleBrief?.workingTitle ??
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
      consultation_session_id: session.id,
      generated_kind: "article",
      generation_mode: mode,
      strategy_tag: input.strategyTag ?? null,
      material_item_id: materialContext.material?.id ?? null,
      material_reference_id: materialContext.reference?.id ?? input.materialReferenceId ?? null,
    },
  });
  const cta = merchant.defaultCta[0] ?? "私信我领取体验方案或预约到店咨询";
  const angle = input.goal ?? session.strategySnapshot.articleBrief?.angle ?? "专业干货 + 场景信任";

  const draftBundle = await createDraftWithVariants({
    merchantId: merchant.id,
    sourceItemId: sourceItem.id,
    workingTitle,
    rewriteGoal: angle,
    inputSnapshot: {
      consultationSessionId: session.id,
      strategySnapshot: session.strategySnapshot,
      generationMode: mode,
      strategyTag: input.strategyTag ?? null,
      extraRequirement: input.extraRequirement ?? null,
      materialContext: buildMaterialSnapshot(materialContext.material, materialContext.reference),
    },
    commentInsights: {
      audiences: session.strategySnapshot.targetAudiences,
      strategyTags: session.strategySnapshot.strategyTags,
      referenceMaterialTitle: materialContext.material?.title ?? null,
      referenceMaterialEngagement: materialContext.material?.engagementLabel ?? null,
    },
    variants: [
      {
        platform: "xiaohongshu",
        variantType: "note",
        title: `别再盲目发内容了，${merchant.name} 先把这 3 个点讲清楚`,
        bodyText: buildArticleBody({
          merchantName: merchant.name,
          angle,
          session,
          variantLabel: "专业干货版",
          cta,
          material: materialContext.material,
        }),
        hashtags: buildHashtags(session),
        ctaText: cta,
      },
      {
        platform: "xiaohongshu",
        variantType: "note",
        title: `${session.strategySnapshot.targetAudiences[0] ?? "高意向用户"} 最在意的，其实不是价格`,
        bodyText: buildArticleBody({
          merchantName: merchant.name,
          angle,
          session,
          variantLabel: "场景共鸣版",
          cta,
          material: materialContext.material,
        }),
        hashtags: buildHashtags(session),
        ctaText: cta,
      },
    ],
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

export async function generateVideoScriptForUser(input: {
  userId: string;
  sessionId: string;
  goal?: string | null;
  extraRequirement?: string | null;
  materialId?: string | null;
  materialReferenceId?: string | null;
  strategyTag?: string | null;
}): Promise<ContentDraftBundleDto> {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const session = await getConsultationSessionDetail({
    merchantId: merchant.id,
    sessionId: input.sessionId,
  });
  const materialContext = await resolveMaterialContext({
    merchantId: merchant.id,
    materialId: input.materialId,
    materialReferenceId: input.materialReferenceId,
    targetWorkbench: "video",
  });
  const workingTitle =
    materialContext.material
      ? `视频脚本：${materialContext.material.title}`
      : session.strategySnapshot.videoBrief?.workingTitle ??
    `${merchant.name} 的视频脚本`;
  const materialSnapshot = buildMaterialSnapshot(materialContext.material, materialContext.reference);
  const scriptContext = buildVideoScriptContext({
    merchant,
    session,
    extraRequirement: input.extraRequirement ?? null,
    materialContext: materialSnapshot,
    strategyTag: input.strategyTag ?? null,
  });
  const fallbackScriptCandidates = buildVideoScriptCandidates({
    merchantName: merchant.name,
    session,
    scriptContext,
    extraRequirement: input.extraRequirement ?? null,
    material: materialContext.material,
  });
  const platformSettings = await getPlatformSettings();
  const scriptProductionBriefBase = buildVideoScriptProductionBrief({
    merchant,
    session,
    materialSnapshot,
    goal: input.goal ?? null,
    extraRequirement: input.extraRequirement ?? null,
    strategyTag: input.strategyTag ?? null,
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
  const briefValidation = validateScriptProductionBrief(scriptProductionBrief);

  if (!briefValidation.ready) {
    throw new ApiError(
      409,
      "SCRIPT_PRODUCTION_BRIEF_INCOMPLETE",
      "咨询台信息还不足以生成正式视频脚本。",
      {
        missingFields: briefValidation.missingFields,
        questions: briefValidation.questions,
      },
    );
  }

  const scriptAgent = await generateVideoScriptCandidatesWithAgent({
    brief: scriptProductionBrief,
    fallbackCandidates: fallbackScriptCandidates,
    llmRuntime: platformSettings.llmRuntime,
    agentSettings: platformSettings.scriptProductionAgent,
  });
  const scriptCandidates = scriptAgent.candidates;
  const sourceItem = await createManualSourceItem({
    merchantId: merchant.id,
    platform: "douyin",
    title: workingTitle,
    scriptText:
      buildSourceText({
        extraRequirement: input.extraRequirement,
        material: materialContext.material,
        fallback: session.summaryText ?? workingTitle,
      }),
    tracePayload: {
      consultation_session_id: session.id,
      generated_kind: "video_script",
      strategy_tag: input.strategyTag ?? null,
      material_item_id: materialContext.material?.id ?? null,
      material_reference_id: materialContext.reference?.id ?? input.materialReferenceId ?? null,
      script_agent_mode: scriptAgent.trace.mode,
    },
  });

  const draftBundle = await createDraftWithVariants({
    merchantId: merchant.id,
    sourceItemId: sourceItem.id,
    workingTitle,
    rewriteGoal: input.goal ?? session.strategySnapshot.videoBrief?.hook ?? "门店场景视频脚本",
    inputSnapshot: {
      consultationSessionId: session.id,
      strategySnapshot: session.strategySnapshot,
      strategyTag: input.strategyTag ?? null,
      extraRequirement: input.extraRequirement ?? null,
      materialContext: materialSnapshot,
      scriptContext,
      scriptProductionBrief,
      scriptProductionAgent: scriptAgent.trace,
    },
    commentInsights: {
      audiences: session.strategySnapshot.targetAudiences,
      scenes: session.strategySnapshot.keyScenes,
      referenceMaterialTitle: materialContext.material?.title ?? null,
      referenceMaterialEngagement: materialContext.material?.engagementLabel ?? null,
      scriptCandidateTypes: scriptCandidates.map((candidate) => candidate.candidateType),
      scriptAgentMode: scriptAgent.trace.mode,
    },
    variants: scriptCandidates.map((candidate) => ({
        platform: "douyin",
        variantType: "video_script",
        title: candidate.title,
        scriptText: candidate.scriptText,
        productionScenes: candidate.scenes,
        hashtags: buildHashtags(session),
        ctaText: candidate.ctaText,
        reviewStatus: "review_pending",
      })),
  });
  const draftBundleWithScenes = attachProductionScenes(
    draftBundle,
    scriptCandidates.map((candidate) => candidate.scenes),
  );

  await consumeMaterialReferenceIfNeeded({
    merchantId: merchant.id,
    materialId: materialContext.material?.id ?? input.materialId ?? null,
    materialReferenceId: input.materialReferenceId,
    targetWorkbench: "video",
    draftId: draftBundle.draft.id,
  });

  return draftBundleWithScenes;
}

export async function createVideoChainTestDraftForUser(input: {
  userId: string;
}): Promise<ContentDraftBundleDto> {
  if (!isVideoChainTestDraftEnabled()) {
    throw new ApiError(
      403,
      "VIDEO_CHAIN_TEST_ENTRYPOINT_DISABLED",
      "视频链路测试入口未启用。",
    );
  }

  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const fixture = buildVideoChainTestDraftFixture({
    merchantName: merchant.name,
    serviceItems: merchant.serviceItems,
    defaultCta: merchant.defaultCta,
    forbiddenWords: merchant.forbiddenWords,
  });
  const sourceItem = await createManualSourceItem({
    merchantId: merchant.id,
    platform: fixture.sourceItem.platform,
    title: fixture.sourceItem.title,
    scriptText: fixture.sourceItem.scriptText,
    tracePayload: fixture.sourceItem.tracePayload,
  });

  return createDraftWithVariants({
    merchantId: merchant.id,
    sourceItemId: sourceItem.id,
    workingTitle: fixture.draft.workingTitle,
    rewriteGoal: fixture.draft.rewriteGoal,
    status: fixture.draft.status,
    inputSnapshot: fixture.draft.inputSnapshot,
    commentInsights: fixture.draft.commentInsights,
    variants: [fixture.variant],
  });
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
  const revisionIntent = classifyVideoScriptRevisionIntent(input.revisionInstruction);

  if (revisionIntent === "production") {
    return {
      revisionIntent,
      contentVariantId: input.contentVariantId,
      instructionText: input.revisionInstruction,
    };
  }

  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  const currentVariant = await assertVideoScriptVariantAccess({
    merchantId: merchant.id,
    contentVariantId: input.contentVariantId,
  });

  if (!currentVariant.scriptText?.trim()) {
    throw new ApiError(
      409,
      "VIDEO_SCRIPT_TEXT_REQUIRED",
      "视频脚本缺少正文，无法修订。",
    );
  }

  const session = await getConsultationSessionDetail({
    merchantId: merchant.id,
    sessionId: input.sessionId,
  });
  const materialContext = await resolveMaterialContext({
    merchantId: merchant.id,
    materialId: input.materialId,
    materialReferenceId: input.materialReferenceId,
    targetWorkbench: "video",
  });
  const materialSnapshot = buildMaterialSnapshot(materialContext.material, materialContext.reference);
  const scriptContext = buildVideoScriptContext({
    merchant,
    session,
    extraRequirement: input.revisionInstruction,
    materialContext: materialSnapshot,
    strategyTag: input.strategyTag ?? null,
  });
  const fallbackScriptCandidates = buildVideoScriptCandidates({
    merchantName: merchant.name,
    session,
    scriptContext,
    extraRequirement: input.revisionInstruction,
    material: materialContext.material,
  });
  const platformSettings = await getPlatformSettings();

  if (!platformSettings.scriptProductionAgent.revisionEnabled) {
    throw new ApiError(
      409,
      "SCRIPT_PRODUCTION_REVISION_DISABLED",
      "脚本制作 Agent 修订入口未启用。",
    );
  }

  const scriptProductionBriefBase = buildVideoScriptProductionBrief({
    merchant,
    session,
    materialSnapshot,
    goal: currentVariant.title ?? null,
    extraRequirement: input.revisionInstruction,
    strategyTag: input.strategyTag ?? null,
  });
  const scriptProductionBrief = {
    ...scriptProductionBriefBase,
    evidenceReferences: await collectScriptProductionEvidence({
      merchantId: merchant.id,
      brief: scriptProductionBriefBase,
      retrievalTopK: platformSettings.scriptProductionAgent.retrievalTopK,
    }),
  };
  const scriptAgent = await generateVideoScriptCandidatesWithAgent({
    brief: scriptProductionBrief,
    fallbackCandidates: fallbackScriptCandidates,
    llmRuntime: platformSettings.llmRuntime,
    agentSettings: platformSettings.scriptProductionAgent,
    revisionContext: {
      currentVariantId: input.contentVariantId,
      currentScriptText: currentVariant.scriptText,
      revisionInstruction: input.revisionInstruction,
      revisionIntent,
    },
  });
  const revisedCandidate = scriptAgent.candidates[0];

  if (!revisedCandidate) {
    throw new ApiError(
      500,
      "SCRIPT_PRODUCTION_REVISION_EMPTY",
      "脚本制作 Agent 没有返回可用修订稿。",
    );
  }

  const variant = await appendContentVariantToDraft({
    merchantId: merchant.id,
    draftId: currentVariant.draftId,
    platform: "douyin",
    variantType: "video_script",
    title: revisedCandidate.title,
    scriptText: revisedCandidate.scriptText,
    productionScenes: revisedCandidate.scenes,
    hashtags: buildHashtags(session),
    ctaText: revisedCandidate.ctaText,
    reviewStatus: "review_pending",
  });

  return {
    revisionIntent,
    variant: {
      ...variant,
      productionScenes: revisedCandidate.scenes,
    },
    agentTrace: scriptAgent.trace,
  };
}

async function generateVideoScriptCandidatesWithAgent(input: {
  brief: ScriptProductionBrief;
  fallbackCandidates: VideoScriptCandidate[];
  llmRuntime: Awaited<ReturnType<typeof getPlatformSettings>>["llmRuntime"];
  agentSettings: Awaited<ReturnType<typeof getPlatformSettings>>["scriptProductionAgent"];
  revisionContext?: Parameters<typeof buildScriptProductionAgentMessages>[0]["revisionContext"];
}): Promise<{
  candidates: VideoScriptCandidate[];
  trace: {
    promptVersion: typeof SCRIPT_PRODUCTION_AGENT_PROMPT_VERSION;
    mode: "llm" | "fallback_no_key" | "fallback_error" | "fallback_parse_error";
    model?: string;
    error?: string;
    productionGoal?: string | null;
    evidenceSummary?: string[];
    riskNotes?: string[];
    confirmQuestions?: string[];
    evidenceReferenceCount?: number;
  };
}> {
  const promptVersion = SCRIPT_PRODUCTION_AGENT_PROMPT_VERSION;
  const evidenceReferenceCount = input.brief.evidenceReferences?.length ?? 0;

  if (!getAiRuntimeApiKey()) {
    return {
      candidates: input.fallbackCandidates,
      trace: {
        promptVersion,
        mode: "fallback_no_key",
        evidenceReferenceCount,
      },
    };
  }

  try {
    const response = await createChatCompletion({
      runtime: {
        ...input.llmRuntime,
        temperature: input.agentSettings.temperature,
      },
      model: input.agentSettings.model,
      messages: buildScriptProductionAgentMessages({
        brief: input.brief,
        systemPrompt: input.agentSettings.systemPrompt,
        revisionContext: input.revisionContext,
      }),
    });
    const parsed = parseScriptProductionAgentResponse(
      response.content,
      input.fallbackCandidates,
      {
        brief: input.brief,
      },
    );

    if (parsed.mode === "needs_more_info") {
      throw new ApiError(
        409,
        "SCRIPT_PRODUCTION_BRIEF_INCOMPLETE",
        "脚本制作 Agent 判断当前信息还不足以生成正式视频脚本。",
        {
          missingFields: parsed.missingFields,
          questions: parsed.questions,
          reason: parsed.reason,
        },
      );
    }

    if (parsed.mode === "fallback_parse_error") {
      return {
        candidates: parsed.candidates,
        trace: {
          promptVersion,
          mode: "fallback_parse_error",
          model: response.model,
          error: parsed.error,
          evidenceReferenceCount,
        },
      };
    }

    return {
      candidates: parsed.candidates,
      trace: {
        promptVersion,
        mode: "llm",
        model: response.model,
        productionGoal: parsed.productionGoal,
        evidenceSummary: parsed.evidenceSummary,
        riskNotes: parsed.riskNotes,
        confirmQuestions: parsed.confirmQuestions,
        evidenceReferenceCount,
      },
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    return {
      candidates: input.fallbackCandidates,
      trace: {
        promptVersion,
        mode: "fallback_error",
        evidenceReferenceCount,
        error:
          error instanceof AiRuntimeError
            ? `${error.message}${error.status ? ` (${error.status})` : ""}`
            : error instanceof Error
              ? error.message
              : "Unknown AI runtime error.",
      },
    };
  }
}

function attachProductionScenes(
  draftBundle: ContentDraftBundleDto,
  sceneSets: VideoScriptCandidate["scenes"][],
): ContentDraftBundleDto {
  const variants = draftBundle.variants.map((variant, index) => ({
    ...variant,
    productionScenes: sceneSets[index] ?? variant.productionScenes ?? [],
  }));

  return {
    ...draftBundle,
    variants,
    selectedVariant:
      variants.find((variant) => variant.id === draftBundle.selectedVariant?.id) ??
      variants.find((variant) => variant.id === draftBundle.draft.selectedVariantId) ??
      variants[0] ??
      null,
  };
}

function buildVideoScriptProductionBrief(input: {
  merchant: Awaited<ReturnType<typeof getOperationalMerchantProfileByOwnerUserId>>;
  session: Awaited<ReturnType<typeof getConsultationSessionDetail>>;
  materialSnapshot: ReturnType<typeof buildMaterialSnapshot>;
  goal?: string | null;
  extraRequirement?: string | null;
  strategyTag?: string | null;
}): ScriptProductionBrief {
  const snapshot = input.session.strategySnapshot;
  const material = input.materialSnapshot;
  const topicDirection =
    input.goal ??
    snapshot.videoBrief?.workingTitle ??
    snapshot.videoBrief?.hook ??
    snapshot.currentSuggestion;

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
    forbiddenExpressions: input.merchant.forbiddenWords,
    brandTone: input.merchant.toneStyle ?? null,
    availableMaterials: material
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

async function collectScriptProductionEvidence(input: {
  merchantId: string;
  brief: ScriptProductionBrief;
  retrievalTopK: number;
}): Promise<NonNullable<ScriptProductionBrief["evidenceReferences"]>> {
  const references: NonNullable<ScriptProductionBrief["evidenceReferences"]> = [];

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

  if (input.brief.consultationConclusion.summaryText) {
    references.push({
      title: "咨询台摘要",
      content: input.brief.consultationConclusion.summaryText,
      source: "consultation",
      score: null,
    });
  }

  if (input.retrievalTopK > 0) {
    const query = compactStrings([
      input.brief.topicDirection,
      ...input.brief.targetAudiences,
      ...input.brief.productOrServiceInfo,
      ...input.brief.customerAdvantages,
      ...input.brief.availableScenes,
    ]).join(" ");
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

export async function listContentRecordsForUser(input: {
  userId: string;
  limit?: number;
}) {
  const merchant = await getOperationalMerchantProfileByOwnerUserId(input.userId);
  return listDraftBundlesByMerchant({
    merchantId: merchant.id,
    limit: input.limit,
  });
}

function buildArticleBody(input: {
  merchantName: string;
  angle: string;
  session: Awaited<ReturnType<typeof getConsultationSessionDetail>>;
  variantLabel: string;
  cta: string;
  material?: MaterialLibraryItemDto | null;
}) {
  const audiences = input.session.strategySnapshot.targetAudiences.join("、") || "高意向用户";
  const sellingPoints =
    input.session.strategySnapshot.coreSellingPoints.join("、") || input.merchantName;
  const scenes = input.session.strategySnapshot.keyScenes.join("、") || "真实到店前决策";

  return [
    `【${input.variantLabel}】`,
    `如果你最近在做内容，但总感觉发了也没人来问，大概率不是你不努力，而是内容没有真正围绕「${audiences}」的决策场景展开。`,
    "",
    `这次我先把 ${input.merchantName} 的策略资产压成一个更好用的创作角度: ${input.angle}。`,
    input.material
      ? `同时参考了素材「${input.material.title}」：${input.material.description ?? "保留其内容结构、开头钩子和转化动作。"}`
      : null,
    "",
    `1. 先把用户最想听的场景说透`,
    `我们重点围绕 ${scenes} 去讲，因为这类场景最容易触发咨询和收藏。`,
    "",
    `2. 把门店真正的差异点讲具体`,
    `别只说“专业”“靠谱”，要把 ${sellingPoints} 这些真实可感知的信息讲出来。`,
    "",
    `3. 最后给一个明确动作`,
    `${input.cta}。`,
    "",
    `把这一条跑通后，再去扩更多选题，内容效率会比“想到什么发什么”稳定很多。`,
  ]
    .filter((line) => line !== null)
    .join("\n");
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
    engagementLabel: material?.engagementLabel ?? null,
    description: material?.description ?? null,
  };
}

function compactStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
