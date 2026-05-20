# 2026-05-18 Storage Provider Aliyun OSS SDK Handoff

## Goal

Complete Batch 9B from:

```text
docs/handoff/2026-05-18-p1-storage-provider-batch9b-aliyun-oss-sdk-task.md
```

The app-side Aliyun OSS provider now uses the real `ali-oss` SDK for server upload, signed read URL, and browser signed PUT upload intent. Tencent COS remains the default provider.

## Branch / Worktree

```text
worktree: /Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
branch: codex/domestic-infra-migration
starting commit: 5e9218ceeb6bbbe527fe15eee5ae33522a4ecb8d
final commit: branch HEAD after this handoff is committed; exact hash is reported in the final reply
```

## Backup State

Before implementation, the requested backup was pushed:

```text
gitee/codex/domestic-infra-migration = 5e9218ceeb6bbbe527fe15eee5ae33522a4ecb8d
```

No main merge was performed.

## Completed

- Installed `ali-oss`, `@types/ali-oss`, and `proxy-agent`.
- Split Aliyun OSS required env so `ALIYUN_OSS_STS_ROLE_ARN` is optional.
- Implemented Aliyun OSS:
  - server `putObject()`
  - signed read URL
  - browser signed PUT upload intent
- Updated media upload intent DTO and browser upload flow for provider-neutral fields.
- Kept existing Tencent COS SDK upload path.
- Updated storage smoke for:
  - Tencent COS adapter regression
  - Aliyun non-roundtrip signed URL generation when env exists
  - Aliyun missing-env pending behavior
  - Aliyun real roundtrip when env exists
- Updated env examples with signed PUT CORS notes.

## Changed Files

```text
app/.env.example
app/package.json
app/pnpm-lock.yaml
app/scripts/check-domestic-app-env.mjs
app/scripts/check-domestic-storage-provider-smoke.mjs
app/src/contracts/media.ts
app/src/lib/ui/video-workflow.ts
app/src/server/api/media-service.ts
app/src/server/storage/aliyun-oss-provider.ts
app/src/server/storage/object-storage.ts
deploy/domestic/env/app.env.example
docs/progress/2026-05-18-storage-provider-aliyun-oss-sdk.md
docs/handoff/2026-05-18-storage-provider-aliyun-oss-sdk-handoff.md
```

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

Tencent COS regression:

```text
local adapter smoke with dummy env: status=ok, signedReadUrlGenerated=true, roundtrip=skipped
Singapore running app real COS roundtrip: status=ok, signedDownloadStatus=200, signedDownloadMatched=true, deleted=true
```

Aliyun OSS:

```text
SDK wiring compile/build: passed
missing env non-roundtrip smoke: status=pending, code=OSS_NOT_CONFIGURED
missing env roundtrip smoke: status=missing_environment, code=OSS_NOT_CONFIGURED, exit code 2
real Aliyun roundtrip: pending because no real Aliyun OSS env was supplied
```

Singapore:

```text
GET /api/health: ok=true, database.provider=postgres, cos.region=ap-singapore
app preflight through SSH tunnel: status=ok
merchant credits/usage smoke through SSH tunnel: status=ok
material library smoke through SSH tunnel: status=ok
```

## Push / Merge State

```text
pre-work backup pushed to Gitee: yes
Batch 9B implementation pushed after commit: no, unless explicitly done later
main merged: no
completion marker written: no
```

## Explicitly Not Done

- No worker storage migration.
- No worker/TTS/FireRed/OpenStoryline changes.
- No COS to OSS backfill.
- No bucket CORS or RAM policy mutation.
- No real Aliyun OSS roundtrip claim.
- No main merge.
- No completion marker.

## Next Recommended Batch

Recommended next step is not worker migration yet unless Aliyun credentials are ready.

Suggested sequence:

1. Supply real Aliyun OSS env and bucket CORS.
2. Run `node app/scripts/check-domestic-storage-provider-smoke.mjs --provider aliyun_oss --roundtrip`.
3. Verify one browser upload intent and signed PUT upload against the real bucket.
4. After app Aliyun roundtrip is proven, start Batch 9C for worker storage client and `aliyun_oss` input/output support.
