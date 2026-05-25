import type {
  MerchantMediaAssetRecord,
} from "./merchant-media-library-contract.ts";
import type {
  PrivateMediaClipRecord,
} from "./private-media-pexels-adapter.ts";
import type {
  VoiceProfileStateRecord,
} from "./voice-profile-state-machine.ts";

export type PrivateMediaDoctorIssueCode =
  | "merchant_asset_without_ready_clip"
  | "missing_thumbnail"
  | "missing_object"
  | "low_confidence_ready_clip"
  | "wrong_source"
  | "slice_policy_violation"
  | "slice_boundary_violation"
  | "duration_gate_violation"
  | "multi_ready_voice_profile"
  | "public_bucket"
  | "service_role_client_leak"
  | "expired_pending_upload"
  | "orphan_upload_object"
  | "provider_cleanup_backlog";

export type PrivateMediaDoctorIssue = {
  code: PrivateMediaDoctorIssueCode;
  severity: "blocker" | "warning";
  message: string;
  subjectId: string;
};

export function runPrivateMediaDoctor(input: {
  assets: MerchantMediaAssetRecord[];
  clips: PrivateMediaClipRecord[];
  voiceProfiles: VoiceProfileStateRecord[];
  maxAutoReadyVideoDurationSeconds?: number | null;
  minReadyTagConfidence?: number;
  now?: string;
  existingCosKeys?: string[];
  publicBuckets?: string[];
  clientExposedEnvKeys?: string[];
  pendingUploads?: Array<{
    id: string;
    status: "pending" | "uploaded" | "completed" | "aborted";
    expiresAt: string;
    storageKey?: string | null;
  }>;
  orphanCosKeys?: string[];
  cleanupJobs?: Array<{
    id: string;
    provider: string;
    status: "pending" | "running" | "succeeded" | "failed";
    createdAt: string;
  }>;
  maxCleanupJobAgeHours?: number;
}): PrivateMediaDoctorIssue[] {
  return [
    ...checkMerchantAssets(input.assets, input.clips),
    ...checkMerchantClips(input),
    ...checkVoiceProfiles(input.voiceProfiles),
    ...checkStorageSecurity(input),
    ...checkPendingUploads(input),
    ...checkProviderCleanup(input),
  ];
}

function checkMerchantAssets(
  assets: MerchantMediaAssetRecord[],
  clips: PrivateMediaClipRecord[],
) {
  const issues: PrivateMediaDoctorIssue[] = [];

  for (const asset of assets) {
    if (asset.source !== "merchant_upload" && asset.source !== "merchant_confirmed") {
      issues.push(issue("wrong_source", asset.id, `Asset source ${asset.source} cannot enter merchant_media_*.`));
    }

    const readyClips = clips.filter(
      (clip) => clip.assetId === asset.id && clip.merchantId === asset.merchantId && clip.status === "ready",
    );
    if (asset.status === "ready" && readyClips.length === 0) {
      issues.push(issue("merchant_asset_without_ready_clip", asset.id, "Ready asset must have at least one ready clip."));
    }
  }

  return issues;
}

function checkMerchantClips(input: {
  clips: PrivateMediaClipRecord[];
  maxAutoReadyVideoDurationSeconds?: number | null;
  minReadyTagConfidence?: number;
  existingCosKeys?: string[];
  publicBuckets?: string[];
}) {
  const issues: PrivateMediaDoctorIssue[] = [];
  const minConfidence = input.minReadyTagConfidence ?? 0.6;
  const knownKeys = input.existingCosKeys ? new Set(input.existingCosKeys) : null;
  const publicBuckets = new Set(input.publicBuckets ?? []);

  for (const clip of input.clips) {
    if (clip.status !== "ready") {
      continue;
    }
    if (!clip.thumbCosKey) {
      issues.push(issue("missing_thumbnail", clip.id, "Ready clip is missing thumbnail COS key."));
    }
    if (!clip.cosKey) {
      issues.push(issue("missing_object", clip.id, "Ready clip is missing COS object key."));
    }
    if (clip.cosKey && knownKeys && !knownKeys.has(clip.cosKey)) {
      issues.push(issue("missing_object", clip.id, "Ready clip COS object does not exist."));
    }
    if (clip.thumbCosKey && knownKeys && !knownKeys.has(clip.thumbCosKey)) {
      issues.push(issue("missing_object", clip.id, "Ready clip thumbnail COS object does not exist."));
    }
    if (clip.bucketName && publicBuckets.has(clip.bucketName)) {
      issues.push(issue("public_bucket", clip.id, "Private media clip points at a public bucket."));
    }
    if ((clip.tagConfidence ?? 1) < minConfidence) {
      issues.push(issue("low_confidence_ready_clip", clip.id, "Low-confidence tags cannot stay ready."));
    }
    if (clip.clipIndex == null || !Number.isInteger(clip.clipIndex) || clip.clipIndex < 0) {
      issues.push(issue("slice_policy_violation", clip.id, "Ready clip must use a non-negative integer clip_index."));
    }
    if (clip.mediaType === "video") {
      if (clip.clipType !== "full_video" && clip.clipType !== "segment") {
        issues.push(issue("slice_policy_violation", clip.id, "Video ready clip must use clip_type = full_video or segment."));
      }
      if (clip.clipType === "full_video" && (clip.startTimeSeconds !== 0 || clip.endTimeSeconds !== clip.durationSeconds)) {
        issues.push(issue("slice_boundary_violation", clip.id, "full_video boundaries must cover the full duration."));
      }
      if (
        clip.clipType === "segment" &&
        (
          !Number.isFinite(clip.startTimeSeconds ?? NaN) ||
          !Number.isFinite(clip.endTimeSeconds ?? NaN) ||
          (clip.startTimeSeconds ?? -1) < 0 ||
          (clip.endTimeSeconds ?? 0) <= (clip.startTimeSeconds ?? 0)
        )
      ) {
        issues.push(issue("slice_boundary_violation", clip.id, "segment boundaries must be a positive time window."));
      }
      if (
        typeof input.maxAutoReadyVideoDurationSeconds === "number" &&
        input.maxAutoReadyVideoDurationSeconds > 0 &&
        (clip.durationSeconds ?? 0) > input.maxAutoReadyVideoDurationSeconds
      ) {
        issues.push(issue("duration_gate_violation", clip.id, "Overlong full_video clip must go to needs_reclip."));
      }
    }
    if (clip.mediaType === "image") {
      if (clip.clipType !== "image") {
        issues.push(issue("slice_policy_violation", clip.id, "V1 image ready clip must use clip_type = image."));
      }
      if (clip.durationSeconds != null) {
        issues.push(issue("slice_boundary_violation", clip.id, "Image clip must not write video duration_seconds."));
      }
    }
  }

  return issues;
}

