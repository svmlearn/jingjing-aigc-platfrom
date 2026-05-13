#!/usr/bin/env node

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

loadEnvFileFromArgs();

const baseUrl = normalizeBaseUrl(
  getArgValue("--base-url") ||
    process.env.DOMESTIC_APP_BASE_URL ||
    process.env.APP_BASE_URL ||
    "",
);
const email = getArgValue("--email") || process.env.DOMESTIC_SMOKE_EMAIL || "";
const password = getArgValue("--password") || process.env.DOMESTIC_SMOKE_PASSWORD || "";
const bucketName = getArgValue("--bucket") || process.env.COS_BUCKET || "";
const fileName = getArgValue("--file-name") || "codex-domestic-api-smoke.mp4";
const withUploadIntent =
  hasFlag("--with-upload-intent") ||
  normalizeBooleanFlag(process.env.DOMESTIC_SMOKE_WITH_UPLOAD_INTENT) === true;

const missing = [
  ["baseUrl", baseUrl],
  ["email", email],
  ["password", password],
  ["bucket", bucketName],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  writeReport(
    {
      status: "missing_input",
      missing,
      acceptedSources: {
        baseUrl: ["--base-url", "DOMESTIC_APP_BASE_URL", "APP_BASE_URL"],
        email: ["--email", "DOMESTIC_SMOKE_EMAIL"],
        password: ["--password", "DOMESTIC_SMOKE_PASSWORD"],
        bucket: ["--bucket", "COS_BUCKET"],
      },
    },
    2,
  );
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

  const uploadIntent = withUploadIntent
    ? await postJson({
        baseUrl,
        path: "/api/media/upload-intents",
        cookie: login.cookie,
        body: {
          ownerType: "content_draft",
          ownerId: draft.id,
          assetType: "video",
          fileName,
          mimeType: "video/mp4",
          sizeBytes: 1024,
        },
      })
    : null;
  const uploadIntentPayload = uploadIntent?.body?.uploadIntent ?? null;
  const storageKey =
    typeof uploadIntentPayload?.cosKey === "string"
      ? uploadIntentPayload.cosKey
      : [
          "draft-inputs",
          draft.merchantId,
          draft.id,
          `${Date.now()}-${sanitizeFileName(fileName)}`,
        ].join("/");
  const resolvedBucket =
    typeof uploadIntentPayload?.bucket === "string" ? uploadIntentPayload.bucket : bucketName;
  const mediaComplete = await postJson({
    baseUrl,
    path: "/api/media/complete",
    cookie: login.cookie,
    body: {
      ownerType: "content_draft",
      ownerId: draft.id,
      assetType: "video",
      storageProvider: "tencent_cos",
      bucketName: resolvedBucket,
      storageKey,
      mimeType: "video/mp4",
      sizeBytes: 1024,
      etag: "domestic-api-smoke-etag",
      sortOrder: 0,
    },
  });
  const jobCreate = await postJson({
    baseUrl,
    path: "/api/video-edit-jobs",
    cookie: login.cookie,
    body: {
      contentVariantId: variant.id,
      instructionText: "domestic api smoke job",
    },
  });
  const job = jobCreate.body?.job;
  const inputAssets = Array.isArray(job?.inputPayload?.input_assets)
    ? job.inputPayload.input_assets
    : [];
  const passed =
    login.status === 303 &&
    testDraft.status === 201 &&
    (!withUploadIntent || uploadIntent?.status === 201) &&
    mediaComplete.status === 201 &&
    jobCreate.status === 201 &&
    job?.status === "pending" &&
    job?.inputPayload?.render_mode === "asset_driven" &&
    inputAssets.length > 0;

  writeReport(
    {
      status: passed ? "ok" : "failed",
      baseUrl,
      loginStatus: login.status,
      testDraftStatus: testDraft.status,
      uploadIntentStatus: uploadIntent?.status ?? "skipped",
      mediaCompleteStatus: mediaComplete.status,
      jobCreateStatus: jobCreate.status,
      draftId: draft.id,
      contentVariantId: variant.id,
      mediaAssetId: mediaComplete.body?.asset?.id ?? null,
      jobId: job?.id ?? null,
      jobStatus: job?.status ?? null,
      renderMode: job?.inputPayload?.render_mode ?? null,
      inputAssetCount: inputAssets.length,
      uploadIntentKey:
        typeof uploadIntentPayload?.cosKey === "string" ? uploadIntentPayload.cosKey : null,
      errorCodes: compact([
        testDraft.body?.error?.code,
        uploadIntent?.body?.error?.code,
        mediaComplete.body?.error?.code,
        jobCreate.body?.error?.code,
      ]),
      note: withUploadIntent
        ? "API smoke with upload-intent check. It does not upload bytes to COS, run worker, verify final.mp4, or replace mobile browser e2e."
        : "API smoke only. It does not upload bytes to COS, run worker, verify final.mp4, or replace mobile browser e2e.",
    },
    passed ? 0 : 1,
  );
} catch (error) {
  writeReport(
    {
      status: "error",
      message: error instanceof Error ? error.message : "Domestic video chain API smoke failed.",
    },
    1,
  );
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

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/g, "");
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

function normalizeBooleanFlag(value) {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return null;
}

function sanitizeFileName(value) {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "smoke.mp4";
}

function compact(values) {
  return values.filter((value) => typeof value === "string" && value.length > 0);
}

function writeReport(report, exitCode) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(exitCode);
}
