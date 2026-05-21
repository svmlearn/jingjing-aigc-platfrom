import type { MaterialPlatform, MaterialType } from "@/contracts/material";
import type { NormalizedComment } from "@/server/import-providers/types";
import type { TikHubBenchmarkFindMethod, TikHubMaterialItem } from "@/server/import-providers/tikhub/types";

type NormalizeInput = {
  platform: MaterialPlatform;
  findMethod: TikHubBenchmarkFindMethod;
  target: string;
  cacheKey: string;
  payload: unknown;
  limit: number;
};

export function normalizeTikHubMaterialItems(input: NormalizeInput): TikHubMaterialItem[] {
  const candidates =
    input.platform === "xiaohongshu"
      ? collectXiaohongshuItems(input.payload)
      : collectDouyinAwemeItems(input.payload);
  const sourceType = mapFindMethodToSourceType(input.findMethod);

  const normalizedItems = candidates
    .map((candidate, index) => {
      const normalized =
        input.platform === "xiaohongshu"
          ? normalizeXiaohongshuItem(candidate, input, index)
          : normalizeDouyinItem(candidate, input, index);

      return normalized;
    })
    .filter((item): item is TikHubMaterialItem => Boolean(item))
    .filter((item) => Boolean(item.externalItemId || item.sourceUrl || item.title));

  return dedupeTikHubMaterialItems(normalizedItems)
    .map((item) => ({
      ...item,
      sourceKind: "benchmark" as const,
      sourceType,
      tracePayload: {
        ...item.tracePayload,
        materialLibrary: true,
        materialSourceKind: "benchmark",
        materialProvider: "tikhub",
        materialProviderCacheKey: input.cacheKey,
        materialBenchmark: {
          platform: input.platform,
          findMethod: input.findMethod,
          target: input.target,
        },
      },
    }))
    .slice(0, input.limit);
}

export function buildTikHubBenchmarkCacheKey(input: {
  platform: MaterialPlatform;
  findMethod: TikHubBenchmarkFindMethod;
  target: string;
}) {
  return [
    "tikhub_material_v1",
    input.platform,
    input.findMethod,
    normalizeCacheText(input.target),
  ].join(":");
}

export function normalizeTikHubComments(input: {
  platform: MaterialPlatform;
  payload: unknown;
  limit: number;
}): NormalizedComment[] {
  const candidates =
    input.platform === "xiaohongshu"
      ? collectXiaohongshuCommentItems(input.payload)
      : collectDouyinCommentItems(input.payload);

  return dedupeComments(candidates)
    .filter((comment) => comment.content.trim().length > 0)
    .slice(0, input.limit);
}

function collectXiaohongshuItems(payload: unknown): Record<string, unknown>[] {
  const root = toRecord(payload);
  const directItems = [
    ...toArray(getPath(root, ["data", "data", 0, "note_list"])),
    ...toArray(getPath(root, ["data", "data", "note_list"])),
    ...toArray(getPath(root, ["data", "data", "items"])),
    ...toArray(getPath(root, ["data", "data", "notes"])),
    ...toArray(getPath(root, ["data", "items"])),
    ...toArray(getPath(root, ["data", "notes"])),
  ].filter(isRecord);

  if (directItems.length > 0) {
    return directItems;
  }

  return collectObjects(payload).filter((record) =>
    Boolean(record.noteCard || record.note_id || record.noteId || record.id),
  );
}

