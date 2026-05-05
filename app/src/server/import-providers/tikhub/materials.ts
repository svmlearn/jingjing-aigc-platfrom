import "server-only";

import { requestTikHub } from "@/server/import-providers/tikhub/client";
import {
  buildTikHubBenchmarkCacheKey,
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

  return {
    cacheKey,
    providerResponses: result.providerResponses,
    items: result.items.slice(0, count),
  };
}

async function fetchXiaohongshuBenchmark(
  input: TikHubBenchmarkRequest & { cacheKey: string },
): Promise<TikHubBenchmarkResult> {
  if (input.findMethod === "profile") {
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

async function fetchDouyinBenchmark(
  input: TikHubBenchmarkRequest & { cacheKey: string },
): Promise<TikHubBenchmarkResult> {
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
