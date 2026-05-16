#!/usr/bin/env node

import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

import COS from "cos-nodejs-sdk-v5";
import pg from "pg";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

loadEnvFileFromArgs();

const { Pool } = pg;

const baseUrl = normalizeBaseUrl(
  getArgValue("--base-url") ||
    process.env.DOMESTIC_APP_BASE_URL ||
    process.env.APP_BASE_URL ||
    "",
);
const email = getArgValue("--email") || process.env.DOMESTIC_SMOKE_EMAIL || "";
const password = getArgValue("--password") || process.env.DOMESTIC_SMOKE_PASSWORD || "";
const filePath = getArgValue("--file") || "";
const timeoutSeconds = parsePositiveInt(getArgValue("--timeout-seconds"), 900);
const pollSeconds = parsePositiveInt(getArgValue("--poll-seconds"), 5);
const selfHostedFastPath = hasFlag("--self-hosted-fast-path");
const instructionText = getArgValue("--instruction-text") || "domestic worker smoke job";
const productionConfigJson = getArgValue("--production-config-json");
const productionConfig = productionConfigJson ? parseJsonObjectArg({
  name: "--production-config-json",
  value: productionConfigJson,
}) : null;

const missing = [
  ["baseUrl", baseUrl],
  ["email", email],
  ["password", password],
  ["file", filePath],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  writeReport({ status: "missing_input", missing }, 2);
}

let fileStat;
try {
  fileStat = statSync(filePath);
} catch {
  writeReport({ status: "missing_file", file: filePath }, 2);
}

if (!fileStat.isFile() || fileStat.size <= 0) {
  writeReport({ status: "invalid_file", file: filePath, sizeBytes: fileStat.size }, 2);
}

try {
  const login = await signIn({ baseUrl, email, password });
  const testDraft = await postJson({
    baseUrl,
    path: "/api/content/video-scripts/test-draft",
    cookie: login.cookie,
  });
  const draftBundle = testDraft.body?.draftBundle;
  const draft = draftBundle?.draft;
  const variant = draftBundle?.selectedVariant ?? draftBundle?.variants?.[0] ?? null;

  if (!draft?.id || !draft?.merchantId || !variant?.id) {
    writeReport(
      {
        status: "failed",
        failedStep: "test_draft_shape",
        loginStatus: login.status,
        testDraftStatus: testDraft.status,
        errorCode: testDraft.body?.error?.code ?? null,
      },
      1,
    );
  }

  const body = readFileSync(filePath);
  const uploadIntent = await postJson({
    baseUrl,
    path: "/api/media/upload-intents",
    cookie: login.cookie,
    body: {
      ownerType: "content_draft",
      ownerId: draft.id,
      assetType: "video",
      fileName: basename(filePath),
      mimeType: "video/mp4",
      sizeBytes: body.length,
    },
  });
  const uploadIntentPayload = uploadIntent.body?.uploadIntent ?? null;
  assertUploadIntent(uploadIntentPayload);
  const putResult = await putObjectWithUploadIntent({
    uploadIntent: uploadIntentPayload,
    body,
  });
  const mediaComplete = await postJson({
    baseUrl,
    path: "/api/media/complete",
    cookie: login.cookie,
    body: {
      ownerType: "content_draft",
      ownerId: draft.id,
      assetType: "video",
      storageProvider: "tencent_cos",
      bucketName: uploadIntentPayload.bucket,
      storageKey: uploadIntentPayload.cosKey,
      mimeType: "video/mp4",
      sizeBytes: body.length,
      etag: putResult.etag,
      sortOrder: 0,
    },
  });
  const jobCreate = await postJson({
    baseUrl,
    path: "/api/video-edit-jobs",
    cookie: login.cookie,
    body: {
      contentVariantId: variant.id,
      instructionText,
      ...(productionConfig ? { productionConfig } : {}),
    },
  });
  const jobId = jobCreate.body?.job?.id;

  if (jobCreate.status !== 201 || !jobId) {
    writeReport(
      {
        status: "failed",
        failedStep: "job_create",
        jobCreateStatus: jobCreate.status,
        errorCode: jobCreate.body?.error?.code ?? null,
      },
      1,
    );
  }

  if (selfHostedFastPath) {
    await enableSelfHostedFastPath(jobId);
  }

  const finalJob = await waitForJob({
    baseUrl,
    cookie: login.cookie,
    jobId,
    timeoutSeconds,
    pollSeconds,
  });
  const resultAsset = (finalJob.resultAssets ?? []).find((asset) => asset.assetType === "video") ??
    (finalJob.resultAssets ?? [])[0] ??
    null;
  const preview = resultAsset?.signedPreviewUrl
    ? await fetchPreview({
        baseUrl,
        cookie: login.cookie,
        signedPreviewUrl: resultAsset.signedPreviewUrl,
      })
    : null;
  const passed =
    login.status === 303 &&
    testDraft.status === 201 &&
    uploadIntent.status === 201 &&
    mediaComplete.status === 201 &&
    jobCreate.status === 201 &&
    finalJob.status === "succeeded" &&
    Boolean(resultAsset?.id) &&
    Boolean(preview?.ok) &&
    (preview?.bytes ?? 0) > 0;

  writeReport(
    {
      status: passed ? "ok" : "failed",
      baseUrl,
      loginStatus: login.status,
      testDraftStatus: testDraft.status,
      uploadIntentStatus: uploadIntent.status,
      mediaCompleteStatus: mediaComplete.status,
      jobCreateStatus: jobCreate.status,
      draftId: draft.id,
      contentVariantId: variant.id,
      mediaAssetId: mediaComplete.body?.asset?.id ?? null,
      jobId,
      finalJobStatus: finalJob.status,
      finalStage: finalJob.currentStage ?? null,
      resultAssetCount: finalJob.resultAssets?.length ?? 0,
      previewStatus: preview?.status ?? null,
      previewBytes: preview?.bytes ?? null,
      failureReason: finalJob.failureReason ?? null,
      uploadIntentKey: uploadIntentPayload.cosKey,
      selfHostedFastPath,
      productionConfigProvided: Boolean(productionConfig),
    },
    passed ? 0 : 1,
  );
} catch (error) {
  writeReport(
    {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Domestic video chain worker smoke failed.",
    },
    1,
  );
}

