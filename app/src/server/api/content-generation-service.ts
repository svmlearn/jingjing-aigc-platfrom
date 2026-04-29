import "server-only";

import type { ContentDraftBundleDto } from "@/contracts/draft";
import type {
  MaterialLibraryItemDto,
  MaterialWorkbenchReferenceDto,
  MaterialWorkbenchTarget,
} from "@/contracts/material";
import type { LlmRuntimeSettingsDto } from "@/contracts/platform-admin";
import { getConsultationSessionDetail } from "@/lib/db/consultation-repository";
import {
  createDraftWithVariants,
  createManualSourceItem,
  listDraftBundlesByMerchant,
} from "@/lib/db/content-draft-repository";
import {
  consumeMaterialWorkbenchReference,
  getMaterialLibraryItemById,
  getMaterialWorkbenchReference,
} from "@/lib/db/material-library-repository";
import { isLocalRealChainEnabled } from "@/lib/db/local-real-chain-repository";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import { AiRuntimeError, createChatCompletion } from "@/server/api/ai-runtime";
import { ApiError } from "@/server/api/errors";

type GenerationMode = "create" | "rewrite";
type VideoScriptDraftContent = {
  title: string;
  scriptText: string;
  hashtags: string[];
  ctaText: string;
};

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
  const session = await getVideoScriptSessionOrFallback({
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
    },
  });
  const fallbackScript = buildFallbackVideoScriptDraft({
    workingTitle,
    merchantName: merchant.name,
    session,
    extraRequirement: input.extraRequirement ?? null,
    material: materialContext.material,
    strategyTag: input.strategyTag ?? null,
    ctaText: merchant.defaultCta[0] ?? session.strategySnapshot.videoBrief?.outcome ?? "结尾引导私信或预约体验",
  });
  const generatedScript =
    (await generateVideoScriptWithLlm({
      fallback: fallbackScript,
      merchantName: merchant.name,
      session,
      goal: input.goal ?? null,
      extraRequirement: input.extraRequirement ?? null,
      material: materialContext.material,
      strategyTag: input.strategyTag ?? null,
    })) ?? fallbackScript;

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
      materialContext: buildMaterialSnapshot(materialContext.material, materialContext.reference),
    },
    commentInsights: {
      audiences: session.strategySnapshot.targetAudiences,
      scenes: session.strategySnapshot.keyScenes,
      referenceMaterialTitle: materialContext.material?.title ?? null,
      referenceMaterialEngagement: materialContext.material?.engagementLabel ?? null,
    },
    variants: [
      {
        platform: "douyin",
        variantType: "video_script",
        title: generatedScript.title,
        scriptText: generatedScript.scriptText,
        hashtags: generatedScript.hashtags,
        ctaText: generatedScript.ctaText,
      },
    ],
  });

  await consumeMaterialReferenceIfNeeded({
    merchantId: merchant.id,
    materialId: materialContext.material?.id ?? input.materialId ?? null,
    materialReferenceId: input.materialReferenceId,
    targetWorkbench: "video",
    draftId: draftBundle.draft.id,
  });

  return draftBundle;
}

async function getVideoScriptSessionOrFallback(input: {
  merchantId: string;
  sessionId: string;
}): Promise<Awaited<ReturnType<typeof getConsultationSessionDetail>>> {
  try {
    return await getConsultationSessionDetail(input);
  } catch (error) {
    if (
      !isLocalRealChainEnabled() ||
      !(error instanceof ApiError) ||
      error.code !== "CONSULTATION_SESSION_NOT_FOUND"
    ) {
      throw error;
    }

    const now = new Date().toISOString();

    return {
      id: input.sessionId,
      merchantId: input.merchantId,
      title: "Local real-chain smoke test",
      status: "active",
      currentStage: "video_smoke_test",
      strategySnapshot: {
        positioning: "Local smoke test for real media upload and server-side video worker rendering.",
        coreSellingPoints: ["real COS upload", "server worker render", "OpenStoryline output"],
        targetAudiences: ["local tester"],
        keyScenes: ["uploaded real storefront or product material", "worker-generated edit"],
        currentSuggestion: "Generate a short video script from the uploaded real materials.",
        strategyTags: ["real-chain-smoke"],
        contentCalendarDraft: [],
        articleBrief: null,
        videoBrief: {
          workingTitle: "Real material upload smoke test",
          hook: "Use uploaded real materials to verify the full worker chain.",
          outcome: "Create a rendered video and upload the result back to COS.",
        },
      },
      summaryText:
        "This temporary fallback session is only for verifying real material upload, job enqueueing, server worker rendering, and result upload.",
      latestMessagePreview: null,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
      messages: [],
      events: [],
    };
  }
}

