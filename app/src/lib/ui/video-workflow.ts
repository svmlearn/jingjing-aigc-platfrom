"use client";

export type MediaOwnerType = "source_item" | "content_draft" | "content_variant";
export type MediaAssetType = "image" | "video" | "cover" | "subtitle";
export type VideoEditJobStatus =
  | "pending"
  | "queued"
  | "preparing"
  | "running"
  | "succeeded"
  | "failed_retryable"
  | "failed_manual"
  | "cancelled";

export type DraftMediaAsset = {
  id: string;
  ownerType: MediaOwnerType;
  ownerId: string;
  assetType: MediaAssetType;
  storageProvider: string;
  bucketName: string;
  storageKey: string;
  mimeType: string;
  fileSizeBytes: number;
  etag: string;
  signedPreviewUrl?: string | null;
  originUrl?: string | null;
  createdAt?: string | null;
};

export type VideoEditJob = {
  id: string;
  draftId?: string | null;
  contentVariantId?: string | null;
  status: VideoEditJobStatus;
  currentStage?: string | null;
  progressPct?: number | null;
  failureReason?: string | null;
  instructionText?: string | null;
  resultAssets: DraftMediaAsset[];
  createdAt?: string | null;
  updatedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type UploadIntentRequest = {
  ownerType: MediaOwnerType;
  ownerId: string;
  assetType: MediaAssetType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type UploadIntent = {
  bucket: string;
  region: string;
  cosKey: string;
  tmpSecretId: string;
  tmpSecretKey: string;
  token: string;
  expiredTime: number;
};

type JsonRecord = Record<string, unknown>;

type UploadProgress = {
  loaded: number;
  total: number;
  percent: number;
};

const DRAFT_MEDIA_STORAGE_PREFIX = "jingjing:draft-media-assets";
const DRAFT_VIDEO_JOBS_STORAGE_PREFIX = "jingjing:draft-video-jobs";

type BrowserCosClient = {
  sliceUploadFile?: (
    params: {
      Bucket: string;
      Region: string;
      Key: string;
      Body: File;
      onProgress?: (progress: {
        loaded?: number;
        total?: number;
        percent?: number;
      }) => void;
    },
    callback: (error: unknown, data?: JsonRecord) => void,
  ) => void;
  putObject?: (
    params: {
      Bucket: string;
      Region: string;
      Key: string;
      Body: File;
      onProgress?: (progress: {
        loaded?: number;
        total?: number;
        percent?: number;
      }) => void;
    },
    callback: (error: unknown, data?: JsonRecord) => void,
  ) => void;
};

type BrowserCosConstructor = new (options: {
  getAuthorization: (
    options: unknown,
    callback: (authorization: {
      TmpSecretId: string;
      TmpSecretKey: string;
      SecurityToken: string;
      ExpiredTime: number;
    }) => void,
  ) => void;
}) => BrowserCosClient;

declare global {
  interface Window {
    COS?: BrowserCosConstructor;
  }
}

const COS_SDK_URL = "https://cdn.jsdelivr.net/npm/cos-js-sdk-v5/dist/cos-js-sdk-v5.min.js";
let cosSdkPromise: Promise<BrowserCosConstructor> | null = null;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function readString(record: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

function readNumber(record: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function readArray(record: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function readNestedRecord(record: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) {
      return value;
    }
  }

  return null;
}

function extractErrorMessage(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  return (
    readString(payload, "error", "message") ??
    readString(readNestedRecord(payload, "error") ?? {}, "message", "details")
  );
}

async function requestJson<T>(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    const message = extractErrorMessage(payload) ?? `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  if (payload === null) {
    throw new Error("接口返回为空，暂时无法继续。");
  }

  return payload;
}

function normalizeAsset(input: unknown): DraftMediaAsset | null {
  if (!isRecord(input)) {
    return null;
  }

  const id = readString(input, "id", "assetId", "asset_id", "storageKey", "storage_key");
  const ownerType = readString(input, "ownerType", "owner_type");
  const ownerId = readString(input, "ownerId", "owner_id");
  const assetType = readString(input, "assetType", "asset_type");
  const storageProvider = readString(input, "storageProvider", "storage_provider") ?? "tencent_cos";
  const bucketName = readString(input, "bucketName", "bucket_name") ?? "";
  const storageKey = readString(input, "storageKey", "storage_key") ?? "";
  const mimeType = readString(input, "mimeType", "mime_type") ?? "application/octet-stream";
  const fileSizeBytes = readNumber(input, "fileSizeBytes", "file_size_bytes", "sizeBytes", "size_bytes") ?? 0;
  const etag = readString(input, "etag", "eTag", "ETag") ?? "";

  if (!id || !ownerType || !ownerId || !assetType) {
    return null;
  }

  return {
    id,
    ownerType: ownerType as MediaOwnerType,
    ownerId,
    assetType: assetType as MediaAssetType,
    storageProvider,
    bucketName,
    storageKey,
    mimeType,
    fileSizeBytes,
    etag,
    signedPreviewUrl:
      readString(input, "signedPreviewUrl", "signed_preview_url", "previewUrl", "preview_url") ??
      readString(input, "originUrl", "origin_url"),
    originUrl: readString(input, "originUrl", "origin_url"),
    createdAt: readString(input, "createdAt", "created_at"),
  };
}

function normalizeAssets(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => normalizeAsset(item))
    .filter((item): item is DraftMediaAsset => item !== null);
}

function getResultAssets(input: JsonRecord) {
  const resultPayload =
    readNestedRecord(input, "resultPayload", "result_payload") ??
    readNestedRecord(input, "result", "videoResult", "video_result");

  return normalizeAssets([
    ...readArray(input, "resultAssets", "result_assets", "assets"),
    ...readArray(resultPayload ?? {}, "resultAssets", "result_assets", "assets"),
  ]);
}

function normalizeVideoEditJob(input: unknown): VideoEditJob | null {
  if (!isRecord(input)) {
    return null;
  }

  const id = readString(input, "id", "jobId", "job_id");
  const status = readString(input, "status");
  if (!id || !status) {
    return null;
  }

  return {
    id,
    draftId: readString(input, "draftId", "draft_id"),
    contentVariantId: readString(input, "contentVariantId", "content_variant_id"),
    status: status as VideoEditJobStatus,
    currentStage: readString(input, "currentStage", "current_stage"),
    progressPct: readNumber(input, "progressPct", "progress_pct"),
    failureReason: readString(input, "failureReason", "failure_reason"),
    instructionText: readString(input, "instructionText", "instruction_text"),
    resultAssets: getResultAssets(input),
    createdAt: readString(input, "createdAt", "created_at"),
    updatedAt: readString(input, "updatedAt", "updated_at"),
    startedAt: readString(input, "startedAt", "started_at"),
    finishedAt: readString(input, "finishedAt", "finished_at"),
  };
}

function normalizeVideoEditJobs(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => normalizeVideoEditJob(item))
    .filter((item): item is VideoEditJob => item !== null);
}

function getStorageKey(prefix: string, draftId: string) {
  return `${prefix}:${draftId}`;
}

function readStoredItems<T>(storageKey: string, normalizeItem: (input: unknown) => T | null) {
  if (typeof window === "undefined") {
    return [] as T[];
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return [] as T[];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [] as T[];
    }

    return parsed
      .map((item) => normalizeItem(item))
      .filter((item): item is T => item !== null);
  } catch {
    return [] as T[];
  }
}

function writeStoredItems<T>(storageKey: string, items: T[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(items));
}

async function loadCosSdk() {
  if (typeof window === "undefined") {
    throw new Error("浏览器环境不可用，无法上传素材。");
  }

  if (window.COS) {
    return window.COS;
  }

  if (!cosSdkPromise) {
    cosSdkPromise = new Promise<BrowserCosConstructor>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${COS_SDK_URL}"]`);
      if (existingScript) {
        existingScript.addEventListener("load", () => {
          if (window.COS) {
            resolve(window.COS);
            return;
          }
          reject(new Error("COS SDK 已加载，但对象不可用。"));
        });
        existingScript.addEventListener("error", () => {
          reject(new Error("COS SDK 加载失败。"));
        });
        return;
      }

      const script = document.createElement("script");
      script.src = COS_SDK_URL;
      script.async = true;
      script.onload = () => {
        if (window.COS) {
          resolve(window.COS);
          return;
        }
        reject(new Error("COS SDK 已加载，但对象不可用。"));
      };
      script.onerror = () => {
        reject(new Error("COS SDK 加载失败。"));
      };
      document.head.appendChild(script);
    });
  }

  return cosSdkPromise;
}

