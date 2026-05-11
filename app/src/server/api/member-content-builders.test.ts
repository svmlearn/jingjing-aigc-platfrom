import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGeneratedArticlePackage,
  buildGeneratedVideoScriptPackage,
  buildProjectIntro,
} from "./member-content-builders.ts";

const strategySnapshot = {
  positioning: "低总价上车项目",
  coreSellingPoints: ["低总价", "地铁通勤", "成熟配套"],
  targetAudiences: ["首套刚需", "本地改善"],
  keyScenes: ["样板间", "地铁口", "商业配套"],
  currentSuggestion: "本周围绕客户预算和通勤焦虑展开。",
  strategyTags: ["低总价上车", "成熟配套"],
  contentCalendarDraft: [],
  articleBrief: {
    workingTitle: "低总价上车",
    angle: "把预算讲清楚",
    callToAction: "私信我预算，我帮你先筛一遍。",
  },
  videoBrief: {
    workingTitle: "看房前先判断",
    hook: "先别急着看房，先看预算和通勤。",
    outcome: "把预算和通勤发我，我帮你判断。",
  },
};

test("buildProjectIntro creates a text-first member home payload", () => {
  const intro = buildProjectIntro({
    merchant: {
      name: "young 项目",
      brandSummary: "主打小户型和通勤效率。",
      regionSummary: "位于成熟生活圈。",
      serviceItems: ["小户型", "两房"],
      defaultCta: ["发预算咨询"],
      address: "杭州",
      industry: "住宅",
    },
    snapshot: strategySnapshot,
    today: { theme: "低总价上车" },
  });

  assert.equal(intro.projectName, "young 项目");
  assert.equal(intro.weeklyFocus, "低总价上车");
  assert.ok(intro.summary.includes("小户型"));
  assert.ok(intro.coreSellingPoints.includes("低总价"));
  assert.ok(intro.usageGuide.some((item) => item.includes("内容日历")));
});

test("buildGeneratedArticlePackage returns ready-to-copy copy and image package", () => {
  const article = buildGeneratedArticlePackage({
    title: "今日图文：低总价上车",
    summary: "解释首套客户为什么先看总价。",
    snapshot: strategySnapshot,
    materialHints: ["样板间实景"],
    imageMaterials: [
      {
        id: "material-1",
        merchantId: "merchant-1",
        platform: "xiaohongshu",
        materialType: "article",
        sourceKind: "uploaded",
        usageType: "image_asset",
        retrievalTargets: ["article_image_asset"],
        status: "ready",
        title: "样板间",
        description: "客厅实景",
        originalUrl: "https://example.com/room.jpg",
        creatorName: null,
        engagementLabel: null,
        analysisPayload: {},
        createdAt: "2026-05-11T00:00:00.000Z",
        updatedAt: "2026-05-11T00:00:00.000Z",
      },
    ],
    seed: 1,
  });

  assert.match(article.body, /今日图文：低总价上车/);
  assert.ok(article.hashtags.includes("低总价上车"));
  assert.equal(article.cta, "私信我预算，我帮你先筛一遍。");
  assert.equal(article.imageAssets[0]?.url, "https://example.com/room.jpg");
  assert.ok(article.imageBriefs.length >= 3);
});

test("buildGeneratedVideoScriptPackage returns generated shot script and upload checklist", () => {
  const script = buildGeneratedVideoScriptPackage({
    title: "今日视频：看房前先判断",
    summary: "先讲预算和通勤，再引导私信。",
    snapshot: strategySnapshot,
    materialHints: ["地铁口素材"],
    seed: 2,
  });

  assert.equal(script.hook, "先别急着看房，先看预算和通勤。");
  assert.equal(script.scenes.length, 4);
  assert.ok(script.scenes.every((scene) => scene.materialSlot.length > 0));
  assert.equal(script.cta, "把预算和通勤发我，我帮你判断。");
  assert.ok(script.materialChecklist.includes("本人开场口播"));
});
