import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repositorySource = readFileSync(
  new URL("./merchant-media-repository.ts", import.meta.url),
  "utf8",
);

const repositoryContractSource = readFileSync(
  new URL("../merchant-media-repository-contract.ts", import.meta.url),
  "utf8",
);

const migrationSource = readFileSync(
  new URL("../../../db/migrations/202605250001_merchant_media_tables.sql", import.meta.url),
  "utf8",
);

const renameMigrationSource = readFileSync(
  new URL("../../../db/migrations/202605250004_rename_merchant_media_storage_key_columns.sql", import.meta.url),
  "utf8",
);

const legacySourceColumn = ["source", "cos", "key"].join("_");
const legacyStorageColumn = ["cos", "key"].join("_");
const legacyThumbColumn = ["thumb", "cos", "key"].join("_");
const legacySourceConstraint = [
  "merchant",
  "media",
  "assets",
  "source",
  "cos",
  "key",
  "check",
].join("_");

const forbiddenRepositoryPatterns = [
  "createSupa\x62aseAdminClient",
  "isSupa\x62aseAdminConfigured",
  "@/lib/supa\u0062ase/admin",
  "supabase",
  "Supa\x62ase",
  "cloudSupa\x62aseRequiredError",
  "Supa\x62aseMerchantMediaRepository",
  "Supa\x62aseMerchantMediaPrivateClipRepository",
].map((pattern) => new RegExp(escapeRegExp(pattern)));

