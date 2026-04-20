import type { SourceItemDto, ImportedCommentDto } from "@/contracts/content";
import type { ContentDraftDto, ContentVariantDto } from "@/contracts/draft";
import type { ImportJobDto, ImportRequest } from "@/contracts/import";

export type MerchantProfileDto = {
  id: string;
  name: string;
  address: string;
  contactName: string;
  contactPhone: string;
  services: string;
};

export type DraftBundle = {
  draft: ContentDraftDto;
  variants: ContentVariantDto[];
  sourceItem: SourceItemDto;
};

export type RewriteResult = DraftBundle & {
  commentSummary: string;
};

export const merchantProfile: MerchantProfileDto = {
  id: "merchant-jingjing-001",
  name: "静境皮肤管理中心",
  address: "杭州市西湖区文三路 268 号 3F",
  contactName: "林予安",
  contactPhone: "13800008888",
  services: "敏感肌修护、痘肌管理、面部清洁、抗初老护理、重要约会前急救护理",
};

export const importJobs: ImportJobDto[] = [
  {
    id: "job-240420-003",
    platform: "xiaohongshu",
    importType: "detail",
    status: "partial",
    inputUrl: "https://www.xiaohongshu.com/explore/661f9e9c000000001b00a120",
    totalItems: 1,
    successItems: 1,
    errorSummary: "内容已导入，部分评论未能抓取。你可以先进入改写，或稍后重试评论。",
    createdAt: "2026-04-20 10:32",
    finishedAt: "2026-04-20 10:34",
  },
  {
    id: "job-240420-002",
    platform: "douyin",
    importType: "detail",
    status: "succeeded",
    inputUrl: "https://www.douyin.com/video/7358123123123123000",
    totalItems: 1,
    successItems: 1,
    errorSummary: null,
    createdAt: "2026-04-20 09:48",
    finishedAt: "2026-04-20 09:50",
  },
  {
    id: "job-240420-001",
    platform: "xiaohongshu",
    importType: "creator",
    status: "running",
    inputUrl: "https://www.xiaohongshu.com/user/profile/5f7b0d00000000000101",
    totalItems: 20,
    successItems: 12,
    errorSummary: null,
    createdAt: "2026-04-20 09:12",
    finishedAt: null,
  },
];

export const sourceItems: SourceItemDto[] = [
  {
    id: "source-xhs-sensitive-repair",
    platform: "xiaohongshu",
    sourceType: "detail",
    externalItemId: "661f9e9c000000001b00a120",
    sourceUrl: "https://www.xiaohongshu.com/explore/661f9e9c000000001b00a120",
    creatorId: "creator-xhs-01",
    creatorName: "米粒的护肤日记",
    title: "敏感肌换季急救，三天把泛红压下去",
    bodyText:
      "最近换季皮肤状态很不稳定，脸颊泛红、干痒，还有一点刺痛。护理思路是先停掉高刺激功效，再用温和清洁、舒缓精华和屏障修护面霜做三步。第三天明显稳定，妆前也不容易起皮。",
    scriptText: null,
    engagementSnapshot: {
      likes: 8420,
      comments: 318,
      collects: 1260,
    },
    structureSummary: {
      hook: "换季泛红三天修护",
      angle: "痛点急救",
      media: "before_after",
    },
    isSelectedForRewrite: true,
    createdAt: "2026-04-20 10:34",
  },
  {
    id: "source-dy-acne-care",
    platform: "douyin",
    sourceType: "detail",
    externalItemId: "7358123123123123000",
    sourceUrl: "https://www.douyin.com/video/7358123123123123000",
    creatorId: "creator-dy-02",
    creatorName: "阿宁变美实验室",
    title: "痘肌护理别再猛刷酸，先看这 4 个信号",
    bodyText: null,
    scriptText:
      "如果你一长痘就猛刷酸，先停一下。第一，看是不是干到脱皮；第二，看是不是刺痛泛红；第三，看闭口有没有变多；第四，看作息是不是连续熬夜。护理不是越猛越好，稳定屏障才是第一步。",
    engagementSnapshot: {
      likes: 12900,
      comments: 456,
      shares: 870,
    },
    structureSummary: {
      hook: "反常识提醒",
      angle: "科普口播",
      media: "talking_head",
    },
    isSelectedForRewrite: true,
    createdAt: "2026-04-20 09:50",
  },
  {
    id: "source-xhs-low-quality",
    platform: "xiaohongshu",
    sourceType: "detail",
    externalItemId: null,
    sourceUrl: "https://www.xiaohongshu.com/discovery/item/low-quality",
    creatorId: null,
    creatorName: null,
    title: null,
    bodyText: null,
    scriptText: null,
    engagementSnapshot: {},
    structureSummary: {
      quality: "low",
    },
    isSelectedForRewrite: false,
    createdAt: "2026-04-20 08:42",
  },
];

