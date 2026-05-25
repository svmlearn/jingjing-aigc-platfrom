import {
  buildPexelsPhotoSearchResponse,
  buildPexelsVideoSearchResponse,
  type PexelsSearchInput,
  type PrivateMediaClipRecord,
  type PrivateMediaDownloadKind,
  type PrivateMediaSignedUrl,
} from "./private-media-pexels-adapter.ts";
import type { PrivateMediaClipRepository } from "./private-media-fixture-repository.ts";
import { getPrivateMediaRepository } from "./db/merchant-media-repository.ts";
import { createPrivateMediaDownloadToken } from "./private-media-download-token.ts";

export type PrivateMediaPexelsSearchKind = "video" | "photo";
export type PexelsVideoSearchResponse = ReturnType<typeof buildPexelsVideoSearchResponse>;
export type PexelsPhotoSearchResponse = ReturnType<typeof buildPexelsPhotoSearchResponse>;

export class PrivateMediaPexelsQueryError extends Error {
  code = "PRIVATE_MEDIA_PEXELS_QUERY_INVALID" as const;
}

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
type SearchPrivateMediaPexelsInput = {
  merchantId: string;
  requestUrl: string;
  kind: PrivateMediaPexelsSearchKind;
  repository?: PrivateMediaClipRepository;
  now?: string;
};

export async function searchPrivateMediaPexels(
  input: SearchPrivateMediaPexelsInput & { kind: "video" },
): Promise<PexelsVideoSearchResponse>;
export async function searchPrivateMediaPexels(
  input: SearchPrivateMediaPexelsInput & { kind: "photo" },
): Promise<PexelsPhotoSearchResponse>;
export async function searchPrivateMediaPexels(
  input: SearchPrivateMediaPexelsInput,
): Promise<PexelsVideoSearchResponse | PexelsPhotoSearchResponse> {
  const requestUrl = new URL(input.requestUrl);
  const now = input.now ?? new Date().toISOString();
  const repository = input.repository ?? getPrivateMediaRepository();
  const clips = await repository.listClipsByMerchant({ merchantId: input.merchantId });
  const searchInput: PexelsSearchInput = {
    clips,
    merchantId: input.merchantId,
    query: requestUrl.searchParams.get("query") ?? "",
    page: parsePositiveInteger(requestUrl.searchParams.get("page")),
    perPage: parsePositiveInteger(requestUrl.searchParams.get("per_page")),
    orientation: parseOrientation(requestUrl.searchParams.get("orientation")),
    minVideoDuration: parsePositiveInteger(requestUrl.searchParams.get("min_video_duration")),
    maxVideoDuration: parsePositiveInteger(requestUrl.searchParams.get("max_video_duration")),
    now,
    signDownloadUrl: (clip: PrivateMediaClipRecord, kind: PrivateMediaDownloadKind) =>
      signPrivateMediaDownloadUrl({
        clip,
        kind,
        requestUrl,
        now,
      }),
  };

  if (input.kind === "video") {
    return buildPexelsVideoSearchResponse(searchInput);
  }

  return buildPexelsPhotoSearchResponse(searchInput);
}

export function signPrivateMediaDownloadUrl(input: {
  clip: PrivateMediaClipRecord;
  kind: PrivateMediaDownloadKind;
  requestUrl: URL;
  now: string;
}): PrivateMediaSignedUrl | null {
  if (!isDownloadKindAvailable(input.clip, input.kind)) {
    return null;
  }

  const expiresAt = new Date(Date.parse(input.now) + SIXTY_DAYS_MS).toISOString();
  const token = createPrivateMediaDownloadToken({
    secret: getPrivateMediaDownloadTokenSecret(),
    payload: {
      clipId: input.clip.id,
      kind: input.kind,
      expiresAt,
    },
  });
  const url = new URL(`/api/private-media/download/${encodeURIComponent(token)}`, input.requestUrl);

  return {
    url: url.toString(),
    expiresAt,
  };
}

export function getPrivateMediaDownloadTokenSecret() {
  const secret = process.env.PRIVATE_MEDIA_DOWNLOAD_TOKEN_SECRET?.trim();

  if (!secret) {
    throw new Error("PRIVATE_MEDIA_DOWNLOAD_TOKEN_SECRET is required.");
  }

  return secret;
}

function parsePositiveInteger(value: string | null) {
  if (value == null || value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new PrivateMediaPexelsQueryError("Pagination and duration parameters must be positive integers.");
  }

  return parsed;
}

function parseOrientation(value: string | null): PexelsSearchInput["orientation"] {
  if (!value) {
    return null;
  }

  if (value === "portrait" || value === "landscape") {
    return value;
  }

  throw new PrivateMediaPexelsQueryError("orientation must be portrait or landscape.");
}

function isDownloadKindAvailable(clip: PrivateMediaClipRecord, kind: PrivateMediaDownloadKind) {
  if (kind === "thumb") {
    return Boolean(clip.thumbStorageKey);
  }

  return Boolean(clip.storageKey);
}
