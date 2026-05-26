#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

const { Client } = pg;

const defaultMerchantId = "e7c94a17-cf7d-4eb2-8178-13daa780551a";
const revisionMarker = "factory_material_tags_pexels_style_20260524";
const taggingRevision = {
  revisedAt: "2026-05-24T18:20:00+08:00",
  revisedBy: "codex",
  method: "Pexels-style visible-shot tagging based on sampled preview frames and contact sheets",
  patchScript: "app/scripts/patch-factory-material-library-tags.mjs",
  dataFile: "app/scripts/data/factory-material-tags-20260524.json",
  businessFactsHandling:
    "Area, exact height, parking count, dormitory/apartment count and other sales facts are kept out of per-clip searchable tags unless directly visible.",
};
const expectedClipCount = 27;
const retrievalTargets = ["video_edit_asset"];

loadEnvFileFromArgs();

const apply = process.argv.includes("--apply");
const merchantId = readArg("--merchant-id") ?? defaultMerchantId;
const databaseUrl = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("APP_DATABASE_URL or DATABASE_URL is required.");
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const revisedClips = JSON.parse(
  readFileSync(join(scriptDir, "data", "factory-material-tags-20260524.json"), "utf8"),
);

if (revisedClips.length !== expectedClipCount) {
  throw new Error(`Expected ${expectedClipCount} revised clips, got ${revisedClips.length}.`);
}

