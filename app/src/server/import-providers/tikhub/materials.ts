import "server-only";

import { requestTikHub } from "@/server/import-providers/tikhub/client";
import {
  buildTikHubBenchmarkCacheKey,
  normalizeTikHubComments,
  normalizeTikHubMaterialItems,
} from "@/server/import-providers/tikhub/normalizers";
import type {
  TikHubBenchmarkRequest,
  TikHubCachedResponse,
  TikHubMaterialItem,
} from "@/server/import-providers/tikhub/types";

export type TikHubBenchmarkResult = {
  cacheKey: string;
  providerResponses: TikHubCachedResponse[];
  items: TikHubMaterialItem[];
};

export async function fetchTikHubBenchmarkMaterials(
  input: TikHubBenchmarkRequest,
): Promise<TikHubBenchmarkResult> {
  const cacheKey = buildTikHubBenchmarkCacheKey(input);
  const count = Math.min(Math.max(input.count, 1), 20);
  const result =
    input.platform === "xiaohongshu"
      ? await fetchXiaohongshuBenchmark({ ...input, count, cacheKey })
      : await fetchDouyinBenchmark({ ...input, count, cacheKey });

  const withComments = await attachDefaultComments({
    platform: input.platform,
    target: input.target,
    items: result.items.slice(0, count),
  });

  return {
    cacheKey,
    providerResponses: [...result.providerResponses, ...withComments.providerResponses],
    items: withComments.items,
  };
}

async function fetchXiaohongshuBenchmark(
  input: TikHubBenchmarkRequest & { cacheKey: string },
): Promise<TikHubBenchmarkResult> {
  if (input.findMethod === "detail") {
    const identity = extractXiaohongshuNoteIdentity(input.target);
    const endpoint = identity.noteId
      ? "/api/v1/xiaohongshu/web_v2/fetch_feed_notes_v4"
      : "/api/v1/xiaohongshu/web_v2/fetch_feed_notes_v3";
    const query = identity.noteId
      ? { note_id: identity.noteId }
      : { short_url: identity.urlForRequest };
    const payload = await requestTikHub({
      endpoint,
      query,
    });

    return {
      cacheKey: input.cacheKey,
      providerResponses: [{
        endpoint,
        method: "GET",
        requestPayload: query,
        responsePayload: payload,
      }],
      items: normalizeTikHubMaterialItems({
        platform: "xiaohongshu",
        findMethod: input.findMethod,
        target: input.target,
        cacheKey: input.cacheKey,
        payload,
        limit: input.count,
      }),
    };
  }

  if (input.findMethod === "profile") {
    const userId = extractXiaohongshuUserId(input.target);

    if (userId) {
      const endpoint = "/api/v1/xiaohongshu/web_v3/fetch_user_notes";
      const query = {
        user_id: userId,
        cursor: "",
        num: input.count,
      };
      const payload = await requestTikHub({
        endpoint,
        query,
      });

      return {
        cacheKey: input.cacheKey,
        providerResponses: [{
          endpoint,
          method: "GET",
          requestPayload: query,
          responsePayload: payload,
        }],
        items: normalizeTikHubMaterialItems({
          platform: "xiaohongshu",
          findMethod: input.findMethod,
          target: input.target,
          cacheKey: input.cacheKey,
          payload,
          limit: input.count,
        }),
      };
    }

    const endpoint = "/api/v1/xiaohongshu/app_v2/get_user_posted_notes";
    const query = {
      share_text: input.target,
      cursor: "",
    };
    const payload = await requestTikHub({
      endpoint,
      query,
    });

    return {
      cacheKey: input.cacheKey,
      providerResponses: [{
        endpoint,
        method: "GET",
        requestPayload: query,
        responsePayload: payload,
      }],
      items: normalizeTikHubMaterialItems({
        platform: "xiaohongshu",
        findMethod: input.findMethod,
        target: input.target,
        cacheKey: input.cacheKey,
        payload,
        limit: input.count,
      }),
    };
  }

  const endpoint = "/api/v1/xiaohongshu/web_v3/fetch_search_notes";
  const query = {
    keyword: input.target,
    page: 1,
    sort: "popularity_descending",
    note_type: 0,
  };
  const payload = await requestTikHub({
    endpoint,
    query,
  });

  return {
    cacheKey: input.cacheKey,
    providerResponses: [{
      endpoint,
      method: "GET",
      requestPayload: query,
      responsePayload: payload,
    }],
    items: normalizeTikHubMaterialItems({
      platform: "xiaohongshu",
      findMethod: input.findMethod,
      target: input.target,
      cacheKey: input.cacheKey,
      payload,
      limit: input.count,
    }),
  };
}

