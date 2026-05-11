import type { StrategySnapshotDto } from "../../contracts/consultation.ts";
import type {
  DailyArticleContentPackageDto,
  DailyContentTaskDto,
  DailyProjectIntroDto,
  DailyTaskImageAssetDto,
  DailyVideoScriptPackageDto,
} from "../../contracts/daily-task.ts";
import type { MaterialLibraryItemDto } from "../../contracts/material.ts";

export function buildProjectIntro(input: {
  merchant: {
    name: string;
    brandSummary?: string | null;
    regionSummary?: string | null;
    serviceItems: string[];
    defaultCta: string[];
    address?: string | null;
    industry?: string | null;
  };
  snapshot: StrategySnapshotDto | null;
  today?: Pick<DailyContentTaskDto, "theme"> | null;
}): DailyProjectIntroDto {
  const coreSellingPoints = compactStrings([
    ...(input.snapshot?.coreSellingPoints ?? []),
    input.merchant.brandSummary,
  ]).slice(0, 6);
  const promotedLayouts = compactStrings([
    ...(input.merchant.serviceItems ?? []),
    ...((input.snapshot?.targetAudiences ?? []).length
      ? input.snapshot?.targetAudiences ?? []
      : ["刚需首套", "改善置换", "本地通勤客户"]),
  ]).slice(0, 5);
  const publicInfo = compactStrings([
    input.merchant.regionSummary,
    input.merchant.address ? `项目位置：${input.merchant.address}` : null,
    input.merchant.industry ? `项目类型：${input.merchant.industry}` : null,
    ...(input.snapshot?.keyScenes ?? []).map((scene) => `重点场景：${scene}`),
  ]).slice(0, 6);

  return {
    projectName: input.merchant.name || "当前项目",
    summary:
      input.merchant.brandSummary ||
      input.snapshot?.currentSuggestion ||
      "这是团队当前主推项目。成员端会把项目资料、内容日历和素材策略整理成每天可执行的图文与视频任务。",
    coreSellingPoints: coreSellingPoints.length
      ? coreSellingPoints
      : ["低门槛了解项目价值", "围绕真实客户问题组织表达", "适合手机端快速执行"],
    promotedLayouts: promotedLayouts.length ? promotedLayouts : ["主推户型待补充"],
    publicInfo: publicInfo.length ? publicInfo : ["公开项目信息正在补充中，先按团队内容日历执行。"],
    weeklyFocus:
      input.today?.theme ||
      input.snapshot?.strategyTags[0] ||
      input.snapshot?.currentSuggestion ||
      "本周围绕项目卖点和客户顾虑做稳定曝光。",
    usageGuide: [
      "每天先看内容日历，确认今天要发的图文和要拍的视频。",
      "图文任务直接复制正文和标签，配合系统给出的图片发布。",
      "视频任务按镜头脚本拍素材，上传后点击 AI 剪辑，等待成片预览和下载。",
    ],
    defaultCta: input.merchant.defaultCta.length
      ? input.merchant.defaultCta
      : ["想了解户型和价格，可以私信我。", "评论区留下需求，我帮你看是否适合。"],
  };
}

