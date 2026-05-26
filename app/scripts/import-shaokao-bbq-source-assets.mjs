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
const backupDir = requireArg(args, "--backup-dir");

const expectedEmail = "shaokao@163.com";
const expectedMerchantId = "a8df8d8a-38f2-49b0-bda7-40c48d3537cf";
const expectedUserId = "c2ac1aa4-8bb3-4b64-aa83-ca3a2531b941";
const expectedAssetCount = 94;
const importBatch = "manual-bbq-media-source-assets-20260526";

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
    accountEmail: manifest.accountEmail,
    merchantId: manifest.merchantId,
    uploadedByUserId: manifest.uploadedByUserId,
    bucketName: manifest.bucketName,
    importBatch,
    records: records.length,
    existingMaterialLibraryVideoAssets: preflight.existingMaterialLibraryVideoAssets,
    existingTargetSourceItems: preflight.existingTargetSourceItems.length,
    existingTargetAssetObjects: preflight.existingTargetAssetObjects.length,
    conflictingExternalIds: preflight.conflictingExternalIds.length,
    conflictingSourceUrls: preflight.conflictingSourceUrls.length,
    backupDir,
  }, null, 2));

  if (!apply) {
    console.log("dry-run complete; rerun with --apply to upload OSS objects and upsert DB rows.");
    process.exit(0);
  }

  await uploadVideos(records);
  await upsertSourceAssetRows(records);
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

    const filename = path.basename(asset.originalRelativePath || asset.metadata?.sourceRelativePath || asset.originalFilename || "");
    const sourceItemId = asset.id;
    const assetObjectId = clip.id;
    const storageKey = `source-assets/${input.merchantId}/${sourceItemId}/${sourceItemId}-source.mp4`;
    const sourceUrl = asset.metadata?.sourcePageUrl || null;
    const externalItemId = `vjshi:${asset.metadata?.vjshiId || sourceItemId}`;
    const title = clip.title || asset.metadata?.sourceTitle || asset.originalFilename || filename;
    const retrievalTargets = ["video_edit_asset"];
    const materialAnalysis = {
      materialCategory: "project_media_asset",
      assetType: "video",
      fileName: filename,
      originalFilename: asset.originalFilename || filename,
      mimeType: asset.mimeType || clip.mimeType || "video/mp4",
      sizeBytes: asset.fileSizeBytes ?? null,
      width: clip.width,
      height: clip.height,
      durationSeconds: clip.durationSeconds,
      orientation: clip.orientation,
      tags: clip.tags || [],
      industryTags: clip.industryTags || [],
      sceneTags: clip.sceneTags || [],
      shotTags: clip.shotTags || [],
      peopleTags: clip.peopleTags || [],
      qualityTags: clip.qualityTags || [],
      tagConfidence: clip.tagConfidence ?? null,
      tagSource: clip.tagSource || "manual",
      title,
      description: clip.description || "",
      queryHints: clip.queryHints || [],
      recommendedRole: clip.metadata?.recommendedRole ?? null,
      lensPurpose: clip.metadata?.lensPurpose ?? null,
      humanReviewRequired: Boolean(clip.metadata?.humanReviewRequired),
      sourcePageUrl: sourceUrl,
      sampleUrl: asset.metadata?.sampleUrl || clip.metadata?.source?.sampleUrl || null,
      vjshiId: asset.metadata?.vjshiId || null,
      sourceStorageKey: storageKey,
      segmentation: clip.metadata?.segmentation ?? null,
      visualReview: clip.metadata?.visualReview ?? null,
      taggingRevision: clip.metadata?.taggingRevision ?? null,
    };
    const structureSummary = {
      materialType: "video",
      materialStatus: "ready",
      materialSourceKind: "uploaded",
      materialUsageType: "video_asset",
      retrievalTargets,
      width: clip.width,
      height: clip.height,
      durationSeconds: clip.durationSeconds,
      orientation: clip.orientation,
      tags: clip.tags || [],
      title,
      description: clip.description || "",
      sourceStorageKey: storageKey,
      materialAnalysis,
    };
    const tracePayload = {
      materialLibrary: true,
      materialCategory: "project_media_asset",
      materialSourceKind: "uploaded",
      materialUsageType: "video_asset",
      sourceKind: "uploaded",
      usageType: "video_asset",
      retrievalTargets,
      status: "ready",
      importedForEmail: input.accountEmail,
      importedByUserId: input.uploadedByUserId,
      importBatch,
      originalManifestAssetId: asset.id,
      originalManifestClipId: clip.id,
      routePolicy: asset.metadata?.routePolicy ?? {
        materialCategory: "project_media_asset",
        assetType: "video",
        materialType: "video",
        sourceKind: "uploaded",
        usageType: "video_asset",
        retrievalTargets,
      },
      materialAnalysis,
    };

    return {
      sourceItemId,
      assetObjectId,
      localVideoPath: path.join(videosDir, filename),
      storageKey,
      sourceUrl,
      externalItemId,
      title,
      bodyText: clip.description || title,
      scriptText: null,
      structureSummary,
      tracePayload,
      mimeType: asset.mimeType || clip.mimeType || "video/mp4",
      fileSizeBytes: asset.fileSizeBytes ?? null,
    };
  });
}

