import "server-only";

import type { ImportRequest } from "@/contracts/import";
import type { NormalizedComment, NormalizedSourceItem } from "@/server/import-providers/types";

type JsonRecord = Record<string, unknown>;

export function normalizeApifySourceItems(
  request: ImportRequest,
  items: unknown[],
): NormalizedSourceItem[] {
  if (request.importType === "comments") {
    return [];
  }

  if (request.platform === "xiaohongshu") {
    return items.map((item) => normalizeXiaohongshuSourceItem(request, item));
  }

  return items.map((item) => normalizeDouyinSourceItem(request, item));
}

export function normalizeApifyComments(
  request: ImportRequest,
  items: unknown[],
): NormalizedComment[] {
  if (request.platform === "xiaohongshu") {
    return items.flatMap(normalizeXiaohongshuCommentItem);
  }

  return items.flatMap(normalizeDouyinCommentItem);
}

function normalizeXiaohongshuSourceItem(
  request: ImportRequest,
  value: unknown,
): NormalizedSourceItem {
  const item = asRecord(value);
  const user = firstRecord(item.user, item.userInfo, item.user_info, item.author);
  const images = firstArray(item.images, item.imageList, item.image_list);
  const video = firstRecord(item.video, item.videoInfo, item.video_info);
  const externalItemId = firstString(
    item.id,
    item.noteId,
    item.note_id,
    item.itemId,
    item.aweme_id,
  );
  const sourceUrl = firstString(item.postUrl, item.noteUrl, item.note_url, item.url) ?? request.url;
  const bodyText = firstString(item.description, item.desc, item.body, item.content);
  const scriptText = firstString(item.content, item.text);

  return {
    platform: "xiaohongshu",
    sourceType: request.importType === "creator" ? "creator" : "detail",
    externalItemId,
    sourceUrl,
    creatorId: firstString(user?.userId, user?.user_id, user?.id),
    creatorName: firstString(user?.nickname, user?.name, item.nickname, item.userName),
    title: firstString(item.title, item.displayTitle, item.display_title),
    bodyText,
    scriptText,
    engagementSnapshot: {
      likes: firstNumber(item.likes, item.likeCount, item.like_count),
      comments: firstNumber(item.comments, item.commentCount, item.comment_count),
      collects: firstNumber(item.collects, item.collectCount, item.collect_count),
      shares: firstNumber(item.shares, item.shareCount, item.share_count),
    },
    structureSummary: {
      type: firstString(item.type, item.noteType, item.note_type),
      tags: firstArray(item.tags, item.tagList, item.tag_list) ?? [],
      imageCount: images?.length ?? 0,
      hasVideo: Boolean(video),
      ipLocation: firstString(item.ipLocation, item.ip_location),
      createTime: firstString(item.createTime, item.create_time, item.createdAt),
    },
    tracePayload: value,
  };
}

function normalizeDouyinSourceItem(request: ImportRequest, value: unknown): NormalizedSourceItem {
  const item = asRecord(value);
  const result = asRecord(item.result) ?? item;
  const author = firstRecord(result.author, result.authorInfo, item.author);

  return {
    platform: "douyin",
    sourceType: request.importType === "creator" ? "creator" : "detail",
    externalItemId: firstString(result.id, result.awemeId, result.aweme_id, item.id),
    sourceUrl: firstString(result.url, result.shareUrl, result.share_url, item.url) ?? request.url,
    creatorId: firstString(author?.id, author?.uid, author?.secUid, author?.sec_uid),
    creatorName: firstString(author?.nickname, author?.name, result.author, item.author),
    title: firstString(result.title, result.desc, item.title),
    bodyText: firstString(result.title, result.desc, item.title),
    engagementSnapshot: {
      likes: firstNumber(result.diggCount, result.digg_count, result.likes),
      comments: firstNumber(result.commentCount, result.comment_count, result.comments),
      shares: firstNumber(result.shareCount, result.share_count, result.shares),
    },
    structureSummary: {
      duration: firstNumber(result.duration, item.duration),
      createTime: firstString(result.createTime, result.create_time, item.create_time),
    },
    tracePayload: value,
  };
}

