import assert from "node:assert/strict";
import test from "node:test";

import {
  attachGuidanceToContentCalendar,
  buildMerchantKnowledgeCalendarGuidance,
  collectContentCalendarGuidanceSummary,
  collectContentCalendarKnowledgeRefs,
  normalizeContentCalendarGuidance,
} from "./content-calendar-guidance.ts";

import type { StrategySnapshotDto } from "../contracts/consultation.ts";
import type { KnowledgeSearchMatchDto } from "../contracts/knowledge.ts";

const snapshot: StrategySnapshotDto = {
  positioning: "本地改善型项目",
  coreSellingPoints: ["真实项目卖点", "成熟配套"],
  targetAudiences: ["本地换房客户"],
  keyScenes: ["项目现场实拍"],
  currentSuggestion: "围绕项目资料做团队选题。",
  strategyTags: ["低总价", "配套"],
  contentCalendarDraft: [],
  articleBrief: null,
  videoBrief: null,
};

test("merchant knowledge matches are distilled into calendar guidance", () => {
  const guidance = buildMerchantKnowledgeCalendarGuidance({
    snapshot,
    matches: [
      buildMatch({
        chunkId: "chunk-1",
        documentId: "doc-1",
        documentTitle: "项目资料",
        scope: "merchant",
        content: "项目真实卖点是地铁口和成熟商业配套。客户最关心通勤和首付压力。",
      }),
      buildMatch({
        chunkId: "platform-1",
        documentId: "platform-doc",
        documentTitle: "平台方法论",
        scope: "platform",
        content: "平台通用方法论不应该作为用户项目资料写入。",
      }),
    ],
  });

  assert.equal(guidance?.knowledgeRefs.length, 1);
  assert.equal(guidance?.knowledgeRefs[0]?.chunkId, "chunk-1");
  assert.match(guidance?.mustUseFacts.join(" ") ?? "", /项目真实卖点/);
  assert.match(guidance?.assetCapabilityHints?.join(" ") ?? "", /项目现场实拍/);
  assert.match(guidance?.shotConstraints?.join(" ") ?? "", /高空航拍/);
  assert.equal(guidance?.retrievalTrace?.[0]?.chunkId, "chunk-1");

  const calendar = attachGuidanceToContentCalendar({
    guidance,
    calendar: [
      {
        id: "calendar-1",
        dayLabel: "本周",
        contentType: "article",
        strategyTag: "低总价",
        title: "低总价图文",
        summary: "围绕项目资料做小红书图文。",
      },
    ],
  });
  const refs = collectContentCalendarKnowledgeRefs(calendar);
  const summary = collectContentCalendarGuidanceSummary(calendar);

  assert.equal(calendar[0]?.guidance?.knowledgeRefs[0]?.documentId, "doc-1");
  assert.equal(refs[0]?.source, "merchant_knowledge_base");
  assert.deepEqual(refs[0]?.retrievalTargets, ["copy_context", "script_context"]);
  assert.match(summary?.mustUseFacts.join(" ") ?? "", /成熟配套/);
  assert.match(summary?.assetCapabilityHints.join(" ") ?? "", /项目现场实拍/);
  assert.match(summary?.shotConstraints.join(" ") ?? "", /高空航拍/);
  assert.equal(summary?.retrievalTrace[0]?.documentId, "doc-1");
});

test("calendar guidance normalization preserves compact knowledge refs", () => {
  const guidance = normalizeContentCalendarGuidance({
    source: "consultation_knowledge_distillation_v1",
    mustUseFacts: ["A", "A", "B"],
    sellingPointHints: [],
    audienceHints: [],
    contentAngles: ["选题角度"],
    complianceNotes: [],
    materialHints: [],
    shotConstraints: ["只能用项目现场实拍", "只能用项目现场实拍"],
    assetCapabilityHints: ["样板间", "样板间"],
    retrievalTrace: [
      {
        source: "keyword_search",
        documentId: "doc-1",
        chunkId: "chunk-1",
        documentTitle: "项目资料",
        score: 0.88,
      },
      {
        source: "keyword_search",
        documentId: "doc-1",
        chunkId: "chunk-1",
        documentTitle: "重复资料",
        score: 0.8,
      },
    ],
    knowledgeRefs: [
      {
        id: "chunk-1",
        source: "merchant_knowledge_base",
        title: "项目资料",
        summary: "项目资料摘要",
        chunkId: "chunk-1",
      },
      {
        id: "chunk-1",
        source: "merchant_knowledge_base",
        title: "项目资料",
        summary: "重复片段",
        chunkId: "chunk-1",
      },
    ],
  });

  assert.deepEqual(guidance?.mustUseFacts, ["A", "B"]);
  assert.equal(guidance?.knowledgeRefs.length, 1);
  assert.deepEqual(guidance?.shotConstraints, ["只能用项目现场实拍"]);
  assert.deepEqual(guidance?.assetCapabilityHints, ["样板间"]);
  assert.equal(guidance?.retrievalTrace?.length, 1);
});

function buildMatch(
  input: Pick<
    KnowledgeSearchMatchDto,
    "chunkId" | "documentId" | "documentTitle" | "scope" | "content"
  >,
): KnowledgeSearchMatchDto {
  return {
    ...input,
    sourceName: null,
    merchantId: input.scope === "merchant" ? "merchant-1" : null,
    score: 0.9,
    chunkIndex: 0,
    metadata: {},
  };
}