function normalizeXiaohongshuItem(
  item: Record<string, unknown>,
  input: NormalizeInput,
  index: number,
): TikHubMaterialItem | null {
  const noteCard = toRecord(item.noteCard ?? item.note_card ?? item);
  const externalItemId =
    getString(item.id) ??
    getString(item.note_id) ??
    getString(item.noteId) ??
    getString(noteCard.note_id) ??
    getString(noteCard.noteId);
  const title =
    getString(noteCard.displayTitle) ??
    getString(noteCard.display_title) ??
    getString(noteCard.title) ??
    getString(noteCard.desc) ??
    `${input.target} · 小红书对标素材 ${index + 1}`;
  const user = toRecord(noteCard.user ?? item.user ?? item.userInfo ?? item.user_info);
  const interactInfo = toRecord(noteCard.interactInfo ?? noteCard.interact_info ?? item.interactInfo);
  const xsecToken = getString(item.xsecToken ?? item.xsec_token);
  const noteType = getString(noteCard.type ?? item.type);
  const materialType: MaterialType = noteType === "video" ? "video" : "article";
  const sourceUrl =
    getString(
      item.url ??
        item.shareUrl ??
        item.share_url ??
        getPath(item, ["share_info", "link"]) ??
        getPath(noteCard, ["share_info", "link"]),
    ) ??
    (externalItemId
      ? `https://www.xiaohongshu.com/explore/${externalItemId}${xsecToken ? `?xsec_token=${encodeURIComponent(xsecToken)}` : ""}`
      : null);
  const coverUrl = firstString([
    getPath(noteCard, ["cover", "urlDefault"]),
    getPath(noteCard, ["cover", "urlPre"]),
    getPath(noteCard, ["cover", "url"]),
    getPath(noteCard, ["cover", "url_default"]),
    getPath(noteCard, ["image_list", 0, "url"]),
    getPath(noteCard, ["image_list", 0, "url_default"]),
    getPath(noteCard, ["images_list", 0, "url"]),
    getPath(noteCard, ["images", 0, "url"]),
    getPath(noteCard, ["video_info", "image", "url_list", 0]),
    getPath(noteCard, ["video_info_v2", "image", "thumbnail"]),
    getPath(noteCard, ["video_info_v2", "image", "first_frame"]),
  ]);
  const likedCount = parseCount(
    interactInfo.likedCount ??
      interactInfo.likeCount ??
      interactInfo.likes ??
      noteCard.liked_count ??
      noteCard.like_count ??
      noteCard.likes ??
      noteCard.nice_count ??
      item.liked_count,
  );
  const commentCount = parseCount(
    interactInfo.commentCount ??
      interactInfo.comments ??
      noteCard.comments_count ??
      noteCard.comment_count ??
      item.comments_count,
  );
  const collectedCount = parseCount(
    interactInfo.collectedCount ??
      interactInfo.collectCount ??
      noteCard.collected_count ??
      noteCard.collect_count ??
      item.collected_count,
  );
  const shareCount = parseCount(
    interactInfo.shareCount ??
      interactInfo.share_count ??
      noteCard.share_count ??
      item.share_count,
  );
  const playCount = parseCount(
    interactInfo.viewCount ??
      interactInfo.view_count ??
      noteCard.view_count ??
      item.view_count,
  );

  return {
    platform: "xiaohongshu",
    materialType,
    sourceKind: "benchmark",
    sourceType: mapFindMethodToSourceType(input.findMethod),
    externalItemId,
    sourceUrl,
    creatorId: getString(user.user_id ?? user.userId ?? user.id),
    creatorName: getString(user.nickname ?? user.nickName ?? user.name),
    title,
    description: getString(noteCard.desc ?? noteCard.description ?? noteCard.displayTitle ?? noteCard.display_title),
    engagementSnapshot: {
      label: formatEngagementLabel({
        likedCount,
        commentCount,
        collectedCount,
        shareCount,
        playCount,
      }),
      likedCount,
      commentCount,
      collectedCount,
      shareCount,
      playCount,
    },
    structureSummary: {
      materialType,
      materialStatus: "ready",
      provider: "tikhub",
      providerEndpointFamily: "xiaohongshu",
      noteType: noteType ?? materialType,
      coverUrl,
      tags: collectTagNames(
        noteCard.tags ??
          noteCard.tagList ??
          noteCard.tag_list ??
          noteCard.topics ??
          noteCard.hash_tag ??
          noteCard.foot_tags ??
          noteCard.head_tags,
      ),
      rank: index + 1,
    },
    tracePayload: {
      providerRawItem: item,
      xsecToken: xsecToken ?? null,
    },
  };
}

function collectDouyinAwemeItems(payload: unknown): Record<string, unknown>[] {
  return collectObjects(payload).filter((record) => Boolean(record.aweme_id || record.awemeId));
}