function normalizeXiaohongshuCommentItem(value: unknown): NormalizedComment[] {
  const item = asRecord(value);
  const main = asRecord(item.comment) ?? item;
  const content = firstString(main.content, main.text, main.comment);

  if (!content) {
    return [];
  }

  const mainId = firstString(main.id, main.commentId, main.comment_id);
  const parent: NormalizedComment = {
    externalCommentId: mainId,
    authorName: firstString(
      asRecord(main.user_info)?.nickname,
      asRecord(main.userInfo)?.nickname,
      asRecord(main.user)?.nickname,
    ),
    content,
    likeCount: firstNumber(main.like_count, main.likeCount),
    replyCount: firstNumber(main.sub_comment_count, main.replyCount, main.reply_count),
    publishedAt: parsePlatformTime(firstString(main.create_time, main.createTime, main.createdAt)),
    tracePayload: main,
  };

  const replies = firstArray(main.sub_comments, main.subComments, main.replies) ?? [];

  return [
    parent,
    ...replies.flatMap((reply) => {
      const replyRecord = asRecord(reply);
      const replyContent = firstString(replyRecord.content, replyRecord.text, replyRecord.comment);

      if (!replyContent) {
        return [];
      }

      return [
        {
          externalCommentId: firstString(
            replyRecord.id,
            replyRecord.commentId,
            replyRecord.comment_id,
          ),
          parentExternalCommentId: mainId,
          authorName: firstString(
            asRecord(replyRecord.user_info)?.nickname,
            asRecord(replyRecord.userInfo)?.nickname,
            asRecord(replyRecord.user)?.nickname,
          ),
          content: replyContent,
          likeCount: firstNumber(replyRecord.like_count, replyRecord.likeCount),
          replyCount: 0,
          publishedAt: parsePlatformTime(
            firstString(replyRecord.create_time, replyRecord.createTime, replyRecord.createdAt),
          ),
          tracePayload: reply,
        },
      ];
    }),
  ];
}

function normalizeDouyinCommentItem(value: unknown): NormalizedComment[] {
  const item = asRecord(value);
  const candidates = firstArray(item.comments, item.commentList, item.comment_list) ?? [
    item.comment ?? item,
  ];

  return candidates.flatMap((candidate) => {
    const comment = asRecord(candidate);
    const content = firstString(comment.text, comment.content, comment.comment);

    if (!content) {
      return [];
    }

    const user = firstRecord(comment.user, comment.userInfo, comment.user_info);

    return [
      {
        externalCommentId: firstString(comment.cid, comment.id, comment.commentId),
        parentExternalCommentId: firstString(
          comment.replyToCommentId,
          comment.reply_to_comment_id,
          comment.parentId,
        ),
        authorName: firstString(user?.nickname, user?.name, comment.nickname),
        content,
        likeCount: firstNumber(comment.digg_count, comment.diggCount, comment.likeCount),
        replyCount: firstNumber(
          comment.reply_comment_total,
          comment.replyCommentTotal,
          comment.replyCount,
        ),
        publishedAt: parsePlatformTime(
          firstString(comment.create_time, comment.createTime, comment.createdAt),
        ),
        tracePayload: candidate,
      },
    ];
  });
}

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }

  return {};
}

function firstRecord(...values: unknown[]): JsonRecord | undefined {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as JsonRecord;
    }
  }

  return undefined;
}

function firstArray(...values: unknown[]): unknown[] | undefined {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function parsePlatformTime(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const numeric = Number(value);

  if (Number.isFinite(numeric)) {
    const milliseconds = numeric > 10_000_000_000 ? numeric : numeric * 1000;
    return new Date(milliseconds).toISOString();
  }

  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return new Date(parsed).toISOString();
}
