#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import OSS from "ali-oss";
import pg from "pg";

const { Pool } = pg;

const args = parseArgs(process.argv.slice(2));
const apply = args.has("--apply");
const manifestPath = requireArg(args, "--manifest");
const videosDir = requireArg(args, "--videos-dir");
const thumbsDir = requireArg(args, "--thumbs-dir");
const backupDir = requireArg(args, "--backup-dir");

const expectedEmail = "shaokao@163.com";
const expectedMerchantId = "a8df8d8a-38f2-49b0-bda7-40c48d3537cf";
const expectedUserId = "c2ac1aa4-8bb3-4b64-aa83-ca3a2531b941";
const expectedOldAssetCount = 14;
const expectedNewAssetCount = 94;

const databaseUrl = requireEnv("APP_DATABASE_URL");
const ossBucket = requireEnv("ALIYUN_OSS_BUCKET");
const ossRegion = requireEnv("ALIYUN_OSS_REGION");
const ossEndpoint = requireEnv("ALIYUN_OSS_ENDPOINT").replace(/^https?:\/\//i, "");
const ossAccessKeyId = requireEnv("ALIYUN_OSS_ACCESS_KEY_ID");
const ossAccessKeySecret = requireEnv("ALIYUN_OSS_ACCESS_KEY_SECRET");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
validateManifest(manifest);

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
  const oldTargets = await loadOldProjectMediaTargets();
  const dependencyCounts = await loadOldProjectMediaDependencyCounts();
  await writeBackup(oldTargets, dependencyCounts);

  const summary = {
    mode: apply ? "apply" : "dry-run",
    accountEmail: manifest.accountEmail,
    merchantId: manifest.merchantId,
    uploadedByUserId: manifest.uploadedByUserId,
    bucketName: manifest.bucketName,
    oldSourceItems: oldTargets.sourceItems.length,
    oldAssetObjects: oldTargets.assetObjects.length,
    oldObjectKeys: oldTargets.objectKeys.length,
    dependencyCounts,
    newAssets: manifest.assets.length,
    newClips: manifest.clips.length,
    backupDir,
  };
  console.log(JSON.stringify(summary, null, 2));

  assertNoOldTargetDrift(oldTargets, dependencyCounts);
  assertNewLocalFilesExist(manifest);

  if (!apply) {
    console.log("dry-run complete; rerun with --apply to mutate DB and OSS.");
    process.exit(0);
  }

  await deleteOldOssObjects(oldTargets.objectKeys);
  await deleteOldDbRows(oldTargets);
  await uploadNewObjects(manifest);
  await upsertMerchantMedia(manifest);
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
  if (!Array.isArray(input.assets) || input.assets.length !== expectedNewAssetCount) {
    throw new Error(`manifest must contain ${expectedNewAssetCount} assets.`);
  }
  if (!Array.isArray(input.clips) || input.clips.length !== expectedNewAssetCount) {
    throw new Error(`manifest must contain ${expectedNewAssetCount} clips.`);
  }
}

async function loadOldProjectMediaTargets() {
  const { rows } = await pool.query(
    `
    select
      si.id as source_item_id,
      si.title,
      si.platform,
      si.source_type,
      si.trace_payload,
      ao.id as asset_object_id,
      ao.bucket_name,
      ao.storage_key,
      ao.mime_type,
      ao.file_size_bytes
    from public.source_items si
    join public.asset_objects ao
      on ao.owner_type = 'source_item'
     and ao.owner_id = si.id
     and ao.asset_type = 'video'
    where si.merchant_id = $1
      and ao.storage_provider = 'aliyun_oss'
      and ao.storage_key like $2
    order by ao.created_at
    `,
    [expectedMerchantId, `source-assets/${expectedMerchantId}/%`],
  );

  const sourceItems = uniqueBy(rows.map((row) => ({
    id: row.source_item_id,
    title: row.title,
    platform: row.platform,
    sourceType: row.source_type,
    tracePayload: row.trace_payload,
  })), "id");
  const assetObjects = rows.map((row) => ({
    id: row.asset_object_id,
    sourceItemId: row.source_item_id,
    bucketName: row.bucket_name,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
  }));
  const objectKeys = assetObjects.map((asset) => asset.storageKey);

  return { sourceItems, assetObjects, objectKeys };
}