const db = new Client({
  connectionString: databaseUrl,
  ssl: process.env.APP_DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

try {
  await db.connect();
  await db.query("begin");

  const sourceItems = await loadMaterialSourceItems();
  const matchPlan = buildMatchPlan(sourceItems, revisedClips);

  if (matchPlan.errors.length) {
    throw new Error(
      [
        "Factory material tag patch cannot continue because matching is not exact.",
        ...matchPlan.errors,
      ].join("\n"),
    );
  }

  const updates = [];
  for (const item of matchPlan.items) {
    const patch = buildPatchedSourceItem(item.row, item.clip);
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
        item.row.id,
        merchantId,
        patch.title,
        patch.scriptText,
        JSON.stringify(patch.structureSummary),
        JSON.stringify(patch.tracePayload),
      ],
    );

    if (result.rowCount !== 1) {
      throw new Error(`Expected to update one source_item for ${item.row.id}, got ${result.rowCount}.`);
    }

    updates.push({
      sourceItemId: item.row.id,
      assetObjectIds: item.row.asset_objects.map((asset) => asset.id),
      sourceRelativePath: item.clip.sourceRelativePath,
      originalFilename: item.clip.originalFilename,
      titleBefore: item.row.title,
      titleAfter: patch.title,
      description: item.clip.description,
      tags: item.clip.tags,
      sceneTags: item.clip.sceneTags,
      shotTags: item.clip.shotTags,
      queryHints: item.clip.queryHints,
    });
  }

  if (apply) {
    await db.query("commit");
  } else {
    await db.query("rollback");
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "applied" : "dry-run",
        merchantId,
        revisionMarker,
        sourceItemsScanned: sourceItems.length,
        matchedClipCount: updates.length,
        expectedClipCount,
        updatedSourceItemIds: updates.map((item) => item.sourceItemId),
        correctionsToCheck: {
          pingluanshanRoadClip:
            findUpdateByFilename(updates, "4fd14cd4421d3ea08073180c1a18af3e.mp4") ?? null,
          pingluanshanWideClip:
            findUpdateByFilename(updates, "5165c70ee2e6914393cbe44a6d1ff17f.mp4") ?? null,
        },
        updates,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await db.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await db.end().catch(() => undefined);
}

async function loadMaterialSourceItems() {
  const result = await db.query(
    `
    select
      si.id,
      si.title,
      si.script_text,
      si.structure_summary,
      si.engagement_snapshot,
      si.trace_payload,
      si.created_at,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', ao.id,
            'storage_provider', ao.storage_provider,
            'bucket_name', ao.bucket_name,
            'storage_key', ao.storage_key,
            'mime_type', ao.mime_type,
            'sort_order', ao.sort_order
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

  return result.rows.map((row) => ({
    ...row,
    structure_summary: asRecord(row.structure_summary),
    engagement_snapshot: asRecord(row.engagement_snapshot),
    trace_payload: asRecord(row.trace_payload),
    asset_objects: Array.isArray(row.asset_objects) ? row.asset_objects : [],
  }));
}

function buildMatchPlan(sourceItems, clips) {
  const errors = [];
  const items = [];
  const usedRowIds = new Map();

  for (const clip of clips) {
    const candidates = sourceItems.filter((row) => rowMatchesClip(row, clip));

    if (candidates.length !== 1) {
      errors.push(
        `${clip.sourceRelativePath} matched ${candidates.length} source_items: ${candidates
          .map((row) => `${row.id}:${row.title}`)
          .join(", ")}`,
      );
      continue;
    }

    const row = candidates[0];
    if (usedRowIds.has(row.id)) {
      errors.push(
        `${clip.sourceRelativePath} matched source_item ${row.id}, already used by ${usedRowIds.get(
          row.id,
        )}`,
      );
      continue;
    }

    usedRowIds.set(row.id, clip.sourceRelativePath);
    items.push({ row, clip });
  }

  if (items.length !== expectedClipCount) {
    errors.push(`Expected ${expectedClipCount} exact matches, got ${items.length}.`);
  }

  return { errors, items };
}

function rowMatchesClip(row, clip) {
  const rowKeys = collectRowMatchKeys(row);
  const clipPath = normalizeKey(clip.sourceRelativePath);
  const clipFilename = normalizeKey(clip.originalFilename);
  const clipAssetId = normalizeKey(clip.assetId);
  const clipId = normalizeKey(clip.clipId);

  return rowKeys.some((key) => {
    if (!key) {
      return false;
    }
    return (
      key === clipPath ||
      key.endsWith(`/${clipPath}`) ||
      key === clipFilename ||
      key.endsWith(`/${clipFilename}`) ||
      key === clipAssetId ||
      key === clipId
    );
  });
}

function collectRowMatchKeys(row) {
  const tracePayload = asRecord(row.trace_payload);
  const analysis = asRecord(tracePayload.materialAnalysis);
  const metadata = asRecord(tracePayload.metadata);
  const analysisMetadata = asRecord(analysis.metadata);
  const keys = [
    tracePayload.sourceRelativePath,
    tracePayload.originalFilename,
    tracePayload.fileName,
    tracePayload.filename,
    tracePayload.assetId,
    tracePayload.clipId,
    metadata.sourceRelativePath,
    metadata.originalFilename,
    metadata.fileName,
    metadata.filename,
    metadata.assetId,
    metadata.clipId,
    analysis.sourceRelativePath,
    analysis.originalFilename,
    analysis.fileName,
    analysis.filename,
    analysis.assetId,
    analysis.clipId,
    analysisMetadata.sourceRelativePath,
    analysisMetadata.originalFilename,
    analysisMetadata.fileName,
    analysisMetadata.filename,
    analysisMetadata.assetId,
    analysisMetadata.clipId,
    ...row.asset_objects.flatMap((asset) => [asset.storage_key, asset.id]),
  ];

  return keys.map(normalizeKey).filter(Boolean);
}

function buildPatchedSourceItem(row, clip) {
  const structureSummary = buildStructureSummary(row, clip);
  const tracePayload = buildTracePayload(row, clip);
  return {
    title: clip.title,
    scriptText: buildScriptText(clip),
    structureSummary,
    tracePayload,
  };
}

function buildStructureSummary(row, clip) {
  const current = asRecord(row.structure_summary);
  const currentTrace = asRecord(row.trace_payload);
  const currentAnalysis = asRecord(currentTrace.materialAnalysis);

  return compactRecord({
    ...current,
    materialType: "video",
    assetType: "video",
    materialStatus: "ready",
    materialSourceKind:
      current.materialSourceKind ??
      currentTrace.materialSourceKind ??
      currentAnalysis.materialSourceKind ??
      "uploaded",
    materialUsageType: "video_asset",
    retrievalTargets: uniqueStrings([
      ...asStringArray(current.retrievalTargets),
      ...asStringArray(currentTrace.retrievalTargets),
      ...asStringArray(currentAnalysis.retrievalTargets),
      ...retrievalTargets,
    ]),
    materialCategory: current.materialCategory ?? currentAnalysis.materialCategory ?? "factory_promotion",
    title: clip.title,
    description: clip.description,
    sourceFolder: clip.sourceFolder,
    sourceRelativePath: clip.sourceRelativePath,
    originalFilename: clip.originalFilename,
    assetId: clip.assetId,
    clipId: clip.clipId,
    recommendedRole: clip.recommendedRole,
    lensPurpose: clip.lensPurpose,
    tags: clip.tags,
    industryTags: clip.industryTags,
    sceneTags: clip.sceneTags,
    shotTags: clip.shotTags,
    peopleTags: clip.peopleTags,
    qualityTags: clip.qualityTags,
    queryHints: clip.queryHints,
    tagConfidence: clip.tagConfidence,
    tagSource: clip.tagSource,
    width: clip.width,
    height: clip.height,
    orientation: clip.orientation,
    durationSeconds: clip.durationSeconds,
    taggingRevision,
    revisionMarker,
  });
}

function buildTracePayload(row, clip) {
  const current = asRecord(row.trace_payload);
  const currentAnalysis = asRecord(current.materialAnalysis);
  const materialSourceKind =
    current.materialSourceKind ?? currentAnalysis.materialSourceKind ?? "uploaded";
  const mergedRetrievalTargets = uniqueStrings([
    ...asStringArray(current.retrievalTargets),
    ...asStringArray(currentAnalysis.retrievalTargets),
    ...retrievalTargets,
  ]);
  const clipFields = buildClipPayloadFields(clip);
  const materialAnalysis = compactRecord({
    ...currentAnalysis,
    ...clipFields,
    materialType: "video",
    assetType: "video",
    mediaType: "video",
    materialStatus: "ready",
    status: "ready",
    materialSourceKind,
    materialUsageType: "video_asset",
    retrievalTargets: mergedRetrievalTargets,
    materialCategory: currentAnalysis.materialCategory ?? "factory_promotion",
    mediaProcessingStatus: currentAnalysis.mediaProcessingStatus ?? "ready",
    humanReviewRequired: true,
    taggingRevision,
    revisionMarker,
  });

  return compactRecord({
    ...current,
    materialLibrary: true,
    materialSourceKind,
    materialUsageType: "video_asset",
    retrievalTargets: mergedRetrievalTargets,
    materialType: "video",
    assetType: "video",
    mediaType: "video",
    materialStatus: "ready",
    ...clipFields,
    materialAnalysis,
    taggingRevision,
    revisionMarker,
  });
}

function buildClipPayloadFields(clip) {
  return compactRecord({
    clipId: clip.clipId,
    assetId: clip.assetId,
    title: clip.title,
    description: clip.description,
    sourceFolder: clip.sourceFolder,
    sourceRelativePath: clip.sourceRelativePath,
    originalFilename: clip.originalFilename,
    recommendedRole: clip.recommendedRole,
    lensPurpose: clip.lensPurpose,
    tags: clip.tags,
    industryTags: clip.industryTags,
    sceneTags: clip.sceneTags,
    shotTags: clip.shotTags,
    peopleTags: clip.peopleTags,
    qualityTags: clip.qualityTags,
    queryHints: clip.queryHints,
    tagConfidence: clip.tagConfidence,
    tagSource: clip.tagSource,
    width: clip.width,
    height: clip.height,
    orientation: clip.orientation,
    durationSeconds: clip.durationSeconds,
  });
}

function buildScriptText(clip) {
  return [
    clip.description,
    `可见标签：${uniqueStrings([...clip.tags, ...clip.sceneTags, ...clip.shotTags]).join("、")}`,
    `检索词：${clip.queryHints.join("、")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function findUpdateByFilename(updates, filename) {
  return updates.find((item) => item.originalFilename === filename);
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

function normalizeKey(value) {
  return String(value ?? "")
    .replaceAll("\\", "/")
    .trim()
    .toLowerCase();
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function compactRecord(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}
