import type { PrivateMediaClipRecord } from "@/lib/private-media-pexels-adapter";
import { searchPrivateMediaClips } from "@/lib/private-media-pexels-adapter";
import { tokenizeMaterialRetrievalQuery } from "@/lib/material-retrieval";
import type {
  ConsultationAgentToolCall,
  ConsultationAgentToolResult,
} from "@/server/api/consultation-runtime/types";
import {
  clipText,
  uniqueStrings,
} from "@/server/api/consultation-runtime/utils";

export function buildProjectVideoMaterialsResultFromClips(input: {
  call: ConsultationAgentToolCall;
  merchantId: string;
  clips: PrivateMediaClipRecord[];
}): ConsultationAgentToolResult {
  const query = typeof input.call.args.query === "string" ? input.call.args.query.trim() : "";
  const visibleQuery = scrubProjectVideoQuery(query);
  const limit = normalizeSearchLimit(input.call.args.limit, 8);
  const orientation = parseVideoOrientation(input.call.args.orientation);
  const minDurationSeconds = normalizeOptionalDuration(input.call.args.minDurationSeconds);
  const maxDurationSeconds = normalizeOptionalDuration(input.call.args.maxDurationSeconds);

  if (
    minDurationSeconds != null &&
    maxDurationSeconds != null &&
    maxDurationSeconds < minDurationSeconds
  ) {
    return buildProjectVideoSearchFailure({
      call: input.call,
      summary: "视频素材检索参数无效：maxDurationSeconds 不能小于 minDurationSeconds。",
      errorType: "tool_arguments_validation_failed",
      error: "maxDurationSeconds must be greater than or equal to minDurationSeconds.",
    });
  }

  const matches = searchPrivateMediaClips({
    clips: input.clips,
    merchantId: input.merchantId,
    mediaType: "video",
    query: query || null,
    orientation,
    minVideoDuration: minDurationSeconds,
    maxVideoDuration: maxDurationSeconds,
  });
  const returnedClips = matches.slice(0, limit);
  const filters = {
    orientation: orientation ?? null,
    minDurationSeconds: minDurationSeconds ?? null,
    maxDurationSeconds: maxDurationSeconds ?? null,
    status: "ready",
    mediaType: "video",
  };

  if (matches.length === 0) {
    return {
      callId: input.call.id,
      toolName: input.call.toolName,
      status: "skipped",
      summary: "没有命中 ready 视频素材，未检索到可用于本轮参考的当前商家视频素材。",
      payload: {
        query: visibleQuery,
        filters,
        matchCount: 0,
        clips: [],
      },
    };
  }

  return {
    callId: input.call.id,
    toolName: input.call.toolName,
    status: "completed",
    summary: `命中 ${matches.length} 个 ready 视频素材，返回 ${returnedClips.length} 个紧凑素材引用。`,
    payload: {
      query: visibleQuery,
      filters,
      matchCount: matches.length,
      clips: returnedClips.map((clip) => ({
        clipId: clip.id,
        assetId: scrubProjectVideoIdentifier(clip.assetId),
        title: buildSafeProjectVideoClipTitle(clip),
        description: buildSafeProjectVideoDescription(clip),
        tags: compactStringArray(clip.tags, 12, 40),
        sceneTags: compactStringArray(clip.sceneTags ?? [], 10, 40),
        shotTags: compactStringArray(clip.shotTags ?? [], 10, 40),
        peopleTags: compactStringArray(clip.peopleTags ?? [], 10, 40),
        qualityTags: compactStringArray(clip.qualityTags ?? [], 10, 40),
        width: clip.width,
        height: clip.height,
        orientation: clip.orientation,
        durationSeconds: clip.durationSeconds ?? null,
        matchReason: buildSafeProjectVideoMatchReason(clip, visibleQuery, filters),
      })),
    },
  };
}

function normalizeSearchLimit(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(Math.max(Math.trunc(value), 1), 12)
    : fallback;
}

function normalizeOptionalDuration(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : undefined;
}

function parseVideoOrientation(value: unknown): PrivateMediaClipRecord["orientation"] | null {
  return value === "landscape" || value === "portrait" ? value : null;
}

function buildSafeProjectVideoClipTitle(clip: PrivateMediaClipRecord) {
  const titleParts = compactStringArray([
    ...(clip.sceneTags ?? []),
    ...(clip.shotTags ?? []),
    ...(clip.peopleTags ?? []),
    ...clip.tags,
  ], 3, 24);

  return titleParts.length > 0 ? titleParts.join(" · ") : "项目视频素材";
}

