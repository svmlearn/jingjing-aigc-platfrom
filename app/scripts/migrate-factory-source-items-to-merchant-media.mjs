#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

const { Pool } = pg;

const defaultMerchantId = "e7c94a17-cf7d-4eb2-8178-13daa780551a";
const defaultUploadedByUserId = "47b1a5e5-0d1c-49a5-b321-155e061ae61f";
const expectedClipCount = 27;
const migrationMarker = "factory_source_items_to_merchant_media_20260527";

loadEnvFileFromArgs();

const apply = process.argv.includes("--apply");
const merchantId = readArg("--merchant-id") ?? defaultMerchantId;
const uploadedByUserId = readArg("--uploaded-by-user-id") ?? defaultUploadedByUserId;
const databaseUrl = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("APP_DATABASE_URL or DATABASE_URL is required.");
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const clips = JSON.parse(
  readFileSync(join(scriptDir, "data", "factory-material-tags-20260524.json"), "utf8"),
);

if (!Array.isArray(clips) || clips.length !== expectedClipCount) {
  throw new Error(`Expected ${expectedClipCount} factory clips, got ${Array.isArray(clips) ? clips.length : "invalid"}.`);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.APP_DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

try {
  const sourceItems = await loadSourceItems();
  const plan = buildPlan(sourceItems, clips);
  if (plan.errors.length > 0) {
    throw new Error(["Factory merchant-media migration cannot continue.", ...plan.errors].join("\n"));
  }

  const summary = {
    mode: apply ? "applied" : "dry-run",
    merchantId,
    uploadedByUserId,
    migrationMarker,
    sourceItemsScanned: sourceItems.length,
    plannedAssets: plan.items.length,
    plannedClips: plan.items.length,
    expectedClipCount,
    sample: plan.items.slice(0, 5).map(({ sourceItem, clip, assetObject }) => ({
      sourceItemId: sourceItem.id,
      assetId: clip.assetId,
      clipId: clip.clipId,
      title: clip.title,
      tags: clip.tags,
      queryHints: clip.queryHints,
      storageKey: assetObject.storage_key,
    })),
  };

  if (apply) {
    await upsertMerchantMedia(plan.items);
  }

  const finalCounts = await loadFinalCounts();
  console.log(JSON.stringify({ ...summary, finalCounts }, null, 2));
} finally {
  await pool.end();
}

async function loadSourceItems() {
  const { rows } = await pool.query(
    `
    select
      si.id,
      si.title,
      si.creator_id,
      si.trace_payload,
      si.structure_summary,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', ao.id,
            'bucket_name', ao.bucket_name,
            'storage_key', ao.storage_key,
            'mime_type', ao.mime_type,
            'file_size_bytes', ao.file_size_bytes,
            'etag', ao.etag
          )
          order by ao.sort_order asc, ao.created_at asc
        ) filter (where ao.id is not null),
        '[]'::jsonb
      ) as asset_objects
    from public.source_items si
    left join public.asset_objects ao
      on ao.owner_type = 'source_item'
     and ao.owner_id = si.id
     and ao.asset_type = 'video'
    where si.merchant_id = $1
      and si.trace_payload @> '{"materialLibrary": true}'::jsonb
    group by si.id
    order by si.created_at asc
    `,
    [merchantId],
  );

  return rows.map((row) => ({
    ...row,
    trace_payload: asRecord(row.trace_payload),
    structure_summary: asRecord(row.structure_summary),
    asset_objects: Array.isArray(row.asset_objects) ? row.asset_objects : [],
  }));
}

function buildPlan(sourceItems, clipRecords) {
  const errors = [];
  const items = [];
  const usedSourceItems = new Set();

  for (const clip of clipRecords) {
    const matches = sourceItems.filter((sourceItem) => sourceItemMatchesClip(sourceItem, clip));
    if (matches.length !== 1) {
      errors.push(`${clip.sourceRelativePath} matched ${matches.length} source_items.`);
      continue;
    }

    const sourceItem = matches[0];
    if (usedSourceItems.has(sourceItem.id)) {
      errors.push(`${clip.sourceRelativePath} matched duplicate source_item ${sourceItem.id}.`);
      continue;
    }
    usedSourceItems.add(sourceItem.id);

    if (sourceItem.asset_objects.length !== 1) {
      errors.push(`${clip.sourceRelativePath} expected one video asset_object, got ${sourceItem.asset_objects.length}.`);
      continue;
    }

    const assetObject = sourceItem.asset_objects[0];
    if (!assetObject.bucket_name || !assetObject.storage_key) {
      errors.push(`${clip.sourceRelativePath} is missing bucket_name or storage_key.`);
      continue;
    }

    items.push({ sourceItem, clip, assetObject });
  }

  if (items.length !== expectedClipCount) {
    errors.push(`Expected ${expectedClipCount} migration items, got ${items.length}.`);
  }

  return { errors, items };
}

function sourceItemMatchesClip(sourceItem, clip) {
  const keys = collectMatchKeys(sourceItem);
  const clipKeys = [
    clip.sourceRelativePath,
    clip.originalFilename,
    clip.assetId,
    clip.clipId,
  ].map(normalizeKey).filter(Boolean);

  return clipKeys.some((clipKey) =>
    keys.some((key) => key === clipKey || key.endsWith(`/${clipKey}`)),
  );
}

function collectMatchKeys(sourceItem) {
  const trace = asRecord(sourceItem.trace_payload);
  const structure = asRecord(sourceItem.structure_summary);
  const analysis = asRecord(trace.materialAnalysis);
  const metadata = asRecord(trace.metadata);
  const values = [
    sourceItem.id,
    trace.sourceRelativePath,
    trace.originalFilename,
    trace.assetId,
    trace.clipId,
    structure.sourceRelativePath,
    structure.originalFilename,
    structure.assetId,
    structure.clipId,
    analysis.sourceRelativePath,
    analysis.originalFilename,
    analysis.assetId,
    analysis.clipId,
    metadata.sourceRelativePath,
    metadata.originalFilename,
    metadata.assetId,
    metadata.clipId,
    ...sourceItem.asset_objects.flatMap((asset) => [asset.id, asset.storage_key]),
  ];
  return values.map(normalizeKey).filter(Boolean);
}

async function upsertMerchantMedia(items) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const { sourceItem, clip, assetObject } of items) {
      await client.query(
        `
        insert into public.merchant_media_assets (
          id,
          merchant_id,
          uploaded_by_user_id,
          media_type,
          source,
          source_storage_key,
          original_filename,
          mime_type,
          file_size_bytes,
          status,
          failure_reason,
          processing_trace_id,
          idempotency_key
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        on conflict (id)
        do update set merchant_id = excluded.merchant_id,
                      uploaded_by_user_id = excluded.uploaded_by_user_id,
                      media_type = excluded.media_type,
                      source = excluded.source,
                      source_storage_key = excluded.source_storage_key,
                      original_filename = excluded.original_filename,
                      mime_type = excluded.mime_type,
                      file_size_bytes = excluded.file_size_bytes,
                      status = excluded.status,
                      failure_reason = excluded.failure_reason,
                      processing_trace_id = excluded.processing_trace_id,
                      idempotency_key = excluded.idempotency_key,
                      updated_at = timezone('utc', now())
        `,
        [
          clip.assetId,
          merchantId,
          uploadedByUserId,
          clip.mediaType ?? "video",
          "source_item_migration",
          assetObject.storage_key,
          clip.originalFilename ?? null,
          assetObject.mime_type ?? clip.mimeType ?? "video/mp4",
          assetObject.file_size_bytes ?? null,
          "ready",
          null,
          migrationMarker,
          `${merchantId}:${migrationMarker}:${clip.assetId}`,
        ],
      );

      await client.query(
        `
        insert into public.merchant_media_clips (
          id,
          asset_id,
          merchant_id,
          media_type,
          status,
          clip_index,
          clip_type,
          start_time_seconds,
          end_time_seconds,
          width,
          height,
          duration_seconds,
          orientation,
          description,
          tags,
          industry_tags,
          scene_tags,
          shot_tags,
          people_tags,
          quality_tags,
          tag_confidence,
          tag_source,
          bucket_name,
          storage_key,
          thumb_storage_key,
          mime_type
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17::jsonb,$18::jsonb,$19::jsonb,$20::jsonb,$21,$22,$23,$24,$25,$26)
        on conflict (asset_id, clip_index)
        do update set media_type = excluded.media_type,
                      status = excluded.status,
                      clip_type = excluded.clip_type,
                      start_time_seconds = excluded.start_time_seconds,
                      end_time_seconds = excluded.end_time_seconds,
                      width = excluded.width,
                      height = excluded.height,
                      duration_seconds = excluded.duration_seconds,
                      orientation = excluded.orientation,
                      description = excluded.description,
                      tags = excluded.tags,
                      industry_tags = excluded.industry_tags,
                      scene_tags = excluded.scene_tags,
                      shot_tags = excluded.shot_tags,
                      people_tags = excluded.people_tags,
                      quality_tags = excluded.quality_tags,
                      tag_confidence = excluded.tag_confidence,
                      tag_source = excluded.tag_source,
                      bucket_name = excluded.bucket_name,
                      storage_key = excluded.storage_key,
                      thumb_storage_key = excluded.thumb_storage_key,
                      mime_type = excluded.mime_type,
                      updated_at = timezone('utc', now())
        `,
        [
          clip.clipId,
          clip.assetId,
          merchantId,
          clip.mediaType ?? "video",
          "ready",
          0,
          "full_video",
          0,
          clip.durationSeconds ?? null,
          clip.width,
          clip.height,
          clip.durationSeconds ?? null,
          clip.orientation,
          clip.description,
          JSON.stringify(clip.tags ?? []),
          JSON.stringify(clip.industryTags ?? []),
          JSON.stringify(clip.sceneTags ?? []),
          JSON.stringify(clip.shotTags ?? []),
          JSON.stringify(clip.peopleTags ?? []),
          JSON.stringify([...(clip.qualityTags ?? []), migrationMarker]),
          clip.tagConfidence ?? null,
          clip.tagSource ?? migrationMarker,
          assetObject.bucket_name,
          assetObject.storage_key,
          null,
          assetObject.mime_type ?? clip.mimeType ?? "video/mp4",
        ],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function loadFinalCounts() {
  const { rows } = await pool.query(
    `
    select 'merchant_media_assets' as metric, count(*)::int as count
    from public.merchant_media_assets
    where merchant_id = $1
    union all
    select 'merchant_media_ready_video_clips', count(*)::int
    from public.merchant_media_clips
    where merchant_id = $1
      and media_type = 'video'
      and status = 'ready'
    union all
    select 'source_material_items', count(*)::int
    from public.source_items
    where merchant_id = $1
      and trace_payload @> '{"materialLibrary": true}'::jsonb
    `,
    [merchantId],
  );

  return Object.fromEntries(rows.map((row) => [row.metric, row.count]));
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeKey(value) {
  return String(value ?? "")
    .replaceAll("\\", "/")
    .trim()
    .toLowerCase();
}