export const importedComments: ImportedCommentDto[] = [
  {
    id: "comment-001",
    sourceItemId: "source-xhs-sensitive-repair",
    externalCommentId: "xhs-c-001",
    parentExternalCommentId: null,
    authorName: "橘子汽水",
    content: "我也是换季脸颊红，一直不敢做护理，想知道这种修护会不会刺痛？",
    likeCount: 86,
    replyCount: 12,
    publishedAt: "2026-04-19 22:18",
    createdAt: "2026-04-20 10:34",
  },
  {
    id: "comment-002",
    sourceItemId: "source-xhs-sensitive-repair",
    externalCommentId: "xhs-c-002",
    parentExternalCommentId: null,
    authorName: "困困不熬夜",
    content: "想要一个上班族中午也能做完的流程，不然下班后太晚了。",
    likeCount: 54,
    replyCount: 4,
    publishedAt: "2026-04-19 23:02",
    createdAt: "2026-04-20 10:34",
  },
  {
    id: "comment-003",
    sourceItemId: "source-xhs-sensitive-repair",
    externalCommentId: "xhs-c-003",
    parentExternalCommentId: null,
    authorName: "小猫皮肤日历",
    content: "最怕被推一堆产品，能不能只做屏障修护不办卡？",
    likeCount: 38,
    replyCount: 7,
    publishedAt: "2026-04-20 00:14",
    createdAt: "2026-04-20 10:34",
  },
  {
    id: "comment-004",
    sourceItemId: "source-dy-acne-care",
    externalCommentId: "dy-c-001",
    parentExternalCommentId: null,
    authorName: "一颗青提",
    content: "说中了，我就是刷酸刷到又红又痒。",
    likeCount: 210,
    replyCount: 18,
    publishedAt: "2026-04-20 08:20",
    createdAt: "2026-04-20 09:50",
  },
  {
    id: "comment-005",
    sourceItemId: "source-dy-acne-care",
    externalCommentId: "dy-c-002",
    parentExternalCommentId: null,
    authorName: "江边晚风",
    content: "这种内容适合做成到店检测吗？想先知道自己是不是屏障受损。",
    likeCount: 97,
    replyCount: 6,
    publishedAt: "2026-04-20 08:36",
    createdAt: "2026-04-20 09:50",
  },
];

export const contentDrafts: ContentDraftDto[] = [
  {
    id: "draft-sensitive-repair",
    sourceItemId: "source-xhs-sensitive-repair",
    merchantId: merchantProfile.id,
    workingTitle: "换季泛红急救护理",
    rewriteGoal: "本地化种草",
    status: "drafting",
    selectedVariantId: "variant-sensitive-xhs-a",
    createdAt: "2026-04-20 10:39",
    updatedAt: "2026-04-20 10:39",
  },
  {
    id: "draft-douyin-acne-care",
    sourceItemId: "source-dy-acne-care",
    merchantId: merchantProfile.id,
    workingTitle: "痘肌屏障检测口播",
    rewriteGoal: "抖音口播",
    status: "drafting",
    selectedVariantId: "variant-douyin-acne-a",
    createdAt: "2026-04-20 10:46",
    updatedAt: "2026-04-20 10:46",
  },
];