function assertLocalFilesExist(inputRecords) {
  for (const record of inputRecords) {
    if (!fs.existsSync(record.localVideoPath)) {
      throw new Error(`missing video file: ${record.localVideoPath}`);
    }
  }
}

async function loadPreflight() {
  const sourceItemIds = records.map((record) => record.sourceItemId);
  const assetObjectIds = records.map((record) => record.assetObjectId);
  const externalItemIds = records.map((record) => record.externalItemId);
  const sourceUrls = records.map((record) => record.sourceUrl).filter(Boolean);

  const [
    targetSourceItems,
    targetAssetObjects,
    externalIdConflicts,
    sourceUrlConflicts,
    materialLibraryVideoAssets,
  ] = await Promise.all([
    pool.query(
      `
      select id, title, trace_payload
      from public.source_items
      where merchant_id = $1
        and id = any($2::uuid[])
      order by created_at
      `,
      [expectedMerchantId, sourceItemIds],
    ),
    pool.query(
      `
      select id, owner_id, storage_key
      from public.asset_objects
      where id = any($1::uuid[])
         or (bucket_name = $2 and storage_key like $3)
      order by created_at
      `,
      [assetObjectIds, ossBucket, `source-assets/${expectedMerchantId}/%`],
    ),
    pool.query(
      `
      select id, external_item_id
      from public.source_items
      where merchant_id = $1
        and platform = 'douyin'
        and external_item_id = any($2::text[])
        and not (id = any($3::uuid[]))
      `,
      [expectedMerchantId, externalItemIds, sourceItemIds],
    ),
    pool.query(
      `
      select id, source_url
      from public.source_items
      where merchant_id = $1
        and source_url = any($2::text[])
        and not (id = any($3::uuid[]))
      `,
      [expectedMerchantId, sourceUrls, sourceItemIds],
    ),
    pool.query(
      `
      select count(*)::int as count
      from public.source_items si
      join public.asset_objects ao
        on ao.owner_type = 'source_item'
       and ao.owner_id = si.id
       and ao.asset_type = 'video'
      where si.merchant_id = $1
        and si.trace_payload @> '{"materialLibrary": true}'::jsonb
        and si.trace_payload #>> '{materialAnalysis,materialCategory}' = 'project_media_asset'
        and si.trace_payload #>> '{materialAnalysis,assetType}' = 'video'
        and coalesce(si.structure_summary->>'materialStatus', 'ready') = 'ready'
        and ao.storage_provider = 'aliyun_oss'
        and ao.bucket_name = $2
      `,
      [expectedMerchantId, ossBucket],
    ),
  ]);

  return {
    existingTargetSourceItems: targetSourceItems.rows,
    existingTargetAssetObjects: targetAssetObjects.rows,
    conflictingExternalIds: externalIdConflicts.rows,
    conflictingSourceUrls: sourceUrlConflicts.rows,
    existingMaterialLibraryVideoAssets: materialLibraryVideoAssets.rows[0]?.count ?? 0,
  };
}

