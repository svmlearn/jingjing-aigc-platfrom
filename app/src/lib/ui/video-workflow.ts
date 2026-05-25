"use client";

import type { VideoEditProgressModuleDto } from "@/contracts/video";
import type { MediaAssetDto } from "@/contracts/media";
import type { VoiceProfileDto } from "@/contracts/voice";
import { normalizeVoiceProfileAudioMimeType } from "@/lib/member-video-workflow";
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
  provider: "aliyun_oss";
  bucket: string;
  region: string;
  endpoint?: string | null;
  storageKey: string;
  uploadKey: string;
  // Legacy alias retained for older callers while the current upload path uses storageKey/uploadKey.
  cosKey: string;
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

export type VoiceProfileUploadResult = {
  voiceProfile: VoiceProfileDto;
  audioAsset: DraftMediaAsset;
};

const DRAFT_MEDIA_STORAGE_PREFIX = "jingjing:draft-media-assets";
const DRAFT_VIDEO_JOBS_STORAGE_PREFIX = "jingjing:draft-video-jobs";

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

function parseJsonRecord(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
  const storageProvider = readString(input, "storageProvider", "storage_provider") ?? "aliyun_oss";
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

function normalizeVoiceProfile(input: unknown): VoiceProfileDto | null {
  if (!isRecord(input)) {
    return null;
  }

  const id = readString(input, "id");
  const merchantId = readString(input, "merchantId", "merchant_id");
  const createdByUserId = readString(input, "createdByUserId", "created_by_user_id");
  const displayName = readString(input, "displayName", "display_name");
  const status = readString(input, "status");
  const provider = readString(input, "provider");
  const refAudioAssetId = readString(input, "refAudioAssetId", "ref_audio_asset_id");
  const authorizationAcceptedAt = readString(
    input,
    "authorizationAcceptedAt",
    "authorization_accepted_at",
  );
  const createdAt = readString(input, "createdAt", "created_at");

  if (
    !id ||
    !merchantId ||
    !createdByUserId ||
    !displayName ||
    !status ||
    !provider ||
    !refAudioAssetId ||
    !authorizationAcceptedAt ||
    !createdAt
  ) {
    return null;
  }

  const refAudioAsset = normalizeAsset(readNestedRecord(input, "refAudioAsset", "ref_audio_asset"));

  return {
    id,
    merchantId,
    createdByUserId,
    displayName,
    status: status as VoiceProfileDto["status"],
    provider: provider as VoiceProfileDto["provider"],
    externalVoiceId: readString(input, "externalVoiceId", "external_voice_id"),
    externalModelId: readString(input, "externalModelId", "external_model_id"),
    refAudioAssetId,
    authorizationAcceptedAt,
    createdAt,
    updatedAt: readString(input, "updatedAt", "updated_at"),
    refAudioAsset: refAudioAsset ? toMediaAssetDto(refAudioAsset) : null,
  };
}

function toMediaAssetDto(asset: DraftMediaAsset): MediaAssetDto {
  return {
    ...asset,
    ownerType: asset.ownerType as MediaAssetDto["ownerType"],
    assetType: asset.assetType as MediaAssetDto["assetType"],
    storageProvider: asset.storageProvider as MediaAssetDto["storageProvider"],
    sortOrder: asset.sortOrder ?? 0,
    createdAt: asset.createdAt ?? "",
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

function stripEtagQuotes(value: string) {
  return value.replaceAll('"', "");
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
  return uploadToAliyunOss(params);
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
  const provider = readString(source, "provider", "storageProvider") ?? "aliyun_oss";
  const bucket = readString(source, "bucket");
  const region = readString(source, "region");
  const endpoint = readString(source, "endpoint");
  const objectKey = readString(source, "storageKey", "storage_key", "uploadKey", "upload_key", "key", "cosKey", "cos_key");
  const uploadUrl = readString(source, "uploadUrl", "upload_url");
  const uploadMethod = readString(source, "uploadMethod", "upload_method");
  const uploadHeaders = readStringRecord(readNestedRecord(source, "uploadHeaders", "upload_headers"));
  const expiredTime = readNumber(source, "expiredTime", "expired_time", "ExpiredTime");

  if (provider !== "aliyun_oss") {
    throw new Error("上传意图返回了暂不支持的存储 provider。");
  }

  if (!bucket || !region || !objectKey || expiredTime === null) {
    throw new Error("上传意图返回不完整，缺少对象存储目标。");
  }

  const storageKey = objectKey;
  const uploadKey = objectKey;
  const cosKey = objectKey;

  if (!uploadUrl) {
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
  assetTypeOverride?: UploadableMediaAssetType;
  mimeTypeOverride?: string;
  sortOrder?: number;
  onProgress?: (progress: UploadProgress) => void;
  onStageChange?: (stage: DraftMediaUploadStage) => void;
}) {
  const assetType = params.assetTypeOverride ?? assetTypeFromMimeType(params.file.type, params.file.name);
  const mimeType = params.mimeTypeOverride?.trim() || params.file.type || "application/octet-stream";

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

function uploadVoiceProfileAudioWithProgress(params: {
  formData: FormData;
  fileSize: number;
  onProgress?: (progress: UploadProgress) => void;
  onStageChange?: (stage: DraftMediaUploadStage) => void;
}): Promise<JsonRecord> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("POST", "/api/voice-profiles/upload");
    xhr.withCredentials = true;
    params.onStageChange?.("uploading");
    params.onProgress?.({ loaded: 0, total: params.fileSize, percent: 0 });

    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : params.fileSize;
      params.onProgress?.({
        loaded: event.loaded,
        total,
        percent: total > 0 ? event.loaded / total : 0,
      });
    };
    xhr.upload.onload = () => {
      params.onProgress?.({
        loaded: params.fileSize,
        total: params.fileSize,
        percent: 1,
      });
      params.onStageChange?.("finalizing");
    };
    xhr.onerror = () => reject(new Error("克隆音色上传失败，请稍后重试。"));
    xhr.onabort = () => reject(new Error("克隆音色上传已取消。"));
    xhr.onload = () => {
      const payload = parseJsonRecord(xhr.responseText);
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(extractErrorMessage(payload) ?? `${xhr.status} ${xhr.statusText}`));
        return;
      }
      if (!payload) {
        reject(new Error("接口返回为空，暂时无法继续。"));
        return;
      }
      resolve(payload);
    };

    xhr.send(params.formData);
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

export async function uploadVoiceProfileAudioFile(params: {
  voiceProfileId?: string;
  displayName: string;
  authorizationAccepted: boolean;
  file: File;
  onProgress?: (progress: UploadProgress) => void;
  onStageChange?: (stage: DraftMediaUploadStage) => void;
}): Promise<VoiceProfileUploadResult> {
  params.onStageChange?.("preparing");

  const formData = new FormData();
  if (params.voiceProfileId) {
    formData.set("voiceProfileId", params.voiceProfileId);
  }
  formData.set("displayName", params.displayName);
  formData.set("authorizationAccepted", params.authorizationAccepted ? "true" : "false");
  formData.set("mimeType", normalizeVoiceProfileAudioMimeType(params.file));
  formData.set("file", params.file, params.file.name);

  const response = await uploadVoiceProfileAudioWithProgress({
    formData,
    fileSize: params.file.size,
    onProgress: params.onProgress,
    onStageChange: params.onStageChange,
  });
  const voiceProfile = normalizeVoiceProfile(response.voiceProfile);
  const audioAsset =
    normalizeAsset(response.audioAsset) ??
    normalizeAsset(response.asset) ??
    normalizeAsset(response.mediaAsset);

  if (!voiceProfile || !audioAsset) {
    throw new Error("克隆音色创建失败");
  }

  return { voiceProfile, audioAsset };
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
  inputAssetIds?: string[] | null;
  sourceJobId?: string | null;
  productionConfig?: JsonRecord | null;
}) {
  const requestPayload = {
    contentVariantId: payload.contentVariantId,
    instructionText: payload.instructionText ?? null,
    inputAssetIds: payload.inputAssetIds ?? null,
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
