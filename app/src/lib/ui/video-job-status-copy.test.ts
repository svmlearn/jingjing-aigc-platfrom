import assert from "node:assert/strict";
import test from "node:test";

import { buildVideoJobStatusCopy } from "./video-job-status-copy.ts";

test("buildVideoJobStatusCopy flags stale running jobs with a clear next action", () => {
  const copy = buildVideoJobStatusCopy({
    status: "running",
    currentStage: "openstoryline_rendering",
    progressPct: 50,
    updatedAt: "2026-04-30T01:00:00.000Z",
    createdAt: "2026-04-30T00:55:00.000Z",
    now: "2026-04-30T01:16:00.000Z",
    hasResultPreview: false,
  });

  assert.equal(copy.tone, "warning");
  assert.match(copy.title, /可能卡住/);
  assert.match(copy.detail, /16 分钟/);
  assert.ok(copy.nextAction);
  assert.match(copy.nextAction, /worker|服务/);
});

test("buildVideoJobStatusCopy explains retryable failures", () => {
  const copy = buildVideoJobStatusCopy({
    status: "failed_retryable",
    currentStage: "output_upload_failed",
    progressPct: 80,
    failureReason: "OUTPUT_UPLOAD_FAILED: timeout",
    updatedAt: "2026-04-30T01:00:00.000Z",
    createdAt: "2026-04-30T00:55:00.000Z",
    now: "2026-04-30T01:01:00.000Z",
    hasResultPreview: false,
  });

  assert.equal(copy.tone, "warning");
  assert.match(copy.title, /可以重试/);
  assert.match(copy.detail, /成片上传失败/);
});

test("buildVideoJobStatusCopy warns when a succeeded job has no preview", () => {
  const copy = buildVideoJobStatusCopy({
    status: "succeeded",
    currentStage: "local_demo_completed",
    progressPct: 100,
    updatedAt: "2026-04-30T01:00:00.000Z",
    createdAt: "2026-04-30T00:55:00.000Z",
    now: "2026-04-30T01:01:00.000Z",
    hasResultPreview: false,
  });

  assert.equal(copy.tone, "warning");
  assert.match(copy.title, /没有可预览/);
});