function buildFallbackVideoScriptDraft(input: {
  workingTitle: string;
  merchantName: string;
  session: Awaited<ReturnType<typeof getConsultationSessionDetail>>;
  extraRequirement?: string | null;
  material?: MaterialLibraryItemDto | null;
  strategyTag?: string | null;
  ctaText: string;
}): VideoScriptDraftContent {
  return {
    title: input.workingTitle,
    scriptText: buildVideoScript({
      merchantName: input.merchantName,
      session: input.session,
      extraRequirement: input.extraRequirement ?? null,
      material: input.material,
      strategyTag: input.strategyTag ?? null,
    }),
    hashtags: buildHashtags(input.session),
    ctaText: input.ctaText,
  };
}

async function generateVideoScriptWithLlm(input: {
  fallback: VideoScriptDraftContent;
  merchantName: string;
  session: Awaited<ReturnType<typeof getConsultationSessionDetail>>;
  goal?: string | null;
  extraRequirement?: string | null;
  material?: MaterialLibraryItemDto | null;
  strategyTag?: string | null;
}): Promise<VideoScriptDraftContent | null> {
  const runtime = getVideoWorkbenchLlmRuntime();
  const apiKey = getVideoWorkbenchLlmApiKey();

  if (!runtime || !apiKey) {
    return null;
  }

  try {
    const response = await createChatCompletion({
      runtime,
      apiKey,
      messages: [
        {
          role: "system",
          content: [
            "You are the video script generation agent for a Chinese merchant content workbench.",
            "Return strict JSON only. No markdown.",
            "JSON shape: {\"title\":\"...\",\"scriptText\":\"...\",\"hashtags\":[\"#...\"],\"ctaText\":\"...\"}.",
            "The scriptText must be Chinese, short-video ready, and split into 4-6 scenes with timestamps, visuals, and voiceover.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            merchantName: input.merchantName,
            goal: input.goal,
            extraRequirement: input.extraRequirement,
            strategyTag: input.strategyTag,
            consultationSummary: input.session.summaryText,
            strategySnapshot: input.session.strategySnapshot,
            material: input.material
              ? {
                  title: input.material.title,
                  description: input.material.description,
                  platform: input.material.platform,
                  engagementLabel: input.material.engagementLabel,
                }
              : null,
            fallback: input.fallback,
          }),
        },
      ],
    });

    return normalizeVideoScriptDraft(parseJsonObject(response.content), input.fallback);
  } catch (error) {
    if (error instanceof AiRuntimeError) {
      console.warn("Video script LLM generation failed; falling back to deterministic script.", {
        status: error.status,
      });
      return null;
    }

    console.warn("Video script LLM generation failed; falling back to deterministic script.");
    return null;
  }
}