test("merchant media repository no longer contains Supa\x62ase runtime fallback", () => {
  for (const pattern of forbiddenRepositoryPatterns) {
    assert.doesNotMatch(repositorySource, pattern, pattern.source);
  }
  const repositorySourceWithoutArrayFrom = repositorySource.replace(/\bArray\.from\(/g, "Array_from(");
  assert.doesNotMatch(repositorySourceWithoutArrayFrom, /\.from\(/, "\\.from\\(");
});

test("repository entrypoints and classes now use PostgreSQL app DB implementations", () => {
  assert.match(repositorySource, /export function getMerchantMediaRepository\(\): MerchantMediaRepository/);
  assert.match(repositorySource, /return new PostgresMerchantMediaRepository\(\);/);
  assert.match(repositorySource, /export function getPrivateMediaRepository\(\): PrivateMediaClipRepository/);
  assert.match(repositorySource, /return new PostgresMerchantMediaPrivateClipRepository\(\);/);
  assert.match(repositorySource, /export class PostgresMerchantMediaRepository implements MerchantMediaRepository/);
  assert.match(repositorySource, /export class PostgresMerchantMediaPrivateClipRepository implements PrivateMediaClipRepository/);
});

test("PostgreSQL helpers and table names are the only data access path", () => {
  for (const snippet of [
    "queryAppDb",
    "withAppDbTransaction",
    "mapPostgresError",
    "public.merchant_media_assets",
    "public.merchant_media_clips",
    "assertMerchantMediaAssetExists",
  ]) {
    assert.match(repositorySource, new RegExp(escapeRegExp(snippet)), snippet);
  }
});

test("asset idempotent upsert uses merchant_id plus idempotency_key", () => {
  assertFunctionBody("upsertAsset", [
    "const asset = input.asset",
    "assertMerchantMediaRepositoryAsset(asset)",
    "insert into public.merchant_media_assets",
    "idempotency_key",
    "on conflict (merchant_id, idempotency_key)",
    "source_storage_key",
    "asset.sourceStorageKey",
    "returning ${merchantMediaAssetSelect}",
  ]);
});

test("ready clip upsert checks merchant asset and keeps asset/index idempotency", () => {
  const upsertReadyClipBody = extractFunctionBody("upsertReadyClip");
  const sharedHelperIndex = upsertReadyClipBody.indexOf("assertMerchantMediaRepositoryReadyClip(normalizedInput)");
  const transactionIndex = upsertReadyClipBody.indexOf("withAppDbTransaction(async (client)");

  assert.notEqual(sharedHelperIndex, -1, "PostgreSQL upsertReadyClip should call shared ready clip helper.");
  assert.notEqual(transactionIndex, -1, "PostgreSQL upsertReadyClip should use a transaction.");
  assert.ok(
    sharedHelperIndex < transactionIndex,
    "PostgreSQL upsertReadyClip should validate ready clip contract before any DB transaction.",
  );

  assert.ok(
    sharedHelperIndex < transactionIndex,
    "PostgreSQL upsertReadyClip should validate ready clip contract before any DB transaction.",
  );

  assertFunctionBody("upsertReadyClip", [
    "withAppDbTransaction(async (client)",
    "assertMerchantMediaAssetExists(client",
    "insert into public.merchant_media_clips",
    "on conflict (asset_id, clip_index)",
    "JSON.stringify(clip.tags)",
    "storage_key",
    "thumb_storage_key",
    "clip.storageKey",
    "clip.thumbStorageKey ?? null",
    "returning ${merchantMediaClipSelect}",
  ]);
  assertFunctionBody("assertMerchantMediaAssetExists", [
    "from public.merchant_media_assets",
    "where id = $1",
    "and merchant_id = $2",
    "MERCHANT_MEDIA_ASSET_NOT_FOUND",
  ]);
});

test("ready clip contract is shared by InMemory and PostgreSQL repositories", () => {
  assert.match(repositoryContractSource, /export function assertMerchantMediaRepositoryReadyClip/);
  assert.doesNotMatch(repositoryContractSource, /normalizeMerchantMediaAssetStorageAliases/);
  assert.doesNotMatch(repositoryContractSource, /normalizePrivateMediaClipStorageAliases/);
  assert.match(repositoryContractSource, /sourceStorageKey/);
  assert.match(repositoryContractSource, /thumbStorageKey/);
  assert.doesNotMatch(repositoryContractSource, /sourceCosKey|thumbCosKey|\bcosKey\b/);
  assert.match(repositoryContractSource, /input\.clip\.merchantId !== input\.merchantId/);
  assert.match(repositoryContractSource, /input\.clip\.assetId && input\.clip\.assetId !== input\.assetId/);
  assert.match(repositoryContractSource, /input\.clip\.status !== "ready"/);
  assert.match(repositoryContractSource, /input\.clip\.clipIndex == null/);
  assert.match(repositoryContractSource, /!Number\.isInteger\(input\.clip\.clipIndex\)/);
  assert.match(repositoryContractSource, /input\.clip\.clipIndex < 0/);
  assert.match(repositoryContractSource, /input\.clip\.clipType !== "full_video"/);
  assert.match(repositoryContractSource, /input\.clip\.clipType !== "segment"/);
  assert.match(repositoryContractSource, /input\.clip\.clipType !== "image"/);
  assert.match(repositorySource, /assertMerchantMediaRepositoryReadyClip\(normalizedInput\);/);
});

test("repository mappers output provider-neutral storage key aliases", () => {
  for (const oldColumn of [legacySourceColumn, legacyStorageColumn, legacyThumbColumn]) {
    assert.doesNotMatch(repositorySource, new RegExp(escapeRegExp(oldColumn)), oldColumn);
  }

  assertFunctionBody("mapMerchantMediaAsset", [
    "sourceStorageKey: row.source_storage_key",
  ]);
  assertFunctionBody("mapMerchantMediaClip", [
    "storageKey: row.storage_key",
    "thumbStorageKey: row.thumb_storage_key",
  ]);
});

test("merchant-scoped readers only return matching merchant ready clips", () => {
  assertFunctionBody("listAssetsByMerchant", [
    "from public.merchant_media_assets",
    "where merchant_id = $1",
    "order by created_at desc",
  ]);
  assertFunctionBody("listClipsByMerchant", [
    "from public.merchant_media_clips",
    "where merchant_id = $1",
    "and status = 'ready'",
    "order by created_at desc",
  ]);
  assertFunctionBody("listLegacyMaterialClipsByMerchantFromPostgres", [
    "ao.owner_type = 'source_item'",
    "si.trace_payload @> '{\"materialLibrary\": true}'::jsonb",
    "si.trace_payload #>> '{materialAnalysis,materialCategory}' = 'project_media_asset'",
    "si.trace_payload #>> '{materialAnalysis,assetType}' = 'video'",
  ]);
  assertFunctionBody("getReadyClipByMerchant", [
    "from public.merchant_media_clips",
    "where id = $1",
    "and merchant_id = $2",
    "and status = 'ready'",
    "limit 1",
  ]);
  assertFunctionBody("getClipById", [
    "from public.merchant_media_clips",
    "where id = $1",
    "limit 1",
  ]);
});

test("app DB migration creates merchant media tables without Supa\x62ase RLS or auth.uid", () => {
  assert.match(migrationSource, /create table if not exists public\.merchant_media_assets/);
  assert.match(migrationSource, /create table if not exists public\.merchant_media_clips/);
  assert.match(migrationSource, /references public\.merchant_profiles\(id\)/);
  assert.match(migrationSource, /uploaded_by_user_id uuid not null references public\.app_users\(id\)/);
  assert.doesNotMatch(migrationSource, /enable row level security/i);
  assert.doesNotMatch(migrationSource, /create policy/i);
  assert.doesNotMatch(migrationSource, /auth\.uid/i);
  assert.doesNotMatch(migrationSource, /service_role/i);
});

test("migration preserves indexes and constraints required by repository contracts", () => {
  for (const snippet of [
    "ux_merchant_media_assets_idempotency",
    "on public.merchant_media_assets (merchant_id, idempotency_key)",
    "idx_merchant_media_assets_merchant_status_created_at",
    "idx_merchant_media_assets_uploaded_by",
    "ux_merchant_media_clips_asset_index",
    "on public.merchant_media_clips (asset_id, clip_index)",
    "idx_merchant_media_clips_merchant_status_created_at",
    "idx_merchant_media_clips_merchant_media_status",
    "merchant_media_clips_media_type_check_v2",
    "merchant_media_clips_clip_index_nonnegative_v2",
    "merchant_media_clips_clip_type_check_v2",
    "merchant_media_clips_orientation_check_v2",
    "merchant_media_clips_status_check_v2",
    "merchant_media_clips_tags_array_check_v2",
    "merchant_media_clips_tags_minimum_check_v2",
    "merchant_media_clips_tag_source_check_v2",
    "merchant_media_clips_tag_confidence_check_v2",
    "merchant_media_clips_dimensions_check_v2",
    "merchant_media_clips_timing_check_v2",
    "trg_merchant_media_assets_updated_at",
    "trg_merchant_media_clips_updated_at",
  ]) {
    assert.match(migrationSource, new RegExp(escapeRegExp(snippet)), snippet);
  }
});

test("forward migration renames merchant media storage key columns", () => {
  for (const snippet of [
    `rename column ${legacySourceColumn} to source_storage_key`,
    `rename column ${legacyStorageColumn} to storage_key`,
    `rename column ${legacyThumbColumn} to thumb_storage_key`,
    `drop constraint if exists ${legacySourceConstraint}`,
    "drop constraint if exists merchant_media_assets_source_storage_key_check",
    "add constraint merchant_media_assets_source_storage_key_check",
    "check (source_storage_key like 'merchant-media/%/originals/%/%')",
  ]) {
    assert.match(renameMigrationSource, new RegExp(escapeRegExp(snippet)), snippet);
  }
});

function assertFunctionBody(functionName, expectedSnippets) {
  const functionBody = extractFunctionBody(functionName);
  for (const snippet of expectedSnippets) {
    assert.match(
      functionBody,
      new RegExp(escapeRegExp(snippet)),
      `${functionName} should include ${snippet}`,
    );
  }
}

function extractFunctionBody(functionName) {
  const candidates = [
    `export async function ${functionName}`,
    `async function ${functionName}`,
    `async ${functionName}(`,
    `function ${functionName}`,
  ];
  const signatureIndex = candidates
    .map((candidate) => repositorySource.indexOf(candidate))
    .filter((index) => index !== -1)
    .sort((left, right) => left - right)[0];

  assert.notEqual(signatureIndex, undefined, `${functionName} should exist.`);

  const parameterStart = repositorySource.indexOf("(", signatureIndex);
  assert.notEqual(parameterStart, -1, `${functionName} should have parameters.`);

  let parenthesisDepth = 0;
  let parameterEnd = -1;
  for (let index = parameterStart; index < repositorySource.length; index += 1) {
    const character = repositorySource[index];

    if (character === "(") {
      parenthesisDepth += 1;
    } else if (character === ")") {
      parenthesisDepth -= 1;
      if (parenthesisDepth === 0) {
        parameterEnd = index;
        break;
      }
    }
  }

  assert.notEqual(parameterEnd, -1, `${functionName} parameters should be closed.`);

  const bodyStartMatch = / \{\r?\n/.exec(repositorySource.slice(parameterEnd));
  assert.notEqual(bodyStartMatch, null, `${functionName} should have a body.`);
  const bodyStart = parameterEnd + bodyStartMatch.index;

  let depth = 0;
  for (let index = bodyStart; index < repositorySource.length; index += 1) {
    const character = repositorySource[index];

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return repositorySource.slice(bodyStart + 1, index);
      }
    }
  }

  throw new Error(`${functionName} body is not closed.`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