async function loadOldProjectMediaDependencyCounts() {
  const { rows } = await pool.query(
    `
    with target_source_items as (
      select distinct si.id
      from public.source_items si
      join public.asset_objects ao
        on ao.owner_type = 'source_item'
       and ao.owner_id = si.id
       and ao.asset_type = 'video'
      where si.merchant_id = $1
        and ao.storage_key like $2
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
    [expectedMerchantId, `source-assets/${expectedMerchantId}/%`],
  );

  return Object.fromEntries(rows.map((row) => [row.relation, row.count]));
}

async function writeBackup(oldTargets, dependencyCounts) {
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(
    path.join(backupDir, "old-project-media-targets.json"),
    JSON.stringify({ oldTargets, dependencyCounts }, null, 2),
  );
  fs.writeFileSync(path.join(backupDir, "old-oss-keys.txt"), `${oldTargets.objectKeys.join("\n")}\n`);
  fs.writeFileSync(
    path.join(backupDir, "new-import-summary.json"),
    JSON.stringify({
      accountEmail: manifest.accountEmail,
      merchantId: manifest.merchantId,
      uploadedByUserId: manifest.uploadedByUserId,
      bucketName: manifest.bucketName,
      assets: manifest.assets.length,
      clips: manifest.clips.length,
    }, null, 2),
  );
}

function assertNoOldTargetDrift(oldTargets, dependencyCounts) {
  if (oldTargets.sourceItems.length !== expectedOldAssetCount) {
    throw new Error(`expected ${expectedOldAssetCount} old source_items, found ${oldTargets.sourceItems.length}.`);
  }
  if (oldTargets.assetObjects.length !== expectedOldAssetCount) {
    throw new Error(`expected ${expectedOldAssetCount} old asset_objects, found ${oldTargets.assetObjects.length}.`);
  }
  for (const [relation, count] of Object.entries(dependencyCounts)) {
    if (count !== 0) {
      throw new Error(`old project media has ${count} dependent ${relation}; aborting.`);
    }
  }
}

function assertNewLocalFilesExist(input) {
  for (const asset of input.assets) {
    const filename = path.basename(asset.originalRelativePath || asset.metadata?.sourceRelativePath || "");
    const localPath = path.join(videosDir, filename);
    if (!fs.existsSync(localPath)) {
      throw new Error(`missing video file: ${localPath}`);
    }
  }
  for (const clip of input.clips) {
    const localPath = path.join(thumbsDir, `${clip.id}.jpg`);
    if (!fs.existsSync(localPath)) {
      throw new Error(`missing thumb file: ${localPath}`);
    }
  }
}

async function deleteOldOssObjects(objectKeys) {
  for (const [index, key] of objectKeys.entries()) {
    await oss.delete(key);
    console.log(`deleted old OSS object ${index + 1}/${objectKeys.length}: ${key}`);
  }
}

async function deleteOldDbRows(oldTargets) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "delete from public.asset_objects where id = any($1::uuid[])",
      [oldTargets.assetObjects.map((row) => row.id)],
    );
    await client.query(
      "delete from public.source_items where id = any($1::uuid[])",
      [oldTargets.sourceItems.map((row) => row.id)],
    );
    await client.query("commit");
    console.log(`deleted old DB rows: ${oldTargets.assetObjects.length} asset_objects, ${oldTargets.sourceItems.length} source_items`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function uploadNewObjects(input) {
  for (const [index, asset] of input.assets.entries()) {
    const filename = path.basename(asset.originalRelativePath || asset.metadata?.sourceRelativePath || "");
    const videoPath = path.join(videosDir, filename);
    await oss.put(asset.sourceStorageKey, fs.createReadStream(videoPath), { mime: asset.mimeType || "video/mp4" });
    if ((index + 1) % 10 === 0 || index === input.assets.length - 1) {
      console.log(`uploaded videos ${index + 1}/${input.assets.length}`);
    }
  }

  for (const [index, clip] of input.clips.entries()) {
    const thumbPath = path.join(thumbsDir, `${clip.id}.jpg`);
    await oss.put(clip.thumbStorageKey, fs.createReadStream(thumbPath), { mime: "image/jpeg" });
    if ((index + 1) % 25 === 0 || index === input.clips.length - 1) {
      console.log(`uploaded thumbs ${index + 1}/${input.clips.length}`);
    }
  }
}

async function upsertMerchantMedia(input) {
  const clipByAsset = new Map(input.clips.map((clip) => [clip.assetId, clip]));
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const asset of input.assets) {
      const clip = clipByAsset.get(asset.id);
      if (!clip) {
        throw new Error(`missing clip for asset ${asset.id}`);
      }
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
          input.merchantId,
          input.uploadedByUserId,
          asset.mediaType,
          asset.source || "merchant_upload",
          asset.sourceStorageKey,
          asset.originalFilename ?? null,
          asset.mimeType ?? "video/mp4",
          asset.fileSizeBytes ?? null,
          "ready",
          null,
          asset.processingTraceId ?? null,
          asset.idempotencyKey || `${input.merchantId}:${asset.id}`,
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
          input.merchantId,
          clip.mediaType,
          "ready",
          clip.clipIndex ?? 0,
          clip.clipType ?? "full_video",
          clip.startTimeSeconds ?? 0,
          clip.endTimeSeconds ?? clip.durationSeconds,
          clip.width,
          clip.height,
          clip.durationSeconds,
          clip.orientation,
          clip.description,
          JSON.stringify(clip.tags || []),
          JSON.stringify(clip.industryTags || []),
          JSON.stringify(clip.sceneTags || []),
          JSON.stringify(clip.shotTags || []),
          JSON.stringify(clip.peopleTags || []),
          JSON.stringify(clip.qualityTags || []),
          clip.tagConfidence ?? null,
          clip.tagSource || "manual",
          input.bucketName,
          clip.storageKey,
          clip.thumbStorageKey,
          clip.mimeType || "video/mp4",
        ],
      );
    }
    await client.query("commit");
    console.log(`upserted ${input.assets.length} merchant_media_assets and ${input.clips.length} merchant_media_clips`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function verifyFinalState() {
  const { rows } = await pool.query(
    `
    select 'old_source_asset_objects' as metric, count(*)::int as count
    from public.asset_objects
    where storage_key like $2
    union all
    select 'merchant_media_assets', count(*)::int
    from public.merchant_media_assets
    where merchant_id = $1
    union all
    select 'merchant_media_ready_video_clips', count(*)::int
    from public.merchant_media_clips
    where merchant_id = $1
      and media_type = 'video'
      and status = 'ready'
    `,
    [expectedMerchantId, `source-assets/${expectedMerchantId}/%`],
  );
  console.log(JSON.stringify({ finalCounts: Object.fromEntries(rows.map((row) => [row.metric, row.count])) }, null, 2));
}

function uniqueBy(items, key) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (seen.has(item[key])) continue;
    seen.add(item[key]);
    result.push(item);
  }
  return result;
}

function safeErrorMessage(error) {
  if (error instanceof Error) {
    const code = error.code ? ` code=${error.code}` : "";
    const status = error.status ? ` status=${error.status}` : "";
    const requestId = error.requestId ? ` requestId=${error.requestId}` : "";
    return `import failed:${code}${status}${requestId} ${error.message}`;
  }
  return `import failed: ${String(error)}`;
}