function dedupeTikHubMaterialItems(items: TikHubMaterialItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key =
      item.externalItemId
        ? `${item.platform}:external:${item.externalItemId}`
        : item.sourceUrl
          ? `${item.platform}:url:${item.sourceUrl}`
          : `${item.platform}:title:${item.title}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function mapFindMethodToSourceType(findMethod: TikHubBenchmarkFindMethod): "detail" | "creator" | "search" {
  if (findMethod === "detail") return "detail";
  if (findMethod === "profile") return "creator";
  return "search";
}

function collectXiaohongshuCommentItems(payload: unknown): NormalizedComment[] {
  return collectObjects(payload).flatMap((record) => {
    const comment = toRecord(record.comment ?? record);
    const content = firstString([
      comment.content,
      comment.text,
      comment.comment,
    ]);

    if (!content || !hasCommentShape(comment)) {
      return [];
    }

    const user = toRecord(comment.user_info ?? comment.userInfo ?? comment.user ?? record.user_info);

    return [{
      externalCommentId: getString(comment.id ?? comment.commentId ?? comment.comment_id) ?? undefined,
      parentExternalCommentId: getString(
        comment.parent_id ??
          comment.parentId ??
          comment.parent_comment_id ??
          comment.parentCommentId,
      ) ?? undefined,
      authorName: getString(user.nickname ?? user.name ?? comment.nickname) ?? undefined,
      content,
      likeCount: parseCount(comment.like_count ?? comment.likeCount ?? comment.likes) ?? undefined,
      replyCount: parseCount(
        comment.sub_comment_count ??
          comment.subCommentCount ??
          comment.reply_count ??
          comment.replyCount,
      ) ?? undefined,
      publishedAt: parsePlatformTime(comment.create_time ?? comment.createTime ?? comment.createdAt),
      tracePayload: record,
    }];
  });
}

function collectDouyinCommentItems(payload: unknown): NormalizedComment[] {
  return collectObjects(payload).flatMap((record) => {
    const content = firstString([
      record.text,
      record.content,
      record.comment,
    ]);

    if (!content || !hasCommentShape(record)) {
      return [];
    }

    const user = toRecord(record.user ?? record.userInfo ?? record.user_info);

    return [{
      externalCommentId: getString(record.cid ?? record.id ?? record.commentId ?? record.comment_id) ?? undefined,
      parentExternalCommentId: getString(
        record.reply_to_comment_id ??
          record.replyToCommentId ??
          record.parent_id ??
          record.parentId,
      ) ?? undefined,
      authorName: getString(user.nickname ?? user.name ?? record.nickname) ?? undefined,
      content,
      likeCount: parseCount(record.digg_count ?? record.diggCount ?? record.like_count ?? record.likeCount) ?? undefined,
      replyCount: parseCount(
        record.reply_comment_total ??
          record.replyCommentTotal ??
          record.reply_count ??
          record.replyCount,
      ) ?? undefined,
      publishedAt: parsePlatformTime(record.create_time ?? record.createTime ?? record.createdAt),
      tracePayload: record,
    }];
  });
}

function hasCommentShape(record: Record<string, unknown>) {
  return Boolean(
    record.cid ||
      record.commentId ||
      record.comment_id ||
      record.parent_id ||
      record.parentId ||
      record.sub_comments ||
      record.subComments ||
      record.reply_count ||
      record.replyCount ||
      record.like_count ||
      record.likeCount ||
      record.digg_count ||
      record.diggCount ||
      record.user_info ||
      record.userInfo ||
      record.user,
  );
}

function dedupeComments(comments: NormalizedComment[]) {
  const seen = new Set<string>();

  return comments.filter((comment) => {
    const key = comment.externalCommentId
      ? `id:${comment.externalCommentId}`
      : `content:${comment.authorName ?? ""}:${comment.content}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizeDouyinItem(
  aweme: Record<string, unknown>,
  input: NormalizeInput,
  index: number,
): TikHubMaterialItem | null {
  const awemeId = getString(aweme.aweme_id ?? aweme.awemeId ?? aweme.id);
  const author = toRecord(aweme.author);
  const statistics = toRecord(aweme.statistics);
  const video = toRecord(aweme.video);
  const coverUrl = firstString([
    getPath(video, ["cover", "url_list", 0]),
    getPath(video, ["origin_cover", "url_list", 0]),
    getPath(video, ["dynamic_cover", "url_list", 0]),
  ]);
  const title = getString(aweme.desc) ?? `${input.target} · 抖音对标视频 ${index + 1}`;
  const likedCount = parseCount(statistics.digg_count ?? statistics.like_count);
  const commentCount = parseCount(statistics.comment_count);
  const collectedCount = parseCount(statistics.collect_count);
  const shareCount = parseCount(statistics.share_count);
  const playCount = parseCount(statistics.play_count);

  return {
    platform: "douyin",
    materialType: "video",
    sourceKind: "benchmark",
    sourceType: mapFindMethodToSourceType(input.findMethod),
    externalItemId: awemeId,
    sourceUrl: getString(aweme.share_url ?? aweme.shareUrl) ?? (awemeId ? `https://www.douyin.com/video/${awemeId}` : null),
    creatorId: getString(author.uid ?? author.sec_uid ?? author.secUid),
    creatorName: getString(author.nickname ?? author.name),
    title,
    description: title,
    engagementSnapshot: {
      label: formatEngagementLabel({
        likedCount,
        commentCount,
        collectedCount,
        shareCount,
        playCount,
      }),
      likedCount,
      commentCount,
      collectedCount,
      shareCount,
      playCount,
    },
    structureSummary: {
      materialType: "video",
      materialStatus: "ready",
      provider: "tikhub",
      providerEndpointFamily: "douyin",
      coverUrl,
      durationMs: parseCount(video.duration),
      tags: collectTagNames(aweme.text_extra ?? aweme.textExtra),
      rank: index + 1,
    },
    tracePayload: {
      providerRawItem: aweme,
    },
  };
}

function collectObjects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectObjects);
  }

  if (!isRecord(value)) {
    return [];
  }

  const nested = Object.values(value).flatMap(collectObjects);
  return [value, ...nested];
}

