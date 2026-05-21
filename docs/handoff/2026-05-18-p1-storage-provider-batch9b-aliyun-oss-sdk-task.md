# 2026-05-18 P1 Storage Provider Batch 9B: Real Aliyun OSS App SDK

## 1. Task Goal

Continue `codex/domestic-infra-migration` after Batch 9A app storage provider adapter.

This batch wires the app-side Aliyun OSS provider to the real Aliyun OSS JavaScript SDK and proves the app can use Aliyun OSS for server upload, signed read URL, and browser direct upload intent when real env is supplied.

The goal is:

```text
STORAGE_PROVIDER=aliyun_oss can use real Aliyun OSS app-side storage operations:
server put object, signed read URL, browser direct upload intent, media complete validation,
and storage smoke roundtrip.
```

Tencent COS must remain the default and must keep passing regression. Worker storage remains separate.

## 2. Starting State

Worktree:

```text
/Users/wy/Desktop/静境/静境4.0/jingjing-domestic-infra-migration
```

Branch:

```text
codex/domestic-infra-migration
```

Expected current local HEAD before this batch:

```text
5e9218c Batch 9A storage provider app adapter
```

The branch is expected to be ahead of Gitee by 1 commit. Before making new code changes, push this commit to Gitee as backup:

```bash
git status --short --branch
git log --oneline --decorate -8
git push gitee codex/domestic-infra-migration
git rev-parse HEAD
git rev-parse gitee/codex/domestic-infra-migration
```

Do not merge to `main`.

## 3. Must-Read Context

In the migration worktree, read:

```text
docs/progress/2026-05-17-storage-provider-app-adapter.md
docs/handoff/2026-05-17-storage-provider-app-adapter-handoff.md
docs/架构规范/2026-05-16-storage-provider-adapter-plan.md
```

Inspect before editing:

```text
app/src/server/storage/aliyun-oss-provider.ts
app/src/server/storage/tencent-cos-provider.ts
app/src/server/storage/object-storage.ts
app/src/server/storage/index.ts
app/src/server/api/media-service.ts
app/src/server/api/knowledge-service.ts
app/src/server/api/video-edit-jobs-service.ts
app/src/lib/ui/video-workflow.ts
app/src/contracts/media.ts
app/scripts/check-domestic-storage-provider-smoke.mjs
app/package.json
app/pnpm-lock.yaml
deploy/domestic/env/app.env.example
app/.env.example
```

SDK note from official/current docs:

- Use official JavaScript package `ali-oss` (`/ali-sdk/ali-oss`).
- Typical client config uses `region`, `accessKeyId`, `accessKeySecret`, and `bucket`; endpoint support should be verified in the current README/API docs before coding.
- Object upload uses SDK `put`.
- Signed URLs are supported through `signatureUrl` / `asyncSignatureUrl`.
- Browser direct upload can use a server-generated signed PUT URL; this is acceptable for this batch if it keeps scope smaller than full STS browser credential flow.

Before implementation, re-check official docs or Context7 for exact method signatures. Do not guess method names.

## 4. Implementation Scope

### 4.1 Add real SDK dependency

Add the official Aliyun OSS SDK to the app package:

```bash
pnpm --dir app add ali-oss
```

Commit the package and lockfile updates:

```text
app/package.json
app/pnpm-lock.yaml
```

If the installed package has TypeScript typing differences, solve them narrowly in the provider module. Do not add broad `any` plumbing outside the storage provider layer.

### 4.2 Split Aliyun env validation by capability

Update:

```text
app/src/server/storage/aliyun-oss-provider.ts
```

Current 9A shell treats `ALIYUN_OSS_STS_ROLE_ARN` as required. For Batch 9B, split validation:

Required for server put and signed read:

```text
ALIYUN_OSS_ACCESS_KEY_ID
ALIYUN_OSS_ACCESS_KEY_SECRET
ALIYUN_OSS_BUCKET
ALIYUN_OSS_REGION
ALIYUN_OSS_ENDPOINT
```