export function buildGeneratedArticlePackage(input: {
  title: string;
  summary: string;
  snapshot: StrategySnapshotDto | null;
  materialHints: string[];
  imageMaterials: MaterialLibraryItemDto[];
  seed: number;
}): DailyArticleContentPackageDto {
  const sellingPoints = compactStrings(input.snapshot?.coreSellingPoints ?? []).slice(0, 3);
  const scenes = compactStrings(input.snapshot?.keyScenes ?? []).slice(0, 3);
  const hashtags = Array.from(
    new Set(
      compactStrings([
        "小红书买房笔记",
        ...(input.snapshot?.strategyTags ?? []),
        ...(input.snapshot?.targetAudiences ?? []),
      ])
        .map((tag) => tag.replace(/^#/, ""))
        .slice(0, 6),
    ),
  );
  const bodySections = [
    `今天想聊的是：${input.title}。`,
    input.summary,
    sellingPoints.length
      ? `这条内容可以重点讲 ${sellingPoints.join("、")}，不要堆参数，尽量用真实客户能听懂的话。`
      : "这条内容先从客户最关心的问题切入，用简单、确定的表达讲清楚项目价值。",
    scenes.length
      ? `如果你要配图，可以优先选 ${scenes.join("、")} 相关画面。`
      : "配图优先选择项目实景、户型动线、周边配套或看房路上的真实素材。",
    "结尾不要强销售，给用户一个低压力咨询入口。",
  ];

  return {
    title: input.title,
    body: bodySections.join("\n\n"),
    hashtags,
    cta:
      input.snapshot?.articleBrief?.callToAction ||
      "想了解适不适合自己，私信我说预算和通勤范围。",
    coverText: input.title.length > 18 ? input.title.slice(0, 18) : input.title,
    imageAssets: buildImageAssets(input.imageMaterials),
    imageBriefs: buildImageBriefs({
      title: input.title,
      materialHints: input.materialHints,
      scenes,
    }),
    generatedAt: new Date().toISOString(),
  };
}

export function buildGeneratedVideoScriptPackage(input: {
  title: string;
  summary: string;
  snapshot: StrategySnapshotDto | null;
  materialHints: string[];
  seed: number;
}): DailyVideoScriptPackageDto {
  const hook = input.snapshot?.videoBrief?.hook || "如果你正在看这个项目，先别急着问价格，先看这 3 个点。";
  const points = compactStrings([
    ...(input.snapshot?.coreSellingPoints ?? []),
    ...input.materialHints,
    input.summary,
  ]).slice(0, 4);
  const sceneInputs = [
    {
      title: "开场钩子",
      durationSeconds: 6,
      camera: "手机竖屏半身口播，背景可以是项目门头、样板间或通勤路上。",
      spokenText: hook,
      subtitle: "先别急着问价格，先看这 3 个点",
      shootingGuide: "保持人声清晰，前 2 秒直接抛出客户关心的问题。",
      materialSlot: "本人开场口播",
    },
    {
      title: "项目价值",
      durationSeconds: 12,
      camera: "项目实景或样板间横移镜头，必要时配一段口播。",
      spokenText:
        points[0] ||
        "这个项目最值得先看的，是它把预算、通勤和生活配套放在了一个比较均衡的位置。",
      subtitle: points[0] || "预算、通勤、配套更均衡",
      shootingGuide: "拍摄 2 到 3 个能支撑卖点的画面，尽量避免纯空镜。",
      materialSlot: "项目实景 / 样板间素材",
    },
    {
      title: "客户顾虑拆解",
      durationSeconds: 12,
      camera: "对着镜头解释，穿插户型图或周边配套画面。",
      spokenText:
        points[1] ||
        "很多客户会担心后期转手、生活便利和上车压力，建议先把自己的预算和通勤范围列出来再判断。",
      subtitle: points[1] || "先看预算和通勤是否匹配",
      shootingGuide: "用一句真实顾虑开头，再给出判断方法。",
      materialSlot: "口播 + 户型/配套补充素材",
    },
    {
      title: "行动引导",
      durationSeconds: 8,
      camera: "手机竖屏半身，语气放轻，不要像硬广。",
      spokenText:
        input.snapshot?.videoBrief?.outcome ||
        "你可以把预算、首付和通勤位置发我，我帮你先判断这个项目值不值得现场看。",
      subtitle: "发我预算和通勤，我帮你先判断",
      shootingGuide: "结尾看镜头，留 1 秒停顿方便剪辑。",
      materialSlot: "本人收尾口播",
    },
  ];

  return {
    title: input.title,
    hook,
    storyOutline: `围绕「${input.title}」做一条 35-45 秒的竖屏短视频：先抛出客户疑问，再用项目价值和顾虑拆解建立信任，最后引导私信咨询。`,
    targetDurationSeconds: sceneInputs.reduce((sum, scene) => sum + scene.durationSeconds, 0),
    scenes: sceneInputs.map((scene, index) => ({
      id: `scene-${index + 1}`,
      order: index + 1,
      required: true,
      ...scene,
    })),
    cta:
      input.snapshot?.videoBrief?.outcome ||
      "把预算和通勤位置发我，我帮你判断这个项目适不适合。",
    materialChecklist: sceneInputs.map((scene) => scene.materialSlot),
    generatedAt: new Date().toISOString(),
  };
}

function buildImageAssets(materials: MaterialLibraryItemDto[]): DailyTaskImageAssetDto[] {
  return materials.slice(0, 6).map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description ?? item.engagementLabel ?? null,
    url: item.originalUrl ?? null,
    source: item.sourceKind,
  }));
}

function buildImageBriefs(input: {
  title: string;
  materialHints: string[];
  scenes: string[];
}) {
  const defaults = [
    `封面图：${input.title}，少字大标题，突出今日主题。`,
    "项目实景图：优先选择光线稳定、空间感明确的画面。",
    "配套或通勤图：用真实生活场景补足信任感。",
  ];
  const hints = compactStrings([...input.scenes, ...input.materialHints])
    .slice(0, 3)
    .map((hint) => `补充图：围绕「${hint}」选择一张可解释的图片。`);

  return [...defaults, ...hints].slice(0, 6);
}

function compactStrings(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value?.trim()));
}
