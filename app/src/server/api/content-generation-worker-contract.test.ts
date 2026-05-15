import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workerSource = readFileSync(
  new URL("../../../scripts/content-generation-worker.mjs", import.meta.url),
  "utf8",
);
const runNextRouteSource = readFileSync(
  new URL("../../app/api/content-generation/jobs/run-next/route.ts", import.meta.url),
  "utf8",
);
const serviceSource = readFileSync(
  new URL("./content-generation-batch-service.ts", import.meta.url),
  "utf8",
);

test("content generation worker only drives the run-next single-job route", () => {
  assert.match(workerSource, /CONTENT_GENERATION_WORKER_RUN_ONCE/);
  assert.match(workerSource, /api\/content-generation\/jobs\/run-next/);
  assert.match(workerSource, /concurrency: 1/);
  assert.doesNotMatch(workerSource, /Promise\.all/);
  assert.doesNotMatch(workerSource, /\/api\/video-edit-jobs/);
  assert.doesNotMatch(workerSource, /OpenStoryline|FireRed|video-worker/);
});

test("run-next route remains worker-secret protected and processes at most one job", () => {
  assert.match(runNextRouteSource, /CONTENT_GENERATION_WORKER_SECRET/);
  assert.match(runNextRouteSource, /x-content-generation-worker-secret/);
  assert.match(runNextRouteSource, /runNextDifyContentGenerationJob\(\)/);
});

test("Dify transient failures are retryable while missing key is manual", () => {
  assert.match(serviceSource, /isRetryableDifyContentGenerationError/);
  assert.match(serviceSource, /DIFY_API_KEY_MISSING/);
  assert.match(serviceSource, /failed_retryable|retryable/);
  assert.doesNotMatch(serviceSource, /retryable: false/);
});
