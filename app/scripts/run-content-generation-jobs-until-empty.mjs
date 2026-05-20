#!/usr/bin/env node

import { setTimeout as delay } from "node:timers/promises";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

loadEnvFileFromArgs();

const baseUrl = normalizeBaseUrl(
  getArgValue("--base-url") ||
    process.env.DOMESTIC_APP_BASE_URL ||
    process.env.APP_BASE_URL ||
    "",
);
const maxJobs = readPositiveInt(getArgValue("--max-jobs") || process.env.CONTENT_GENERATION_MAX_JOBS, 50);
const delayMs = readPositiveInt(getArgValue("--delay-ms") || process.env.CONTENT_GENERATION_DELAY_MS, 500);
const workerSecret = process.env.CONTENT_GENERATION_WORKER_SECRET?.trim() ?? "";

if (!baseUrl) {
  writeReport(
    {
      status: "missing_input",
      missing: ["baseUrl"],
      acceptedSources: ["--base-url", "DOMESTIC_APP_BASE_URL", "APP_BASE_URL"],
    },
    2,
  );
}

const report = {
  status: "running",
  baseUrl,
  workerSecret: workerSecret ? "SET" : "MISSING",
  maxJobs,
  processedCount: 0,
  emptyQueue: false,
  jobs: [],
};

try {
  while (report.processedCount < maxJobs) {
    const result = await runNextJob();

    if (!result.ok) {
      report.status = "failed";
      report.httpStatus = result.status;
      report.errorCode = result.body?.error?.code ?? null;
      report.errorMessagePresent = Boolean(result.body?.error?.message);
      writeReport(report, 1);
    }

    if (!result.body?.processed) {
      report.status = "ok";
      report.emptyQueue = true;
      writeReport(report, 0);
    }

    report.processedCount += 1;
    report.jobs.push(sanitizeJob(result.body.job));

    if (delayMs > 0) {
      await delay(delayMs);
    }
  }

  report.status = "max_jobs_reached";
  writeReport(report, 0);
} catch (error) {
  report.status = "error";
  report.message = error instanceof Error ? error.message : "Content generation worker failed.";
  writeReport(report, 1);
}

async function runNextJob() {
  const headers = {
    "Content-Type": "application/json",
  };

  if (workerSecret) {
    headers["x-content-generation-worker-secret"] = workerSecret;
  }

  const response = await fetch(`${baseUrl}/api/content-generation/jobs/run-next`, {
    method: "POST",
    headers,
  });
  const body = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

function sanitizeJob(job) {
  if (!job || typeof job !== "object") {
    return null;
  }

  return {
    id: job.id ?? null,
    batchId: job.batchId ?? null,
    memberUserId: job.memberUserId ?? null,
    dailyTaskId: job.dailyTaskId ?? null,
    taskDate: job.taskDate ?? null,
    status: job.status ?? null,
    currentStage: job.currentStage ?? null,
    workflowProvider: job.workflowProvider ?? null,
    workflowVersion: job.workflowVersion ?? null,
    contentDraftId: job.contentDraftId ?? null,
    articleVariantId: job.articleVariantId ?? null,
    videoVariantId: job.videoVariantId ?? null,
    errorMessagePresent: Boolean(job.errorMessage),
    updatedAt: job.updatedAt ?? null,
  };
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? "" : process.argv[index + 1] || "";
}

function readPositiveInt(rawValue, fallback) {
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(value) {
  const trimmed = value.trim();
  return trimmed.replace(/\/+$/, "");
}

function writeReport(payload, exitCode) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(exitCode);
}
