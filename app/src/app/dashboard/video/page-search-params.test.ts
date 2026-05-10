import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDashboardVideoSearchParams } from "./page-search-params.ts";

test("normalizeDashboardVideoSearchParams preserves video workbench route parameters", () => {
  const params = normalizeDashboardVideoSearchParams({
    source: "consultation_calendar",
    sessionId: "session_1",
    dailyTaskId: "daily_task_1",
    calendarItemId: "calendar_1",
    draftId: "draft_1",
    variantId: "variant_1",
    jobId: "job_1",
    materialId: "material_1",
    materialReferenceId: "reference_1",
    strategy: "trust",
    testMode: "video_chain",
  });

  assert.deepEqual(params, {
    source: "consultation_calendar",
    sessionId: "session_1",
    dailyTaskId: "daily_task_1",
    calendarItemId: "calendar_1",
    draftId: "draft_1",
    variantId: "variant_1",
    jobId: "job_1",
    materialId: "material_1",
    materialReferenceId: "reference_1",
    strategyTag: "trust",
    testMode: "video_chain",
  });
});