function getVideoWorkbenchLlmRuntime(): LlmRuntimeSettingsDto | null {
  const baseUrl = firstEnv("VIDEO_WORKBENCH_LLM_BASE_URL", "LLM_BASE_URL");
  const model = firstEnv("VIDEO_WORKBENCH_LLM_MODEL", "LLM_MODEL");

  if (!baseUrl || !model) {
    return null;
  }

  return {
    providerLabel: firstEnv("VIDEO_WORKBENCH_LLM_PROVIDER", "LLM_PROVIDER") ?? "DeepSeek",
    baseUrl,
    primaryModel: model,
    fallbackModel: null,
    temperature: parseEnvNumber("VIDEO_WORKBENCH_LLM_TEMPERATURE", 0.6),
    maxTokens: parseEnvInteger("VIDEO_WORKBENCH_LLM_MAX_TOKENS", 2200),
    timeoutSeconds: parseEnvInteger("VIDEO_WORKBENCH_LLM_TIMEOUT_SECONDS", 90),
    retryCount: 0,
    apiKeySource: "env",
  };
}

function getVideoWorkbenchLlmApiKey() {
  return firstEnv("VIDEO_WORKBENCH_LLM_API_KEY", "DEEPSEEK_API_KEY", "LLM_API_KEY");
}

function parseJsonObject(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  const candidate = fenced ?? (firstBrace >= 0 && lastBrace > firstBrace ? text.slice(firstBrace, lastBrace + 1) : text);
  const parsed = JSON.parse(candidate);

  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function normalizeVideoScriptDraft(
  record: Record<string, unknown>,
  fallback: VideoScriptDraftContent,
): VideoScriptDraftContent {
  const hashtags = Array.isArray(record.hashtags)
    ? record.hashtags
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => (item.trim().startsWith("#") ? item.trim() : `#${item.trim()}`))
        .slice(0, 8)
    : fallback.hashtags;

  return {
    title: firstNonEmptyString(record.title, fallback.title),
    scriptText: firstNonEmptyString(record.scriptText, record.script, fallback.scriptText),
    hashtags: hashtags.length > 0 ? hashtags : fallback.hashtags,
    ctaText: firstNonEmptyString(record.ctaText, record.cta, fallback.ctaText),
  };
}

function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

function parseEnvInteger(name: string, fallback: number) {
  const value = process.env[name]?.trim();
  const parsed = value ? Number.parseInt(value, 10) : NaN;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseEnvNumber(name: string, fallback: number) {
  const value = process.env[name]?.trim();
  const parsed = value ? Number.parseFloat(value) : NaN;

  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
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

function buildVideoScript(input: {
  merchantName: string;
  session: Awaited<ReturnType<typeof getConsultationSessionDetail>>;
  extraRequirement?: string | null;
  material?: MaterialLibraryItemDto | null;
  strategyTag?: string | null;
}) {
  const audience = input.session.strategySnapshot.targetAudiences[0] ?? "高意向用户";
  const scene = input.session.strategySnapshot.keyScenes[0] ?? "门店首次咨询前的信任建立";
  const sellingPoint = input.session.strategySnapshot.coreSellingPoints[0] ?? input.merchantName;
  const cta = input.session.strategySnapshot.videoBrief?.outcome ?? "结尾引导私信或预约体验";

  return [
    `Scene 1 | 00:00-00:05`,
    `画面：门头或空间快速推进，第一秒就出现 ${scene} 的氛围。`,
    `台词：如果你也是 ${audience}，这条视频一定要看完。${
      input.strategyTag ? `这条内容主打「${input.strategyTag}」。` : ""
    }`,
    "",
    `Scene 2 | 00:05-00:18`,
    `画面：展示门店真实环境、服务细节和最能建立信任的镜头。`,
    `台词：很多人真正卡住的，不是需不需要，而是不知道怎么判断一家店靠不靠谱。`,
    "",
    `Scene 3 | 00:18-00:32`,
    `画面：放大 ${sellingPoint}，用细节镜头把差异讲明白。`,
    `台词：我们这次重点想让你看到的，不是花哨包装，而是能不能把结果和体验稳定交付。${
      input.material ? `参考素材「${input.material.title}」的结构，把可信细节讲得更具体。` : ""
    }`,
    "",
    `Scene 4 | 00:32-00:45`,
    `画面：落回咨询动作、预约动作或体验流程。`,
    `台词：${cta}。${input.extraRequirement ? `补充要求：${input.extraRequirement}` : ""}`,
  ].join("\n");
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