function assertSafePreflight(preflight) {
  const expectedSourceItemIds = new Set(records.map((record) => record.sourceItemId));
  const expectedAssetObjectIds = new Set(records.map((record) => record.assetObjectId));
  const expectedStorageKeys = new Set(records.map((record) => record.storageKey));

  const unexpectedSourceItems = preflight.existingTargetSourceItems.filter(
    (row) => !expectedSourceItemIds.has(row.id),
  );
  const unexpectedAssetObjects = preflight.existingTargetAssetObjects.filter(
    (row) => !expectedAssetObjectIds.has(row.id) || !expectedStorageKeys.has(row.storage_key),
  );

  if (unexpectedSourceItems.length > 0) {
    throw new Error(`unexpected existing source_items: ${unexpectedSourceItems.map((row) => row.id).join(", ")}`);
  }
  if (unexpectedAssetObjects.length > 0) {
    throw new Error(`unexpected existing asset_objects: ${unexpectedAssetObjects.map((row) => row.id).join(", ")}`);
  }
  if (preflight.conflictingExternalIds.length > 0) {
    throw new Error(`conflicting external_item_id rows: ${preflight.conflictingExternalIds.map((row) => row.id).join(", ")}`);
  }
  if (preflight.conflictingSourceUrls.length > 0) {
    throw new Error(`conflicting source_url rows: ${preflight.conflictingSourceUrls.map((row) => row.id).join(", ")}`);
  }
}

function writeBackup(preflight) {
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(
    path.join(backupDir, "source-assets-import-preflight.json"),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      accountEmail: manifest.accountEmail,
      merchantId: manifest.merchantId,
      bucketName: manifest.bucketName,
      importBatch,
      records: records.length,
      preflight,
    }, null, 2),
  );
  fs.writeFileSync(
    path.join(backupDir, "source-assets-import-records.json"),
    JSON.stringify(records.map((record) => ({
      sourceItemId: record.sourceItemId,
      assetObjectId: record.assetObjectId,
      externalItemId: record.externalItemId,
      sourceUrl: record.sourceUrl,
      title: record.title,
      storageKey: record.storageKey,
      localVideoPath: record.localVideoPath,
    })), null, 2),
  );
}

async function uploadVideos(inputRecords) {
  for (const [index, record] of inputRecords.entries()) {
    const sizeBytes = fs.statSync(record.localVideoPath).size;
    if (await remoteObjectMatches(record, sizeBytes)) {
      console.log(`skipped existing source-assets video ${index + 1}/${inputRecords.length}: ${record.storageKey}`);
      continue;
    }
    console.log(
      `uploading source-assets video ${index + 1}/${inputRecords.length}: ${formatBytes(sizeBytes)} ${record.storageKey}`,
    );
    await oss.put(record.storageKey, fs.createReadStream(record.localVideoPath), {
      mime: record.mimeType || "video/mp4",
    });
    console.log(`uploaded source-assets video ${index + 1}/${inputRecords.length}`);
  }
}

async function remoteObjectMatches(record, sizeBytes) {
  try {
    const result = await oss.head(record.storageKey);
    const rawLength = result?.res?.headers?.["content-length"];
    return Number(rawLength) === Number(sizeBytes);
  } catch (error) {
    if (error?.status === 404 || error?.code === "NoSuchKey" || error?.code === "NoSuchObject") {
      return false;
    }
    throw error;
  }
}

function formatBytes(sizeBytes) {
  return `${(Number(sizeBytes) / 1024 / 1024).toFixed(1)}MB`;
}