function checkVoiceProfiles(voiceProfiles: VoiceProfileStateRecord[]) {
  const issues: PrivateMediaDoctorIssue[] = [];
  const readyCounts = new Map<string, VoiceProfileStateRecord[]>();

  for (const profile of voiceProfiles) {
    if (profile.status !== "ready") {
      continue;
    }
    const key = `${profile.merchantId}:${profile.createdByUserId}`;
    readyCounts.set(key, [...(readyCounts.get(key) ?? []), profile]);
  }

  for (const profiles of readyCounts.values()) {
    if (profiles.length > 1) {
      issues.push(
        issue(
          "multi_ready_voice_profile",
          profiles.map((profile) => profile.id).join(","),
          "A merchant user must not have multiple ready current voice profiles.",
        ),
      );
    }
  }

  return issues;
}

function checkStorageSecurity(input: {
  publicBuckets?: string[];
  clientExposedEnvKeys?: string[];
}) {
  const issues: PrivateMediaDoctorIssue[] = [];

  for (const bucketName of input.publicBuckets ?? []) {
    issues.push(issue("public_bucket", bucketName, "Private media buckets must not be public."));
  }

  for (const envKey of input.clientExposedEnvKeys ?? []) {
    if (envKey.endsWith("_SERVICE_ROLE_KEY") || envKey.startsWith("COS_SECRET_")) {
      issues.push(issue("service_role_client_leak", envKey, "Server-only secret is exposed to client runtime."));
    }
  }

  return issues;
}

function checkPendingUploads(input: {
  now?: string;
  pendingUploads?: Array<{
    id: string;
    status: "pending" | "uploaded" | "completed" | "aborted";
    expiresAt: string;
    storageKey?: string | null;
  }>;
  orphanCosKeys?: string[];
}) {
  const issues: PrivateMediaDoctorIssue[] = [];
  const nowMs = Date.parse(input.now ?? new Date().toISOString());

  for (const upload of input.pendingUploads ?? []) {
    if (upload.status === "pending" && Date.parse(upload.expiresAt) < nowMs) {
      issues.push(issue("expired_pending_upload", upload.id, "Pending upload intent is expired and must be cleaned."));
    }
  }

  for (const cosKey of input.orphanCosKeys ?? []) {
    issues.push(issue("orphan_upload_object", cosKey, "COS object has no accepted owner record and must be cleaned or quarantined."));
  }

  return issues;
}

function checkProviderCleanup(input: {
  now?: string;
  cleanupJobs?: Array<{
    id: string;
    provider: string;
    status: "pending" | "running" | "succeeded" | "failed";
    createdAt: string;
  }>;
  maxCleanupJobAgeHours?: number;
}) {
  const issues: PrivateMediaDoctorIssue[] = [];
  const maxAgeMs = (input.maxCleanupJobAgeHours ?? 24) * 60 * 60 * 1000;
  const nowMs = Date.parse(input.now ?? new Date().toISOString());

  for (const job of input.cleanupJobs ?? []) {
    if ((job.status === "pending" || job.status === "running") && nowMs - Date.parse(job.createdAt) > maxAgeMs) {
      issues.push(issue("provider_cleanup_backlog", job.id, `${job.provider} cleanup job is stale.`));
    }
  }

  return issues;
}

function issue(
  code: PrivateMediaDoctorIssueCode,
  subjectId: string,
  message: string,
): PrivateMediaDoctorIssue {
  return {
    code,
    severity: "blocker",
    subjectId,
    message,
  };
}