function extractXiaohongshuNoteIdentity(target: string): {
  noteId: string | null;
  xsecToken: string | null;
  urlForRequest: string;
} {
  const urlText = extractFirstUrl(target) ?? target.trim();

  try {
    const url = new URL(urlText);
    const noteMatch = url.pathname.match(/\/(?:explore|discovery\/item)\/([^/?#]+)/);

    return {
      noteId: noteMatch?.[1] ? decodeURIComponent(noteMatch[1]) : null,
      xsecToken: url.searchParams.get("xsec_token"),
      urlForRequest: url.toString(),
    };
  } catch {
    const noteMatch = urlText.match(/xiaohongshu\.com\/(?:explore|discovery\/item)\/([^/?#\s]+)/i);
    const xsecMatch = urlText.match(/[?&]xsec_token=([^&#\s]+)/i);

    return {
      noteId: noteMatch?.[1] ? decodeURIComponent(noteMatch[1]) : null,
      xsecToken: xsecMatch?.[1] ? decodeURIComponent(xsecMatch[1]) : null,
      urlForRequest: urlText,
    };
  }
}

function extractXiaohongshuUserId(target: string): string | null {
  const trimmed = target.trim();
  const directIdMatch = trimmed.match(/^[a-zA-Z0-9_-]{16,40}$/);

  if (directIdMatch) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const profileMatch = url.pathname.match(/\/user\/profile\/([^/?#]+)/);
    if (profileMatch?.[1]) {
      return decodeURIComponent(profileMatch[1]);
    }
  } catch {
    const profileMatch = trimmed.match(/xiaohongshu\.com\/user\/profile\/([^/?#\s]+)/i);
    if (profileMatch?.[1]) {
      return decodeURIComponent(profileMatch[1]);
    }
  }

  return null;
}

async function fetchDouyinBenchmark(
  input: TikHubBenchmarkRequest & { cacheKey: string },
): Promise<TikHubBenchmarkResult> {
  if (input.findMethod === "detail") {
    return fetchDouyinDetailBenchmark(input);
  }

  if (input.findMethod === "profile") {
    return fetchDouyinProfileBenchmark(input);
  }

  const endpoint = "/api/v1/douyin/search/fetch_video_search_v2";
  const body = {
    keyword: input.target,
    cursor: 0,
    sort_type: "1",
    publish_time: "180",
    filter_duration: "0",
    content_type: "0",
    search_id: "",
    backtrace: "",
  };
  const payload = await requestTikHub({
    endpoint,
    method: "POST",
    body,
  });

  return {
    cacheKey: input.cacheKey,
    providerResponses: [{
      endpoint,
      method: "POST",
      requestPayload: body,
      responsePayload: payload,
    }],
    items: normalizeTikHubMaterialItems({
      platform: "douyin",
      findMethod: input.findMethod,
      target: input.target,
      cacheKey: input.cacheKey,
      payload,
      limit: input.count,
    }),
  };
}

async function fetchDouyinDetailBenchmark(
  input: TikHubBenchmarkRequest & { cacheKey: string },
): Promise<TikHubBenchmarkResult> {
  const awemeId = extractDouyinAwemeId(input.target);
  const endpoint = awemeId
    ? "/api/v1/douyin/app/v3/fetch_one_video"
    : "/api/v1/douyin/web/fetch_one_video_by_share_url";
  const query = awemeId
    ? { aweme_id: awemeId }
    : { share_url: extractFirstUrl(input.target) ?? input.target };
  const payload = await requestTikHub({
    endpoint,
    query,
  });

  return {
    cacheKey: input.cacheKey,
    providerResponses: [{
      endpoint,
      method: "GET",
      requestPayload: query,
      responsePayload: payload,
    }],
    items: normalizeTikHubMaterialItems({
      platform: "douyin",
      findMethod: input.findMethod,
      target: input.target,
      cacheKey: input.cacheKey,
      payload,
      limit: input.count,
    }),
  };
}

async function fetchDouyinProfileBenchmark(
  input: TikHubBenchmarkRequest & { cacheKey: string },
): Promise<TikHubBenchmarkResult> {
  const secUserEndpoint = "/api/v1/douyin/web/get_sec_user_id";
  const secUserQuery = { url: input.target };
  const secUserPayload = await requestTikHub({
    endpoint: secUserEndpoint,
    query: secUserQuery,
  });
  const secUserId = findValueByKey(secUserPayload, ["sec_user_id", "secUserId", "sec_uid", "secUid"]);

  if (!secUserId) {
    return {
      cacheKey: input.cacheKey,
      providerResponses: [{
        endpoint: secUserEndpoint,
        method: "GET",
        requestPayload: secUserQuery,
        responsePayload: secUserPayload,
      }],
      items: [],
    };
  }

  const endpoint = "/api/v1/douyin/app/v3/fetch_user_post_videos";
  const query = {
    sec_user_id: secUserId,
    max_cursor: 0,
    count: input.count,
    sort_type: 1,
  };
  const payload = await requestTikHub({
    endpoint,
    query,
  });
  const providerResponses: TikHubCachedResponse[] = [
    {
      endpoint: secUserEndpoint,
      method: "GET",
      requestPayload: secUserQuery,
      responsePayload: secUserPayload,
    },
    {
      endpoint,
      method: "GET",
      requestPayload: query,
      responsePayload: payload,
    },
  ];

  return {
    cacheKey: input.cacheKey,
    providerResponses,
    items: normalizeTikHubMaterialItems({
      platform: "douyin",
      findMethod: input.findMethod,
      target: input.target,
      cacheKey: input.cacheKey,
      payload,
      limit: input.count,
    }),
  };
}

async function attachDefaultComments(input: {
  platform: TikHubBenchmarkRequest["platform"];
  target: string;
  items: TikHubMaterialItem[];
}): Promise<{ items: TikHubMaterialItem[]; providerResponses: TikHubCachedResponse[] }> {
  const maxComments = getTikHubMaterialCommentCount();

  if (maxComments <= 0 || input.items.length === 0) {
    return { items: input.items, providerResponses: [] };
  }

  const providerResponses: TikHubCachedResponse[] = [];
  const items: TikHubMaterialItem[] = [];

  for (const item of input.items) {
    const commentFetch = await fetchCommentsForMaterial({
      platform: input.platform,
      target: input.target,
      item,
      maxComments,
    });
    providerResponses.push(...commentFetch.providerResponses);
    items.push(commentFetch.item);
  }

  return { items, providerResponses };
}

async function fetchCommentsForMaterial(input: {
  platform: TikHubBenchmarkRequest["platform"];
  target: string;
  item: TikHubMaterialItem;
  maxComments: number;
}): Promise<{ item: TikHubMaterialItem; providerResponses: TikHubCachedResponse[] }> {
  try {
    if (input.platform === "xiaohongshu") {
      const noteId = input.item.externalItemId ?? extractXiaohongshuNoteIdentity(input.target).noteId;
      const xsecToken =
        getStringFromRecord(input.item.tracePayload, "xsecToken") ??
        extractXiaohongshuNoteIdentity(input.target).xsecToken;

      if (!noteId || !xsecToken) {
        return {
          item: markCommentFetchSkipped(input.item, "missing_xiaohongshu_note_id_or_xsec_token"),
          providerResponses: [],
        };
      }

      const endpoint = "/api/v1/xiaohongshu/web_v3/fetch_note_comments";
      const query = {
        note_id: noteId,
        cursor: "",
        xsec_token: xsecToken,
      };
      const payload = await requestTikHub({ endpoint, query });
      const comments = normalizeTikHubComments({
        platform: input.platform,
        payload,
        limit: input.maxComments,
      });

      return {
        item: attachCommentsToItem(input.item, comments, "ready"),
        providerResponses: [{
          endpoint,
          method: "GET",
          requestPayload: query,
          responsePayload: payload,
        }],
      };
    }

    const awemeId = input.item.externalItemId ?? extractDouyinAwemeId(input.target);

    if (!awemeId) {
      return {
        item: markCommentFetchSkipped(input.item, "missing_douyin_aweme_id"),
        providerResponses: [],
      };
    }

    const endpoint = "/api/v1/douyin/app/v3/fetch_video_comments";
    const query = {
      aweme_id: awemeId,
      cursor: 0,
      count: input.maxComments,
    };
    const payload = await requestTikHub({ endpoint, query });
    const comments = normalizeTikHubComments({
      platform: input.platform,
      payload,
      limit: input.maxComments,
    });

    return {
      item: attachCommentsToItem(input.item, comments, "ready"),
      providerResponses: [{
        endpoint,
        method: "GET",
        requestPayload: query,
        responsePayload: payload,
      }],
    };
  } catch (error) {
    return {
      item: {
        ...input.item,
        tracePayload: {
          ...input.item.tracePayload,
          materialCommentFetch: {
            status: "failed",
            error: error instanceof Error ? error.message : "TikHub comment fetch failed.",
          },
        },
      },
      providerResponses: [],
    };
  }
}

function attachCommentsToItem(
  item: TikHubMaterialItem,
  comments: TikHubMaterialItem["comments"],
  status: "ready" | "empty",
): TikHubMaterialItem {
  const safeComments = comments ?? [];

  return {
    ...item,
    comments: safeComments,
    tracePayload: {
      ...item.tracePayload,
      materialComments: safeComments,
      materialCommentFetch: {
        status: safeComments.length > 0 ? status : "empty",
        count: safeComments.length,
      },
    },
  };
}

function markCommentFetchSkipped(item: TikHubMaterialItem, reason: string): TikHubMaterialItem {
  return {
    ...item,
    tracePayload: {
      ...item.tracePayload,
      materialComments: [],
      materialCommentFetch: {
        status: "skipped",
        reason,
      },
    },
  };
}

function extractDouyinAwemeId(target: string): string | null {
  const text = extractFirstUrl(target) ?? target.trim();
  const directIdMatch = text.match(/^\d{12,30}$/);

  if (directIdMatch) {
    return text;
  }

  try {
    const url = new URL(text);
    const videoMatch = url.pathname.match(/\/video\/(\d{12,30})/);
    if (videoMatch?.[1]) {
      return videoMatch[1];
    }

    const modalId = url.searchParams.get("modal_id") ?? url.searchParams.get("aweme_id");
    if (modalId && /^\d{12,30}$/.test(modalId)) {
      return modalId;
    }
  } catch {
    const videoMatch = text.match(/douyin\.com\/video\/(\d{12,30})/i);
    if (videoMatch?.[1]) {
      return videoMatch[1];
    }
  }

  return null;
}

function extractFirstUrl(value: string) {
  return value.match(/https?:\/\/[^\s，。)）]+/i)?.[0] ?? null;
}

function getStringFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getTikHubMaterialCommentCount() {
  const count = Number(process.env.TIKHUB_MATERIAL_COMMENT_COUNT ?? 20);
  return Number.isFinite(count) ? Math.min(Math.max(Math.trunc(count), 0), 100) : 20;
}

function findValueByKey(value: unknown, keys: string[]): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const matched = findValueByKey(item, keys);
      if (matched) return matched;
    }

    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  for (const item of Object.values(record)) {
    const matched = findValueByKey(item, keys);
    if (matched) return matched;
  }

  return null;
}