async function enableSelfHostedFastPath(jobId) {
  const databaseUrl =
    process.env.APP_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.LOCAL_REAL_CHAIN_DB_URL?.trim() ||
    "";

  if (!databaseUrl) {
    throw new Error("APP_DATABASE_URL is required for --self-hosted-fast-path.");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: resolveSslConfig(),
    max: 1,
  });

  try {
    const current = await pool.query(
      `
      select input_payload, runtime_payload
      from public.video_edit_jobs
      where id = $1
      limit 1
      `,
      [jobId],
    );
    const row = current.rows[0];

    if (!row) {
      throw new Error(`Video job ${jobId} not found for fast path patch.`);
    }

    const inputPayload = row.input_payload && typeof row.input_payload === "object"
      ? row.input_payload
      : {};
    const runtimePayload = row.runtime_payload && typeof row.runtime_payload === "object"
      ? row.runtime_payload
      : {};
    await pool.query(
      `
      update public.video_edit_jobs
      set input_payload = $2::jsonb,
          runtime_payload = $3::jsonb,
          updated_at = timezone('utc', now())
      where id = $1
      `,
      [
        jobId,
        JSON.stringify({
          ...inputPayload,
          executionMode: "self_hosted_rehearsal_fast_path",
          productionDirective: {
            ...(inputPayload.productionDirective ?? {}),
            desiredOutputs: ["final_video"],
          },
        }),
        JSON.stringify({
          ...runtimePayload,
          self_hosted_rehearsal_fast_path: true,
        }),
      ],
    );
  } finally {
    await pool.end();
  }
}

