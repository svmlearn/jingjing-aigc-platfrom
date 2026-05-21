import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContentCalendarRevisionId,
  markContentCalendarTeamContentGenerated,
  withUpdatedContentCalendarGeneration,
} from "./content-calendar-revision.ts";

import type { ContentCalendarItemDto, StrategySnapshotDto } from "../contracts/consultation.ts";

const calendar: ContentCalendarItemDto[] = [
  {
    id: "fri-video",
    dayLabel: "周五",
    contentType: "video",
    strategyTag: "信任建立",
    title: "老业主亲测：为什么他们反复选择东洲售楼团队？",
    summary: "调用客户访谈片段和签约场景素材。",
  },
];

const snapshot: StrategySnapshotDto = {
  positioning: "房地产项目咨询",
  coreSellingPoints: ["实景素材"],
  targetAudiences: ["改善客户"],
  keyScenes: ["签约"],
  currentSuggestion: "围绕团队信任做日历。",
  strategyTags: ["信任建立"],
  contentCalendarDraft: calendar,
  articleBrief: null,
  videoBrief: null,
};

test("calendar revision tracks generated and modified-after-generation states", () => {
  const generated = markContentCalendarTeamContentGenerated(snapshot, {
    batchId: "batch-1",
    generatedAt: "2026-05-21T12:00:00.000Z",
    generatedByUserId: "user-1",
    generatedJobCount: 6,
  });
  const generatedRevision = buildContentCalendarRevisionId(calendar);

  assert.equal(generated.contentCalendarGeneration?.status, "generated");
  assert.equal(generated.contentCalendarGeneration?.currentRevisionId, generatedRevision);
  assert.equal(generated.contentCalendarGeneration?.generatedFromRevisionId, generatedRevision);
  assert.equal(generated.contentCalendarGeneration?.generatedBatchId, "batch-1");

  const updated = withUpdatedContentCalendarGeneration(generated, [
    {
      ...calendar[0]!,
      title: "老业主亲测：商办投资决策背后的3个关键价值点",
    },
  ]);

  assert.equal(updated.contentCalendarGeneration?.status, "modified_after_generation");
  assert.notEqual(updated.contentCalendarGeneration?.currentRevisionId, generatedRevision);
  assert.equal(updated.contentCalendarGeneration?.generatedFromRevisionId, generatedRevision);
  assert.equal(updated.contentCalendarGeneration?.generatedBatchId, "batch-1");
});
