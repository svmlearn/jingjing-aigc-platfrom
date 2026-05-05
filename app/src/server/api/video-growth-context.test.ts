import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVideoScriptContext,
  buildVideoScriptCandidates,
} from "./video-growth-context.ts";

const session = {
  id: "session-1",
  summaryText: "用户希望提高首次咨询前的信任感。",
  strategySnapshot: {
    positioning: "专业可信的本地门店",
    coreSellingPoints: ["真实环境", "稳定交付"],
    targetAudiences: ["首次咨询前还在比较的用户"],
    keyScenes: ["到店前决策"],
    currentSuggestion: "先建立信任，再引导私信。",
    strategyTags: ["信任建立"],
    contentCalendarDraft: [],
    articleBrief: null,
    videoBrief: {
      workingTitle: "第一次到店前，先看这 3 个细节",
      hook: "不知道怎么判断一家店靠不靠谱？",
      outcome: "私信预约体验",
    },
  },
};

const merchant = {
  name: "静境普拉提",
  industry: "本地生活 / 普拉提门店",
  serviceItems: ["普拉提私教"],
  defaultCta: ["私信预约体验"],
  toneStyle: "专业、温柔、可信",
  forbiddenWords: ["包瘦"],
};

test("buildVideoScriptContext includes consultation context for video drafting", () => {
  const scriptContext = buildVideoScriptContext({
    merchant,
    session,
    strategyAssetMarkdown: "# 商家策略资产\n\n## 当前定位\n专业可信的本地门店",
    extraRequirement: "更强调专业信任感",
    materialContext: {
      referenceId: "reference-1",
      materialId: "material-1",
      title: "门店环境视频",
    },
    strategyTag: "信任建立",
    selectedCalendarItem: {
      id: "calendar-video-1",
      dayLabel: "周三",
      contentType: "video",
      strategyTag: "信任建立",
      title: "门店一镜到底体验",
      summary: "展示门店环境、真实体验流程和用户会感知到的安全感。",
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
    /商家策略资产/,
  );
  assert.deepEqual(scriptContext.contextDigest.selectedCalendarItem, {
    id: "calendar-video-1",
    contentType: "video",
    strategyTag: "信任建立",
    title: "门店一镜到底体验",
    dayLabel: "周三",
    summary: "展示门店环境、真实体验流程和用户会感知到的安全感。",
  });
});

test("buildVideoScriptCandidates creates three traceable video script variants", () => {
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
    candidates.map((candidate) => candidate.candidateType),
    ["safe_conversion", "strong_hook", "trust_expert"],
  );
  for (const candidate of candidates) {
    assert.equal(candidate.strategyTrace.acquisitionGoal, scriptContext.strategy.acquisitionGoal);
    assert.match(candidate.scriptText, /Scene 1/);
    assert.ok(candidate.whyThisWorks.length > 0);
  }
});
