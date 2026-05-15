#!/usr/bin/env node

const appBaseUrl = (process.env.APP_BASE_URL?.trim() || "http://127.0.0.1:3000").replace(
  /\/+$/,
  "",
);
const workerSecret = process.env.CONTENT_GENERATION_WORKER_SECRET?.trim() ?? "";
const pollIntervalMs = readPositiveIntEnv("CONTENT_GENERATION_WORKER_POLL_MS", 10_000);
const idleIntervalMs = readPositiveIntEnv("CONTENT_GENERATION_WORKER_IDLE_MS", 30_000);
const requestTimeoutMs = readPositiveIntEnv("CONTENT_GENERATION_WORKER_REQUEST_TIMEOUT_MS", 960_000);
const runOnce = isTruthy(process.env.CONTENT_GENERATION_WORKER_RUN_ONCE);

console.info(
  JSON.stringify({
    event: "content_generation_worker_started",
    appBaseUrl,
    mode: runOnce ? "run_once" : "loop",
    pollIntervalMs,
    idleIntervalMs,
    requestTimeoutMs,
    concurrency: 1,
  }),
);

while (true) {
  const startedAt = Date.now();
  const result = await runNextJob().catch((error) => ({
    ok: false,
    error: error instanceof Error ? error.message : "Unknown worker error.",
  }));

  if (!result.ok) {
    console.error(
      JSON.stringify({
        event: "content_generation_worker_request_failed",
        error: result.error,
      }),
    );
    if (runOnce) {
      process.exitCode = 1;
      break;
    }
    await sleep(idleIntervalMs);
    continue;
  }

  const body = result.body;
  const processed = body?.processed === true;
  const job = toRecord(body?.job);
  console.info(
    JSON.stringify({
      event: processed ? "content_generation_job_processed" : "content_generation_worker_idle",
      processed,
      jobId: readString(job.id),
      status: readString(job.status),
      currentStage: readString(job.currentStage),
      elapsedMs: Date.now() - startedAt,
    }),
  );

  if (runOnce) {
    break;
  }

  await sleep(processed ? pollIntervalMs : idleIntervalMs);
}

async function runNextJob() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const headers = {
      "content-type": "application/json",
    };
    if (workerSecret) {
      headers["x-content-generation-worker-secret"] = workerSecret;
    }

    const response = await fetch(`${appBaseUrl}/api/content-generation/jobs/run-next`, {
      method: "POST",
      headers,
      body: "{}",
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        error: `run-next HTTP ${response.status}: ${JSON.stringify(body)}`,
      };
    }

    return { ok: true, body };
  } finally {
    clearTimeout(timeout);
  }
}

function readPositiveIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