function buildSafeProjectVideoDescription(clip: PrivateMediaClipRecord) {
  const parts: string[] = [];
  const semanticGroups: Array<[string, string[]]> = [
    ["标签", compactStringArray(clip.tags, 8, 32)],
    ["场景", compactStringArray(clip.sceneTags ?? [], 6, 32)],
    ["镜头", compactStringArray(clip.shotTags ?? [], 6, 32)],
    ["人物", compactStringArray(clip.peopleTags ?? [], 6, 32)],
    ["质量", compactStringArray(clip.qualityTags ?? [], 6, 32)],
  ];

  for (const [label, values] of semanticGroups) {
    if (values.length > 0) {
      parts.push(`${label}：${values.join("、")}`);
    }
  }

  const facts = [
    `方向：${clip.orientation}`,
    `尺寸：${Math.trunc(clip.width)}x${Math.trunc(clip.height)}`,
  ];
  if (typeof clip.durationSeconds === "number" && Number.isFinite(clip.durationSeconds)) {
    facts.push(`时长：${Math.round(clip.durationSeconds)}秒`);
  }
  parts.push(facts.join("；"));

  return parts.length > 0
    ? clipText(parts.join("；"), 260)
    : "已保存视频素材，描述中仅保留安全语义字段。";
}

function buildSafeProjectVideoMatchReason(
  clip: PrivateMediaClipRecord,
  query: string,
  filters: Record<string, unknown>,
) {
  const terms = tokenizeMaterialRetrievalQuery(query)
    .map(scrubSensitiveProjectVideoText)
    .filter((term) => term.length >= 2);
  const haystack = normalizeSearchText([
    ...clip.tags,
    ...(clip.sceneTags ?? []),
    ...(clip.shotTags ?? []),
    ...(clip.peopleTags ?? []),
    ...(clip.qualityTags ?? []),
  ].join(" "));
  const hitTerms = terms.filter((term) => haystack.includes(normalizeSearchText(term)));

  if (hitTerms.length > 0) {
    return `命中素材标签或安全元数据关键词：${uniqueStrings(hitTerms).slice(0, 6).join("、")}`;
  }

  if (query.trim()) {
    return "符合 ready 视频素材与筛选条件。";
  }

  const activeFilters = Object.entries(filters)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`);

  return activeFilters.length > 0
    ? `最近 ready 视频素材；筛选：${activeFilters.join(", ")}`
    : "最近 ready 视频素材。";
}

function scrubSensitiveProjectVideoText(value: string | null | undefined) {
  const text = value?.trim() ?? "";

  if (!text) {
    return "";
  }

  if (containsSensitiveProjectVideoMarker(text)) {
    return "";
  }

  return text
    .replace(/oss:\/\/[^\s"',，。)）]+/gi, "")
    .replace(/https?:\/\/[^\s"',，。)）]+/gi, "")
    .replace(/[A-Za-z0-9_=-]{32,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scrubProjectVideoQuery(value: string) {
  const withoutExternalRefs = value
    .replace(/oss:\/\/[^\s"',，。)）]+/gi, "")
    .replace(/https?:\/\/[^\s"',，。)）]+/gi, "")
    .replace(/[A-Za-z0-9_=-]{32,}/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return scrubSensitiveProjectVideoText(withoutExternalRefs);
}

function containsSensitiveProjectVideoMarker(value: string) {
  return sensitiveProjectVideoTextPatterns.some((pattern) => pattern.test(value));
}

function scrubProjectVideoIdentifier(value: string | undefined) {
  if (!value) {
    return null;
  }

  return containsSensitiveProjectVideoMarker(value) ? null : value;
}

function buildProjectVideoSearchFailure(input: {
  call: ConsultationAgentToolCall;
  summary: string;
  errorType: string;
  error: string;
}): ConsultationAgentToolResult {
  return {
    callId: input.call.id,
    toolName: input.call.toolName,
    status: "failed",
    summary: input.summary,
    payload: {
      errorType: input.errorType,
      error: clipText(input.error, 240),
    },
  };
}

function compactStringArray(values: string[], maxItems: number, maxLength: number) {
  return uniqueStrings(values)
    .map((value) => scrubSensitiveProjectVideoText(value))
    .filter((value) => value.length > 0)
    .map((value) => clipText(value, maxLength))
    .slice(0, maxItems);
}

function normalizeSearchText(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

const sensitiveProjectVideoTextPatterns = [
  /sourceStorageKey/i,
  /bucketName/i,
  /storageKey/i,
  /thumbStorageKey/i,
  /signed(?:Preview|Download)?Url/i,
  /downloadToken/i,
  /download[_-]?token/i,
  /structureSummary/i,
  /tracePayload/i,
  /engagementSnapshot/i,
  /importedForEmail/i,
  /importBatch/i,
  /providerPayload/i,
  /oss:\/\//i,
  /https?:\/\//i,
];
