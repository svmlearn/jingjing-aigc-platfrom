export type MediaOwnerType =
  | "source_item"
  | "content_draft"
  | "content_variant"
  | "voice_profile";

export type MediaAssetType = "image" | "video" | "cover" | "subtitle" | "audio";

export type MediaStorageProvider = "tencent_cos" | "supabase_storage";

export type MediaAssetDto = {
  id: string;
  ownerType: MediaOwnerType;
  ownerId: string;
  assetType: MediaAssetType;
  storageProvider: MediaStorageProvider;
  bucketName?: string | null;
  storageKey: string;
  originUrl?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  etag?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt?: string | null;
  signedPreviewUrl?: string | null;
  signedDownloadUrl?: string | null;
};

export type MediaUploadIntentRequest = {
  ownerType: MediaOwnerType;
  ownerId: string;
  assetType: Extract<MediaAssetType, "image" | "video" | "audio">;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type MediaUploadIntentDto = {
  bucket: string;
  region: string;
  cosKey: string;
  TmpSecretId: string;
  TmpSecretKey: string;
  Token: string;
  StartTime: number;
  ExpiredTime: number;
  expiredTime: number;
};

export type MediaCompleteRequest = {
  ownerType: MediaOwnerType;
  ownerId: string;
  assetType: MediaAssetType;
  storageProvider: MediaStorageProvider;
  bucketName?: string | null;
  storageKey: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  etag?: string | null;
  originUrl?: string | null;
  sortOrder?: number;
};
