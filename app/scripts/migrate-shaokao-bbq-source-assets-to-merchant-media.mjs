#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import OSS from "ali-oss";
import pg from "pg";

const { Pool } = pg;

const args = parseArgs(process.argv.slice(2));
const apply = args.has("--apply");
const archiveSourceAssets = args.has("--archive-source-assets");
const skipUpload = args.has("--skip-upload");
const manifestPath = requireArg(args, "--manifest");
const videosDir = requireArg(args, "--videos-dir");
const thumbsDir = requireArg(args, "--thumbs-dir");
const backupDir = requireArg(args, "--backup-dir");

const expectedEmail = "shaokao@163.com";
const expectedMerchantId = "a8df8d8a-38f2-49b0-bda7-40c48d3537cf";
const expectedUserId = "c2ac1aa4-8bb3-4b64-aa83-ca3a2531b941";
const expectedAssetCount = 94;
const sourceAssetImportBatch = "manual-bbq-media-source-assets-20260526";
const migrationBatch = "shaokao-bbq-source-assets-to-merchant-media-20260526";

const databaseUrl = requireEnv("APP_DATABASE_URL");
const ossBucket = requireEnv("ALIYUN_OSS_BUCKET");
const ossRegion = requireEnv("ALIYUN_OSS_REGION");
const ossEndpoint = requireEnv("ALIYUN_OSS_ENDPOINT").replace(/^https?:\/\//i, "");
const ossAccessKeyId = requireEnv("ALIYUN_OSS_ACCESS_KEY_ID");
const ossAccessKeySecret = requireEnv("ALIYUN_OSS_ACCESS_KEY_SECRET");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
validateManifest(manifest);
const records = buildRecords(manifest);
assertLocalFilesExist(records);

const pool = new Pool({ connectionString: databaseUrl });
const oss = new OSS({
  region: ossRegion,
  endpoint: ossEndpoint,
  accessKeyId: ossAccessKeyId,
  accessKeySecret: ossAccessKeySecret,
  bucket: ossBucket,
  secure: true,
  timeout: 20 * 60 * 1000,
});

try {
  const preflight = await loadPreflight();
  assertSafePreflight(preflight);
  writeBackup(preflight);

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    archiveSourceAssets,
    skipUpload,
    accountEmail: manifest.accountEmail,
    merchantId: manifest.merchantId,
    uploadedByUserId: manifest.uploadedByUserId,
    bucketName: manifest.bucketName,
    migrationBatch,
    records: records.length,
    existingMerchantMediaAssets: preflight.existingMerchantMediaAssets,
    existingMerchantMediaClips: preflight.existingMerchantMediaClips,
    readySourceAssetItems: preflight.readySourceAssetItems,
    archivedSourceAssetItems: preflight.archivedSourceAssetItems,
    dependencyCounts: preflight.dependencyCounts,
    backupDir,
  }, null, 2));

  if (!apply) {
    console.log("dry-run complete; rerun with --apply to upload OSS objects and mutate DB rows.");
    process.exit(0);
  }
  if (!archiveSourceAssets) {
    throw new Error("--archive-source-assets is required with --apply to prevent duplicate search results.");
  }

  if (skipUpload) {
    console.log("skipped merchant-media object upload");
  } else {
    await uploadMerchantMediaObjects(records);
  }
  await upsertMerchantMediaRows(records);
  await archiveLegacySourceAssets(records);
  await verifyFinalState();
} catch (error) {
  console.error(safeErrorMessage(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}

function parseArgs(rawArgs) {
  const parsed = new Map();
  for (let index = 0; index < rawArgs.length; index += 1) {
    const item = rawArgs[index];
    if (!item.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${item}`);
    }
    const next = rawArgs[index + 1];
    if (!next || next.startsWith("--")) {
      parsed.set(item, true);
      continue;
    }
    parsed.set(item, next);
    index += 1;
  }
  return parsed;
}

function requireArg(parsed, name) {
  const value = parsed.get(name);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function validateManifest(input) {
  if (input.accountEmail !== expectedEmail) {
    throw new Error(`manifest account mismatch: ${input.accountEmail}`);
  }
  if (input.merchantId !== expectedMerchantId) {
    throw new Error(`manifest merchant mismatch: ${input.merchantId}`);
  }
  if (input.uploadedByUserId !== expectedUserId) {
    throw new Error(`manifest user mismatch: ${input.uploadedByUserId}`);
  }
  if (input.bucketName !== ossBucket) {
    throw new Error(`manifest bucket mismatch: ${input.bucketName} !== ${ossBucket}`);
  }
  if (!Array.isArray(input.assets) || input.assets.length !== expectedAssetCount) {
    throw new Error(`manifest must contain ${expectedAssetCount} assets.`);
  }
  if (!Array.isArray(input.clips) || input.clips.length !== expectedAssetCount) {
    throw new Error(`manifest must contain ${expectedAssetCount} clips.`);
  }
}

function buildRecords(input) {
  const clipByAssetId = new Map(input.clips.map((clip) => [clip.assetId, clip]));
  return input.assets.map((asset) => {
    const clip = clipByAssetId.get(asset.id);
    if (!clip) {
      throw new Error(`missing clip for asset ${asset.id}`);
    }
    if (!asset.sourceStorageKey?.startsWith(`merchant-media/${input.merchantId}/originals/`)) {
      throw new Error(`asset ${asset.id} has invalid merchant-media source key.`);
    }
    if (clip.storageKey !== asset.sourceStorageKey) {
      throw new Error(`clip ${clip.id} storageKey must match asset ${asset.id} sourceStorageKey.`);
    }
    if (!clip.thumbStorageKey?.startsWith(`merchant-media/${input.merchantId}/thumbs/`)) {
      throw new Error(`clip ${clip.id} has invalid thumb key.`);
    }
    if (!Array.isArray(clip.tags) || clip.tags.length < 3) {
      throw new Error(`clip ${clip.id} must have at least 3 tags.`);
    }

    const filename = path.basename(
      asset.originalRelativePath ||
        asset.metadata?.sourceRelativePath ||
        asset.originalFilename ||
        "",
    );
    return {
      asset,
      clip,
      localVideoPath: path.join(videosDir, filename),
      localThumbPath: path.join(thumbsDir, `${clip.id}.jpg`),
    };
  });
}

function assertLocalFilesExist(inputRecords) {
  for (const record of inputRecords) {
    if (!fs.existsSync(record.localVideoPath)) {
      throw new Error(`missing video file: ${record.localVideoPath}`);
    }
    if (!fs.existsSync(record.localThumbPath)) {
      throw new Error(`missing thumb file: ${record.localThumbPath}`);
    }
  }
}

async function loadPreflight() {
  const assetIds = records.map((record) => record.asset.id);
  const clipIds = records.map((record) => record.clip.id);

  const [
    merchantAssets,
    merchantClips,
    sourceStatusCounts,
    dependencies,
  ] = await Promise.all([
    pool.query(
      `
      select count(*)::int as count
      from public.merchant_media_assets
      where merchant_id = $1
        and id = any($2::uuid[])
      `,
      [expectedMerchantId, assetIds],
    ),
    pool.query(
      `
      select count(*)::int as count
      from public.merchant_media_clips
      where merchant_id = $1
        and id = any($2::uuid[])
      `,
      [expectedMerchantId, clipIds],
    ),
    pool.query(
      `
      select coalesce(si.structure_summary->>'materialStatus', 'ready') as status,
             count(*)::int as count
      from public.source_items si
      join public.asset_objects ao
        on ao.owner_type = 'source_item'
       and ao.owner_id = si.id
       and ao.asset_type = 'video'
      where si.merchant_id = $1
        and si.id = any($2::uuid[])
        and si.trace_payload->>'importBatch' = $3
        and ao.storage_provider = 'aliyun_oss'
        and ao.storage_key like $4
      group by 1
      `,
      [expectedMerchantId, assetIds, sourceAssetImportBatch, `source-assets/${expectedMerchantId}/%`],
    ),
    pool.query(
      `
      with target_source_items as (
        select unnest($1::uuid[]) as id
      )
      select 'content_drafts' as relation, count(*)::int as count
      from public.content_drafts cd
      join target_source_items t on t.id = cd.source_item_id
      union all
      select 'content_variants' as relation, count(*)::int as count
      from public.content_variants cv
      join public.content_drafts cd on cd.id = cv.draft_id
      join target_source_items t on t.id = cd.source_item_id
      union all
      select 'video_edit_jobs' as relation, count(*)::int as count
      from public.video_edit_jobs vej
      join public.content_drafts cd on cd.id = vej.draft_id
      join target_source_items t on t.id = cd.source_item_id
      `,
      [assetIds],
    ),
  ]);

  const statusCounts = Object.fromEntries(
    sourceStatusCounts.rows.map((row) => [row.status, row.count]),
  );
  return {
    existingMerchantMediaAssets: merchantAssets.rows[0]?.count ?? 0,
    existingMerchantMediaClips: merchantClips.rows[0]?.count ?? 0,
    readySourceAssetItems: statusCounts.ready ?? 0,
    archivedSourceAssetItems: statusCounts.archived ?? 0,
    dependencyCounts: Object.fromEntries(
      dependencies.rows.map((row) => [row.relation, row.count]),
    ),
    sourceStatusCounts: statusCounts,
  };
}

function assertSafePreflight(preflight) {
  const knownSourceRows = preflight.readySourceAssetItems + preflight.archivedSourceAssetItems;
  if (knownSourceRows !== expectedAssetCount) {
    throw new Error(`expected ${expectedAssetCount} source asset rows, found ${knownSourceRows}.`);
  }
  if (preflight.readySourceAssetItems !== expectedAssetCount && preflight.readySourceAssetItems !== 0) {
    throw new Error(`ready source asset rows must be ${expectedAssetCount} or 0, found ${preflight.readySourceAssetItems}.`);
  }
  for (const [relation, count] of Object.entries(preflight.dependencyCounts)) {
    if (count !== 0) {
      throw new Error(`source assets have ${count} dependent ${relation}; aborting archive.`);
    }
  }
  if (
    preflight.existingMerchantMediaAssets !== 0 &&
    preflight.existingMerchantMediaAssets !== expectedAssetCount
  ) {
    throw new Error(`unexpected existing merchant_media_assets count: ${preflight.existingMerchantMediaAssets}.`);
  }
  if (
    preflight.existingMerchantMediaClips !== 0 &&
    preflight.existingMerchantMediaClips !== expectedAssetCount
  ) {
    throw new Error(`unexpected existing merchant_media_clips count: ${preflight.existingMerchantMediaClips}.`);
  }
}

function writeBackup(preflight) {
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(
    path.join(backupDir, "preflight.json"),
    JSON.stringify({ migrationBatch, preflight }, null, 2),
  );
  fs.writeFileSync(
    path.join(backupDir, "merchant-media-keys.txt"),
    `${records.flatMap((record) => [
      record.asset.sourceStorageKey,
      record.clip.thumbStorageKey,
    ]).join("\n")}\n`,
  );
}

async function uploadMerchantMediaObjects(inputRecords) {
  for (const [index, record] of inputRecords.entries()) {
    await oss.put(record.asset.sourceStorageKey, fs.createReadStream(record.localVideoPath), {
      mime: record.asset.mimeType || record.clip.mimeType || "video/mp4",
    });
    if ((index + 1) % 10 === 0 || index === inputRecords.length - 1) {
      console.log(`uploaded merchant-media videos ${index + 1}/${inputRecords.length}`);
    }
  }

  for (const [index, record] of inputRecords.entries()) {
    await oss.put(record.clip.thumbStorageKey, fs.createReadStream(record.localThumbPath), {
      mime: "image/jpeg",
    });
    if ((index + 1) % 25 === 0 || index === inputRecords.length - 1) {
      console.log(`uploaded merchant-media thumbs ${index + 1}/${inputRecords.length}`);
    }
  }
}

async function upsertMerchantMediaRows(inputRecords) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const { asset, clip } of inputRecords) {
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
                      idempotency_key = excluded.idempotency_key
        `,
        [
          asset.id,
          expectedMerchantId,
          expectedUserId,
          asset.mediaType || "video",
          asset.source || "merchant_upload",
          asset.sourceStorageKey,
          asset.originalFilename ?? null,
          asset.mimeType || clip.mimeType || "video/mp4",
          asset.fileSizeBytes ?? null,
          "ready",
          null,
          asset.processingTraceId ?? null,
          asset.idempotencyKey || `${expectedMerchantId}:${asset.id}`,
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
                      mime_type = excluded.mime_type
        `,
        [
          clip.id,
          asset.id,
          expectedMerchantId,
          clip.mediaType || "video",
          "ready",
          clip.clipIndex ?? 0,
          clip.clipType || "full_video",
          clip.startTimeSeconds ?? 0,
          clip.endTimeSeconds ?? clip.durationSeconds,
          clip.width,
          clip.height,
          clip.durationSeconds,
          clip.orientation,
          clip.description || clip.title || asset.originalFilename || asset.id,
          JSON.stringify(clip.tags || []),
          JSON.stringify(clip.industryTags || []),
          JSON.stringify(clip.sceneTags || []),
          JSON.stringify(clip.shotTags || []),
          JSON.stringify(clip.peopleTags || []),
          JSON.stringify(clip.qualityTags || []),
          clip.tagConfidence ?? null,
          clip.tagSource || "manual",
          manifest.bucketName,
          clip.storageKey,
          clip.thumbStorageKey,
          clip.mimeType || asset.mimeType || "video/mp4",
        ],
      );
    }
    await client.query("commit");
    console.log(`upserted ${inputRecords.length} merchant_media_assets and ${inputRecords.length} merchant_media_clips`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function archiveLegacySourceAssets(inputRecords) {
  const sourceItemIds = inputRecords.map((record) => record.asset.id);
  const { rowCount } = await pool.query(
    `
    update public.source_items
    set structure_summary = jsonb_set(
          coalesce(structure_summary, '{}'::jsonb),
          '{materialStatus}',
          '"archived"'::jsonb,
          true
        ),
        trace_payload = jsonb_set(
          jsonb_set(
            coalesce(trace_payload, '{}'::jsonb),
            '{status}',
            '"archived"'::jsonb,
            true
          ),
          '{merchantMediaMigration}',
          jsonb_build_object(
            'migrationBatch', $4::text,
            'migratedAt', timezone('utc', now()),
            'targetTable', 'merchant_media_clips'
          ),
          true
        )
    where merchant_id = $1
      and id = any($2::uuid[])
      and trace_payload->>'importBatch' = $3
      and coalesce(structure_summary->>'materialStatus', 'ready') = 'ready'
    `,
    [expectedMerchantId, sourceItemIds, sourceAssetImportBatch, migrationBatch],
  );
  console.log(`archived ${rowCount} legacy source_items`);
}

async function verifyFinalState() {
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
    select 'ready_source_asset_items', count(*)::int
    from public.source_items
    where merchant_id = $1
      and id = any($2::uuid[])
      and trace_payload->>'importBatch' = $3
      and coalesce(structure_summary->>'materialStatus', 'ready') = 'ready'
    union all
    select 'archived_source_asset_items', count(*)::int
    from public.source_items
    where merchant_id = $1
      and id = any($2::uuid[])
      and trace_payload->>'importBatch' = $3
      and coalesce(structure_summary->>'materialStatus', 'ready') = 'archived'
    `,
    [expectedMerchantId, records.map((record) => record.asset.id), sourceAssetImportBatch],
  );
  const counts = Object.fromEntries(rows.map((row) => [row.metric, row.count]));
  if (counts.merchant_media_assets !== expectedAssetCount) {
    throw new Error(`expected ${expectedAssetCount} merchant_media_assets, found ${counts.merchant_media_assets}.`);
  }
  if (counts.merchant_media_ready_video_clips !== expectedAssetCount) {
    throw new Error(`expected ${expectedAssetCount} ready merchant_media_clips, found ${counts.merchant_media_ready_video_clips}.`);
  }
  if (counts.ready_source_asset_items !== 0) {
    throw new Error(`expected 0 ready source asset items, found ${counts.ready_source_asset_items}.`);
  }
  if (counts.archived_source_asset_items !== expectedAssetCount) {
    throw new Error(`expected ${expectedAssetCount} archived source asset items, found ${counts.archived_source_asset_items}.`);
  }
  console.log(JSON.stringify({ finalCounts: counts }, null, 2));
}

function safeErrorMessage(error) {
  if (error instanceof Error) {
    const code = error.code ? ` code=${error.code}` : "";
    const status = error.status ? ` status=${error.status}` : "";
    const requestId = error.requestId ? ` requestId=${error.requestId}` : "";
    return `migration failed:${code}${status}${requestId} ${error.message}`;
  }
  return `migration failed: ${String(error)}`;
}
