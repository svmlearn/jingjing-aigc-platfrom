export type PrivateMediaClipStatus =
  | "ready"
  | "tagging_failed"
  | "archived"
  | "quarantined"
  | "missing_object";

export type PrivateMediaClipType = "full_video" | "segment" | "image";

export type PrivateMediaClipRecord = {
  id: string;
  assetId?: string;
  merchantId: string;
  mediaType: "image" | "video";
  status: PrivateMediaClipStatus;
  clipIndex?: number;
  clipType?: PrivateMediaClipType;
  startTimeSeconds?: number | null;
  endTimeSeconds?: number | null;
  width: number;
  height: number;
  durationSeconds?: number | null;
  orientation: "portrait" | "landscape";
  description: string;
  tags: string[];
  industryTags?: string[];
  sceneTags?: string[];
  shotTags?: string[];
  peopleTags?: string[];
  qualityTags?: string[];
  tagConfidence?: number | null;
  tagSource?: string | null;
  bucketName: string;
  cosKey: string;
  thumbCosKey?: string | null;
  mimeType: string;
  createdAt: string;
};

export type PrivateMediaDownloadKind =
  | "video"
  | "thumb"
  | "original"
  | "large"
  | "medium"
  | "portrait"
  | "landscape";

export type PrivateMediaSignedUrl = {
  url: string;
  expiresAt: string;
};

export type PrivateMediaUrlSigner = (
  clip: PrivateMediaClipRecord,
  kind: PrivateMediaDownloadKind,
) => PrivateMediaSignedUrl | null;

export type PexelsSearchInput = {
  clips: PrivateMediaClipRecord[];
  merchantId: string;
  query?: string | null;
  page?: number | null;
  perPage?: number | null;
  orientation?: "portrait" | "landscape" | null;
  minVideoDuration?: number | null;
  maxVideoDuration?: number | null;
  now: string;
  signDownloadUrl: PrivateMediaUrlSigner;
};

export function buildPexelsVideoSearchResponse(input: PexelsSearchInput) {
  const page = normalizePage(input.page);
  const perPage = normalizePerPage(input.perPage);
  const results = paginateSignedClips({
    ...input,
    mediaType: "video",
    page,
    perPage,
    requiredKinds: ["thumb", "video"],
  });

  return {
    page,
    per_page: perPage,
    total_results: results.totalResults,
    videos: results.items.map(({ clip, urls }) => ({
      id: clip.id,
      width: clip.width,
      height: clip.height,
      duration: Math.round(clip.durationSeconds ?? 0),
      image: urls.thumb.url,
      video_files: [
        {
          id: `${clip.id}_hd`,
          quality: "hd",
          file_type: clip.mimeType || "video/mp4",
          width: clip.width,
          height: clip.height,
          link: urls.video.url,
        },
      ],
    })),
    next_page: buildNextPage({
      basePath: "/api/private-media/pexels/videos/search",
      page,
      perPage,
      totalResults: results.totalResults,
      query: input.query,
    }),
  };
}

export function buildPexelsPhotoSearchResponse(input: PexelsSearchInput) {
  const page = normalizePage(input.page);
  const perPage = normalizePerPage(input.perPage);
  const results = paginateSignedClips({
    ...input,
    mediaType: "image",
    page,
    perPage,
    requiredKinds: ["original", "large", "medium", "portrait", "landscape"],
  });

  return {
    page,
    per_page: perPage,
    total_results: results.totalResults,
    photos: results.items.map(({ clip, urls }) => ({
      id: clip.id,
      width: clip.width,
      height: clip.height,
      url: urls.original.url,
      src: {
        original: urls.original.url,
        large: urls.large.url,
        medium: urls.medium.url,
        portrait: urls.portrait.url,
        landscape: urls.landscape.url,
      },
    })),
    next_page: buildNextPage({
      basePath: "/api/private-media/pexels/v1/search",
      page,
      perPage,
      totalResults: results.totalResults,
      query: input.query,
    }),
  };
}

