"use client";

import type { VideoEditProgressModuleDto } from "@/contracts/video";
import { normalizeVideoProgressModules } from "@/lib/ui/video-progress-modules";

export type MediaOwnerType = "source_item" | "content_draft" | "content_variant" | "voice_profile";
export type MediaAssetType = "image" | "video" | "cover" | "subtitle" | "audio";
export type UploadableMediaAssetType = Extract<MediaAssetType, "image" | "video" | "audio">;
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
  sortOrder?: number | null;
  signedPreviewUrl?: string | null;
  signedDownloadUrl?: string | null;
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
  progressModules: VideoEditProgressModuleDto[];
  resultAssets: DraftMediaAsset[];
  createdAt?: string | null;
  updatedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type UploadIntentRequest = {
  ownerType: MediaOwnerType;
  ownerId: string;
  assetType: UploadableMediaAssetType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type UploadIntent = {
  provider: "tencent_cos" | "aliyun_oss";
  bucket: string;
  region: string;
  endpoint?: string | null;
  storageKey: string;
  uploadKey: string;
  cosKey: string;
  tmpSecretId?: string;
  tmpSecretKey?: string;
  token?: string;
  uploadUrl?: string;
  uploadMethod?: "PUT";
  uploadHeaders?: Record<string, string>;
  expiredTime: number;
};

type JsonRecord = Record<string, unknown>;

type UploadProgress = {
  loaded: number;
  total: number;
  percent: number;
};

export type DraftMediaUploadStage = "preparing" | "uploading" | "finalizing";

const DRAFT_MEDIA_STORAGE_PREFIX = "jingjing:draft-media-assets";
const DRAFT_VIDEO_JOBS_STORAGE_PREFIX = "jingjing:draft-video-jobs";

type BrowserCosClient = {
  cancelTask?: (taskId: string) => void;
  sliceUploadFile?: (
    params: {
      Bucket: string;
      Region: string;
      Key: string;
      Body: File;
      onTaskReady?: (taskId: string) => void;
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
      onTaskReady?: (taskId: string) => void;
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
const COS_UPLOAD_STALL_TIMEOUT_MS = 90_000;
const COS_UPLOAD_TOTAL_TIMEOUT_MS = 10 * 60_000;
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

function readStringRecord(record: JsonRecord | null) {
  const output: Record<string, string> = {};

  if (!record) {
    return output;
  }

  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") {
      output[key] = value;
    }
  }

  return output;
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
  const sortOrder = readNumber(input, "sortOrder", "sort_order");

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
    sortOrder,
    signedPreviewUrl:
      readString(input, "signedPreviewUrl", "signed_preview_url", "previewUrl", "preview_url") ??
      readString(input, "originUrl", "origin_url"),
    signedDownloadUrl:
      readString(input, "signedDownloadUrl", "signed_download_url", "downloadUrl", "download_url") ??
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
  return normalizeAssets(readArray(input, "resultAssets", "result_assets", "assets"));
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
  const currentStage = readString(input, "currentStage", "current_stage");
  const progressPct = readNumber(input, "progressPct", "progress_pct");

  return {
    id,
    draftId: readString(input, "draftId", "draft_id"),
    contentVariantId: readString(input, "contentVariantId", "content_variant_id"),
    status: status as VideoEditJobStatus,
    currentStage,
    progressPct,
    failureReason: readString(input, "failureReason", "failure_reason"),
    instructionText: readString(input, "instructionText", "instruction_text"),
    progressModules: normalizeVideoProgressModules({
      status: status as VideoEditJobStatus,
      currentStage,
      progressPct,
      progressModules: readArray(input, "progressModules", "progress_modules"),
    }),
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
  if (!params.intent.tmpSecretId || !params.intent.tmpSecretKey || !params.intent.token) {
    throw new Error("上传意图返回不完整，缺少 COS 临时凭证。");
  }

  const Cos = await loadCosSdk();
  const cosClient = new Cos({
    getAuthorization(_, callback) {
      callback({
        TmpSecretId: params.intent.tmpSecretId ?? "",
        TmpSecretKey: params.intent.tmpSecretKey ?? "",
        SecurityToken: params.intent.token ?? "",
        ExpiredTime: params.intent.expiredTime,
      });
    },
  });

  const uploadMethod = cosClient.sliceUploadFile ?? cosClient.putObject;
  if (!uploadMethod) {
    throw new Error("COS SDK 不支持当前上传方法。");
  }

  return new Promise<{ etag: string }>((resolve, reject) => {
    let settled = false;
    let taskId: string | null = null;
    let lastProgressAt = Date.now();
    let lastLoaded = 0;
    let lastPercent = 0;
    let stallTimer: number | null = null;
    let totalTimer: number | null = null;

    const clearTimers = () => {
      if (stallTimer) {
        window.clearInterval(stallTimer);
        stallTimer = null;
      }

      if (totalTimer) {
        window.clearTimeout(totalTimer);
        totalTimer = null;
      }
    };
    const failUpload = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimers();
      if (taskId) {
        cosClient.cancelTask?.(taskId);
      }
      reject(error);
    };
    const finishUpload = (etag: string) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimers();
      resolve({ etag: stripEtagQuotes(etag) });
    };

    stallTimer = window.setInterval(() => {
      if (Date.now() - lastProgressAt >= COS_UPLOAD_STALL_TIMEOUT_MS) {
        failUpload(new Error("素材上传到 COS 已长时间没有进度，请检查网络后重试。"));
      }
    }, 10_000);
    totalTimer = window.setTimeout(() => {
      failUpload(new Error("素材上传到 COS 超时，请检查文件大小和网络后重试。"));
    }, COS_UPLOAD_TOTAL_TIMEOUT_MS);

    try {
      uploadMethod.call(
        cosClient,
        {
          Bucket: params.intent.bucket,
          Region: params.intent.region,
          Key: params.intent.cosKey,
          Body: params.file,
          onTaskReady(nextTaskId) {
            taskId = nextTaskId;
          },
          onProgress(progress) {
            const loaded = progress.loaded ?? 0;
            const percent = progress.percent ?? 0;

            if (loaded > lastLoaded || percent > lastPercent) {
              lastLoaded = Math.max(lastLoaded, loaded);
              lastPercent = Math.max(lastPercent, percent);
              lastProgressAt = Date.now();
            }

            params.onProgress?.({
              loaded,
              total: progress.total ?? params.file.size,
              percent,
            });
          },
        },
        (error, data) => {
          if (error) {
            failUpload(error instanceof Error ? error : new Error("素材上传到 COS 失败。"));
            return;
          }

          const etag =
            (isRecord(data) ? readString(data, "ETag", "etag", "eTag") : null) ??
            `${params.intent.cosKey}-${params.file.size}`;
          finishUpload(etag);
        },
      );
    } catch (error) {
      failUpload(error instanceof Error ? error : new Error("素材上传到 COS 失败。"));
    }
  });
}

async function uploadToAliyunOss(params: {
  intent: UploadIntent;
  file: File;
  onProgress?: (progress: UploadProgress) => void;
}) {
  if (!params.intent.uploadUrl) {
    throw new Error("上传意图返回不完整，缺少 OSS 上传地址。");
  }

  params.onProgress?.({
    loaded: 0,
    total: params.file.size,
    percent: 0,
  });

  const response = await fetch(params.intent.uploadUrl, {
    method: params.intent.uploadMethod ?? "PUT",
    headers: params.intent.uploadHeaders ?? {},
    body: params.file,
  });

  if (!response.ok) {
    throw new Error(`素材上传到 OSS 失败：${response.status} ${response.statusText}`);
  }

  params.onProgress?.({
    loaded: params.file.size,
    total: params.file.size,
    percent: 1,
  });

  return {
    etag:
      stripEtagQuotes(response.headers.get("etag") ?? "") ||
      `${params.intent.storageKey}-${params.file.size}`,
  };
}

async function uploadToObjectStorage(params: {
  intent: UploadIntent;
  file: File;
  onProgress?: (progress: UploadProgress) => void;
}) {
  if (params.intent.provider === "aliyun_oss") {
    return uploadToAliyunOss(params);
  }

  return uploadToCos(params);
}

function assetTypeFromMimeType(mimeType: string, fileName?: string): UploadableMediaAssetType {
  if (mimeType.startsWith("audio/") || /\.(aac|flac|m4a|mp3|ogg|opus|wav|webm)$/i.test(fileName ?? "")) {
    return "audio";
  }
  if (mimeType.startsWith("video/") || /\.(m4v|mov|mp4|webm)$/i.test(fileName ?? "")) {
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
  const provider = readString(source, "provider", "storageProvider") ?? "tencent_cos";
  const bucket = readString(source, "bucket");
  const region = readString(source, "region");
  const endpoint = readString(source, "endpoint");
  const cosKey = readString(source, "cosKey", "cos_key", "storageKey", "uploadKey", "key");
  const storageKey = readString(source, "storageKey", "storage_key", "uploadKey", "cosKey", "key");
  const uploadKey = readString(source, "uploadKey", "upload_key", "storageKey", "cosKey", "key");
  const uploadUrl = readString(source, "uploadUrl", "upload_url");
  const uploadMethod = readString(source, "uploadMethod", "upload_method");
  const uploadHeaders = readStringRecord(readNestedRecord(source, "uploadHeaders", "upload_headers"));
  const tmpSecretId = readString(source, "TmpSecretId", "tmpSecretId", "tmp_secret_id");
  const tmpSecretKey = readString(source, "TmpSecretKey", "tmpSecretKey", "tmp_secret_key");
  const token = readString(source, "Token", "token", "SecurityToken", "securityToken");
  const expiredTime = readNumber(source, "expiredTime", "expired_time", "ExpiredTime");

  if (provider !== "tencent_cos" && provider !== "aliyun_oss") {
    throw new Error("上传意图返回了暂不支持的存储 provider。");
  }

  if (!bucket || !region || !cosKey || !storageKey || !uploadKey || expiredTime === null) {
    throw new Error("上传意图返回不完整，缺少对象存储目标。");
  }

  if (
    provider === "tencent_cos" &&
    (!tmpSecretId || !tmpSecretKey || !token)
  ) {
    throw new Error("上传意图返回不完整，缺少 COS 临时凭证。");
  }

  if (provider === "aliyun_oss" && !uploadUrl) {
    throw new Error("上传意图返回不完整，缺少 OSS 上传地址。");
  }

  return {
    provider,
    bucket,
    region,
    endpoint,
    storageKey,
    uploadKey,
    cosKey,
    tmpSecretId: tmpSecretId ?? undefined,
    tmpSecretKey: tmpSecretKey ?? undefined,
    token: token ?? undefined,
    uploadUrl: uploadUrl ?? undefined,
    uploadMethod: uploadMethod === "PUT" ? "PUT" : undefined,
    uploadHeaders,
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
  sortOrder?: number;
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

export async function uploadMediaFileForOwner(params: {
  ownerType: Extract<MediaOwnerType, "source_item" | "content_draft" | "voice_profile">;
  ownerId: string;
  file: File;
  sortOrder?: number;
  onProgress?: (progress: UploadProgress) => void;
  onStageChange?: (stage: DraftMediaUploadStage) => void;
}) {
  const assetType = assetTypeFromMimeType(params.file.type, params.file.name);
  const mimeType = params.file.type || "application/octet-stream";

  params.onStageChange?.("preparing");
  const intent = await createUploadIntent({
    ownerType: params.ownerType,
    ownerId: params.ownerId,
    assetType,
    fileName: params.file.name,
    mimeType,
    sizeBytes: params.file.size,
  });

  params.onStageChange?.("uploading");
  const uploadResult = await uploadToObjectStorage({
    intent,
    file: params.file,
    onProgress: params.onProgress,
  });

  const completePayload = {
    ownerType: params.ownerType,
    ownerId: params.ownerId,
    assetType,
    storageProvider: intent.provider,
    bucketName: intent.bucket,
    storageKey: intent.storageKey,
    mimeType,
    sizeBytes: params.file.size,
    etag: uploadResult.etag,
    ...(params.sortOrder !== undefined ? { sortOrder: params.sortOrder } : {}),
  };

  params.onStageChange?.("finalizing");
  const completedAsset =
    (await completeMediaUpload(completePayload)) ??
    ({
      id: intent.storageKey,
      ownerType: params.ownerType,
      ownerId: params.ownerId,
      assetType,
      storageProvider: intent.provider,
      bucketName: intent.bucket,
      storageKey: intent.storageKey,
      mimeType,
      fileSizeBytes: params.file.size,
      etag: uploadResult.etag,
      sortOrder: params.sortOrder ?? null,
      signedPreviewUrl: null,
      originUrl: null,
    } satisfies DraftMediaAsset);

  return completedAsset;
}

export async function uploadVoiceProfileAudioFile(params: {
  voiceProfileId: string;
  file: File;
  onProgress?: (progress: UploadProgress) => void;
  onStageChange?: (stage: DraftMediaUploadStage) => void;
}) {
  return uploadMediaFileForOwner({
    ownerType: "voice_profile",
    ownerId: params.voiceProfileId,
    file: params.file,
    onProgress: params.onProgress,
    onStageChange: params.onStageChange,
  });
}

export async function uploadDraftMediaFile(params: {
  draftId: string;
  file: File;
  sortOrder?: number;
  onProgress?: (progress: UploadProgress) => void;
  onStageChange?: (stage: DraftMediaUploadStage) => void;
}) {
  return uploadMediaFileForOwner({
    ownerType: "content_draft",
    ownerId: params.draftId,
    file: params.file,
    sortOrder: params.sortOrder,
    onProgress: params.onProgress,
    onStageChange: params.onStageChange,
  });
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
  sourceJobId?: string | null;
  productionConfig?: JsonRecord | null;
}) {
  const requestPayload = {
    contentVariantId: payload.contentVariantId,
    instructionText: payload.instructionText ?? null,
    sourceJobId: payload.sourceJobId ?? null,
    productionConfig: payload.productionConfig ?? null,
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