function getPath(value: unknown, path: Array<string | number>): unknown {
  return path.reduce<unknown>((current, key) => {
    if (Array.isArray(current) && typeof key === "number") return current[key];
    if (isRecord(current) && typeof key === "string") return current[key];
    return undefined;
  }, value);
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstString(values: unknown[]) {
  for (const value of values) {
    const stringValue = getString(value);
    if (stringValue) return stringValue;
  }

  return null;
}

function collectTagNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const tags = value.flatMap((item) => {
    if (typeof item === "string") {
      return [item];
    }

    const record = toRecord(item);
    const tag = getString(
      record.name ??
        record.tagName ??
        record.tag_name ??
        record.hashtagName ??
        record.hashtag_name,
    );

    return tag ? [tag] : [];
  });

  return Array.from(new Set(tags.map((tag) => tag.replace(/^#/, "").trim()).filter(Boolean)));
}

function parseCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  const numberValue = Number(normalized.replace(/,/g, ""));
  if (Number.isFinite(numberValue)) return numberValue;

  const multiplier = normalized.includes("万") || normalized.includes("w") ? 10000 : 1;
  const compact = Number(normalized.replace(/[^\d.]/g, ""));

  return Number.isFinite(compact) ? Math.round(compact * multiplier) : null;
}

function parsePlatformTime(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(milliseconds).toISOString();
  }

  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return parsePlatformTime(numeric);
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function formatEngagementLabel(input: {
  likedCount?: number | null;
  commentCount?: number | null;
  collectedCount?: number | null;
  shareCount?: number | null;
  playCount?: number | null;
}) {
  const parts = [
    input.likedCount != null ? `赞 ${formatCount(input.likedCount)}` : null,
    input.commentCount != null ? `评 ${formatCount(input.commentCount)}` : null,
    input.collectedCount != null ? `藏 ${formatCount(input.collectedCount)}` : null,
    input.shareCount != null ? `转 ${formatCount(input.shareCount)}` : null,
    input.playCount != null ? `播 ${formatCount(input.playCount)}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "已抓取";
}

function formatCount(value: number) {
  if (value >= 10000) {
    return `${Number((value / 10000).toFixed(1))}万`;
  }

  return String(value);
}

function normalizeCacheText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 180);
}