Optional / only required if implementing STS temporary credential flow:

```text
ALIYUN_OSS_STS_ROLE_ARN
ALIYUN_OSS_STS_DURATION_SECONDS
```

Keep:

```text
ALIYUN_OSS_READ_URL_TTL_SECONDS
MEDIA_UPLOAD_MAX_BYTES
```

Expected behavior:

- `STORAGE_PROVIDER=aliyun_oss` with missing server env returns clear `OSS_NOT_CONFIGURED`.
- Missing STS role must not block server put or signed read URL if browser upload uses signed PUT URL.
- Do not print secrets in errors, logs, smoke output, or docs.

### 4.3 Implement Aliyun OSS server upload

Implement `putObject()` using `ali-oss`.

Expected output shape must remain:

```text
provider: aliyun_oss
bucketName: ALIYUN_OSS_BUCKET
storageKey: input key
etag if available
```

Use `Buffer` body support if the SDK documents/supports it. If SDK only documents file path strongly, use a minimal temp-file bridge inside the provider or smoke, but keep it scoped and cleaned up.

### 4.4 Implement Aliyun OSS signed read URL

Implement `createSignedReadUrl()` using the SDK signed URL method.

Expected behavior:

- Uses configured bucket/region/endpoint.
- Respects `ALIYUN_OSS_READ_URL_TTL_SECONDS` or explicit `expiresInSeconds`.
- Returns a usable HTTPS URL.
- Does not require public-read bucket.

### 4.5 Implement browser direct upload intent

Choose the smaller safe path for this batch:

```text
server-signed PUT URL
```

Extend the storage provider upload intent to include provider-neutral fields:

```text
provider: "aliyun_oss"
bucket
region
endpoint
storageKey
uploadKey
uploadUrl
uploadMethod: "PUT"
uploadHeaders, at least Content-Type when needed
expiresAt / expiredTime if useful
```

Update:

```text
app/src/contracts/media.ts
app/src/lib/ui/video-workflow.ts
```

Expected frontend behavior:

- If intent provider is `tencent_cos`, keep existing COS SDK upload unchanged.
- If intent provider is `aliyun_oss`, upload with `fetch(uploadUrl, { method: "PUT", headers, body: file })`.
- Complete upload with:
  - `storageProvider: "aliyun_oss"`
  - bucket from intent
  - storageKey from intent
  - etag from response header if available
- Keep old Tencent fields backward compatible.

Do not load a browser Aliyun SDK unless it is clearly smaller and better than signed PUT. If using signed PUT, document required OSS bucket CORS instead of trying to mutate CORS automatically.

### 4.6 Update smoke

Update:

```text
app/scripts/check-domestic-storage-provider-smoke.mjs
```

Expected modes:

```bash
node app/scripts/check-domestic-storage-provider-smoke.mjs --provider tencent_cos
node app/scripts/check-domestic-storage-provider-smoke.mjs --provider tencent_cos --roundtrip
node app/scripts/check-domestic-storage-provider-smoke.mjs --provider aliyun_oss
node app/scripts/check-domestic-storage-provider-smoke.mjs --provider aliyun_oss --roundtrip
```

Aliyun behavior:

- If required Aliyun server env is missing, return `status=pending`, not failed, for non-roundtrip mode.
- If `--roundtrip` is requested and env is missing, return nonzero with clear `OSS_NOT_CONFIGURED`.
- If env is present, perform:
  - put object
  - signed GET URL
  - fetch signed URL and compare bytes
  - delete object if SDK exposes delete; otherwise use SDK delete method after checking docs
  - report `status=ok`
- Never print access keys/secrets.

Tencent behavior:

- Existing Tencent smoke behavior must remain compatible.

### 4.7 Optional HTTP route smoke

If feasible without real browser:

