import "server-only";

import type { ContentDraftBundleDto } from "@/contracts/draft";
import type {
  MaterialLibraryItemDto,
  MaterialWorkbenchReferenceDto,
  MaterialWorkbenchTarget,
} from "@/contracts/material";
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
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";

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
        title: workingTitle,
        scriptText: buildVideoScript({
          merchantName: merchant.name,
          session,
          extraRequirement: input.extraRequirement ?? null,
          material: materialContext.material,
          strategyTag: input.strategyTag ?? null,
        }),
        hashtags: buildHashtags(session),
        ctaText: merchant.defaultCta[0] ?? "结尾引导私信或预约体验",
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