function paginateSignedClips(input: PexelsSearchInput & {
  mediaType: PrivateMediaClipRecord["mediaType"];
  page: number;
  perPage: number;
  requiredKinds: PrivateMediaDownloadKind[];
}) {
  const eligible = searchPrivateMediaClips(input)
    .map((clip) => {
      const urls = signRequiredUrls({
        clip,
        kinds: input.requiredKinds,
        now: input.now,
        signDownloadUrl: input.signDownloadUrl,
      });

      return urls ? { clip, urls } : null;
    })
    .filter((item): item is { clip: PrivateMediaClipRecord; urls: Record<PrivateMediaDownloadKind, PrivateMediaSignedUrl> } =>
      Boolean(item),
    );
  const start = (input.page - 1) * input.perPage;

  return {
    totalResults: eligible.length,
    items: eligible.slice(start, start + input.perPage),
  };
}

export function searchPrivateMediaClips(input: {
  clips: PrivateMediaClipRecord[];
  merchantId: string;
  mediaType: PrivateMediaClipRecord["mediaType"];
  query?: string | null;
  orientation?: "portrait" | "landscape" | null;
  minVideoDuration?: number | null;
  maxVideoDuration?: number | null;
}) {
  const terms = tokenize(input.query);

  return input.clips
    .filter((clip) => clip.merchantId === input.merchantId)
    .filter((clip) => clip.mediaType === input.mediaType)
    .filter((clip) => clip.status === "ready")
    .filter((clip) => !input.orientation || clip.orientation === input.orientation)
    .filter((clip) =>
      input.mediaType !== "video" || input.minVideoDuration == null
        ? true
        : (clip.durationSeconds ?? 0) >= input.minVideoDuration,
    )
    .filter((clip) =>
      input.mediaType !== "video" || input.maxVideoDuration == null
        ? true
        : (clip.durationSeconds ?? 0) <= input.maxVideoDuration,
    )
    .map((clip) => ({
      clip,
      score: scoreClip(clip, terms),
    }))
    .filter((item) => terms.length === 0 || item.score > 0)
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      const createdDelta = right.clip.createdAt.localeCompare(left.clip.createdAt);
      if (createdDelta !== 0) {
        return createdDelta;
      }
      return left.clip.id.localeCompare(right.clip.id);
    })
    .map((item) => item.clip);
}

function signRequiredUrls(input: {
  clip: PrivateMediaClipRecord;
  kinds: PrivateMediaDownloadKind[];
  now: string;
  signDownloadUrl: PrivateMediaUrlSigner;
}) {
  const urls: Partial<Record<PrivateMediaDownloadKind, PrivateMediaSignedUrl>> = {};

  for (const kind of input.kinds) {
    const signed = input.signDownloadUrl(input.clip, kind);
    if (!signed || !isAtLeastSixtyDays(input.now, signed.expiresAt)) {
      return null;
    }
    urls[kind] = signed;
  }

  return urls as Record<PrivateMediaDownloadKind, PrivateMediaSignedUrl>;
}

function isAtLeastSixtyDays(now: string, expiresAt: string) {
  const nowMs = Date.parse(now);
  const expiresMs = Date.parse(expiresAt);

  if (!Number.isFinite(nowMs) || !Number.isFinite(expiresMs)) {
    return false;
  }

  return expiresMs - nowMs >= 60 * 24 * 60 * 60 * 1000;
}

function scoreClip(clip: PrivateMediaClipRecord, terms: string[]) {
  if (terms.length === 0) {
    return 0;
  }
  const haystack = [
    clip.description,
    ...clip.tags,
    ...(clip.industryTags ?? []),
    ...(clip.sceneTags ?? []),
    ...(clip.shotTags ?? []),
    ...(clip.peopleTags ?? []),
    ...(clip.qualityTags ?? []),
  ]
    .join(" ")
    .normalize("NFKC")
    .toLowerCase();

  return terms.filter((term) => haystack.includes(term)).length;
}

function buildNextPage(input: {
  basePath: string;
  page: number;
  perPage: number;
  totalResults: number;
  query?: string | null;
}) {
  if (input.page * input.perPage >= input.totalResults) {
    return null;
  }

  const params = new URLSearchParams({
    page: String(input.page + 1),
    per_page: String(input.perPage),
  });
  if (input.query?.trim()) {
    params.set("query", input.query.trim());
  }

  return `${input.basePath}?${params.toString()}`;
}

function normalizePage(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 1;
}

function normalizePerPage(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return 10;
  }

  return Math.min(value, 80);
}

function tokenize(value: string | null | undefined) {
  return Array.from(
    new Set(
      (value ?? "")
        .normalize("NFKC")
        .toLowerCase()
        .split(/[\s,，;；]+/)
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  );
}