async function upsertSourceAssetRows(inputRecords) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const record of inputRecords) {
      await client.query(
        `
        insert into public.source_items (
          id,
          merchant_id,
          import_job_id,
          platform,
          source_type,
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
          is_selected_for_rewrite
        ) values ($1,$2,null,'douyin','manual_text',$3,$4,null,'VJshi',$5,$6,$7,$8::jsonb,'{}'::jsonb,$9::jsonb,false)
        on conflict (id)
        do update set merchant_id = excluded.merchant_id,
                      platform = excluded.platform,
                      source_type = excluded.source_type,
                      external_item_id = excluded.external_item_id,
                      source_url = excluded.source_url,
                      creator_name = excluded.creator_name,
                      title = excluded.title,
                      body_text = excluded.body_text,
                      script_text = excluded.script_text,
                      structure_summary = excluded.structure_summary,
                      trace_payload = excluded.trace_payload,
                      is_selected_for_rewrite = excluded.is_selected_for_rewrite
        `,
        [
          record.sourceItemId,
          expectedMerchantId,
          record.externalItemId,
          record.sourceUrl,
          record.title,
          record.bodyText,
          record.scriptText,
          JSON.stringify(record.structureSummary),
          JSON.stringify(record.tracePayload),
        ],
      );

      await client.query(
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
        ) values ($1,'source_item',$2,'video','aliyun_oss',$3,$4,$5,$6,$7,null,0)
        on conflict (id)
        do update set owner_type = excluded.owner_type,
                      owner_id = excluded.owner_id,
                      asset_type = excluded.asset_type,
                      storage_provider = excluded.storage_provider,
                      bucket_name = excluded.bucket_name,
                      storage_key = excluded.storage_key,
                      origin_url = excluded.origin_url,
                      mime_type = excluded.mime_type,
                      file_size_bytes = excluded.file_size_bytes,
                      sort_order = excluded.sort_order
        `,
        [
          record.assetObjectId,
          record.sourceItemId,
          ossBucket,
          record.storageKey,
          record.sourceUrl,
          record.mimeType,
          record.fileSizeBytes,
        ],
      );
    }
    await client.query("commit");
    console.log(`upserted ${inputRecords.length} source_items and ${inputRecords.length} asset_objects`);
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
    select 'source_items' as metric, count(*)::int as count
    from public.source_items
    where merchant_id = $1
      and id = any($3::uuid[])
    union all
    select 'asset_objects', count(*)::int
    from public.asset_objects
    where id = any($4::uuid[])
      and bucket_name = $2
    union all
    select 'ready_material_library_video_assets', count(*)::int
    from public.source_items si
    join public.asset_objects ao
      on ao.owner_type = 'source_item'
     and ao.owner_id = si.id
     and ao.asset_type = 'video'
    where si.merchant_id = $1
      and si.trace_payload @> '{"materialLibrary": true}'::jsonb
      and si.trace_payload #>> '{materialAnalysis,materialCategory}' = 'project_media_asset'
      and si.trace_payload #>> '{materialAnalysis,assetType}' = 'video'
      and coalesce(si.structure_summary->>'materialStatus', 'ready') = 'ready'
      and ao.storage_provider = 'aliyun_oss'
      and ao.bucket_name = $2
    `,
    [
      expectedMerchantId,
      ossBucket,
      records.map((record) => record.sourceItemId),
      records.map((record) => record.assetObjectId),
    ],
  );
  const finalCounts = Object.fromEntries(rows.map((row) => [row.metric, row.count]));
  console.log(JSON.stringify({ finalCounts }, null, 2));

  for (const metric of ["source_items", "asset_objects", "ready_material_library_video_assets"]) {
    if (finalCounts[metric] !== expectedAssetCount) {
      throw new Error(`final ${metric} count mismatch: ${finalCounts[metric]} !== ${expectedAssetCount}`);
    }
  }
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