export const contentVariants: ContentVariantDto[] = [
  {
    id: "variant-sensitive-xhs-a",
    draftId: "draft-sensitive-repair",
    platform: "xiaohongshu",
    variantType: "note",
    versionNo: 1,
    title: "杭州换季泛红急救：先把屏障稳住",
    bodyText:
      "这几天杭州温差一大，很多姐妹脸颊开始泛红、干痒、上妆起皮。静境这次给敏感肌做的是温和清洁、舒缓导入、屏障修护三步，不急着上猛药，先让皮肤安静下来。午休和下班后都能安排，护理前会先看皮肤状态，再决定要不要加强修护。",
    scriptText: null,
    hashtags: ["杭州皮肤管理", "敏感肌修护", "换季护肤", "屏障修护"],
    ctaText: "想先看自己是不是屏障受损，可以预约一次基础检测。",
    reviewStatus: "editing",
    createdAt: "2026-04-20 10:39",
    updatedAt: "2026-04-20 10:39",
  },
  {
    id: "variant-sensitive-xhs-b",
    draftId: "draft-sensitive-repair",
    platform: "xiaohongshu",
    variantType: "note",
    versionNo: 2,
    title: "脸一换季就红，不一定要刷酸",
    bodyText:
      "泛红、刺痛、起皮同时出现时，先别急着叠加功效。我们更建议先做低刺激修护，把清洁、舒缓和保湿做扎实。静境的敏感肌护理会结合当天状态调整手法和产品，用更稳的节奏把皮肤拉回来。",
    scriptText: null,
    hashtags: ["敏感肌", "杭州护肤", "泛红急救"],
    ctaText: "把近期皮肤状态发来，我们先帮你判断适不适合做护理。",
    reviewStatus: "editing",
    createdAt: "2026-04-20 10:40",
    updatedAt: "2026-04-20 10:40",
  },
  {
    id: "variant-douyin-acne-a",
    draftId: "draft-douyin-acne-care",
    platform: "douyin",
    variantType: "video_script",
    versionNo: 1,
    title: "痘肌别急着猛刷酸",
    bodyText: null,
    scriptText:
      "如果你一长痘就想刷酸，先别急。干到脱皮、刺痛泛红、闭口变多，这些都可能是在提醒你屏障已经扛不住了。到静境可以先做一次皮肤状态检测，再决定是清洁、舒缓，还是痘肌管理。我们不会一上来就推高刺激项目，先把皮肤稳住，后面才好谈改善。",
    hashtags: ["杭州痘肌管理", "屏障修护", "皮肤检测", "别乱刷酸"],
    ctaText: "不确定自己能不能刷酸，先来做一次皮肤状态检测。",
    reviewStatus: "editing",
    createdAt: "2026-04-20 10:46",
    updatedAt: "2026-04-20 10:46",
  },
  {
    id: "variant-douyin-acne-b",
    draftId: "draft-douyin-acne-care",
    platform: "douyin",
    variantType: "video_script",
    versionNo: 2,
    title: "这 4 个信号出现，先别刷酸",
    bodyText: null,
    scriptText:
      "脸上长痘，不代表每次都要刷酸。第一，脸颊干到起皮；第二，护肤品一上脸就刺痛；第三，红痒比痘更明显；第四，熬夜后反复爆痘。遇到这些情况，静境更建议先检测屏障和炎症状态，再做温和护理方案。",
    hashtags: ["痘肌护理", "杭州皮肤管理", "屏障受损"],
    ctaText: "把你的皮肤状态发来，我们先帮你判断适不适合做痘肌护理。",
    reviewStatus: "editing",
    createdAt: "2026-04-20 10:47",
    updatedAt: "2026-04-20 10:47",
  },
];

export const sourceThumbnails: Record<string, string> = {
  "source-xhs-sensitive-repair":
    "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=960&q=80",
  "source-dy-acne-care":
    "https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?auto=format&fit=crop&w=960&q=80",
  "source-xhs-low-quality":
    "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=960&q=80",
};

export const commentSummary =
  "评论集中在三个顾虑：护理是否刺痛、能否快速完成、是否会被强推办卡。改写时适合强调先检测、低刺激、流程时长和不强制办卡。";

