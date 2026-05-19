#!/usr/bin/env node

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
const provider = normalizeStorageProvider(
  getArgValue("--provider") || process.env.STORAGE_PROVIDER?.trim() || "aliyun_oss",
);
const bucketName = getArgValue("--bucket") || defaultBucketForProvider(provider);
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
        bucket:
          provider === "aliyun_oss"
            ? ["--bucket", "ALIYUN_OSS_BUCKET"]
            : ["--bucket", "COS_BUCKET"],
        provider: ["--provider", "STORAGE_PROVIDER"],
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
  const uploadIntentShape = inspectUploadIntentShape(uploadIntentPayload, provider);
  const signedPut = await performSignedPutIfAvailable({
    uploadIntent: uploadIntentPayload,
    provider,
  });
  const storageKey =
    firstString(
      uploadIntentPayload?.storageKey,
      uploadIntentPayload?.uploadKey,
      uploadIntentPayload?.cosKey,
    ) ??
    [
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
      storageProvider: provider,
      bucketName: resolvedBucket,
      storageKey,
      mimeType: "video/mp4",
      sizeBytes: 1024,
      etag: signedPut.etag ?? "domestic-api-smoke-etag",
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
  const persistedJobPayload = await inspectPersistedJobInputPayload(job?.id);
  const publicInputPayload =
    job?.inputPayload && typeof job.inputPayload === "object" ? job.inputPayload : {};
  const inputAssets = Array.isArray(publicInputPayload.input_assets)
    ? publicInputPayload.input_assets
    : persistedJobPayload.inputAssets;
  const renderMode = publicInputPayload.render_mode ?? persistedJobPayload.renderMode;
  const passed =
    login.status === 303 &&
    testDraft.status === 201 &&
    (!withUploadIntent || (uploadIntent?.status === 201 && uploadIntentShape.complete)) &&
    (!signedPut.attempted || signedPut.status === 200) &&
    mediaComplete.status === 201 &&
    jobCreate.status === 201 &&
    job?.status === "pending" &&
    renderMode === "asset_driven" &&
    inputAssets.length > 0;

  writeReport(
    {
      status: passed ? "ok" : "failed",
      baseUrl,
      provider,
      loginStatus: login.status,
      testDraftStatus: testDraft.status,
      uploadIntentStatus: uploadIntent?.status ?? "skipped",
      uploadIntentCredentialsPresent: withUploadIntent ? uploadIntentShape.credentialsPresent : null,
      signedPutStatus: signedPut.attempted ? signedPut.status : "skipped",
      mediaCompleteStatus: mediaComplete.status,
      jobCreateStatus: jobCreate.status,
      draftId: draft.id,
      contentVariantId: variant.id,
      mediaAssetId: mediaComplete.body?.asset?.id ?? null,
      jobId: job?.id ?? null,
      jobStatus: job?.status ?? null,
      renderMode,
      inputAssetCount: inputAssets.length,
      persistedJobPayloadInspected: persistedJobPayload.inspected,
      uploadIntentKey: storageKey,
      uploadIntentMissingFields: withUploadIntent ? uploadIntentShape.missingFields : [],
      errorCodes: compact([
        testDraft.body?.error?.code,
        uploadIntent?.body?.error?.code,
        mediaComplete.body?.error?.code,
        jobCreate.body?.error?.code,
      ]),
      note: withUploadIntent
        ? "API smoke with upload-intent check. Aliyun OSS uses signed PUT; Tencent COS validates STS shape. It does not run worker, verify final.mp4, or replace mobile browser e2e."
        : "API smoke only. It does not upload bytes, run worker, verify final.mp4, or replace mobile browser e2e.",
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

async function inspectPersistedJobInputPayload(jobId) {
  if (!jobId) {
    return {
      inspected: false,
      renderMode: null,
      inputAssets: [],
    };
  }

  const databaseUrl =
    process.env.APP_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.LOCAL_REAL_CHAIN_DB_URL?.trim() ||
    "";

  if (!databaseUrl) {
    return {
      inspected: false,
      renderMode: null,
      inputAssets: [],
    };
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: resolveSslConfig(),
    max: 1,
  });

  try {
    const result = await pool.query(
      "select input_payload from public.video_edit_jobs where id = $1 limit 1",
      [jobId],
    );
    const inputPayload = result.rows[0]?.input_payload;

    if (!inputPayload || typeof inputPayload !== "object") {
      return {
        inspected: true,
        renderMode: null,
        inputAssets: [],
      };
    }

    return {
      inspected: true,
      renderMode: typeof inputPayload.render_mode === "string" ? inputPayload.render_mode : null,
      inputAssets: Array.isArray(inputPayload.input_assets) ? inputPayload.input_assets : [],
    };
  } finally {
    await pool.end();
  }
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

function inspectUploadIntentShape(uploadIntent, selectedProvider) {
  if (!uploadIntent || typeof uploadIntent !== "object") {
    return {
      complete: false,
      credentialsPresent: false,
      missingFields: ["uploadIntent"],
    };
  }

  const commonFields = ["bucket", "region", "expiredTime"];
  const providerFields =
    selectedProvider === "aliyun_oss"
      ? ["uploadUrl", "uploadMethod"]
      : ["cosKey", "TmpSecretId", "TmpSecretKey", "Token"];
  const missingFields = [...commonFields, ...providerFields].filter((field) =>
    isMissingUploadIntentField(uploadIntent, field),
  );
  if (
    selectedProvider === "aliyun_oss" &&
    !firstString(uploadIntent.storageKey, uploadIntent.uploadKey, uploadIntent.cosKey)
  ) {
    missingFields.push("storageKey|uploadKey|cosKey");
  }

  return {
    complete: missingFields.length === 0,
    credentialsPresent:
      selectedProvider === "aliyun_oss"
        ? typeof uploadIntent.uploadUrl === "string" &&
          uploadIntent.uploadUrl.length > 0 &&
          uploadIntent.uploadMethod === "PUT"
        : ["TmpSecretId", "TmpSecretKey", "Token"].every(
            (field) => typeof uploadIntent[field] === "string" && uploadIntent[field].length > 0,
          ),
    missingFields,
  };
}

async function performSignedPutIfAvailable(input) {
  if (input.provider !== "aliyun_oss" || !input.uploadIntent?.uploadUrl) {
    return {
      attempted: false,
      status: null,
      etag: null,
    };
  }

  const headers = {
    ...(typeof input.uploadIntent.uploadHeaders === "object" && input.uploadIntent.uploadHeaders
      ? input.uploadIntent.uploadHeaders
      : {}),
  };
  headers["Content-Type"] = headers["Content-Type"] || "video/mp4";

  const response = await fetch(input.uploadIntent.uploadUrl, {
    method: input.uploadIntent.uploadMethod || "PUT",
    headers,
    body: Buffer.alloc(1024, 0),
  });

  return {
    attempted: true,
    status: response.status,
    etag: response.headers.get("etag"),
  };
}

function isMissingUploadIntentField(uploadIntent, field) {
  const value = uploadIntent[field];
  return value === null || value === undefined || value === "";
}

function normalizeStorageProvider(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === "tencent_cos" || normalized === "aliyun_oss") {
    return normalized;
  }

  writeReport(
    {
      status: "invalid_provider",
      provider: value,
      message: "Provider must be tencent_cos or aliyun_oss.",
    },
    2,
  );
}

function defaultBucketForProvider(selectedProvider) {
  return selectedProvider === "aliyun_oss"
    ? process.env.ALIYUN_OSS_BUCKET || ""
    : process.env.COS_BUCKET || "";
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
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
