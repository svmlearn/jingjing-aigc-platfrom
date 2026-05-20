# 2026-05-17 Storage Provider App Adapter Handoff

## Goal

Complete Batch 9A from:

```text
docs/handoff/2026-05-17-p1-storage-provider-batch9a-app-adapter-task.md
```

The app now has a provider-neutral storage adapter shape. Tencent COS stays the default and remains compatible. Aliyun OSS is represented in env/contracts/schema/migration/adapter boundaries, but real OSS roundtrip is pending because no real Aliyun env was available and SDK wiring is intentionally out of this batch.

## Branch / Worktree

```text
worktree: /Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
branch: codex/domestic-infra-migration
```

## Backup State

Before implementation, the requested pre-work backup was pushed:

```text
gitee/codex/domestic-infra-migration = c9c8bcd8e10a283793e3577574fdc4b52b59eaa3
```

The Batch 9A implementation commit is local unless explicitly pushed later.

## Completed

- Added `app/src/server/storage/`:
  - `object-storage.ts`
  - `tencent-cos-provider.ts`
  - `aliyun-oss-provider.ts`
  - `index.ts`
- Kept `app/src/server/api/cos.ts` as a Tencent COS compatibility wrapper.
- Migrated app-side storage call sites:
  - `media-service.ts`
  - `knowledge-service.ts`
  - `video-edit-jobs-service.ts`
  - `content-generation-batch-service.ts`
  - `app/api/media/cos-preview/route.ts`
  - `app/api/health/route.ts`
- Extended `MediaStorageProvider` and knowledge storage provider unions to include `aliyun_oss`.
- Updated `mediaCompleteSchema` to accept `aliyun_oss`.
- Added DB migration:
  - `app/db/migrations/202605170002_selfhost_storage_provider_aliyun_oss.sql`
- Updated env examples with `STORAGE_PROVIDER` and separate `ALIYUN_OSS_*` names.
- Added storage smoke:
  - `app/scripts/check-domestic-storage-provider-smoke.mjs`
- Updated `check-domestic-app-env.mjs` so storage env checks follow `STORAGE_PROVIDER`.

## Explicitly Not Done

- No worker changes.
- No TTS changes.
- No FireRed/OpenStoryline changes.
- No real Aliyun OSS SDK integration.
- No real Aliyun OSS roundtrip claim.
- No main merge.
- No completion marker files.

## Validation Summary

Local:

```text
node --check app/scripts/check-domestic-storage-provider-smoke.mjs: passed
node --check app/scripts/check-domestic-app-env.mjs: passed
pnpm --dir app typecheck: passed
pnpm --dir app lint: passed
pnpm --dir app build: passed
git diff --check: passed
```

Local fresh PostgreSQL:

```text
baseline + foundation + merchant credits + storage provider migration: passed
asset_objects constraint includes aliyun_oss: passed
knowledge_documents constraint includes aliyun_oss: passed
app env smoke: status=ok
merchant credits smoke: status=ok
material library smoke: status=ok
knowledge repository smoke: status=ok
```

Storage provider smoke:

```text
tencent_cos with dummy env: status=ok, signedReadUrlGenerated=true, roundtrip=skipped
aliyun_oss without real env: status=pending, expectedErrorCode=OSS_NOT_CONFIGURED
```

Singapore:

```text
new migration applied to jingjing-selfhost-pg: passed
constraint check includes aliyun_oss: passed
GET http://43.160.208.189/api/health: ok=true
real Tencent COS roundtrip in running app container: status=ok, signedDownloadMatched=true, deleted=true
app env smoke through SSH tunnel: status=ok
merchant credits smoke through SSH tunnel: status=ok
material library smoke through SSH tunnel: status=ok
knowledge repository smoke through SSH tunnel: status=ok
```

## Next Recommended Batch

Batch 9B should be separated from this commit and should decide one of two paths:

1. Wire real Aliyun OSS SDK/STS for browser upload, server upload, signed read URL, and COS-preview successor route.
2. Keep app on Tencent COS until Aliyun credentials and policy/STS role are ready, then do a real Aliyun roundtrip before enabling `STORAGE_PROVIDER=aliyun_oss`.

Worker migration should remain a separate batch because `video-job-payload.ts` still rejects non-`tencent_cos` input assets by design.