function stripEtagQuotes(value: string) {
  return value.replaceAll('"', "");
}

async function uploadToCos(params: {
  intent: UploadIntent;
  file: File;
  onProgress?: (progress: UploadProgress) => void;
}) {
  const Cos = await loadCosSdk();
  const cosClient = new Cos({
    getAuthorization(_, callback) {
      callback({
        TmpSecretId: params.intent.tmpSecretId,
        TmpSecretKey: params.intent.tmpSecretKey,
        SecurityToken: params.intent.token,
        ExpiredTime: params.intent.expiredTime,
      });
    },
  });

  const uploadMethod = cosClient.sliceUploadFile ?? cosClient.putObject;
  if (!uploadMethod) {
    throw new Error("COS SDK 不支持当前上传方法。");
  }

  return new Promise<{ etag: string }>((resolve, reject) => {
    uploadMethod.call(
      cosClient,
      {
        Bucket: params.intent.bucket,
        Region: params.intent.region,
        Key: params.intent.cosKey,
        Body: params.file,
        onProgress(progress) {
          params.onProgress?.({
            loaded: progress.loaded ?? 0,
            total: progress.total ?? params.file.size,
            percent: progress.percent ?? 0,
          });
        },
      },
      (error, data) => {
        if (error) {
          reject(error instanceof Error ? error : new Error("素材上传到 COS 失败。"));
          return;
        }

        const etag =
          (isRecord(data) ? readString(data, "ETag", "etag", "eTag") : null) ??
          `${params.intent.cosKey}-${params.file.size}`;
        resolve({ etag: stripEtagQuotes(etag) });
      },
    );
  });
}