- Start branch-built local app with `STORAGE_PROVIDER=aliyun_oss` and real env.
- Call `/api/media/upload-intents` for a fixture owner.
- Verify response includes `uploadUrl` and provider-neutral fields.
- Do not actually upload large files.

If route fixture setup becomes too large, keep this as pending and rely on storage provider roundtrip for Batch 9B.

## 5. Explicitly Out Of Scope

Do not migrate in this batch:

```text
workers/video-worker storage client
worker input asset provider acceptance
worker output upload provider selection
FireRed / OpenStoryline / TTS
voiceover
Tencent COS to Aliyun OSS data backfill
bucket creation / CORS policy mutation / RAM policy mutation
payment provider / invoices / billing callbacks
main merge
completion marker
```

Do not switch production/default provider to Aliyun yet:

```text
default remains tencent_cos
Singapore live app remains Tencent COS unless explicitly told otherwise
```

Do not claim domestic Phase 1 complete.

## 6. Required Validation

Local static/build validation:

```bash
node --check app/scripts/check-domestic-storage-provider-smoke.mjs
pnpm --dir app typecheck
pnpm --dir app lint
pnpm --dir app build
git diff --check
```

Tencent regression:

```text
existing Tencent storage smoke
existing COS roundtrip if env present
```

Aliyun validation:

If real Aliyun OSS env is available:

```text
Aliyun OSS storage provider smoke --roundtrip: status=ok
put/read/delete evidence recorded without secrets
signed read URL fetch status 200
downloaded bytes match uploaded bytes
```

If real env is not available:

```text
SDK wiring can compile/build
non-roundtrip smoke records pending / env missing
roundtrip remains pending and must not be claimed passed
```

Singapore validation:

```text
live /api/health
app preflight
Tencent COS roundtrip still passes
Batch 8 merchant credits/usage non-regression smoke
Batch 7 material library non-regression smoke
```

If Singapore does not have Aliyun OSS env, do not attempt real Aliyun roundtrip there.

## 7. Documentation To Add

Add:

```text
docs/progress/2026-05-18-storage-provider-aliyun-oss-sdk.md
docs/handoff/2026-05-18-storage-provider-aliyun-oss-sdk-handoff.md
```

Progress must include:

- SDK package/version installed
- exact provider methods implemented
- browser upload method chosen (`signed_put_url` or `sts_credentials`) and why
- required env and optional env split
- whether real Aliyun OSS roundtrip passed or remained pending
- Tencent regression result
- Singapore result
- remaining risks

Handoff must include:

- branch/worktree
- starting commit
- final commit
- changed files
- validation commands
- push/merge state
- next recommended batch

## 8. Completion Conditions

This batch is complete only when:

- current `5e9218c` was pushed to Gitee before editing
- `ali-oss` dependency is installed cleanly if SDK implementation is done
- Aliyun provider no longer returns SDK-pending errors for server put / signed read URL
- browser upload intent has an implemented Aliyun path or a clearly documented reason it remains pending
- Tencent COS default behavior still passes regression
- typecheck/lint/build pass
- worktree is clean
- final commit exists
- no main merge
- no forbidden completion marker

If real Aliyun OSS env is not available, it is acceptable for real roundtrip to remain pending, but the final reply must say that clearly.

Do not write `DOMESTIC_PHASE1_E2E_PASS`.
Do not mark `.codex/long-task/active.json` complete.

## 9. Recommended Final Reply Shape

When done, report:

```text
Completed Batch 9B real Aliyun OSS app SDK.

Final HEAD:
<hash> <message>

Changed files:
...

Validation:
...

Aliyun OSS:
passed / pending, with exact evidence or blocker.

Tencent COS regression:
...

Gitee:
...

Out of scope:
worker storage, TTS, FireRed/OpenStoryline, COS->OSS backfill, main merge, completion marker.

Recommended next batch:
Batch 9C worker storage client + aliyun_oss input/output support, only after app Aliyun roundtrip is actually passed.
```
