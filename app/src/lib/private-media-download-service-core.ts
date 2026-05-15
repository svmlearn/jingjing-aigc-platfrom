import {
  verifyPrivateMediaDownloadToken,
  type PrivateMediaDownloadTokenPayload,
} from "./private-media-download-token.ts";
import type { PrivateMediaClipRepository } from "./private-media-fixture-repository.ts";
import type { PrivateMediaClipRecord, PrivateMediaDownloadKind } from "./private-media-pexels-adapter.ts";

export type PrivateMediaReadUrlSigner = (input: {
  bucketName: string;
  storageKey: string;
  responseContentDisposition: "inline" | "attachment";
  responseContentType: string;
}) => string;

export type ResolvePrivateMediaDownloadResult =
  | {
      ok: true;
      status: 302;
      location: string;
      contentType: string;
      contentDisposition: "inline" | "attachment";
      payload: PrivateMediaDownloadTokenPayload;
    }
  | {
      ok: false;
      status: 401 | 410;
      code:
        | "PRIVATE_MEDIA_DOWNLOAD_TOKEN_INVALID"
        | "PRIVATE_MEDIA_DOWNLOAD_EXPIRED"
        | "PRIVATE_MEDIA_DOWNLOAD_REVOKED"
        | "PRIVATE_MEDIA_DOWNLOAD_ARCHIVED"
        | "PRIVATE_MEDIA_DOWNLOAD_QUARANTINED"
        | "PRIVATE_MEDIA_DOWNLOAD_MISSING_OBJECT";
      message: string;
    };

type PrivateMediaDownloadUnavailableCode = Extract<
  ResolvePrivateMediaDownloadResult,
  { ok: false }
>["code"];

export async function resolvePrivateMediaDownload(input: {
  token: string;
  secret: string;
  now: string;
  repository: PrivateMediaClipRepository;
  signReadUrl: PrivateMediaReadUrlSigner;
}): Promise<ResolvePrivateMediaDownloadResult> {
  const verified = verifyPrivateMediaDownloadToken({
    token: input.token,
    secret: input.secret,
    now: input.now,
  });

  if (!verified.ok) {
    return {
      ok: false,
      status: verified.error === "expired" ? 410 : 401,
      code: verified.error === "expired"
        ? "PRIVATE_MEDIA_DOWNLOAD_EXPIRED"
        : "PRIVATE_MEDIA_DOWNLOAD_TOKEN_INVALID",
      message: "Private media download token is invalid or expired.",
    };
  }

  const clip = await input.repository.getClipById({
    clipId: verified.payload.clipId,
  });
  if (!clip || clip.status !== "ready") {
    return unavailableDownloadResult(clip);
  }

  const storageKey = getStorageKeyForDownloadKind(clip, verified.payload.kind);
  if (!storageKey) {
    return {
      ok: false,
      status: 410,
      code: "PRIVATE_MEDIA_DOWNLOAD_MISSING_OBJECT",
      message: "Private media object is missing.",
    };
  }

  const contentType = getContentTypeForDownloadKind(clip, verified.payload.kind);
  const contentDisposition = "inline";

  return {
    ok: true,
    status: 302,
    location: input.signReadUrl({
      bucketName: clip.bucketName,
      storageKey,
      responseContentDisposition: contentDisposition,
      responseContentType: contentType,
    }),
    contentType,
    contentDisposition,
    payload: verified.payload,
  };
}

function unavailableDownloadResult(clip: PrivateMediaClipRecord | null): ResolvePrivateMediaDownloadResult {
  if (clip?.status === "archived") {
    return unavailable("PRIVATE_MEDIA_DOWNLOAD_ARCHIVED", "Private media has been archived.");
  }
  if (clip?.status === "quarantined") {
    return unavailable("PRIVATE_MEDIA_DOWNLOAD_QUARANTINED", "Private media has been quarantined.");
  }
  if (clip?.status === "missing_object") {
    return unavailable("PRIVATE_MEDIA_DOWNLOAD_MISSING_OBJECT", "Private media object is missing.");
  }

  return unavailable("PRIVATE_MEDIA_DOWNLOAD_REVOKED", "Private media is no longer available.");
}

function unavailable(
  code: PrivateMediaDownloadUnavailableCode,
  message: string,
): ResolvePrivateMediaDownloadResult {
  return {
    ok: false,
    status: 410,
    code,
    message,
  };
}

function getStorageKeyForDownloadKind(clip: PrivateMediaClipRecord, kind: PrivateMediaDownloadKind) {
  if (kind === "thumb") {
    return clip.thumbCosKey ?? null;
  }

  return clip.cosKey;
}

function getContentTypeForDownloadKind(clip: PrivateMediaClipRecord, kind: PrivateMediaDownloadKind) {
  if (kind === "thumb") {
    return "image/jpeg";
  }

  return clip.mimeType || "application/octet-stream";
}
