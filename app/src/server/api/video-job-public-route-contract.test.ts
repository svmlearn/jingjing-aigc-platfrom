import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const apiDir = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(apiDir, "../..");

function readSource(relativePath: string) {
  return readFileSync(resolve(srcDir, relativePath), "utf8");
}

test("video edit job service exposes only public DTOs to ordinary API callers", () => {
  const source = readSource("server/api/video-edit-jobs-service.ts");

  assert.match(source, /import \{ extractPayloadResultAssets, toPublicVideoEditJob \} from "@\/server\/api\/video-job-public-dto";/);
  assert.match(source, /createVideoEditJobForUser[\s\S]{0,260}\): Promise<PublicVideoEditJobDto>/);
  assert.match(source, /listVideoEditJobsForUser[\s\S]{0,260}\): Promise<PublicVideoEditJobDto\[]>/);
  assert.match(source, /getVideoEditJobForUser[\s\S]{0,220}\): Promise<PublicVideoEditJobDto>/);
  assert.match(source, /retryVideoEditJobForUser[\s\S]{0,220}\): Promise<PublicVideoEditJobDto>/);
  assert.match(source, /cancelVideoEditJobForUser[\s\S]{0,220}\): Promise<PublicVideoEditJobDto>/);
});

test("ordinary video job API routes call public service functions instead of repositories", () => {
  const expectations = [
    {
      path: "app/api/video-edit-jobs/route.ts",
      serviceFunctions: ["createVideoEditJobForUser", "listVideoEditJobsForUser"],
    },
    {
      path: "app/api/video-edit-jobs/[id]/route.ts",
      serviceFunctions: ["getVideoEditJobForUser"],
    },
    {
      path: "app/api/video-edit-jobs/[id]/retry/route.ts",
      serviceFunctions: ["retryVideoEditJobForUser"],
    },
    {
      path: "app/api/video-edit-jobs/[id]/cancel/route.ts",
      serviceFunctions: ["cancelVideoEditJobForUser"],
    },
    {
      path: "app/api/member/history/route.ts",
      serviceFunctions: ["listVideoEditJobsForUser"],
    },
    {
      path: "app/api/history/records/route.ts",
      serviceFunctions: ["listVideoEditJobsForUser"],
    },
  ];

  for (const expectation of expectations) {
    const source = readSource(expectation.path);

    for (const serviceFunction of expectation.serviceFunctions) {
      assert.match(source, new RegExp(`\\b${serviceFunction}\\b`), expectation.path);
    }

    assert.doesNotMatch(source, /video-edit-job-repository/, expectation.path);
    assert.doesNotMatch(source, /\bVideoEditJobDto\b/, expectation.path);
  }
});