async function signIn(input) {
  const form = new URLSearchParams();
  form.set("email", input.email);
  form.set("password", input.password);
  form.set("next", "/dashboard/video");

  const response = await fetch(`${input.baseUrl}/api/auth/merchant-login`, {
    method: "POST",
    body: form,
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  const cookie = extractCookieHeader(response);

  if (!cookie) {
    throw new Error(`Login did not set a session cookie. status=${response.status}`);
  }

  return {
    status: response.status,
    cookie,
  };
}

async function postJson(input) {
  const response = await fetch(`${input.baseUrl}${input.path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: input.cookie,
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
  const bodyText = await response.text();
  const body = bodyText ? JSON.parse(bodyText) : null;

  return {
    status: response.status,
    body,
  };
}

async function getJson(input) {
  const response = await fetch(`${input.baseUrl}${input.path}`, {
    headers: {
      Cookie: input.cookie,
    },
  });
  const bodyText = await response.text();
  const body = bodyText ? JSON.parse(bodyText) : null;

  return {
    status: response.status,
    body,
  };
}

async function waitForJob(input) {
  const startedAt = Date.now();
  let lastJob = null;

  while (Date.now() - startedAt <= input.timeoutSeconds * 1000) {
    const result = await getJson({
      baseUrl: input.baseUrl,
      path: `/api/video-edit-jobs/${encodeURIComponent(input.jobId)}`,
      cookie: input.cookie,
    });
    lastJob = result.body?.job ?? null;

    if (lastJob?.status === "succeeded") {
      return lastJob;
    }

    if (
      lastJob?.status === "failed_retryable" ||
      lastJob?.status === "failed_manual" ||
      lastJob?.status === "cancelled"
    ) {
      return lastJob;
    }

    await sleep(input.pollSeconds * 1000);
  }

  throw new Error(
    `Timed out waiting for job ${input.jobId}. Last status=${lastJob?.status ?? "unknown"}`,
  );
}

async function fetchPreview(input) {
  const url = input.signedPreviewUrl.startsWith("http")
    ? input.signedPreviewUrl
    : `${input.baseUrl}${input.signedPreviewUrl}`;
  const response = await fetch(url, {
    headers: {
      Cookie: input.cookie,
    },
    redirect: "follow",
  });
  const bytes = Buffer.from(await response.arrayBuffer()).length;

  return {
    ok: response.ok,
    status: response.status,
    bytes,
  };
}

function assertUploadIntent(uploadIntent) {
  const missing = [
    "bucket",
    "region",
    "cosKey",
    "TmpSecretId",
    "TmpSecretKey",
    "Token",
  ].filter((field) => !uploadIntent?.[field]);

  if (missing.length > 0) {
    throw new Error(`Upload intent missing fields: ${missing.join(", ")}`);
  }
}

function putObjectWithUploadIntent(input) {
  const client = new COS({
    SecretId: input.uploadIntent.TmpSecretId,
    SecretKey: input.uploadIntent.TmpSecretKey,
    SecurityToken: input.uploadIntent.Token,
  });

  return new Promise((resolve, reject) => {
    client.putObject(
      {
        Bucket: input.uploadIntent.bucket,
        Region: input.uploadIntent.region,
        Key: input.uploadIntent.cosKey,
        Body: input.body,
        ContentType: "video/mp4",
      },
      (error, data) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({ etag: data?.ETag ?? null });
      },
    );
  });
}

function extractCookieHeader(response) {
  const getSetCookie = response.headers.getSetCookie?.() ?? [];
  const rawCookies =
    getSetCookie.length > 0
      ? getSetCookie
      : response.headers.get("set-cookie")
        ? [response.headers.get("set-cookie")]
        : [];

  return rawCookies
    .map((cookie) => cookie?.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return "";
  }

  return process.argv[index + 1] ?? "";
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/g, "");
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseJsonObjectArg(input) {
  try {
    const parsed = JSON.parse(input.value);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      writeReport(
        {
          status: "invalid_input",
          argument: input.name,
          message: `${input.name} must be a JSON object.`,
        },
        2,
      );
    }

    return parsed;
  } catch (error) {
    writeReport(
      {
        status: "invalid_input",
        argument: input.name,
        message:
          error instanceof Error
            ? error.message
            : `${input.name} must be valid JSON.`,
      },
      2,
    );
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveSslConfig() {
  const raw =
    process.env.APP_DATABASE_SSL ?? process.env.DATABASE_SSL ?? process.env.LOCAL_REAL_CHAIN_DB_SSL;

  if (raw === "disable" || raw === "false") {
    return false;
  }

  if (raw === "require" || raw === "true") {
    return { rejectUnauthorized: false };
  }

  return undefined;
}

function writeReport(report, exitCode) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(exitCode);
}
