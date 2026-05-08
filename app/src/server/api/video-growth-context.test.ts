import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVideoScriptContext,
  buildVideoScriptCandidates,
} from "./video-growth-context.ts";

const session = {
  id: "session-1",
  summaryText: "用户希望提高 AI 产品咨询前的信任感。",
  strategySnapshot: {
    positioning: "AI 产品设计咨询顾问",
    coreSellingPoints: ["产品判断", "方案设计"],
    targetAudiences: ["需要落地 AI 产品的团队"],
    keyScenes: ["AI 产品需求拆解"],
    currentSuggestion: "先建立专业信任，再引导预约沟通。",
    strategyTags: ["信任建立"],
    contentCalendarDraft: [],
    articleBrief: null,
    videoBrief: {
      workingTitle: "AI 产品落地前先问清这 3 件事",
      hook: "AI 产品不是先堆功能。",
      outcome: "预约一次需求诊断",
    },
  },
};

const merchant = {
  name: "young",
  industry: "AI 产品设计咨询",
  serviceItems: ["AI 产品设计咨询"],
  defaultCta: ["预约一次需求诊断"],
  toneStyle: "专业、温柔、可信",
  forbiddenWords: ["保证成功"],
};

test("buildVideoScriptContext includes consultation context for video drafting", () => {
  const scriptContext = buildVideoScriptContext({
    merchant,
    session,
    strategyAssetMarkdown: "# 用户策略资产\n\n## 当前定位\nAI 产品设计咨询顾问",
    extraRequirement: "更强调专业信任感",
    materialContext: {
      referenceId: "reference-1",
      materialId: "material-1",
      title: "产品案例讲解视频",
    },
    strategyTag: "信任建立",
    selectedCalendarItem: {
      id: "calendar-video-1",
      dayLabel: "周三",
      contentType: "video",
      strategyTag: "信任建立",
      title: "AI 产品需求拆解",
      summary: "展示一次需求判断、方案取舍和可落地边界。",
    },
  });

  assert.ok(scriptContext.contextDigest);
  assert.ok(scriptContext.strategy);
  assert.ok(scriptContext.critique);
  assert.ok(Array.isArray(scriptContext.scriptCandidates));
  assert.equal(scriptContext.strategy.platformStrategy.platform, "douyin");
  assert.equal(scriptContext.strategy.platformStrategy.format, "vertical_short_video");
  assert.equal(scriptContext.critique.passForDrafting, true);
  assert.match(
    scriptContext.contextDigest.consultationSummary.strategyAssetMarkdown ?? "",
    /用户策略资产/,
  );
  assert.deepEqual(scriptContext.contextDigest.selectedCalendarItem, {
    id: "calendar-video-1",
    contentType: "video",
    strategyTag: "信任建立",
    title: "AI 产品需求拆解",
    dayLabel: "周三",
    summary: "展示一次需求判断、方案取舍和可落地边界。",
  });
  assert.doesNotMatch(JSON.stringify(scriptContext), /本地生活|门店|到店/);
});

test("buildVideoScriptCandidates does not create deterministic script variants", () => {
  const scriptContext = buildVideoScriptContext({
    merchant,
    session,
    extraRequirement: null,
    materialContext: null,
    strategyTag: null,
  });

  const candidates = buildVideoScriptCandidates({
    merchantName: merchant.name,
    session,
    scriptContext,
    extraRequirement: null,
    material: null,
  });

  assert.deepEqual(
    candidates,
    [],
  );
});

test("buildVideoScriptContext marks missing context instead of filling industry defaults", () => {
  const scriptContext = buildVideoScriptContext({
    merchant: {
      ...merchant,
      serviceItems: [],
      defaultCta: [],
    },
    session: {
      id: "session-empty",
      summaryText: null,
      strategySnapshot: {
        positioning: "",
        coreSellingPoints: [],
        targetAudiences: [],
        keyScenes: [],
        currentSuggestion: "",
        strategyTags: [],
        contentCalendarDraft: [],
        articleBrief: null,
        videoBrief: null,
      },
    },
    extraRequirement: null,
    materialContext: null,
    strategyTag: null,
  });

  assert.equal(scriptContext.critique.passForDrafting, false);
  assert.deepEqual(scriptContext.scriptCandidates, []);
  assert.deepEqual(scriptContext.critique.missingInputs, [
    "targetAudiences",
    "coreSellingPoints",
    "keyScenes",
    "cta",
    "videoHookOrTopic",
  ]);
  assert.doesNotMatch(JSON.stringify(scriptContext), /本地生活|门店|到店|私信预约体验/);
});
