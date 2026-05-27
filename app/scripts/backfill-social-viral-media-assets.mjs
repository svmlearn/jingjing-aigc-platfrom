#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";

import OSS from "ali-oss";
import pg from "pg";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

const { Client } = pg;

const revisionMarker = "social_viral_media_backfill_20260527";
const defaultLimit = 80;
const socialViralAssetFolder = "social-viral";

loadEnvFileFromArgs();

const apply = process.argv.includes("--apply");
const skipVideos = process.argv.includes("--skip-videos");
const email = readArg("--email");
const merchantIdArg = readArg("--merchant-id");
const limit = readIntArg("--limit", defaultLimit);
const databaseUrl = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("APP_DATABASE_URL or DATABASE_URL is required.");
}

if (!email && !merchantIdArg) {
  throw new Error("Provide --email or --merchant-id.");
}

const db = new Client({
  connectionString: databaseUrl,
  ssl: process.env.APP_DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

try {
  await db.connect();
  const merchant = await resolveMerchant();
  const storage = apply ? createOssClient() : null;
  const storageConfig = storage ? getOssConfig() : getOssConfig({ optional: true });
  const maxBytes = readPositiveInt(process.env.MEDIA_UPLOAD_MAX_BYTES, 500 * 1024 * 1024);
  const rows = await loadViralReferenceRows(merchant.id);
  const results = [];

  for (const row of rows) {
    const existingAssets = await loadExistingAssets(row.id);
    const existingOriginUrls = new Set(
      existingAssets.map((asset) => asset.origin_url).filter((url) => typeof url === "string" && url),
    );
    const aweme = extractAwemeDetail(row.trace_payload);
    const patch = aweme ? buildSourceItemPatch(row, aweme) : null;
    const candidateGroups = patch
      ? buildCandidateGroups({
          sourceItemId: row.id,
          merchantId: merchant.id,
          coverUrls: patch.coverUrls,
          videoUrls: skipVideos ? [] : patch.videoUrls,
        }).filter((group) => !group.urls.some((url) => existingOriginUrls.has(url)))
      : [];

    const itemResult = {
      sourceItemId: row.id,
      sourceUrl: row.source_url,
      titleBefore: row.title,
      titleAfter: patch?.title ?? row.title,
      awemeExtracted: Boolean(aweme),
      existingAssetCount: existingAssets.length,
      candidateAssetGroups: candidateGroups.map((group) => ({
        assetType: group.assetType,
        candidateUrlCount: group.urls.length,
      })),
      updatedSourceItem: false,
      persistedAssets: [],
      skipped: [],
    };

    if (!patch) {
      itemResult.skipped.push("missing_aweme_detail");
      results.push(itemResult);
      continue;
    }

    if (apply) {
      await updateSourceItem(row, patch);
      itemResult.updatedSourceItem = true;
    }

    for (const [sortOrder, group] of candidateGroups.entries()) {
      if (!apply) {
        itemResult.skipped.push(`dry_run:${group.assetType}`);
        continue;
      }

      const persisted = await persistFirstWorkingCandidate({
        group,
        sortOrder,
        storage,
        storageConfig,
        maxBytes,
      });

      if (persisted.asset) {
        itemResult.persistedAssets.push(persisted.asset);
      } else {
        itemResult.skipped.push(`${group.assetType}:${persisted.skippedReason}`);
      }
    }

    results.push(itemResult);
  }

  console.log(JSON.stringify(buildSummary({
    mode: apply ? "applied" : "dry-run",
    merchant,
    limit,
    skipVideos,
    rowsScanned: rows.length,
    results,
  }), null, 2));
} finally {
  await db.end().catch(() => undefined);
}

async function resolveMerchant() {
  if (merchantIdArg) {
    const result = await db.query(
      `
      select id, owner_user_id, name
      from public.merchant_profiles
      where id = $1
      limit 1
      `,
      [merchantIdArg],
    );
    if (!result.rows[0]) {
      throw new Error(`Merchant not found: ${merchantIdArg}`);
    }
    return result.rows[0];
  }

  const result = await db.query(
    `
    select mp.id, mp.owner_user_id, mp.name
    from public.app_users u
    join public.merchant_profiles mp on mp.owner_user_id = u.id
    where u.email = $1
    limit 1
    `,
    [email],
  );

  if (!result.rows[0]) {
    throw new Error(`Merchant not found for email: ${email}`);
  }

  return result.rows[0];
}

async function loadViralReferenceRows(merchantId) {
  const result = await db.query(
    `
    select
      id,
      merchant_id,
      platform,
      external_item_id,
      source_url,
      creator_id,
      creator_name,
      title,
      body_text,
      script_text,
      structure_summary,
      engagement_snapshot,
      trace_payload,
      created_at
    from public.source_items
    where merchant_id = $1
      and platform = 'douyin'
      and trace_payload @> '{"materialLibrary": true}'::jsonb
      and coalesce(structure_summary->>'materialUsageType', trace_payload->>'materialUsageType') = 'viral_reference'
      and coalesce(structure_summary->>'materialStatus', 'ready') = 'ready'
    order by created_at desc
    limit $2
    `,
    [merchantId, limit],
  );

  return result.rows;
}

async function loadExistingAssets(sourceItemId) {
  const result = await db.query(
    `
    select id, asset_type, origin_url
    from public.asset_objects
    where owner_type = 'source_item'
      and owner_id = $1
    `,
    [sourceItemId],
  );

  return result.rows;
}

async function updateSourceItem(row, patch) {
  const result = await db.query(
    `
    update public.source_items
    set title = $3,
        script_text = $4,
        structure_summary = $5::jsonb,
        trace_payload = $6::jsonb
    where id = $1
      and merchant_id = $2
    `,
    [
      row.id,
      row.merchant_id,
      patch.title,
      patch.scriptText,
      JSON.stringify(patch.structureSummary),
      JSON.stringify(patch.tracePayload),
    ],
  );

  if (result.rowCount !== 1) {
    throw new Error(`Expected to update one source_item ${row.id}, got ${result.rowCount}.`);
  }
}

async function persistFirstWorkingCandidate(input) {
  const errors = [];

  for (const url of input.group.urls) {
    try {
      const downloaded = await downloadRemoteMedia(url, input.maxBytes);
      const storageKey = buildStorageKey({
        merchantId: input.group.merchantId,
        sourceItemId: input.group.sourceItemId,
        assetType: input.group.assetType,
        sortOrder: input.sortOrder,
        url,
        contentType: downloaded.contentType,
      });
      const upload = await input.storage.put(storageKey, downloaded.body, {
        mime: downloaded.contentType,
      });
      const assetId = randomUUID();
      const insert = await db.query(
        `
        insert into public.asset_objects (
          id,
          owner_type,
          owner_id,
          asset_type,
          storage_provider,
          bucket_name,
          storage_key,
          origin_url,
          mime_type,
          file_size_bytes,
          etag,
          sort_order
        ) values ($1, 'source_item', $2, $3, 'aliyun_oss', $4, $5, $6, $7, $8, $9, $10)
        returning id, asset_type, storage_key, origin_url, mime_type, file_size_bytes
        `,
        [
          assetId,
          input.group.sourceItemId,
          input.group.assetType,
          input.storageConfig.bucket,
          storageKey,
          url,
          downloaded.contentType,
          downloaded.body.byteLength,
          readHeader(upload?.res?.headers, "etag"),
          input.sortOrder,
        ],
      );

      return { asset: insert.rows[0] };
    } catch (error) {
      errors.push(`${shortenUrl(url)}:${getErrorMessage(error)}`);
    }
  }

  return { skippedReason: errors.join(" | ") || "no_working_url" };
}

function extractAwemeDetail(tracePayload) {
  const responses = Array.isArray(tracePayload?.tikhubProviderResponses)
    ? tracePayload.tikhubProviderResponses
    : [];

  for (const response of responses) {
    const payload = response?.responsePayload;
    const direct = [
      getPath(payload, ["data", "aweme_detail"]),
      getPath(payload, ["data", "awemeDetail"]),
      getPath(payload, ["aweme_detail"]),
      getPath(payload, ["awemeDetail"]),
    ].find(isAwemeMaterial);

    if (direct) {
      return direct;
    }

    const nested = collectObjects(payload).find(isAwemeMaterial);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function isAwemeMaterial(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value.aweme_id || value.awemeId || value.id) &&
      (value.video || value.desc || value.author || value.share_url || value.shareUrl),
  );
}

function buildSourceItemPatch(row, aweme) {
  const structureSummary = toRecord(row.structure_summary);
  const tracePayload = toRecord(row.trace_payload);
  const video = toRecord(aweme.video);
  const author = toRecord(aweme.author);
  const statistics = toRecord(aweme.statistics);
  const coverUrls = collectCoverUrls(video);
  const videoUrls = collectVideoUrls(video);
  const title = stringValue(aweme.desc) ?? row.title ?? "抖音对标视频";
  const awemeId = stringValue(aweme.aweme_id ?? aweme.awemeId ?? aweme.id) ?? row.external_item_id;
  const sourceUrl =
    stringValue(aweme.share_url ?? aweme.shareUrl ?? getPath(aweme, ["share_info", "share_url"])) ??
    row.source_url;

  return {
    title,
    scriptText: title,
    coverUrls,
    videoUrls,
    structureSummary: {
      ...structureSummary,
      materialType: "video",
      materialStatus: "ready",
      materialSourceKind: "benchmark",
      materialUsageType: "viral_reference",
      retrievalTargets: ["copy_context", "script_context"],
      provider: "tikhub",
      providerEndpointFamily: "douyin",
      coverUrl: coverUrls[0] ?? null,
      imageUrls: coverUrls,
      videoUrls,
      durationMs: numberValue(video.duration ?? aweme.duration) ?? structureSummary.durationMs ?? null,
      tags: collectTagNames(aweme.text_extra ?? aweme.textExtra),
      socialViralMediaBackfill: {
        revisionMarker,
        patchedAt: new Date().toISOString(),
      },
    },
    tracePayload: {
      ...tracePayload,
      providerRawItem: aweme,
      materialUsageType: "viral_reference",
      retrievalTargets: ["copy_context", "script_context"],
      materialProvider: tracePayload.materialProvider ?? "tikhub",
      materialLibrary: true,
      socialViralMediaBackfill: {
        revisionMarker,
        patchedAt: new Date().toISOString(),
        sourceUrl,
        awemeId,
        creatorName: stringValue(author.nickname ?? author.name) ?? row.creator_name ?? null,
        statistics: {
          likedCount: numberValue(statistics.digg_count ?? statistics.like_count),
          commentCount: numberValue(statistics.comment_count),
          collectedCount: numberValue(statistics.collect_count),
          shareCount: numberValue(statistics.share_count),
          playCount: numberValue(statistics.play_count),
        },
      },
    },
  };
}

function buildCandidateGroups(input) {
  const groups = [];
  const coverUrls = input.coverUrls.slice(0, 6);
  const videoUrls = input.videoUrls.slice(0, 12);

  if (coverUrls.length > 0) {
    groups.push({
      merchantId: input.merchantId,
      sourceItemId: input.sourceItemId,
      assetType: "cover",
      urls: coverUrls,
    });
  }

  if (videoUrls.length > 0) {
    groups.push({
      merchantId: input.merchantId,
      sourceItemId: input.sourceItemId,
      assetType: "video",
      urls: videoUrls,
    });
  }

  return groups;
}

function collectCoverUrls(video) {
  return compactUrls([
    getPath(video, ["cover", "url_list"]),
    getPath(video, ["origin_cover", "url_list"]),
    getPath(video, ["dynamic_cover", "url_list"]),
    getPath(video, ["cover_original_scale", "url_list"]),
    getPath(video, ["animated_cover", "url_list"]),
  ]);
}

function collectVideoUrls(video) {
  const urls = compactUrls([
    getPath(video, ["play_addr_h264", "url_list"]),
    getPath(video, ["play_addr", "url_list"]),
    getPath(video, ["download_addr", "url_list"]),
    getPath(video, ["play_addr_265", "url_list"]),
    getPath(video, ["bit_rate"]),
  ]).filter(looksLikeVideoUrl);

  return urls.sort((left, right) => videoUrlPriority(left) - videoUrlPriority(right));
}

function videoUrlPriority(url) {
  if (/api-play\.amemv\.com/i.test(url)) return 0;
  if (/api\.amemv\.com/i.test(url)) return 1;
  if (/douyinvod\.com/i.test(url)) return 2;
  if (/zjcdn\.com/i.test(url)) return 8;
  return 5;
}

async function downloadRemoteMedia(url, maxBytes) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,video/*,*/*;q=0.8",
      referer: inferReferer(url),
    },
    signal: AbortSignal.timeout(90_000),
  });

  if (!response.ok) {
    throw new Error(`REMOTE_MEDIA_FETCH_FAILED:${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`REMOTE_MEDIA_TOO_LARGE:${contentLength}`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > maxBytes) {
    throw new Error(`REMOTE_MEDIA_TOO_LARGE:${body.byteLength}`);
  }

  return {
    body,
    contentType: normalizeContentType(response.headers.get("content-type")),
  };
}

function buildStorageKey(input) {
  const digest = createHash("sha256").update(input.url).digest("hex").slice(0, 16);
  const extension = inferMediaExtension({
    url: input.url,
    assetType: input.assetType,
    contentType: input.contentType,
  });

  return [
    "source-assets",
    input.merchantId,
    input.sourceItemId,
    socialViralAssetFolder,
    `${input.assetType}-${input.sortOrder}-${digest}.${extension}`,
  ].join("/");
}

function createOssClient() {
  const config = getOssConfig();
  return new OSS({
    region: config.region,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    bucket: config.bucket,
    endpoint: config.endpoint.replace(/^https?:\/\//i, ""),
    secure: true,
  });
}

function getOssConfig(options = {}) {
  const config = {
    accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID?.trim(),
    accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim(),
    bucket: process.env.ALIYUN_OSS_BUCKET?.trim(),
    region: process.env.ALIYUN_OSS_REGION?.trim(),
    endpoint: process.env.ALIYUN_OSS_ENDPOINT?.trim(),
  };
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0 && !options.optional) {
    throw new Error(`Missing Aliyun OSS env: ${missing.join(", ")}`);
  }

  return config;
}

function buildSummary(input) {
  const persistedAssets = input.results.flatMap((result) => result.persistedAssets);

  return {
    mode: input.mode,
    revisionMarker,
    merchant: {
      id: input.merchant.id,
      name: input.merchant.name,
      ownerUserId: input.merchant.owner_user_id,
    },
    limit: input.limit,
    skipVideos: input.skipVideos,
    rowsScanned: input.rowsScanned,
    awemeExtracted: input.results.filter((result) => result.awemeExtracted).length,
    sourceItemsUpdated: input.results.filter((result) => result.updatedSourceItem).length,
    persistedAssets: persistedAssets.length,
    persistedCovers: persistedAssets.filter((asset) => asset.asset_type === "cover").length,
    persistedVideos: persistedAssets.filter((asset) => asset.asset_type === "video").length,
    skippedCount: input.results.reduce((sum, result) => sum + result.skipped.length, 0),
    sampleResults: input.results.slice(0, 8),
  };
}

function inferReferer(url) {
  if (/xiaohongshu|xhscdn|xhs/i.test(url)) {
    return "https://www.xiaohongshu.com/";
  }

  return "https://www.douyin.com/";
}

function normalizeContentType(value) {
  const contentType = value?.split(";")[0]?.trim().toLowerCase();
  return contentType || "application/octet-stream";
}

function inferMediaExtension(input) {
  const contentType = input.contentType?.toLowerCase() ?? "";

  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("quicktime")) return "mov";
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";

  const extension = safeUrlPathname(input.url).match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (extension && ["mp4", "mov", "webm", "jpg", "jpeg", "png", "webp", "gif"].includes(extension)) {
    return extension === "jpeg" ? "jpg" : extension;
  }

  return input.assetType === "video" ? "mp4" : "jpg";
}

function looksLikeVideoUrl(url) {
  return /\.mp4(?:[?#]|$)|video|douyin|byte|stream|aweme\/v1\/play/i.test(url);
}

function compactUrls(values) {
  return Array.from(
    new Set(
      values
        .flatMap(collectUrlStrings)
        .map((url) => url.trim())
        .filter(Boolean),
    ),
  );
}

function collectUrlStrings(value) {
  if (typeof value === "string") {
    return /^https?:\/\//i.test(value) ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectUrlStrings);
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectUrlStrings);
  }

  return [];
}

function collectObjects(value) {
  if (Array.isArray(value)) {
    return value.flatMap(collectObjects);
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return [value, ...Object.values(value).flatMap(collectObjects)];
}

function collectTagNames(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => {
          if (typeof item === "string") return item;
          if (!item || typeof item !== "object") return null;
          return stringValue(item.hashtag_name ?? item.hashtagName ?? item.name ?? item.tag_name ?? item.tagName);
        })
        .filter((tag) => typeof tag === "string" && tag.trim())
        .map((tag) => tag.replace(/^#/, "").trim()),
    ),
  );
}

function getPath(value, path) {
  return path.reduce((current, key) => {
    if (Array.isArray(current) && typeof key === "number") return current[key];
    if (current && typeof current === "object" && typeof key === "string") return current[key];
    return undefined;
  }, value);
}

function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const number = Number(value.replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1]?.trim() || null;
}

function readIntArg(name, fallback) {
  const value = readArg(name);
  if (!value) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) {
    throw new Error(`${name} must be a positive number.`);
  }
  return Math.trunc(number);
}

function readPositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
}

function readHeader(headers, name) {
  if (!headers) return null;
  const normalized = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === normalized && typeof value === "string") {
      return value;
    }
  }
  return null;
}

function safeUrlPathname(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function shortenUrl(url) {
  return url.length > 90 ? `${url.slice(0, 90)}...` : url;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