function assetTypeFromMimeType(mimeType: string): MediaAssetType {
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  return "image";
}

export function formatAssetSize(fileSizeBytes: number) {
  if (fileSizeBytes < 1024) {
    return `${fileSizeBytes} B`;
  }
  if (fileSizeBytes < 1024 * 1024) {
    return `${(fileSizeBytes / 1024).toFixed(1)} KB`;
  }
  if (fileSizeBytes < 1024 * 1024 * 1024) {
    return `${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(fileSizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export async function createUploadIntent(payload: UploadIntentRequest) {
  const response = await requestJson<JsonRecord>("/api/media/upload-intents", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const source = readNestedRecord(response, "uploadIntent", "intent", "credentials") ?? response;
  const bucket = readString(source, "bucket");
  const region = readString(source, "region");
  const cosKey = readString(source, "cosKey", "cos_key", "key");
  const tmpSecretId = readString(source, "TmpSecretId", "tmpSecretId", "tmp_secret_id");
  const tmpSecretKey = readString(source, "TmpSecretKey", "tmpSecretKey", "tmp_secret_key");
  const token = readString(source, "Token", "token", "SecurityToken", "securityToken");
  const expiredTime = readNumber(source, "expiredTime", "expired_time", "ExpiredTime");

  if (!bucket || !region || !cosKey || !tmpSecretId || !tmpSecretKey || !token || expiredTime === null) {
    throw new Error("上传意图返回不完整，缺少 COS 临时凭证。");
  }

  return {
    bucket,
    region,
    cosKey,
    tmpSecretId,
    tmpSecretKey,
    token,
    expiredTime,
  } satisfies UploadIntent;
}

export async function completeMediaUpload(payload: {
  ownerType: MediaOwnerType;
  ownerId: string;
  assetType: MediaAssetType;
  storageProvider: string;
  bucketName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  etag: string;
  originUrl?: string | null;
}) {
  const response = await requestJson<JsonRecord>("/api/media/complete", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return (
    normalizeAsset(response.asset) ??
    normalizeAsset(response.assetObject) ??
    normalizeAsset(response.mediaAsset) ??
    normalizeAsset(response)
  );
}

export async function uploadDraftMediaFile(params: {
  draftId: string;
  file: File;
  onProgress?: (progress: UploadProgress) => void;
}) {
  const assetType = assetTypeFromMimeType(params.file.type);
  const intent = await createUploadIntent({
    ownerType: "content_draft",
    ownerId: params.draftId,
    assetType,
    fileName: params.file.name,
    mimeType: params.file.type || "application/octet-stream",
    sizeBytes: params.file.size,
  });

  const uploadResult = await uploadToCos({
    intent,
    file: params.file,
    onProgress: params.onProgress,
  });

  const completedAsset =
    (await completeMediaUpload({
      ownerType: "content_draft",
      ownerId: params.draftId,
      assetType,
      storageProvider: "tencent_cos",
      bucketName: intent.bucket,
      storageKey: intent.cosKey,
      mimeType: params.file.type || "application/octet-stream",
      sizeBytes: params.file.size,
      etag: uploadResult.etag,
    })) ??
    ({
      id: intent.cosKey,
      ownerType: "content_draft",
      ownerId: params.draftId,
      assetType,
      storageProvider: "tencent_cos",
      bucketName: intent.bucket,
      storageKey: intent.cosKey,
      mimeType: params.file.type || "application/octet-stream",
      fileSizeBytes: params.file.size,
      etag: uploadResult.etag,
      signedPreviewUrl: null,
      originUrl: null,
    } satisfies DraftMediaAsset);

  return completedAsset;
}

export function loadDraftMediaAssetsFallback(draftId: string) {
  return readStoredItems(getStorageKey(DRAFT_MEDIA_STORAGE_PREFIX, draftId), normalizeAsset);
}

export function persistDraftMediaAssetsFallback(draftId: string, assets: DraftMediaAsset[]) {
  writeStoredItems(getStorageKey(DRAFT_MEDIA_STORAGE_PREFIX, draftId), assets);
}

export async function listVideoEditJobs() {
  const response = await requestJson<JsonRecord>("/api/video-edit-jobs", {
    method: "GET",
  });

  return normalizeVideoEditJobs(response.videoEditJobs ?? response.jobs ?? response.items ?? []);
}

export async function getVideoEditJobDetail(jobId: string) {
  const response = await requestJson<JsonRecord>(`/api/video-edit-jobs/${jobId}`, {
    method: "GET",
  });

  return (
    normalizeVideoEditJob(response.videoEditJob) ??
    normalizeVideoEditJob(response.job) ??
    normalizeVideoEditJob(response)
  );
}

export async function createVideoEditJob(payload: {
  draftId: string;
  contentVariantId: string;
  instructionText?: string | null;
}) {
  const requestPayload = {
    draftId: payload.draftId,
    contentVariantId: payload.contentVariantId,
    instructionText: payload.instructionText ?? null,
    draft_id: payload.draftId,
    content_variant_id: payload.contentVariantId,
    instruction_text: payload.instructionText ?? null,
  };

  const response = await requestJson<JsonRecord>("/api/video-edit-jobs", {
    method: "POST",
    body: JSON.stringify(requestPayload),
  });

  const job =
    normalizeVideoEditJob(response.videoEditJob) ??
    normalizeVideoEditJob(response.job) ??
    normalizeVideoEditJob(response);

  if (!job) {
    throw new Error("视频任务创建成功，但返回数据不完整。");
  }

  return job;
}

export async function retryVideoEditJob(jobId: string) {
  const response = await requestJson<JsonRecord>(`/api/video-edit-jobs/${jobId}/retry`, {
    method: "POST",
  });

  return (
    normalizeVideoEditJob(response.videoEditJob) ??
    normalizeVideoEditJob(response.job) ??
    normalizeVideoEditJob(response)
  );
}

export async function cancelVideoEditJob(jobId: string) {
  const response = await requestJson<JsonRecord>(`/api/video-edit-jobs/${jobId}/cancel`, {
    method: "POST",
  });

  return (
    normalizeVideoEditJob(response.videoEditJob) ??
    normalizeVideoEditJob(response.job) ??
    normalizeVideoEditJob(response)
  );
}

export function loadDraftVideoJobsFallback(draftId: string) {
  return readStoredItems(getStorageKey(DRAFT_VIDEO_JOBS_STORAGE_PREFIX, draftId), normalizeVideoEditJob);
}

export function persistDraftVideoJobsFallback(draftId: string, jobs: VideoEditJob[]) {
  writeStoredItems(getStorageKey(DRAFT_VIDEO_JOBS_STORAGE_PREFIX, draftId), jobs);
}