const commentSummaries: Record<string, string> = {
  "source-xhs-sensitive-repair": commentSummary,
  "source-dy-acne-care":
    "评论集中在刷酸后泛红、是否适合做屏障检测、以及痘肌护理是否会过度刺激。改写时适合用短口播强调先检测、再护理、不要盲目刷酸。",
};

export function getCommentSummary(sourceItemId: string) {
  return commentSummaries[sourceItemId] ?? commentSummary;
}

function createFallbackDraft(sourceItem: SourceItemDto): ContentDraftDto {
  return {
    id: `draft-${sourceItem.id}`,
    sourceItemId: sourceItem.id,
    merchantId: merchantProfile.id,
    workingTitle: sourceItem.title ?? "导入内容改写草稿",
    rewriteGoal: sourceItem.platform === "douyin" ? "抖音口播" : "本地化种草",
    status: "drafting",
    selectedVariantId: `variant-${sourceItem.id}-a`,
    createdAt: "刚刚",
    updatedAt: "刚刚",
  };
}

function createFallbackVariant(sourceItem: SourceItemDto, draftId: string): ContentVariantDto {
  const isDouyin = sourceItem.platform === "douyin";

  return {
    id: `variant-${sourceItem.id}-a`,
    draftId,
    platform: sourceItem.platform,
    variantType: isDouyin ? "video_script" : "note",
    versionNo: 1,
    title: sourceItem.title ? `${sourceItem.title}｜本地化改写` : "导入内容改写草稿",
    bodyText: isDouyin
      ? null
      : `结合 ${merchantProfile.name} 的服务项目，把这条来源内容改写成一篇更适合本地用户咨询的笔记。`,
    scriptText: isDouyin
      ? `结合 ${merchantProfile.name} 的服务项目，把这条来源内容改写成一段适合抖音的短口播。`
      : null,
    hashtags: isDouyin ? ["本地生活", "皮肤管理"] : ["本地种草", "皮肤管理"],
    ctaText: "想了解自己适合哪种护理，可以先预约一次基础评估。",
    reviewStatus: "editing",
    createdAt: "刚刚",
    updatedAt: "刚刚",
  };
}

export function createImportJob(request: ImportRequest): ImportJobDto {
  return {
    id: `job-mock-${Date.now()}`,
    platform: request.platform,
    importType: request.importType,
    status: request.options?.includeComments ? "running" : "pending",
    inputUrl: request.url,
    totalItems: request.importType === "creator" ? request.options?.maxItems ?? 20 : 1,
    successItems: 0,
    errorSummary: null,
    createdAt: "刚刚",
    finishedAt: null,
  };
}

export function getSourceItem(sourceItemId: string) {
  return sourceItems.find((item) => item.id === sourceItemId) ?? sourceItems[0];
}

export function getComments(sourceItemId: string) {
  return importedComments.filter((comment) => comment.sourceItemId === sourceItemId);
}

export function getDraftBundle(draftId: string): DraftBundle {
  const draft = contentDrafts.find((item) => item.id === draftId) ?? contentDrafts[0];
  const sourceItem = getSourceItem(draft.sourceItemId);
  const variants = contentVariants.filter((variant) => variant.draftId === draft.id);

  return {
    draft,
    variants: variants.length > 0 ? variants : [createFallbackVariant(sourceItem, draft.id)],
    sourceItem,
  };
}

export function rewriteSourceItem(sourceItemId: string): RewriteResult {
  const sourceItem = getSourceItem(sourceItemId);
  const draft =
    contentDrafts.find((item) => item.sourceItemId === sourceItem.id) ??
    createFallbackDraft(sourceItem);
  const variants = contentVariants.filter((variant) => variant.draftId === draft.id);

  return {
    draft,
    variants: variants.length > 0 ? variants : [createFallbackVariant(sourceItem, draft.id)],
    sourceItem,
    commentSummary: getCommentSummary(sourceItem.id),
  };
}

export function saveDraft(draftId: string) {
  return {
    ...getDraftBundle(draftId).draft,
    updatedAt: "刚刚",
  };
}
